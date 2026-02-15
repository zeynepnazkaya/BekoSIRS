from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from ..models import Delivery, DeliveryRoute, ProductAssignment
from ..serializers import (
    DeliverySerializer, 
    DeliveryRouteSerializer, 
    ProductAssignmentSerializer
)
from ..permissions import IsAdminOrReadOnly, IsDeliveryPerson, IsAdmin

class DeliveryViewSet(viewsets.ModelViewSet):
    queryset = Delivery.objects.all()
    serializer_class = DeliverySerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['status', 'assignment__customer__username']

class DeliveryRouteViewSet(viewsets.ModelViewSet):
    queryset = DeliveryRoute.objects.all()
    serializer_class = DeliveryRouteSerializer
    permission_classes = [IsAdminOrReadOnly]
    
    @action(detail=True, methods=['post'])
    def optimize(self, request, pk=None):
        # Placeholder for optimization logic
        return Response({"message": "Optimization started (mock)"})

class ProductAssignmentViewSet(viewsets.ModelViewSet):
    queryset = ProductAssignment.objects.all()
    serializer_class = ProductAssignmentSerializer
    permission_classes = [IsAdminOrReadOnly]
    filter_backends = [filters.SearchFilter]
    search_fields = ['customer__username', 'product__name']

class DeliveryPersonViewSet(viewsets.GenericViewSet):
    """
    Viewset specifically for Delivery Personnel to manage their tasks.
    """
    permission_classes = [permissions.IsAuthenticated, IsDeliveryPerson]
    
    def get_queryset(self):
        # Only show deliveries assigned to the current user
        return Delivery.objects.filter(delivered_by=self.request.user)

    @action(detail=False, methods=['get'])
    def my_route(self, request):
        """
        Get today's active route for the logged-in delivery person.
        """
        today = timezone.now().date()
        deliveries = Delivery.objects.filter(
            delivered_by=request.user,
            scheduled_date=today
        ).order_by('delivery_order')
        
        serializer = DeliverySerializer(deliveries, many=True)
        return Response(serializer.data)

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
        
        delivery.save()
        return Response(DeliverySerializer(delivery).data)
