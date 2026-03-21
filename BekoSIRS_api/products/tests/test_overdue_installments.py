# products/tests/test_overdue_installments.py
"""
Gecikmiş taksit otomasyonu testleri.
_mark_overdue_installments() fonksiyonu ve API endpoint'lerinin
gecikmiş taksitleri doğru işaretleyip işaretlemediğini test eder.
"""

from decimal import Decimal
from datetime import date, timedelta
from django.test import TestCase
from rest_framework.test import APIClient

from products.models import CustomUser, Product, Category, InstallmentPlan, Installment
from products.views.installment_views import _mark_overdue_installments


class MarkOverdueUnitTest(TestCase):
    """_mark_overdue_installments() fonksiyonu birim testleri."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = CustomUser.objects.create_user(
            username='admin_overdue', password='Admin123!', role='admin'
        )
        cls.customer = CustomUser.objects.create_user(
            username='customer_overdue', password='Customer123!', role='customer'
        )
        cls.category = Category.objects.create(name='Test Kategori')
        cls.product = Product.objects.create(
            name='Test Ürün', brand='Test', category=cls.category,
            price=Decimal('10000.00'), stock=5, warranty_duration_months=12
        )

    def _create_plan_with_installment(self, due_date, status='pending'):
        plan = InstallmentPlan.objects.create(
            customer=self.customer,
            product=self.product,
            total_amount=Decimal('3000.00'),
            down_payment=Decimal('0.00'),
            installment_count=3,
            start_date=date.today(),
            status='active',
            created_by=self.admin
        )
        inst = Installment.objects.create(
            plan=plan,
            installment_number=1,
            amount=Decimal('1000.00'),
            due_date=due_date,
            status=status
        )
        return plan, inst

    def test_pending_past_due_becomes_overdue(self):
        """Vade tarihi geçmiş pending taksit, fonksiyon çalışınca overdue olmalı."""
        past_date = date.today() - timedelta(days=5)
        _, inst = self._create_plan_with_installment(due_date=past_date, status='pending')

        _mark_overdue_installments()

        inst.refresh_from_db()
        self.assertEqual(inst.status, 'overdue')

    def test_future_due_stays_pending(self):
        """Vade tarihi gelecekte olan pending taksit, pending kalmalı."""
        future_date = date.today() + timedelta(days=10)
        _, inst = self._create_plan_with_installment(due_date=future_date, status='pending')

        _mark_overdue_installments()

        inst.refresh_from_db()
        self.assertEqual(inst.status, 'pending')

    def test_today_due_stays_pending(self):
        """Vade tarihi bugün olan taksit henüz gecikmiş sayılmamalı (due_date__lt=today)."""
        today = date.today()
        _, inst = self._create_plan_with_installment(due_date=today, status='pending')

        _mark_overdue_installments()

        inst.refresh_from_db()
        self.assertEqual(inst.status, 'pending')

    def test_already_paid_not_affected(self):
        """Ödenmiş taksit overdue yapılmamalı."""
        past_date = date.today() - timedelta(days=5)
        _, inst = self._create_plan_with_installment(due_date=past_date, status='paid')

        _mark_overdue_installments()

        inst.refresh_from_db()
        self.assertEqual(inst.status, 'paid')

    def test_customer_confirmed_not_affected(self):
        """Müşteri onaylamış taksit overdue yapılmamalı."""
        past_date = date.today() - timedelta(days=5)
        _, inst = self._create_plan_with_installment(due_date=past_date, status='customer_confirmed')

        _mark_overdue_installments()

        inst.refresh_from_db()
        self.assertEqual(inst.status, 'customer_confirmed')


class OverdueAPITriggerTest(TestCase):
    """API endpoint'leri gecikmiş taksitleri otomatik işaretlemeli."""

    @classmethod
    def setUpTestData(cls):
        cls.admin = CustomUser.objects.create_user(
            username='admin_api_overdue', password='Admin123!', role='admin'
        )
        cls.customer = CustomUser.objects.create_user(
            username='customer_api_overdue', password='Customer123!', role='customer'
        )
        cls.category = Category.objects.create(name='Test Kategori API')
        cls.product = Product.objects.create(
            name='Test Ürün API', brand='Test', category=cls.category,
            price=Decimal('6000.00'), stock=5, warranty_duration_months=12
        )

    def setUp(self):
        self.client = APIClient()
        # Her test için taze bir plan ve gecikmiş taksit oluştur
        self.plan = InstallmentPlan.objects.create(
            customer=self.customer,
            product=self.product,
            total_amount=Decimal('3000.00'),
            down_payment=Decimal('0.00'),
            installment_count=3,
            start_date=date.today(),
            status='active',
            created_by=self.admin
        )
        self.overdue_inst = Installment.objects.create(
            plan=self.plan,
            installment_number=1,
            amount=Decimal('1000.00'),
            due_date=date.today() - timedelta(days=10),
            status='pending'
        )

    def test_admin_list_triggers_overdue(self):
        """Admin /installment-plans/ çekince gecikmiş taksitler overdue olmalı."""
        self.client.force_authenticate(user=self.admin)
        self.client.get('/api/v1/installment-plans/', follow=True)

        self.overdue_inst.refresh_from_db()
        self.assertEqual(self.overdue_inst.status, 'overdue')

    def test_customer_my_plans_triggers_overdue(self):
        """Müşteri /my-plans/ çekince gecikmiş taksitleri overdue olmalı."""
        self.client.force_authenticate(user=self.customer)
        self.client.get('/api/v1/installment-plans/my-plans/', follow=True)

        self.overdue_inst.refresh_from_db()
        self.assertEqual(self.overdue_inst.status, 'overdue')

    def test_installments_detail_triggers_overdue(self):
        """Plan taksit detayı çekilince gecikmiş taksitler overdue olmalı."""
        self.client.force_authenticate(user=self.admin)
        self.client.get(f'/api/v1/installment-plans/{self.plan.id}/installments/', follow=True)

        self.overdue_inst.refresh_from_db()
        self.assertEqual(self.overdue_inst.status, 'overdue')
