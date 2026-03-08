import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from products.models import Product, Category

User = get_user_model()

@pytest.mark.django_db
class TestAPIPermissions:
    def setup_method(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(username='admin', password='password123', role='admin')
        self.customer = User.objects.create_user(username='customer', password='password123', role='customer')
        self.seller = User.objects.create_user(username='seller', password='password123', role='seller')

        # Setup basic data
        self.category = Category.objects.create(name='Test Category')
        self.product = Product.objects.create(
            name='Test Product',
            price=100.0,
            category=self.category,
            stock=10
        )

    def test_admin_can_access_users_list(self):
        """Admin should be able to list all users"""
        # Ensure admin user has is_staff=True if DRF IsAdminUser is used, 
        # but we switched to custom IsAdmin so role='admin' is enough.
        self.client.force_authenticate(user=self.admin)
        response = self.client.get('/api/v1/users/')
        assert response.status_code == status.HTTP_200_OK

    def test_customer_cannot_access_users_list(self):
        """Customer should NOT be able to list all users (403 Forbidden)"""
        self.client.force_authenticate(user=self.customer)
        response = self.client.get('/api/v1/users/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_seller_can_create_product(self):
        """Seller/Admin should be able to create a product"""
        self.client.force_authenticate(user=self.seller)
        data = {
            'name': 'New Product',
            'brand': 'Beko',
            'price': 200.0,
            'stock': 5,
            'category': self.category.id
        }
        response = self.client.post('/api/v1/products/', data)
        assert response.status_code == status.HTTP_201_CREATED

    def test_customer_cannot_create_product(self):
        """Customer should NOT be able to create a product"""
        self.client.force_authenticate(user=self.customer)
        data = {
            'name': 'Hacker Product',
            'brand': 'Hack',
            'price': 1.0,
            'stock': 1,
            'category': self.category.id
        }
        response = self.client.post('/api/v1/products/', data)
        assert response.status_code == status.HTTP_403_FORBIDDEN
