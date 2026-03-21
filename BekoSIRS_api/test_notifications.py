"""
Notification Event End-to-End Test
Tests all 5 notification triggers using Django test client + direct model calls.
Run with: py manage.py shell < test_notifications.py
or:        py manage.py runscript test_notifications (if django-extensions installed)
We'll run it standalone via: py test_notifications.py
"""

import os
import sys
import io
import django

# Force UTF-8 output on Windows
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'bekosirs_backend.settings')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

import json
from decimal import Decimal
from datetime import date, timedelta
from django.utils import timezone
from django.test import RequestFactory
from rest_framework.test import APIClient

from products.models import (
    CustomUser, Product, ProductAssignment, ProductOwnership,
    Delivery, InstallmentPlan, Installment, Notification,
    DeliveryRoute, DeliveryRouteStop,
)

# ─────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────
SEP = "-" * 60

def section(title):
    print(f"\n{SEP}")
    print(f"  {title}")
    print(SEP)

def notif_count(user):
    return Notification.objects.filter(user=user).count()

def latest_notif(user):
    n = Notification.objects.filter(user=user).order_by('-created_at').first()
    if n:
        return f"[{n.notification_type}] {n.title} | {n.message[:80]}"
    return "(none)"

def check(label, expected_count, actual_count, latest):
    ok = "[PASS]" if actual_count == expected_count else "[FAIL]"
    print(f"  {ok}  {label}")
    print(f"        Expected notifications: {expected_count}  |  Actual: {actual_count}")
    print(f"        Latest: {latest}")

# ─────────────────────────────────────────
# Setup
# ─────────────────────────────────────────
section("SETUP")

admin = CustomUser.objects.filter(role='admin').first()
customer = CustomUser.objects.get(username='urunatama')

# Clear all existing notifications for urunatama for a clean test
deleted, _ = Notification.objects.filter(user=customer).delete()
print(f"  Cleared {deleted} existing notifications for '{customer.username}'")

# Pick a product not already assigned to this customer
used_ids = ProductAssignment.objects.filter(customer=customer).values_list('product_id', flat=True)
product1 = Product.objects.exclude(id__in=used_ids).filter(stock__gt=0).first()
# For installment plan test, pick any product
product2 = Product.objects.exclude(id__in=used_ids).exclude(id=product1.id if product1 else 0).first()

print(f"  Admin     : {admin.username} (id={admin.id})")
print(f"  Customer  : {customer.username} (id={customer.id})")
print(f"  Product 1 : {product1.name} (id={product1.id})" if product1 else "  Product 1 : NOT FOUND - using first available")
print(f"  Product 2 : {product2.name} (id={product2.id})" if product2 else "  Product 2 : NOT FOUND")

if not product1:
    product1 = Product.objects.first()
if not product2:
    product2 = Product.objects.last()

client = APIClient()
client.force_authenticate(user=admin)

baseline = notif_count(customer)
print(f"\n  Baseline notifications: {baseline}")

# ─────────────────────────────────────────
# EVENT 1: Product Assigned
# ─────────────────────────────────────────
section("EVENT 1: Product Assigned (POST /api/v1/assignments/)")

pre = notif_count(customer)
resp = client.post('/api/v1/assignments/', {
    'customer_id': customer.id,
    'product_id': product1.id,
    'status': 'PLANNED',
}, format='json')
print(f"  API status: {resp.status_code}")
if resp.status_code not in (200, 201):
    print(f"  Response: {resp.data}")

post = notif_count(customer)
check("Assignment notification created", pre + 1, post, latest_notif(customer))

# Get the created assignment for next tests
new_assignment = ProductAssignment.objects.filter(
    customer=customer, product=product1
).order_by('-assigned_at').first()
print(f"  Created assignment id: {new_assignment.id if new_assignment else 'NOT FOUND'}")

# ─────────────────────────────────────────
# EVENT 2: Product Out for Delivery (via DeliveryPerson update_status)
# ─────────────────────────────────────────
section("EVENT 2: Product Out for Delivery (update_status -> OUT_FOR_DELIVERY)")

# Create a delivery and a delivery person
delivery_person = CustomUser.objects.filter(role='delivery').first()
if not delivery_person:
    print("  No delivery person found, creating temp one...")
    delivery_person = CustomUser.objects.create_user(
        username='test_driver_tmp',
        password='pass123',
        role='delivery',
        first_name='Test',
        last_name='Driver',
    )

delivery, _ = Delivery.objects.get_or_create(
    assignment=new_assignment,
    defaults={
        'status': 'WAITING',
        'scheduled_date': date.today(),
        'delivered_by': delivery_person,
    }
)
delivery.delivered_by = delivery_person
delivery.status = 'WAITING'
delivery.save()
print(f"  Created delivery id: {delivery.id}, delivered_by: {delivery_person.username}")

pre = notif_count(customer)
driver_client = APIClient()
driver_client.force_authenticate(user=delivery_person)
resp = driver_client.post(f'/api/v1/delivery-person/{delivery.id}/update_status/', {
    'status': 'OUT_FOR_DELIVERY'
}, format='json')
print(f"  API status: {resp.status_code}")
if resp.status_code not in (200, 201):
    print(f"  Response: {resp.data}")

post = notif_count(customer)
check("Out-for-delivery notification created", pre + 1, post, latest_notif(customer))

# ─────────────────────────────────────────
# EVENT 3: Product Delivered
# ─────────────────────────────────────────
section("EVENT 3: Product Delivered (update_status -> DELIVERED)")

pre = notif_count(customer)
resp = driver_client.post(f'/api/v1/delivery-person/{delivery.id}/update_status/', {
    'status': 'DELIVERED'
}, format='json')
print(f"  API status: {resp.status_code}")
if resp.status_code not in (200, 201):
    print(f"  Response: {resp.data}")

post = notif_count(customer)
check("Delivered notification created", pre + 1, post, latest_notif(customer))

# Also verify ProductOwnership was auto-created
ownership_exists = ProductOwnership.objects.filter(customer=customer, product=product1).exists()
print(f"  ProductOwnership auto-created: {'YES' if ownership_exists else 'NO'}")

# ─────────────────────────────────────────
# EVENT 4: Installment Plan Created
# ─────────────────────────────────────────
section("EVENT 4: Installment Plan Created (POST /api/v1/installment-plans/)")

pre = notif_count(customer)
resp = client.post('/api/v1/installment-plans/', {
    'customer': customer.id,
    'product': product2.id,
    'total_amount': '5000.00',
    'down_payment': '500.00',
    'installment_count': 12,
    'start_date': str(date.today()),
}, format='json')
print(f"  API status: {resp.status_code}")
if resp.status_code not in (200, 201):
    print(f"  Response: {resp.data}")

post = notif_count(customer)
check("Installment plan notification created", pre + 1, post, latest_notif(customer))

# Get the plan
new_plan = InstallmentPlan.objects.filter(customer=customer).order_by('-id').first()
installments_created = Installment.objects.filter(plan=new_plan).count() if new_plan else 0
print(f"  Installments auto-generated: {installments_created} (expected 12)")

# ─────────────────────────────────────────
# EVENT 5: Overdue Installment
# ─────────────────────────────────────────
section("EVENT 5: Overdue Installment (_mark_overdue_installments)")

# Create a clearly overdue installment (30 days past due)
overdue_plan = InstallmentPlan.objects.filter(customer=customer).last()
overdue_inst, _ = Installment.objects.get_or_create(
    plan=overdue_plan,
    installment_number=99,
    defaults={
        'amount': Decimal('416.67'),
        'due_date': date.today() - timedelta(days=30),
        'status': 'pending',
    }
)
# Force back to pending so the trigger fires fresh
overdue_inst.status = 'pending'
overdue_inst.due_date = date.today() - timedelta(days=30)
overdue_inst.save()
print(f"  Created fake overdue installment id: {overdue_inst.id}, due: {overdue_inst.due_date}")

pre = notif_count(customer)

# Trigger the mark-overdue function by calling the list endpoint
resp = client.get('/api/v1/installment-plans/')
print(f"  List API status: {resp.status_code}")

post = notif_count(customer)
overdue_inst.refresh_from_db()
print(f"  Installment status after trigger: {overdue_inst.status} (expected: overdue)")
check("Overdue notification created", pre + 1, post, latest_notif(customer))

# ─────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────
section("FULL SUMMARY")

all_notifs = Notification.objects.filter(user=customer).order_by('created_at')
print(f"\n  Total notifications for '{customer.username}': {all_notifs.count()}")
print(f"  (Expected: 5)\n")

events = {
    'EVENT 1 - Product Assigned'       : 'Yeni',
    'EVENT 2 - Out for Delivery'        : 'Yolda',
    'EVENT 3 - Delivered'               : 'Teslim',
    'EVENT 4 - Installment Plan'        : 'Taksit Plan',
    'EVENT 5 - Overdue Installment'     : 'Gecik',
}

for i, n in enumerate(all_notifs, 1):
    print(f"  [{i}] {n.title}")
    print(f"      {n.message[:100]}")

print()
passed = sum(1 for e_key, e_kw in events.items()
             if any(e_kw in n.title for n in all_notifs))
print(f"  Score: {all_notifs.count()}/5 notifications present")

# Cleanup: remove temp delivery person if created
if delivery_person.username == 'test_driver_tmp':
    delivery_person.delete()
    print("  Cleaned up temp delivery person")

print(f"\n{SEP}")
print("  Test complete.")
print(SEP)
