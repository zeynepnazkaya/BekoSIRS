from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Q, Count
import math
from ..models import Delivery, DeliveryRoute, DeliveryRouteStop, ProductAssignment, CustomUser, DepotLocation
from ..serializers import (
    DeliverySerializer, 
    DeliveryRouteSerializer, 
    ProductAssignmentSerializer
)
from ..permissions import IsAdminOrReadOnly, IsDeliveryPerson, IsAdmin


# ============================================
# Haversine Distance Calculator
# ============================================
def haversine_km(lat1, lon1, lat2, lon2):
    """İki koordinat arasındaki mesafeyi km olarak hesaplar."""
    R = 6371  # Earth radius in km
    lat1, lon1, lat2, lon2 = map(math.radians, [float(lat1), float(lon1), float(lat2), float(lon2)])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    return R * c


def nearest_neighbor_route(depot_lat, depot_lng, deliveries_with_coords):
    """
    Nearest-Neighbor algoritması ile en kısa rota sıralaması.
    deliveries_with_coords: [(delivery_obj, lat, lng), ...]
    Returns: ordered list of (delivery_obj, lat, lng, distance_from_prev)
    """
    if not deliveries_with_coords:
        return []
    
    unvisited = list(deliveries_with_coords)
    route = []
    current_lat, current_lng = float(depot_lat), float(depot_lng)
    
    while unvisited:
        nearest = None
        nearest_dist = float('inf')
        for item in unvisited:
            d_obj, lat, lng = item
            dist = haversine_km(current_lat, current_lng, lat, lng)
            if dist < nearest_dist:
                nearest_dist = dist
                nearest = item
        
        unvisited.remove(nearest)
        route.append((nearest[0], nearest[1], nearest[2], nearest_dist))
        current_lat, current_lng = float(nearest[1]), float(nearest[2])
    
    return route


# ============================================
# ProductAssignment ViewSet
# ============================================
class ProductAssignmentViewSet(viewsets.ModelViewSet):
    queryset = ProductAssignment.objects.select_related('customer', 'product').all()
    serializer_class = ProductAssignmentSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['customer__username', 'customer__first_name', 'customer__last_name', 'product__name', 'product__model_code']
    ordering_fields = ['assigned_at', 'status']

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Her durum için atama sayısını döndürür."""
        qs = ProductAssignment.objects.aggregate(
            planned=Count('id', filter=Q(status='PLANNED')),
            scheduled=Count('id', filter=Q(status='SCHEDULED')),
            out_for_delivery=Count('id', filter=Q(status='OUT_FOR_DELIVERY')),
            delivered=Count('id', filter=Q(status='DELIVERED')),
        )
        return Response(qs)

    @action(detail=True, methods=['post'])
    def schedule_delivery(self, request, pk=None):
        """
        Tek bir atama için teslimat tarihi belirle.
        Body: { "scheduled_date": "2026-03-10", "address": "optional override" }
        """
        assignment = self.get_object()
        scheduled_date = request.data.get('scheduled_date')
        
        if not scheduled_date:
            return Response({"error": "scheduled_date gerekli."}, status=status.HTTP_400_BAD_REQUEST)
        
        # Eğer zaten bir Delivery varsa güncelle, yoksa oluştur
        delivery, created = Delivery.objects.get_or_create(
            assignment=assignment,
            defaults={
                'scheduled_date': scheduled_date,
                'address': request.data.get('address', ''),
                'status': 'WAITING',
            }
        )
        
        if not created:
            delivery.scheduled_date = scheduled_date
            if request.data.get('address'):
                delivery.address = request.data['address']
            delivery.save()
        
        # Assignment durumunu güncelle
        assignment.status = 'SCHEDULED'
        assignment.save()
        
        return Response(ProductAssignmentSerializer(assignment).data)

    @action(detail=False, methods=['post'])
    def batch_schedule(self, request):
        """
        Birden fazla atamaya aynı tarihte teslimat planla.
        Body: { "assignment_ids": [1, 2, 3], "scheduled_date": "2026-03-10" }
        """
        assignment_ids = request.data.get('assignment_ids', [])
        scheduled_date = request.data.get('scheduled_date')
        
        if not assignment_ids or not scheduled_date:
            return Response(
                {"error": "assignment_ids ve scheduled_date gerekli."}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        assignments = ProductAssignment.objects.filter(id__in=assignment_ids)
        scheduled_count = 0
        
        for assignment in assignments:
            delivery, created = Delivery.objects.get_or_create(
                assignment=assignment,
                defaults={
                    'scheduled_date': scheduled_date,
                    'status': 'WAITING',
                }
            )
            if not created:
                delivery.scheduled_date = scheduled_date
                delivery.save()
            
            assignment.status = 'SCHEDULED'
            assignment.save()
            scheduled_count += 1
        
        return Response({
            "message": f"{scheduled_count} atama planlandı.",
            "scheduled_count": scheduled_count
        })


# ============================================
# Delivery ViewSet
# ============================================
class DeliveryViewSet(viewsets.ModelViewSet):
    queryset = Delivery.objects.select_related(
        'assignment', 'assignment__customer', 'assignment__product'
    ).all()
    serializer_class = DeliverySerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['status', 'assignment__customer__username', 'assignment__customer__first_name', 'assignment__customer__last_name']
    ordering_fields = ['scheduled_date', 'delivery_order', 'status']

    def get_queryset(self):
        qs = super().get_queryset()
        # Tarihe göre filtreleme
        date = self.request.query_params.get('date')
        if date:
            qs = qs.filter(scheduled_date=date)
        # Duruma göre filtreleme
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Teslimat istatistikleri."""
        qs = Delivery.objects.aggregate(
            waiting=Count('id', filter=Q(status='WAITING')),
            out_for_delivery=Count('id', filter=Q(status='OUT_FOR_DELIVERY')),
            delivered=Count('id', filter=Q(status='DELIVERED')),
            failed=Count('id', filter=Q(status='FAILED')),
        )
        return Response(qs)

    @action(detail=False, methods=['get'])
    def by_date(self, request):
        """Belirli tarihteki teslimatları getirir."""
        date = request.query_params.get('date')
        if not date:
            return Response({"error": "date parametresi gerekli."}, status=status.HTTP_400_BAD_REQUEST)
        
        deliveries = Delivery.objects.filter(
            scheduled_date=date
        ).select_related(
            'assignment', 'assignment__customer', 'assignment__product'
        ).order_by('delivery_order')
        
        serializer = DeliverySerializer(deliveries, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def assign_driver(self, request):
        """
        Seçili teslimatları bir delivery person'a ata.
        Body: { "delivery_ids": [1, 2, 3], "driver_id": 5 }
        """
        delivery_ids = request.data.get('delivery_ids', [])
        driver_id = request.data.get('driver_id')
        
        if not delivery_ids or not driver_id:
            return Response(
                {"error": "delivery_ids ve driver_id gerekli."}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            driver = CustomUser.objects.get(id=driver_id, role='delivery')
        except CustomUser.DoesNotExist:
            return Response({"error": "Teslimatçı bulunamadı."}, status=status.HTTP_404_NOT_FOUND)
        
        updated = Delivery.objects.filter(id__in=delivery_ids).update(delivered_by=driver)
        
        # Eğer bu teslimatların rotası varsa rotanın driver'ını da güncelle
        routes = DeliveryRoute.objects.filter(
            stops__delivery_id__in=delivery_ids
        ).distinct()
        routes.update(assigned_driver=driver)
        
        return Response({
            "message": f"{updated} teslimat {driver.first_name} {driver.last_name}'e atandı.",
            "updated_count": updated
        })


# ============================================
# DeliveryRoute ViewSet (Rota Optimizasyonu)
# ============================================
class DeliveryRouteViewSet(viewsets.ModelViewSet):
    queryset = DeliveryRoute.objects.prefetch_related('stops', 'stops__delivery').all()
    serializer_class = DeliveryRouteSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        qs = super().get_queryset()
        date = self.request.query_params.get('date')
        if date:
            qs = qs.filter(date=date)
        return qs

    @action(detail=False, methods=['post'])
    def optimize(self, request):
        """
        Seçili teslimatlar için rota optimizasyonu yap.
        Body: {
            "delivery_ids": [1, 2, 3],
            "date": "2026-03-10",
            "depot_id": 1  (optional)
        }
        """
        delivery_ids = request.data.get('delivery_ids', [])
        date = request.data.get('date')
        depot_id = request.data.get('depot_id')
        
        if not delivery_ids or not date:
            return Response(
                {"error": "delivery_ids ve date gerekli."}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Depo bilgisi
        depot_lat, depot_lng = 35.1856, 33.3823  # Default: Lefkoşa
        store_address = "Beko Mağaza, Lefkoşa"
        
        if depot_id:
            try:
                depot = DepotLocation.objects.get(id=depot_id)
                depot_lat = float(depot.latitude)
                depot_lng = float(depot.longitude)
                store_address = depot.name
            except DepotLocation.DoesNotExist:
                pass
        else:
            # Varsayılan depo
            default_depot = DepotLocation.objects.filter(is_default=True).first()
            if default_depot:
                depot_lat = float(default_depot.latitude)
                depot_lng = float(default_depot.longitude)
                store_address = default_depot.name
        
        # Teslimatları getir
        deliveries = Delivery.objects.filter(
            id__in=delivery_ids
        ).select_related('assignment__customer', 'assignment__product')
        
        if not deliveries.exists():
            return Response({"error": "Teslimat bulunamadı."}, status=status.HTTP_404_NOT_FOUND)
        
        # Koordinat bilgisi olan teslimatları topla
        deliveries_with_coords = []
        no_coords = []
        
        for delivery in deliveries:
            lat = delivery.address_lat
            lng = delivery.address_lng
            
            # Eğer teslimatın kendi koordinatı yoksa, müşteri adresinden al
            if not lat or not lng:
                customer = delivery.assignment.customer
                try:
                    addr = customer.customer_address
                    lat = addr.latitude
                    lng = addr.longitude
                except Exception:
                    lat = None
                    lng = None
            
            if lat and lng:
                deliveries_with_coords.append((delivery, float(lat), float(lng)))
            else:
                no_coords.append(delivery.id)
        
        if not deliveries_with_coords:
            return Response(
                {"error": "Koordinat bilgisi olan teslimat bulunamadı. Müşteri adreslerine koordinat eklenmeli."},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Nearest Neighbor ile rota optimize et
        optimized_route = nearest_neighbor_route(depot_lat, depot_lng, deliveries_with_coords)
        
        # Toplam mesafe ve süre hesapla
        total_distance = sum(item[3] for item in optimized_route)
        avg_speed_kmh = 40  # KKTC koşullarında ortalama hız
        total_duration_min = int((total_distance / avg_speed_kmh) * 60) + len(optimized_route) * 5  # +5dk her durak

        # DeliveryRoute kaydı oluştur
        route = DeliveryRoute.objects.create(
            date=date,
            store_address=store_address,
            store_lat=depot_lat,
            store_lng=depot_lng,
            total_distance_km=round(total_distance, 2),
            total_duration_min=total_duration_min,
            is_optimized=True,
            optimized_at=timezone.now(),
            status='PLANNED'
        )
        
        # DeliveryRouteStop kayıtları oluştur ve teslimat sırasını güncelle
        stops_data = []
        for order, (delivery, lat, lng, dist_from_prev) in enumerate(optimized_route, 1):
            stop = DeliveryRouteStop.objects.create(
                route=route,
                delivery=delivery,
                stop_order=order,
                distance_from_previous_km=round(dist_from_prev, 2),
                duration_from_previous_min=int((dist_from_prev / avg_speed_kmh) * 60) + 5,
            )
            # Teslimat sırası güncelle
            delivery.delivery_order = order
            delivery.save(update_fields=['delivery_order'])
            
            stops_data.append({
                'stop_order': order,
                'delivery_id': delivery.id,
                'customer_name': f"{delivery.assignment.customer.first_name} {delivery.assignment.customer.last_name}",
                'product_name': delivery.assignment.product.name,
                'address': delivery.address or '',
                'lat': lat,
                'lng': lng,
                'distance_from_previous_km': round(dist_from_prev, 2),
                'duration_from_previous_min': int((dist_from_prev / avg_speed_kmh) * 60) + 5,
            })
        
        return Response({
            'route_id': route.id,
            'date': date,
            'total_distance_km': round(total_distance, 2),
            'total_duration_min': total_duration_min,
            'stop_count': len(optimized_route),
            'stops': stops_data,
            'warnings': {
                'no_coordinates': no_coords
            } if no_coords else {}
        })


# ============================================
# DeliveryPerson ViewSet (Mobil App)
# ============================================
class DeliveryPersonViewSet(viewsets.GenericViewSet):
    """
    Viewset specifically for Delivery Personnel to manage their tasks.
    """
    permission_classes = [permissions.IsAuthenticated, IsDeliveryPerson]
    
    def get_queryset(self):
        return Delivery.objects.filter(delivered_by=self.request.user)

    @action(detail=False, methods=['get'])
    def my_route(self, request):
        """
        Get today's active route for the logged-in delivery person.
        Includes route summary and ordered delivery stops.
        """
        today = timezone.now().date()
        
        # Bugünkü rotayı bul
        route = DeliveryRoute.objects.filter(
            assigned_driver=request.user,
            date=today
        ).prefetch_related('stops', 'stops__delivery').first()
        
        # Bugünkü teslimatları getir
        deliveries = Delivery.objects.filter(
            delivered_by=request.user,
            scheduled_date=today
        ).select_related(
            'assignment', 'assignment__customer', 'assignment__product'
        ).order_by('delivery_order')
        
        route_info = None
        if route:
            route_info = {
                'id': route.id,
                'total_distance_km': float(route.total_distance_km) if route.total_distance_km else 0,
                'total_duration_min': route.total_duration_min or 0,
                'status': route.status,
                'stop_count': route.stops.count(),
                'completed_count': deliveries.filter(status='DELIVERED').count(),
            }
        
        serializer = DeliverySerializer(deliveries, many=True)
        return Response({
            'route': route_info,
            'deliveries': serializer.data
        })

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        """
        Update the status of a specific delivery.
        """
        try:
            delivery = Delivery.objects.get(pk=pk, delivered_by=request.user)
        except Delivery.DoesNotExist:
            return Response({"error": "Teslimat bulunamadı."}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get('status')
        if new_status not in dict(Delivery.STATUS_CHOICES):
            return Response({"error": "Geçersiz durum."}, status=status.HTTP_400_BAD_REQUEST)

        delivery.status = new_status
        if new_status == 'DELIVERED':
            delivery.delivered_at = timezone.now()
            if delivery.assignment:
                delivery.assignment.status = 'DELIVERED'
                delivery.assignment.save()
        elif new_status == 'OUT_FOR_DELIVERY':
            if delivery.assignment:
                delivery.assignment.status = 'OUT_FOR_DELIVERY'
                delivery.assignment.save()
        
        delivery.save()
        
        # Rota durumu kontrolü - tüm teslimatlar tamamlandıysa rotayı da kapat
        if new_status == 'DELIVERED':
            try:
                route_stop = delivery.route_stop
                route = route_stop.route
                all_delivered = not route.stops.exclude(
                    delivery__status='DELIVERED'
                ).exists()
                if all_delivered:
                    route.status = 'COMPLETED'
                    route.save()
            except Exception:
                pass
        
        return Response(DeliverySerializer(delivery).data)

    @action(detail=False, methods=['post'])
    def start_route(self, request):
        """
        Teslimatçı rotasını başlatır. Tüm teslimatlar OUT_FOR_DELIVERY olur.
        """
        today = timezone.now().date()
        route = DeliveryRoute.objects.filter(
            assigned_driver=request.user,
            date=today,
            status='PLANNED'
        ).first()
        
        if not route:
            return Response({"error": "Bugün için planlı rota bulunamadı."}, status=status.HTTP_404_NOT_FOUND)
        
        # Rotayı başlat
        route.status = 'IN_PROGRESS'
        route.save()
        
        # Tüm teslimatları yolda olarak işaretle
        delivery_ids = route.stops.values_list('delivery_id', flat=True)
        Delivery.objects.filter(id__in=delivery_ids).update(status='OUT_FOR_DELIVERY')
        ProductAssignment.objects.filter(
            delivery__id__in=delivery_ids
        ).update(status='OUT_FOR_DELIVERY')
        
        return Response({"message": "Rota başlatıldı.", "route_status": "IN_PROGRESS"})
