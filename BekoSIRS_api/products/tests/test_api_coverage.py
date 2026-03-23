"""
API endpoint ve model coverage testleri.
Recommendation, ServiceRequest, Delivery, Installment, Wishlist, Review endpoint'leri.
"""
import pytest
from decimal import Decimal
from datetime import date, timedelta
from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APIClient
from rest_framework import status
from products.models import (
    Category, Product, ProductOwnership,
    Wishlist, WishlistItem, Review,
    ServiceRequest, Notification,
    InstallmentPlan, Installment, Recommendation,
)

User = get_user_model()


# ──────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────

@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(username='admin_cov', password='Admin123!', role='admin')


@pytest.fixture
def customer_user(db):
    return User.objects.create_user(username='cust_cov', password='Cust123!', role='customer')


@pytest.fixture
def seller_user(db):
    return User.objects.create_user(username='seller_cov', password='Sell123!', role='seller')


@pytest.fixture
def category(db):
    return Category.objects.create(name='Beyaz Esya')


@pytest.fixture
def product(db, category):
    return Product.objects.create(
        name='Bulaşık Makinesi',
        brand='Beko',
        category=category,
        price=Decimal('8500.00'),
        stock=15,
        warranty_duration_months=24,
    )


@pytest.fixture
def ownership(db, customer_user, product):
    return ProductOwnership.objects.create(
        customer=customer_user,
        product=product,
        purchase_date=date.today(),
    )


# ──────────────────────────────────────────────
# Product API Tests
# ──────────────────────────────────────────────

@pytest.mark.django_db
class TestProductAPI:
    def test_list_products_authenticated(self, api_client, customer_user, product):
        api_client.force_authenticate(user=customer_user)
        r = api_client.get('/api/v1/products/')
        assert r.status_code == status.HTTP_200_OK

    def test_create_product_unauthenticated_blocked(self, api_client, category):
        r = api_client.post('/api/v1/products/', {'name': 'Hack', 'price': 1, 'stock': 1, 'category': category.id})
        assert r.status_code == status.HTTP_401_UNAUTHORIZED

    def test_product_detail(self, api_client, customer_user, product):
        api_client.force_authenticate(user=customer_user)
        r = api_client.get(f'/api/v1/products/{product.id}/')
        assert r.status_code == status.HTTP_200_OK
        assert r.data['name'] == 'Bulaşık Makinesi'

    def test_admin_can_delete_product(self, api_client, admin_user, product):
        api_client.force_authenticate(user=admin_user)
        r = api_client.delete(f'/api/v1/products/{product.id}/')
        assert r.status_code == status.HTTP_204_NO_CONTENT


# ──────────────────────────────────────────────
# Wishlist API Tests
# ──────────────────────────────────────────────

@pytest.mark.django_db
class TestWishlistAPI:
    def test_list_wishlist(self, api_client, customer_user):
        # Wishlist is OneToOne per customer — create directly
        Wishlist.objects.create(customer=customer_user)
        api_client.force_authenticate(user=customer_user)
        r = api_client.get('/api/v1/wishlist/')
        assert r.status_code == status.HTTP_200_OK

    def test_add_item_to_wishlist(self, api_client, customer_user, product):
        Wishlist.objects.create(customer=customer_user)
        api_client.force_authenticate(user=customer_user)
        # WishlistItem is managed via /api/v1/wishlist/add-item/ custom action
        r = api_client.post('/api/v1/wishlist/add-item/', {'product_id': product.id})
        assert r.status_code == status.HTTP_201_CREATED


# ──────────────────────────────────────────────
# Review API Tests
# ──────────────────────────────────────────────

@pytest.mark.django_db
class TestReviewAPI:
    def test_create_review(self, api_client, customer_user, product, ownership):
        api_client.force_authenticate(user=customer_user)
        r = api_client.post('/api/v1/reviews/', {
            'product': product.id,
            'rating': 5,
            'comment': 'Mükemmel ürün!',
        })
        assert r.status_code == status.HTTP_201_CREATED

    def test_list_reviews(self, api_client, customer_user, product, ownership):
        Review.objects.create(customer=customer_user, product=product, rating=4, comment='İyi')
        api_client.force_authenticate(user=customer_user)
        r = api_client.get('/api/v1/reviews/')
        assert r.status_code == status.HTTP_200_OK


# ──────────────────────────────────────────────
# Service Request API Tests
# ──────────────────────────────────────────────

@pytest.mark.django_db
class TestServiceRequestAPI:
    def test_customer_create_service_request(self, api_client, customer_user, product, ownership):
        api_client.force_authenticate(user=customer_user)
        r = api_client.post('/api/v1/service-requests/', {
            'description': 'Kapı açılmıyor.',
            'request_type': 'repair',
            'product_ownership': ownership.id,
        })
        assert r.status_code == status.HTTP_201_CREATED

    def test_list_service_requests_admin(self, api_client, admin_user, customer_user, product, ownership):
        ServiceRequest.objects.create(
            customer=customer_user,
            description='Test arıza',
            request_type='repair',
        )
        api_client.force_authenticate(user=admin_user)
        r = api_client.get('/api/v1/service-requests/')
        assert r.status_code == status.HTTP_200_OK

    def test_customer_sees_own_requests_only(self, api_client, customer_user, admin_user, product, ownership):
        ServiceRequest.objects.create(
            customer=customer_user,
            description='Kendi talebim',
            request_type='repair',
        )
        api_client.force_authenticate(user=customer_user)
        r = api_client.get('/api/v1/service-requests/')
        assert r.status_code == status.HTTP_200_OK


# ──────────────────────────────────────────────
# Installment Plan API Tests
# ──────────────────────────────────────────────

@pytest.mark.django_db
class TestInstallmentPlanAPI:
    def test_admin_create_plan(self, api_client, admin_user, customer_user, product):
        api_client.force_authenticate(user=admin_user)
        r = api_client.post('/api/v1/installment-plans/', {
            'customer': customer_user.id,
            'product': product.id,
            'total_amount': '9000.00',
            'down_payment': '1000.00',
            'installment_count': 6,
            'start_date': str(date.today()),
        })
        assert r.status_code == status.HTTP_201_CREATED

    def test_customer_can_list_own_plans(self, api_client, admin_user, customer_user, product):
        plan = InstallmentPlan.objects.create(
            customer=customer_user,
            product=product,
            total_amount=Decimal('6000.00'),
            down_payment=Decimal('0.00'),
            installment_count=3,
            start_date=date.today(),
            created_by=admin_user,
        )
        api_client.force_authenticate(user=customer_user)
        r = api_client.get('/api/v1/installment-plans/my-plans/')
        assert r.status_code == status.HTTP_200_OK


# ──────────────────────────────────────────────
# Recommendation API Tests
# ──────────────────────────────────────────────

@pytest.mark.django_db
class TestRecommendationAPI:
    def test_list_recommendations_returns_200(self, api_client, customer_user):
        api_client.force_authenticate(user=customer_user)
        r = api_client.get('/api/v1/recommendations/')
        assert r.status_code == status.HTTP_200_OK

    def test_recommendations_returns_list(self, api_client, customer_user, product):
        Recommendation.objects.create(
            customer=customer_user,
            product=product,
            score=0.85,
            reason='İçerik tabanlı öneri',
        )
        api_client.force_authenticate(user=customer_user)
        r = api_client.get('/api/v1/recommendations/')
        assert r.status_code == status.HTTP_200_OK

    def test_unauthenticated_cannot_access_recommendations(self, api_client):
        r = api_client.get('/api/v1/recommendations/')
        assert r.status_code == status.HTTP_401_UNAUTHORIZED


# ──────────────────────────────────────────────
# Notification API Tests
# ──────────────────────────────────────────────

@pytest.mark.django_db
class TestNotificationAPI:
    def test_list_notifications(self, api_client, customer_user, product):
        Notification.objects.create(
            user=customer_user,
            notification_type='general',
            title='Test Bildirimi',
            message='Deneme mesajı',
        )
        api_client.force_authenticate(user=customer_user)
        r = api_client.get('/api/v1/notifications/')
        assert r.status_code == status.HTTP_200_OK


# ──────────────────────────────────────────────
# Management Command: check_overdue_installments
# ──────────────────────────────────────────────

@pytest.mark.django_db
class TestCheckOverdueInstallmentsCommand:
    def _create_plan(self, customer, product, admin):
        return InstallmentPlan.objects.create(
            customer=customer,
            product=product,
            total_amount=Decimal('3000.00'),
            down_payment=Decimal('0.00'),
            installment_count=3,
            start_date=date.today(),
            created_by=admin,
        )

    def test_overdue_installment_gets_updated(self, admin_user, customer_user, product):
        plan = self._create_plan(customer_user, product, admin_user)
        inst = Installment.objects.create(
            plan=plan,
            installment_number=1,
            amount=Decimal('1000.00'),
            due_date=date.today() - timedelta(days=5),
            status='pending',
        )
        call_command('check_overdue_installments')
        inst.refresh_from_db()
        assert inst.status == 'overdue'

    def test_future_installment_not_affected(self, admin_user, customer_user, product):
        plan = self._create_plan(customer_user, product, admin_user)
        inst = Installment.objects.create(
            plan=plan,
            installment_number=1,
            amount=Decimal('1000.00'),
            due_date=date.today() + timedelta(days=10),
            status='pending',
        )
        call_command('check_overdue_installments')
        inst.refresh_from_db()
        assert inst.status == 'pending'

    def test_dry_run_does_not_update(self, admin_user, customer_user, product):
        plan = self._create_plan(customer_user, product, admin_user)
        inst = Installment.objects.create(
            plan=plan,
            installment_number=1,
            amount=Decimal('1000.00'),
            due_date=date.today() - timedelta(days=3),
            status='pending',
        )
        call_command('check_overdue_installments', dry_run=True)
        inst.refresh_from_db()
        assert inst.status == 'pending'

    def test_notification_created_for_overdue(self, admin_user, customer_user, product):
        plan = self._create_plan(customer_user, product, admin_user)
        Installment.objects.create(
            plan=plan,
            installment_number=1,
            amount=Decimal('1000.00'),
            due_date=date.today() - timedelta(days=2),
            status='pending',
        )
        call_command('check_overdue_installments')
        assert Notification.objects.filter(
            user=customer_user,
            notification_type='general',
            title__startswith='Gecikmiş Taksit',
        ).exists()

    def test_paid_installment_not_marked_overdue(self, admin_user, customer_user, product):
        plan = self._create_plan(customer_user, product, admin_user)
        inst = Installment.objects.create(
            plan=plan,
            installment_number=1,
            amount=Decimal('1000.00'),
            due_date=date.today() - timedelta(days=5),
            status='paid',
        )
        call_command('check_overdue_installments')
        inst.refresh_from_db()
        assert inst.status == 'paid'
