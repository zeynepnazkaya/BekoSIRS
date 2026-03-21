# products/views/service_views.py
"""
Service request and product ownership views.
"""

from rest_framework import viewsets, status, exceptions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from django.utils import timezone
from django.db.models import Count, Sum, Avg, Prefetch

from products.models import (
    CustomUser, Product, Category, ProductOwnership,
    ServiceRequest, ServiceQueue, Notification, Review
)
from products.serializers import (
    ProductOwnershipSerializer, ProductOwnershipCreateSerializer,
    ServiceRequestSerializer, ServiceRequestCreateSerializer,
    ServiceQueueSerializer
)


class ProductOwnershipViewSet(viewsets.ModelViewSet):
    """Product ownership/assignment management."""
    queryset = ProductOwnership.objects.all().select_related("customer", "product", "product__category")
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ["list", "retrieve", "my_ownerships"]:
            return [IsAuthenticated()]
        return [IsAdminUser()]

    def get_serializer_class(self):
        if self.action == "create":
            return ProductOwnershipCreateSerializer
        return ProductOwnershipSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role in ["admin", "seller"]:
            return ProductOwnership.objects.all().select_related("customer", "product", "product__category")
        return ProductOwnership.objects.filter(customer=user).select_related("product", "product__category")

    @action(detail=False, methods=["get"], url_path="my-ownerships")
    def my_ownerships(self, request):
        """GET /api/product-ownerships/my-ownerships/ - Customer's owned products with warranty info."""
        # FIX: Use prefetch_related to avoid N+1 query problem
        ownerships = ProductOwnership.objects.filter(
            customer=request.user
        ).select_related("product", "product__category").prefetch_related(
            Prefetch(
                'service_requests',
                queryset=ServiceRequest.objects.exclude(status__in=["completed", "cancelled"]),
                to_attr='active_service_requests_list'
            )
        )

        data = []
        for ownership in ownerships:
            product = ownership.product
            warranty_end = ownership.warranty_end_date
            is_warranty_active = warranty_end and warranty_end >= timezone.now().date()
            # Use prefetched data instead of querying again
            active_service_requests = len(ownership.active_service_requests_list)

            data.append({
                "id": ownership.id,
                "product": {
                    "id": product.id,
                    "name": product.name,
                    "brand": product.brand,
                    "price": str(product.price),
                    "image": product.image.url if product.image else None,
                    "category_name": product.category.name if product.category else None,
                    "warranty_duration_months": product.warranty_duration_months,
                },
                "purchase_date": ownership.purchase_date,
                "serial_number": ownership.serial_number,
                "warranty_end_date": warranty_end,
                "is_warranty_active": is_warranty_active,
                "days_until_warranty_expires": (warranty_end - timezone.now().date()).days if warranty_end and is_warranty_active else None,
                "active_service_requests": active_service_requests,
            })

        return Response(data)


class ServiceRequestViewSet(viewsets.ModelViewSet):
    """Service request management."""
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'create':
            return ServiceRequestCreateSerializer
        return ServiceRequestSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role in ['admin', 'seller']:
            return ServiceRequest.objects.all().select_related(
                'customer', 'product_ownership__product', 'assigned_to'
            ).prefetch_related('queue_entry')
        return ServiceRequest.objects.filter(customer=user).select_related(
            'product_ownership__product'
        ).prefetch_related('queue_entry')

    def perform_create(self, serializer):
        # Validate ownership: either product_ownership or product_assignment must belong to this customer
        ownership = serializer.validated_data.get('product_ownership')
        assignment = serializer.validated_data.get('product_assignment')

        if ownership and ownership.customer != self.request.user:
            raise exceptions.PermissionDenied("Bu ürün için servis talebi oluşturamazsınız.")
        if assignment and assignment.customer != self.request.user:
            raise exceptions.PermissionDenied("Bu ürün için servis talebi oluşturamazsınız.")

        service_request = serializer.save(customer=self.request.user)
        last_queue = ServiceQueue.objects.order_by('-queue_number').first()
        queue_number = (last_queue.queue_number + 1) if last_queue else 1

        ServiceQueue.objects.create(
            service_request=service_request,
            queue_number=queue_number,
            estimated_wait_time=queue_number * 30
        )

        service_request.status = 'in_queue'
        service_request.save()

        Notification.objects.create(
            user=self.request.user,
            notification_type='service_update',
            title='Servis Talebiniz Alındı',
            message=f'Talep numaranız: SR-{service_request.id}. Sıra numaranız: {queue_number}',
            related_service_request=service_request
        )

    @action(detail=True, methods=['post'], url_path='assign')
    def assign_request(self, request, pk=None):
        """POST /api/service-requests/{id}/assign/ - Assign to staff."""
        if request.user.role not in ['admin', 'seller']:
            return Response({'error': 'Yetkiniz yok'}, status=status.HTTP_403_FORBIDDEN)

        service_request = self.get_object()
        assigned_to_id = request.data.get('assigned_to')

        if assigned_to_id:
            try:
                assigned_user = CustomUser.objects.get(id=assigned_to_id)
                service_request.assigned_to = assigned_user
                service_request.status = 'in_progress'
                service_request.save()

                Notification.objects.create(
                    user=service_request.customer,
                    notification_type='service_update',
                    title='Servis Talebiniz İşleme Alındı',
                    message=f'Talep SR-{service_request.id} artık işleme alındı.',
                    related_service_request=service_request
                )
                return Response({'success': 'Talep atandı'})
            except CustomUser.DoesNotExist:
                return Response({'error': 'Kullanıcı bulunamadı'}, status=status.HTTP_404_NOT_FOUND)
        
        return Response({'error': 'assigned_to gerekli'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='queue-status')
    def queue_status(self, request):
        """GET /api/service-requests/queue-status/ - Get user's queue position."""
        user_requests = ServiceRequest.objects.filter(
            customer=request.user
        ).exclude(status__in=['completed', 'cancelled']).select_related('queue_entry')

        data = []
        for sr in user_requests:
            queue = getattr(sr, 'queue_entry', None)
            data.append({
                'request_id': sr.id,
                'status': sr.status,
                'queue_number': queue.queue_number if queue else None,
                'estimated_wait_time': queue.estimated_wait_time if queue else None,
            })

        return Response(data)

    @action(detail=True, methods=['post'], url_path='start')
    def start_request(self, request, pk=None):
        """POST /api/service-requests/{id}/start/ - Start working on request (no assignment needed)."""
        if request.user.role not in ['admin', 'seller']:
            return Response({'error': 'Yetkiniz yok'}, status=status.HTTP_403_FORBIDDEN)

        service_request = self.get_object()
        
        if service_request.status in ['completed', 'cancelled']:
            return Response({'error': 'Bu talep zaten kapatılmış'}, status=status.HTTP_400_BAD_REQUEST)

        service_request.status = 'in_progress'
        service_request.save()

        Notification.objects.create(
            user=service_request.customer,
            notification_type='service_update',
            title='Servis Talebiniz İşleme Alındı',
            message=f'Talep SR-{service_request.id} artık işleme alındı.',
            related_service_request=service_request
        )
        return Response({'success': 'Talep işleme alındı'})

    @action(detail=True, methods=['post'], url_path='complete')
    def complete_request(self, request, pk=None):
        """POST /api/service-requests/{id}/complete/ - Complete the request."""
        if request.user.role not in ['admin', 'seller']:
            return Response({'error': 'Yetkiniz yok'}, status=status.HTTP_403_FORBIDDEN)

        service_request = self.get_object()
        
        if service_request.status in ['completed', 'cancelled']:
            return Response({'error': 'Bu talep zaten kapatılmış'}, status=status.HTTP_400_BAD_REQUEST)

        resolution_notes = request.data.get('resolution_notes', '')
        service_request.status = 'completed'
        service_request.resolution_notes = resolution_notes
        service_request.resolved_at = timezone.now()
        service_request.save()

        Notification.objects.create(
            user=service_request.customer,
            notification_type='service_update',
            title='Servis Talebiniz Tamamlandı',
            message=f'Talep SR-{service_request.id} başarıyla tamamlandı.',
            related_service_request=service_request
        )
        return Response({'success': 'Talep tamamlandı'})

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel_request(self, request, pk=None):
        """POST /api/service-requests/{id}/cancel/ - Cancel the request."""
        if request.user.role not in ['admin', 'seller']:
            return Response({'error': 'Yetkiniz yok'}, status=status.HTTP_403_FORBIDDEN)

        service_request = self.get_object()
        
        if service_request.status in ['completed', 'cancelled']:
            return Response({'error': 'Bu talep zaten kapatılmış'}, status=status.HTTP_400_BAD_REQUEST)

        service_request.status = 'cancelled'
        service_request.save()

        Notification.objects.create(
            user=service_request.customer,
            notification_type='service_update',
            title='Servis Talebiniz İptal Edildi',
            message=f'Talep SR-{service_request.id} iptal edildi.',
            related_service_request=service_request
        )
        return Response({'success': 'Talep iptal edildi'})

    @action(detail=True, methods=['post'], url_path='update-priority')
    def update_priority(self, request, pk=None):
        """POST /api/service-requests/{id}/update-priority/ - Update queue priority."""
        if request.user.role not in ['admin', 'seller']:
            return Response({'error': 'Yetkiniz yok'}, status=status.HTTP_403_FORBIDDEN)

        service_request = self.get_object()
        new_priority = request.data.get('priority')

        if not new_priority or not str(new_priority).isdigit():
            return Response({'error': 'Lütfen geçerli bir öncelik (1-10) değeri gönderin.'}, status=status.HTTP_400_BAD_REQUEST)

        new_priority = int(new_priority)
        if new_priority < 1 or new_priority > 10:
             return Response({'error': 'Öncelik değeri 1 ile 10 arasında olmalıdır.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            queue_entry = service_request.queue_entry
            queue_entry.priority = new_priority
            queue_entry.save()
            return Response({'success': 'Servis önceliği güncellendi', 'new_priority': new_priority})
        except ServiceQueue.DoesNotExist:
            return Response({'error': 'Bu talep için aktif bir sıra bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)



class DashboardSummaryView(APIView):
    """Dashboard summary statistics for admin panel."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.role not in ['admin', 'seller']:
            return Response({'error': 'Yetkisiz'}, status=status.HTTP_403_FORBIDDEN)

        total_products = Product.objects.count()
        total_categories = Category.objects.count()
        total_customers = CustomUser.objects.filter(role='customer').count()
        total_orders = ProductOwnership.objects.count()

        pending_requests = ServiceRequest.objects.filter(status='pending').count()
        in_progress_requests = ServiceRequest.objects.filter(status='in_progress').count()
        completed_requests = ServiceRequest.objects.filter(status='completed').count()

        pending_reviews = Review.objects.filter(is_approved=False).count()
        avg_rating = Review.objects.filter(is_approved=True).aggregate(avg=Avg('rating'))['avg'] or 0

        low_stock = Product.objects.filter(stock__lt=10).count()
        out_of_stock = Product.objects.filter(stock=0).count()

        return Response({
            'products': {
                'total': total_products,
                'low_stock': low_stock,
                'out_of_stock': out_of_stock,
            },
            'categories': {'total': total_categories},
            'customers': {'total': total_customers},
            'orders': {'total': total_orders},
            'service_requests': {
                'pending': pending_requests,
                'in_progress': in_progress_requests,
                'completed': completed_requests,
            },
            'reviews': {
                'pending_approval': pending_reviews,
                'average_rating': round(avg_rating, 1),
            }
        })
