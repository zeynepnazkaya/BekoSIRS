# products/views/delivery_views.py
"""
Delivery management and route optimization views.
"""

from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from django.utils import timezone
from django.db.models import Q
from datetime import datetime, timedelta
import math
from django.db import transaction

from products.models import Delivery, DeliveryRoute, DeliveryRouteStop, CustomUser, ProductAssignment, Product
from products.serializers import DeliverySerializer, ProductAssignmentSerializer, DeliveryRouteSerializer

class ProductAssignmentViewSet(viewsets.ModelViewSet):
    """Satış / Ürün Atama işlemleri."""
    queryset = ProductAssignment.objects.all()
    serializer_class = ProductAssignmentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset().select_related('product', 'customer')
        
        # Limit to own assignments for customers
        if user.role == 'customer':
            qs = qs.filter(customer=user)
        
        # Filtreleme
        if self.request.query_params.get('search'):
            search = self.request.query_params.get('search')
            qs = qs.filter(
                Q(customer__username__icontains=search) |
                Q(customer__first_name__icontains=search) |
                Q(customer__last_name__icontains=search) |
                Q(product__name__icontains=search)
            )
            
        if self.request.query_params.get('status'):
            qs = qs.filter(status=self.request.query_params.get('status'))

        return qs.order_by('-assigned_at')

    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Dashboard KPI stats for assignments."""
        qs = self.get_queryset()
        data = {
            'planned': qs.filter(status='PLANNED').count(),
            'scheduled': qs.filter(status='SCHEDULED').count(),
            'out_for_delivery': qs.filter(status='OUT_FOR_DELIVERY').count(),
            'delivered': qs.filter(status='DELIVERED').count(),
        }
        return Response(data)


class DeliveryViewSet(viewsets.ModelViewSet):
    """Teslimat CRUD işlemleri."""
    permission_classes = [IsAdminUser]
    serializer_class = DeliverySerializer
    
    def get_queryset(self):
        queryset = Delivery.objects.select_related('assignment__customer', 'assignment__product')
        
        # Tarih filtresi
        date = self.request.query_params.get('date')
        if date:
            queryset = queryset.filter(scheduled_date=date)
        
        # Durum filtresi
        status_filter = self.request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        return queryset.order_by('scheduled_date', 'delivery_order')
    
    def get_serializer_class(self):
        return DeliverySerializer

    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        # Custom create to handle assignment creation or linking
        # If assignment_id is provided, link it.
        assignment_id = request.data.get('assignment_id')
        scheduled_date = request.data.get('scheduled_date')
        
        if not assignment_id:
            return Response({'error': 'assignment_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            assignment = ProductAssignment.objects.get(id=assignment_id)
        except ProductAssignment.DoesNotExist:
            return Response({'error': 'Assignment not found'}, status=status.HTTP_404_NOT_FOUND)

        try:
            with transaction.atomic():
                # Check if delivery already exists (hasattr always returns True for OneToOne)
                try:
                    existing_delivery = assignment.delivery
                    # Eğer delivery var ama tarih yoksa (orphan kayıt), güncellemeye izin ver
                    if existing_delivery.scheduled_date:
                         return Response({'error': 'Bu satış için zaten bir teslimat planı mevcut.'}, status=status.HTTP_400_BAD_REQUEST)
                    
                    # Orphan kaydı güncelle
                    delivery = existing_delivery
                    delivery.scheduled_date = scheduled_date
                    delivery.address = request.data.get('address', assignment.customer.open_address or '')
                    delivery.address_lat = request.data.get('address_lat', assignment.customer.address_lat)
                    delivery.address_lng = request.data.get('address_lng', assignment.customer.address_lng)
                    delivery.status = 'WAITING'
                    delivery.save()
                    created = False # It was updated, not created
                except Delivery.DoesNotExist:
                    # Yeni kayıt oluştur
                    delivery = Delivery.objects.create(
                        assignment=assignment,
                        scheduled_date=scheduled_date, # Model field
                        address=request.data.get('address', assignment.customer.open_address or ''),
                        address_lat=request.data.get('address_lat', assignment.customer.address_lat),
                        address_lng=request.data.get('address_lng', assignment.customer.address_lng),
                        status='WAITING'
                    )
                    created = True
                
                serializer = self.get_serializer(delivery)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def destroy(self, request, *args, **kwargs):
        """
        Explicit destroy method for debugging.
        """
        try:
            instance = self.get_object()
            print(f"Deleting Delivery ID: {instance.id}, Status: {instance.status}")
            self.perform_destroy(instance)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            print(f"Error in DeliveryViewSet.destroy: {e}")
            import traceback
            traceback.print_exc()
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def perform_destroy(self, instance):
        """
        Teslimat silindiğinde assignment durumunu geri al.
        """
        with transaction.atomic():
            # Check if assignment exists (it's optional in model)
            if hasattr(instance, 'assignment') and instance.assignment:
                assignment = instance.assignment
                # Eğer atama durumu 'DELIVERED' veya 'COMPLETED' ise silmeyi engelleyebiliriz
                # Ancak kullanıcı 'sil' diyorsa belki yanlıştır diye düzeltmek istiyordur.
                # Biz yine de durumu PLANNED'e çekelim.
                
                assignment.status = 'PLANNED'
                try:
                    assignment.save()
                except Exception as e:
                    # Assignment save fails (maybe user deleted?), log but continue
                    print(f"Error restoring assignment status: {e}")
            
            instance.delete()

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """
        KPI Stats for deliveries.
        Query params:
        - date: YYYY-MM-DD (optional) - for scheduled_for_selected_date_count
        - depot_id: int (optional) - filter by depot
        """
        queryset = Delivery.objects.all()
        
        # Depot filter
        depot_id = request.query_params.get('depot_id')
        if depot_id:
            queryset = queryset.filter(depot_id=depot_id)
        
        # Waiting count (WAITING + OUT_FOR_DELIVERY)
        waiting_count = queryset.filter(status__in=['WAITING', 'OUT_FOR_DELIVERY']).count()
        
        # Delivered in last 10 days
        last_10_days = timezone.now() - timedelta(days=10)
        delivered_count = queryset.filter(
            status='DELIVERED', 
            delivered_at__gte=last_10_days
        ).count()
        
        # Scheduled for selected date
        selected_date = request.query_params.get('date')
        scheduled_for_selected_date_count = 0
        if selected_date:
            try:
                date_obj = datetime.strptime(selected_date, '%Y-%m-%d').date()
                scheduled_for_selected_date_count = queryset.filter(
                    scheduled_date=date_obj
                ).count()
            except ValueError:
                pass  # Invalid date format, return 0
        
        return Response({
            'waiting_count': waiting_count,
            'delivered_last_10_days_count': delivered_count,
            'scheduled_for_selected_date_count': scheduled_for_selected_date_count
        })

class DeliveryRouteViewSet(viewsets.ModelViewSet):
    """Teslimat rotası yönetimi ve optimizasyonu."""
    permission_classes = [IsAdminUser]
    queryset = DeliveryRoute.objects.all()
    serializer_class = DeliveryRouteSerializer
    
    @action(detail=False, methods=['post'])
    def optimize(self, request):
        """
        Rota optimizasyonu - Yeni sürüm route_optimizer servisi ile.
        Body: { 
            date: "2026-01-07",
            delivery_ids: [1, 2, 3],
            depot_id: 1,
            algorithm: "nearest_neighbor"
        }
        """
        from products.services.route_optimizer import RouteOptimizer
        from products.models import DepotLocation
        
        date_str = request.data.get('date')
        delivery_ids = request.data.get('delivery_ids', [])
        depot_id = request.data.get('depot_id')
        algorithm = request.data.get('algorithm', 'nearest_neighbor')
        
        # Validation
        if not date_str:
            return Response({'error': 'date zorunludur'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            route_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return Response({'error': 'Geçersiz tarih formatı (YYYY-MM-DD)'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Get depot
        if depot_id:
            try:
                depot = DepotLocation.objects.get(id=depot_id)
            except DepotLocation.DoesNotExist:
                return Response({'error': 'Depo bulunamadı'}, status=status.HTTP_404_NOT_FOUND)
        else:
            # Get default depot
            try:
                depot = DepotLocation.objects.get(is_default=True)
            except DepotLocation.DoesNotExist:
                return Response({'error': 'Varsayılan depo bulunamadı. Lütfen depo seçin.'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Get deliveries
        if delivery_ids:
            deliveries = Delivery.objects.filter(
                id__in=delivery_ids,
                scheduled_date=route_date,
                status='WAITING'
            )
        else:
            deliveries = Delivery.objects.filter(
                scheduled_date=route_date,
                status='WAITING'
            )
        
        if not deliveries.exists():
            return Response({'error': 'Optimize edilecek teslimat yok'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Check for missing coordinates
        missing_coords = []
        deliveries_data = []
        
        for delivery in deliveries:
            customer = delivery.assignment.customer if delivery.assignment else None
            
            # Use customer's address coordinates
            lat = customer.address_lat if customer else delivery.address_lat
            lng = customer.address_lng if customer else delivery.address_lng
            
            if not lat or not lng:
                missing_coords.append({
                    'delivery_id': delivery.id,
                    'customer': customer.username if customer else 'Unknown'
                })
            else:
                deliveries_data.append({
                    'id': delivery.id,
                    'lat': float(lat),
                    'lng': float(lng),
                    'customer_name': customer.first_name if customer else '',
                    'product_name': delivery.assignment.product.name if delivery.assignment else ''
                })
        
        if missing_coords:
            return Response({
                'error': 'Bazı teslimatların koordinatı eksik',
                'missing_coordinates': missing_coords
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Optimize using service
        optimizer = RouteOptimizer(
            depot_lat=float(depot.latitude),
            depot_lng=float(depot.longitude)
        )
        
        result = optimizer.optimize_deliveries(deliveries_data, algorithm=algorithm)
        
        # Update delivery records
        with transaction.atomic():
            for optimized in result['optimized_deliveries']:
                delivery = Delivery.objects.get(id=optimized['id'])
                delivery.delivery_order = optimized['order']
                delivery.distance_km = optimized['distance_from_previous']
                delivery.route_batch_id = result['batch_id']
                delivery.depot = depot
                delivery.save()
        
        return Response({
            'success': True,
            'batch_id': result['batch_id'],
            'total_km': result['total_km'],
            'algorithm': result['algorithm'],
            'depot': {
                'id': depot.id,
                'name': depot.name,
                'lat': float(depot.latitude),
                'lng': float(depot.longitude)
            },
            'optimized_deliveries': result['optimized_deliveries'],
            'delivery_count': len(result['optimized_deliveries'])
        })

    def _dist(self, lat1, lng1, lat2, lng2):
        # Haversine
        R = 6371
        dLat = math.radians(lat2 - lat1)
        dLon = math.radians(lng2 - lng1)
        a = math.sin(dLat/2) * math.sin(dLat/2) + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2) * math.sin(dLon/2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        return R * c
