import pytest
from django.contrib.auth import get_user_model
from products.models import Category, Product, ProductOwnership
from datetime import date
from dateutil.relativedelta import relativedelta

User = get_user_model()

@pytest.mark.django_db
class TestModels:
    def test_user_creation(self):
        user = User.objects.create_user(username='modeluser', password='password123', role='customer')
        assert user.username == 'modeluser'
        assert user.role == 'customer'
        assert user.check_password('password123')

    def test_category_creation(self):
        category = Category.objects.create(name='Electronics')
        assert str(category) == 'Electronics'

    def test_product_creation(self):
        category = Category.objects.create(name='Appliances')
        product = Product.objects.create(
            name='Washing Machine',
            brand='Beko',
            category=category,
            price=5000.00,
            stock=10
        )
        assert str(product) == 'Washing Machine'
        assert product.stock == 10
        assert product.brand == 'Beko'

    def test_product_ownership_warranty(self):
        user = User.objects.create_user(username='owner', password='password123', role='customer')
        product = Product.objects.create(
            name='TV',
            brand='Beko',
            price=10000.00,
            warranty_duration_months=24
        )
        purchase_date = date.today()
        ownership = ProductOwnership.objects.create(
            customer=user,
            product=product,
            purchase_date=purchase_date
        )
        
        expected_warranty_end = purchase_date + relativedelta(months=24)
        assert ownership.warranty_end_date == expected_warranty_end
        assert str(ownership) == f"owner owns TV"

    def test_user_roles(self):
        admin = User.objects.create_user(username='admin', role='admin')
        seller = User.objects.create_user(username='seller', role='seller')
        delivery = User.objects.create_user(username='delivery', role='delivery')
        
        assert admin.role == 'admin'
        assert seller.role == 'seller'
        assert delivery.role == 'delivery'
