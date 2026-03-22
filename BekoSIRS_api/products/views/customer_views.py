# products/views/customer_views.py
"""
Customer feature views: wishlist, view history, reviews, notifications, recommendations.
"""

from rest_framework import viewsets, status, exceptions
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Avg, F

from products.models import (
    Product, ProductOwnership, Wishlist, WishlistItem,
    ViewHistory, Review, Notification, Recommendation
)
from products.serializers import (
    WishlistSerializer, WishlistItemSerializer,
    ViewHistorySerializer, ReviewSerializer, ReviewCreateSerializer,
    NotificationSerializer, RecommendationSerializer
)


class WishlistViewSet(viewsets.ModelViewSet):
    """Customer wishlist management."""
    serializer_class = WishlistSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Wishlist.objects.filter(customer=self.request.user).prefetch_related('items__product')

    def list(self, request):
        wishlist, created = Wishlist.objects.get_or_create(customer=request.user)
        serializer = WishlistSerializer(wishlist, context={'request': request})
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='add-item')
    def add_item(self, request):
        """POST /api/wishlist/add-item/ - Add product to wishlist."""
        print(f"DEBUG: add_item called by {request.user.username} (ID: {request.user.id})")
        print(f"DEBUG: Payload: {request.data}")
        
        wishlist, _ = Wishlist.objects.get_or_create(customer=request.user)
        product_id = request.data.get('product_id')

        if not product_id:
            print("DEBUG: Missing product_id")
            return Response({'error': 'product_id gerekli'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            print(f"DEBUG: Product {product_id} not found")
            return Response({'error': 'Ürün bulunamadı'}, status=status.HTTP_404_NOT_FOUND)

        if WishlistItem.objects.filter(wishlist=wishlist, product=product).exists():
            print("DEBUG: Already in wishlist")
            return Response({'error': 'Bu ürün zaten istek listenizde'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            item = WishlistItem.objects.create(
                wishlist=wishlist,
                product=product,
                note=request.data.get('note', ''),
                notify_on_price_drop=request.data.get('notify_on_price_drop', True),
                notify_on_restock=request.data.get('notify_on_restock', True)
            )
            print(f"DEBUG: WishlistItem created: {item.id}")
            return Response(WishlistItemSerializer(item, context={'request': request}).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            print(f"DEBUG: Error creating WishlistItem: {e}")
            return Response({'error': f'Kayıt hatası: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['delete'], url_path='remove-item/(?P<product_id>[^/.]+)')
    def remove_item(self, request, product_id=None):
        """DELETE /api/wishlist/remove-item/{product_id}/ - Remove from wishlist."""
        try:
            wishlist = Wishlist.objects.get(customer=request.user)
            item = WishlistItem.objects.get(wishlist=wishlist, product_id=product_id)
            item.delete()
            return Response({'success': 'Ürün istek listesinden çıkarıldı'})
        except (Wishlist.DoesNotExist, WishlistItem.DoesNotExist):
            return Response({'error': 'Ürün istek listenizde bulunamadı'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['patch'], url_path='update-item/(?P<product_id>[^/.]+)')
    def update_item(self, request, product_id=None):
        """PATCH /api/wishlist/update-item/{product_id}/ - Update item settings."""
        try:
            wishlist = Wishlist.objects.get(customer=request.user)
            item = WishlistItem.objects.get(wishlist=wishlist, product_id=product_id)
            
            data = request.data
            if 'notify_on_price_drop' in data:
                item.notify_on_price_drop = data['notify_on_price_drop']
            if 'notify_on_restock' in data:
                item.notify_on_restock = data['notify_on_restock']
            if 'note' in data:
                item.note = data['note']
            
            item.save()
            return Response(WishlistItemSerializer(item, context={'request': request}).data)
        except (Wishlist.DoesNotExist, WishlistItem.DoesNotExist):
            return Response({'error': 'Ürün istek listenizde bulunamadı'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['get'], url_path='check/(?P<product_id>[^/.]+)')
    def check_item(self, request, product_id=None):
        """GET /api/wishlist/check/{product_id}/ - Check if product is in wishlist."""
        try:
            wishlist = Wishlist.objects.get(customer=request.user)
            exists = WishlistItem.objects.filter(wishlist=wishlist, product_id=product_id).exists()
            return Response({'in_wishlist': exists})
        except Wishlist.DoesNotExist:
            return Response({'in_wishlist': False})


class ViewHistoryViewSet(viewsets.ModelViewSet):
    """User view history tracking."""
    serializer_class = ViewHistorySerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ViewHistory.objects.filter(customer=self.request.user).select_related('product')

    @action(detail=False, methods=['post'], url_path='record')
    def record_view(self, request):
        """POST /api/view-history/record/ - Record product view."""
        product_id = request.data.get('product_id')

        if not product_id:
            return Response({'error': 'product_id gerekli'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return Response({'error': 'Ürün bulunamadı'}, status=status.HTTP_404_NOT_FOUND)

        view_history, created = ViewHistory.objects.get_or_create(
            customer=request.user,
            product=product,
            defaults={'view_count': 1}
        )

        if not created:
            view_history.view_count = F('view_count') + 1
            view_history.viewed_at = timezone.now()
            view_history.save()
            view_history.refresh_from_db()

        return Response(ViewHistorySerializer(view_history).data)

    @action(detail=False, methods=['delete'], url_path='clear')
    def clear_history(self, request):
        """DELETE /api/view-history/clear/ - Clear view history."""
        ViewHistory.objects.filter(customer=request.user).delete()
        return Response({'success': 'Görüntüleme geçmişi temizlendi'})


class ReviewViewSet(viewsets.ModelViewSet):
    """Product review management."""
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'create':
            return ReviewCreateSerializer
        return ReviewSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role in ['admin', 'seller']:
            return Review.objects.all().select_related('customer', 'product')
        return Review.objects.filter(customer=user).select_related('product')

    def perform_create(self, serializer):
        product = serializer.validated_data['product']
        user = self.request.user
        has_ownership = ProductOwnership.objects.filter(customer=user, product=product).exists()
        
        if not has_ownership:
            raise exceptions.PermissionDenied("Sadece satın aldığınız ürünleri değerlendirebilirsiniz.")

        serializer.save(customer=self.request.user)

    @action(detail=False, methods=['get'], url_path='product/(?P<product_id>[^/.]+)')
    def product_reviews(self, request, product_id=None):
        """GET /api/reviews/product/{id}/ - Get approved product reviews."""
        reviews = Review.objects.filter(
            product_id=product_id,
            is_approved=True
        ).select_related('customer')

        avg_rating = reviews.aggregate(avg=Avg('rating'))['avg'] or 0

        return Response({
            'reviews': ReviewSerializer(reviews, many=True).data,
            'average_rating': round(avg_rating, 1),
            'total_reviews': reviews.count()
        })

    @action(detail=True, methods=['post'], url_path='approve')
    def approve_review(self, request, pk=None):
        """POST /api/reviews/{id}/approve/ - Approve review (Admin)."""
        if request.user.role != 'admin':
            return Response({'error': 'Yetkiniz yok'}, status=status.HTTP_403_FORBIDDEN)

        review = self.get_object()
        review.is_approved = True
        review.save()
        return Response({'success': 'Değerlendirme onaylandı'})


class NotificationViewSet(viewsets.ModelViewSet):
    """User notification management."""
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).order_by('-created_at')

    @action(detail=False, methods=['get'], url_path='all')
    def all_notifications(self, request):
        """
        GET /api/notifications/all/ - Get all notifications (Admin only).
        Returns notifications for all users, used in admin panel.
        """
        user = request.user
        if user.role not in ['admin', 'seller']:
            return Response({'error': 'Yetkisiz erişim'}, status=status.HTTP_403_FORBIDDEN)
        
        notifications = Notification.objects.all().select_related(
            'user', 'related_product', 'related_service_request'
        ).order_by('-created_at')[:100]
        
        data = []
        for notif in notifications:
            data.append({
                'id': notif.id,
                'user': {
                    'id': notif.user.id,
                    'username': notif.user.username,
                    'email': notif.user.email,
                } if notif.user else None,
                'notification_type': notif.notification_type,
                'title': notif.title,
                'message': notif.message,
                'is_read': notif.is_read,
                'created_at': notif.created_at.isoformat(),
                'related_product': notif.related_product.name if notif.related_product else None,
            })
        
        return Response(data)

    @action(detail=False, methods=['post'], url_path='send-bulk')
    def send_bulk(self, request):
        """
        POST /api/notifications/send-bulk/ - Send notification to multiple users.
        Body: {
            title: string,
            message: string,
            notification_type: 'general' | 'price_drop' | 'restock' | 'recommendation',
            target: 'all' | 'customers'
        }
        """
        from products.models import CustomUser
        
        user = request.user
        if user.role not in ['admin', 'seller']:
            return Response({'error': 'Yetkisiz erişim'}, status=status.HTTP_403_FORBIDDEN)
        
        title = request.data.get('title', '').strip()
        message = request.data.get('message', '').strip()
        notification_type = request.data.get('notification_type', 'general')
        target = request.data.get('target', 'customers')
        
        if not title or not message:
            return Response({'error': 'Başlık ve mesaj zorunludur'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Determine target users via notification preferences
        from products.models import UserNotificationPreference
        if target == 'customers':
            target_users = CustomUser.objects.filter(
                role='customer',
                notification_preferences__notify_general=True
            )
        else:  # all
            target_users = CustomUser.objects.filter(
                notification_preferences__notify_general=True
            )
        # Also include users who don't have preferences yet (defaults are True)
        if target == 'customers':
            users_without_prefs = CustomUser.objects.filter(
                role='customer'
            ).exclude(notification_preferences__isnull=False)
        else:
            users_without_prefs = CustomUser.objects.exclude(
                notification_preferences__isnull=False
            )
        target_users = target_users | users_without_prefs
        
        # Create notifications in bulk
        notifications = [
            Notification(
                user=target_user,
                notification_type=notification_type,
                title=title,
                message=message
            )
            for target_user in target_users
        ]
        
        created = Notification.objects.bulk_create(notifications)
        
        return Response({
            'success': f'{len(created)} kullanıcıya bildirim gönderildi',
            'count': len(created)
        })

    @action(detail=False, methods=['get'], url_path='stats')
    def stats(self, request):
        """GET /api/notifications/stats/ - Get notification statistics."""
        user = request.user
        if user.role not in ['admin', 'seller']:
            return Response({'error': 'Yetkisiz erişim'}, status=status.HTTP_403_FORBIDDEN)
        
        total = Notification.objects.count()
        read = Notification.objects.filter(is_read=True).count()
        unread = Notification.objects.filter(is_read=False).count()
        
        by_type = {}
        for notif_type in ['general', 'price_drop', 'restock', 'service_update', 'recommendation', 'warranty_expiry']:
            by_type[notif_type] = Notification.objects.filter(notification_type=notif_type).count()
        
        return Response({
            'total': total,
            'read': read,
            'unread': unread,
            'by_type': by_type
        })

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        """GET /api/notifications/unread-count/ - Get unread count."""
        count = Notification.objects.filter(user=request.user, is_read=False).count()
        return Response({'count': count})

    @action(detail=True, methods=['post'], url_path='read')
    def mark_as_read(self, request, pk=None):
        """POST /api/notifications/{id}/read/ - Mark as read."""
        notification = self.get_object()
        notification.is_read = True
        notification.save()
        return Response({'success': True})

    @action(detail=False, methods=['post'], url_path='read-all')
    def mark_all_read(self, request):
        """POST /api/notifications/read-all/ - Mark all as read."""
        Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response({'success': True})

    @action(detail=True, methods=['delete'], url_path='delete')
    def delete_notification(self, request, pk=None):
        """DELETE /api/notifications/{id}/delete/ - Delete a notification."""
        notification = self.get_object()
        # Admin can delete any, users can only delete their own
        if request.user.role not in ['admin', 'seller'] and notification.user != request.user:
            return Response({'error': 'Yetkisiz'}, status=status.HTTP_403_FORBIDDEN)
        notification.delete()
        return Response({'success': True})

    @action(detail=False, methods=['delete'], url_path='clear-all')
    def clear_all(self, request):
        """DELETE /api/notifications/clear-all/ - Clear all user notifications."""
        Notification.objects.filter(user=request.user).delete()
        return Response({'success': True})


class RecommendationViewSet(viewsets.ModelViewSet):
    """AI-powered product recommendations."""
    serializer_class = RecommendationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Recommendation.objects.filter(customer=self.request.user).select_related('product')

    def list(self, request):
        """GET /api/recommendations/ - Get recommendations (with optional refresh)."""
        refresh = request.query_params.get('refresh', 'false').lower() == 'true'
        user = request.user
        
        # Check if recommendations exist
        has_recommendations = Recommendation.objects.filter(customer=user).exists()
        
        # Generate if forced refresh OR if no recommendations exist (Cold Start fix)
        if refresh or not has_recommendations:
            self._generate_recommendations(user, ignore_cache=refresh)

        recommendations = Recommendation.objects.filter(
            customer=user
        ).select_related('product').order_by('-score')[:10]

        # Fetch ml metrics
        from products.ml_recommender import get_recommender
        recommender = get_recommender()
        metrics = recommender.get_metrics()
        
        # Format metrics to match what frontend expects
        ncf_metrics = metrics.get('ncf', {})
        content_metrics = metrics.get('content', {})
        ml_metrics = {
            'train_r2': ncf_metrics.get('train_r2') if ncf_metrics else None,
            'test_r2': ncf_metrics.get('test_r2') if ncf_metrics else None,
            'hit_rate_at_10': ncf_metrics.get('hit_rate_at_10') if ncf_metrics else None,
            'n_interactions': ncf_metrics.get('n_interactions') if ncf_metrics else None,
            'n_users': ncf_metrics.get('n_users') if ncf_metrics else None,
            'n_products': ncf_metrics.get('n_products') if ncf_metrics else None,
            'n_epochs': ncf_metrics.get('n_epochs') if ncf_metrics else None,
            'final_loss': ncf_metrics.get('final_loss') if ncf_metrics else None,
            'trained_at': ncf_metrics.get('trained_at') if ncf_metrics else None,
            'content_products': content_metrics.get('n_products') if content_metrics else 0,
            'weights': metrics.get('weights', {})
        }

        return Response({
            'recommendations': RecommendationSerializer(recommendations, many=True).data,
            'ml_metrics': ml_metrics
        })

    def _generate_recommendations(self, user, ignore_cache=False):
        """Generate new recommendations using ML recommender."""
        try:
            from products.ml_recommender import get_recommender
            from products.models import Product  # Fallback import
            
            recommender = get_recommender()
            recommendations = recommender.recommend(user, top_n=10, ignore_cache=ignore_cache)
            
            # FALLBACK: If ML returns empty (Cold User), show popular/random products
            if not recommendations:
                # Fallback to recent products
                fallback_products = Product.objects.all().order_by('-id')[:10]
                recommendations = []
                for p in fallback_products:
                    recommendations.append({
                        'product_id': p.id,
                        'score': 0.5,
                        'reason': 'Popüler Ürünler'
                    })

            # Clear old and create new
            Recommendation.objects.filter(customer=user).delete()
            
            for rec in recommendations:
                Recommendation.objects.create(
                    customer=user,
                    product_id=rec['product_id'],
                    score=rec.get('score', 0),
                    reason=rec.get('reason', 'AI önerisi')
                )
        except Exception as e:
            print(f"Recommendation generation failed: {e}")

    @action(detail=False, methods=['post'], url_path='generate')
    def generate(self, request):
        """POST /api/recommendations/generate/ - Force generate new recommendations."""
        self._generate_recommendations(request.user, ignore_cache=True)
        return Response({'success': 'Öneriler oluşturuldu'})

    @action(detail=True, methods=['post'], url_path='click')
    def record_click(self, request, pk=None):
        """POST /api/recommendations/{id}/click/ - Record click."""
        recommendation = self.get_object()
        recommendation.clicked = True
        recommendation.save()
        return Response({'success': True})


# ---------------------------
# KKTC Location Management
# ---------------------------
class DistrictViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for listing KKTC Districts.
    Read-only: GET /api/locations/districts/
    """
    from products.models import District
    from products.serializers import DistrictSerializer
    
    queryset = District.objects.all()
    serializer_class = DistrictSerializer
    permission_classes = [IsAuthenticated]


class AreaViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for listing KKTC Areas.
    Read-only: GET /api/locations/areas/?district_id=X
    """
    from products.models import Area
    from products.serializers import AreaSerializer
    from rest_framework import filters
    
    serializer_class = AreaSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Filter areas by district if district_id parameter is provided"""
        from products.models import Area
        queryset = Area.objects.select_related('district').all()
        
        district_id = self.request.query_params.get('district_id')
        if district_id:
            queryset = queryset.filter(district_id=district_id)
        
        return queryset


# ---------------------------
# Customer Management
# ---------------------------
from rest_framework.pagination import PageNumberPagination

class CustomerPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 50

class CustomerManagementViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Customer Management.
    
    list: GET /api/customers/?search=xxx&ordering=first_name&page=1
    retrieve: GET /api/customers/{id}/
    update: PUT/PATCH /api/customers/{id}/
    """
    from products.models import CustomUser
    from products.serializers import CustomerListSerializer, CustomerDetailSerializer, CustomerUpdateSerializer
    from rest_framework import filters
    from django.db.models import Q
    
    permission_classes = [IsAuthenticated]
    pagination_class = CustomerPagination
    http_method_names = ['get', 'patch', 'put', 'delete', 'head', 'options']  # Added DELETE
    
    def get_queryset(self):
        """
        Filter customers (role='customer') with search and ordering
        """
        from products.models import CustomUser
        from django.db.models import Q
        
        queryset = CustomUser.objects.filter(role='customer').select_related('customer_address__district', 'customer_address__area')
        
        # Search by phone, first_name, or last_name
        search = self.request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(phone_number__icontains=search) |
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(username__icontains=search)
            )
        
        # Ordering (default: first_name)
        ordering = self.request.query_params.get('ordering', 'first_name')
        queryset = queryset.order_by(ordering)
        
        return queryset
    
    def get_serializer_class(self):
        """Use different serializers for list/detail/update actions"""
        from products.serializers import CustomerListSerializer, CustomerDetailSerializer, CustomerUpdateSerializer
        
        if self.action == 'list':
            return CustomerListSerializer
        elif self.action == 'retrieve':
            return CustomerDetailSerializer
        elif self.action in ['update', 'partial_update']:
            return CustomerUpdateSerializer
        return CustomerListSerializer

