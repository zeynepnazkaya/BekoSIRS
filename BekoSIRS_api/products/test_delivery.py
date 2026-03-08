import pytest
from django.urls import reverse
from rest_framework import status
from products.models import Delivery, DeliveryRoute, ProductAssignment, Product, Category
from datetime import date
from .conftest import APITestCase

@pytest.mark.django_db
class TestDeliverySystem(APITestCase):
    def setUp(self):
        super().setUp()
        
        # Django Rest Framework IsAdminUser permission checks for is_staff
        self.admin_user.is_staff = True
        self.admin_user.save()
        
        # URL'ler
        self.list_url = reverse('delivery-list')
        
        # Create a category and product for ProductAssignment
        self.category = Category.objects.create(name='Test Kategori')
        self.product = Product.objects.create(
            name='Test Ürün', brand='Beko', category=self.category,
            price=1000.00, stock=10
        )

    def test_create_delivery_as_admin(self):
        self.authenticate_admin()
        
        # First create a ProductAssignment
        assignment = ProductAssignment.objects.create(
            customer=self.customer_user,
            product=self.product,
            assigned_by=self.admin_user,
            status='PLANNED'
        )
        
        # Django signals create a delivery automatically when assignment is created
        # We need to delete it first to test manual creation
        Delivery.objects.filter(assignment=assignment).delete()
        
        data = {
            'assignment': assignment.id,
            'address': 'Test Adresi',
            'scheduled_date': str(date.today()),
            'status': 'WAITING'
        }
        response = self.client.post(self.list_url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert Delivery.objects.count() == 1

    def test_customer_cannot_create_delivery(self):
        self.authenticate_customer()
        
        assignment = ProductAssignment.objects.create(
            customer=self.customer_user,
            product=self.product,
            assigned_by=self.admin_user,
            status='PLANNED'
        )
        
        data = {
            'assignment': assignment.id,
            'address': 'Test',
            'scheduled_date': str(date.today())
        }
        response = self.client.post(self.list_url, data)
        # Sadece adminler teslimat oluşturabilir
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_route_optimization_logic(self):
        self.authenticate_admin()
        
        # Create a route first
        route = DeliveryRoute.objects.create(date=date.today())
        
        # Create a delivery with coordinates
        assignment = ProductAssignment.objects.create(
            customer=self.customer_user,
            product=self.product,
            assigned_by=self.admin_user,
            status='PLANNED'
        )
        # Delete the auto-created delivery from the signal
        Delivery.objects.filter(assignment=assignment).delete()
        
        delivery = Delivery.objects.create(
            assignment=assignment,
            address='Koordinatlı',
            address_lat=35.1234,
            address_lng=33.1234,
            scheduled_date=date.today(),
            status='WAITING'
        )
        
        # optimize is a list action on DeliveryRouteViewSet
        optimize_url = reverse('delivery-route-optimize')
        
        data = {
            'delivery_ids': [delivery.id],
            'date': str(date.today())
        }
        
        response = self.client.post(optimize_url, data, format='json')
        
        # The optimize endpoint should return 200 and route info
        assert response.status_code == status.HTTP_200_OK

    def test_optimization_handles_missing_coordinates(self):
        self.authenticate_admin()
        
        # Create a route
        route = DeliveryRoute.objects.create(date=date.today())
        
        # Create a delivery without coordinates
        assignment = ProductAssignment.objects.create(
            customer=self.customer_user,
            product=self.product,
            assigned_by=self.admin_user,
            status='PLANNED'
        )
        # Delete the auto-created delivery from the signal
        Delivery.objects.filter(assignment=assignment).delete()
        
        delivery = Delivery.objects.create(
            assignment=assignment,
            address='Koordinatsız',
            address_lat=None,
            address_lng=None,
            scheduled_date=date.today(),
            status='WAITING'
        )
        
        optimize_url = reverse('delivery-route-optimize')
        
        data = {
            'delivery_ids': [delivery.id],
            'date': str(date.today())
        }
        
        response = self.client.post(optimize_url, data, format='json')
        
        # The optimize endpoint returns 400 if no coordinates are found for selected deliveries
        assert response.status_code == status.HTTP_400_BAD_REQUEST
