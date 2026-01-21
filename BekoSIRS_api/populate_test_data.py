# populate_test_data.py
# Django script to populate test data
# Run with: python manage.py shell < populate_test_data.py

import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'bekosirs_backend.settings')

# If running standalone
try:
    django.setup()
except:
    pass

from django.utils import timezone
from datetime import date, timedelta
from products.models import (
    CustomUser, Product, ProductOwnership, ProductAssignment, Delivery,
    Review, ServiceRequest, Category, Notification
)

print("🚀 BekoSIRS Test Data Population Script")
print("=" * 50)

# Get some products
products = list(Product.objects.all()[:10])
if not products:
    print("❌ Ürün bulunamadı! Önce ürün ekleyin.")
    exit()

print(f"✅ {len(products)} ürün bulundu")

# Create 10 test customers
test_customers = []
customer_data = [
    ("ahmet_yilmaz", "ahmet@test.com", "Ahmet", "Yılmaz"),
    ("mehmet_demir", "mehmet@test.com", "Mehmet", "Demir"),
    ("ayse_kaya", "ayse@test.com", "Ayşe", "Kaya"),
    ("fatma_celik", "fatma@test.com", "Fatma", "Çelik"),
    ("ali_ozturk", "ali@test.com", "Ali", "Öztürk"),
    ("zeynep_arslan", "zeynep@test.com", "Zeynep", "Arslan"),
    ("mustafa_korkmaz", "mustafa@test.com", "Mustafa", "Korkmaz"),
    ("elif_sahin", "elif@test.com", "Elif", "Şahin"),
    ("huseyin_yavuz", "huseyin@test.com", "Hüseyin", "Yavuz"),
    ("merve_aydın", "merve@test.com", "Merve", "Aydın"),
]

for username, email, first_name, last_name in customer_data:
    customer, created = CustomUser.objects.get_or_create(
        username=username,
        defaults={
            "email": email,
            "first_name": first_name,
            "last_name": last_name,
            "role": "customer",
            "address": f"{first_name} {last_name} Caddesi No:1, Lefkoşa",
            "address_lat": 35.1856 + (len(test_customers) * 0.01),
            "address_lng": 33.3823 + (len(test_customers) * 0.01),
        }
    )
    if created:
        customer.set_password("test1234")
        customer.save()
    test_customers.append(customer)
    print(f"  {'✨ Oluşturuldu' if created else '📌 Mevcut'}: {first_name} {last_name}")

print(f"\n✅ {len(test_customers)} müşteri hazır")

# Create Product Ownerships (for service requests)
print("\n📦 Ürün sahiplikleri oluşturuluyor...")
for i, customer in enumerate(test_customers[:7]):
    product = products[i % len(products)]
    ownership, created = ProductOwnership.objects.get_or_create(
        customer=customer,
        product=product,
        defaults={
            "purchase_date": date.today() - timedelta(days=30 + i * 10),
            "serial_number": f"SN-{product.id:03d}-{customer.id:03d}"
        }
    )
    if created:
        print(f"  ✨ {customer.first_name} -> {product.name}")

# Create Product Assignments with different statuses
print("\n📋 Satış atamaları oluşturuluyor...")

# Delete existing test data to avoid duplicates
print("\n🧹 Eski veriler temizleniyor...")
from products.models import Delivery
# Delete ALL deliveries first
deleted_del = Delivery.objects.all().delete()
print(f"  🚚 Teslimatlar silindi: {deleted_del}")
# Delete ALL assignments
deleted_assign = ProductAssignment.objects.all().delete()
print(f"  📋 Atamalar silindi: {deleted_assign}")
print(f"  ✅ Temizlik tamamlandı!")

assignment_configs = [
    # (customer_index, product_index, status, has_delivery)
    (0, 0, 'PLANNED', False),   # Planlanacak - No delivery
    (1, 1, 'PLANNED', False),   # Planlanacak - No delivery
    (2, 2, 'PLANNED', False),   # Planlanacak - No delivery
    (3, 3, 'SCHEDULED', True),  # Teslimat Bekleyen
    (4, 4, 'SCHEDULED', True),  # Teslimat Bekleyen
    (5, 5, 'SCHEDULED', True),  # Teslimat Bekleyen
    (6, 6, 'OUT_FOR_DELIVERY', True),  # Yolda
    (7, 0, 'DELIVERED', True),   # Teslim Edildi
    (8, 1, 'DELIVERED', True),   # Teslim Edildi
    (9, 2, 'DELIVERED', True),   # Teslim Edildi
]

for cust_idx, prod_idx, status, has_delivery in assignment_configs:
    customer = test_customers[cust_idx]
    product = products[prod_idx % len(products)]
    
    assignment = ProductAssignment.objects.create(
        customer=customer,
        product=product,
        quantity=1,
        status=status,
        notes="Test verisi - Otomatik oluşturuldu"
    )
    print(f"  📋 {status}: {customer.first_name} -> {product.name}")
    
    if has_delivery:
        delivery_status = 'WAITING'
        delivered_at = None
        
        if status == 'OUT_FOR_DELIVERY':
            delivery_status = 'OUT_FOR_DELIVERY'
        elif status == 'DELIVERED':
            delivery_status = 'DELIVERED'
            delivered_at = timezone.now() - timedelta(days=cust_idx)
        
        try:
            Delivery.objects.create(
                assignment=assignment,
                scheduled_date=date.today() + timedelta(days=cust_idx - 5),
                address=customer.address or "Lefkoşa",
                address_lat=customer.address_lat,
                address_lng=customer.address_lng,
                status=delivery_status,
                delivered_at=delivered_at
            )
            print(f"    🚚 Teslimat: {delivery_status}")
        except Exception as e:
            print(f"    ⚠️ Teslimat atlandı (muhtemelen mevcut): {str(e)[:50]}")

# Create Reviews
print("\n⭐ Değerlendirmeler oluşturuluyor...")
for i, customer in enumerate(test_customers[:7]):
    product = products[i % len(products)]
    
    review, created = Review.objects.get_or_create(
        customer=customer,
        product=product,
        defaults={
            "rating": 3 + (i % 3),  # 3, 4, 5 rating
            "comment": f"Bu ürünü çok beğendim. {customer.first_name} tarafından test yorumu.",
            "is_approved": i % 2 == 0  # Her 2'de 1'i onaylı
        }
    )
    if created:
        print(f"  ⭐ {customer.first_name}: {product.name} -> {review.rating}/5")

# Create Service Requests
print("\n🔧 Servis talepleri oluşturuluyor...")
ownerships = ProductOwnership.objects.filter(customer__in=test_customers)

request_types = ['repair', 'maintenance', 'warranty', 'complaint']
statuses = ['pending', 'in_progress', 'completed']

for i, ownership in enumerate(ownerships[:5]):
    sr, created = ServiceRequest.objects.get_or_create(
        customer=ownership.customer,
        product_ownership=ownership,
        defaults={
            "request_type": request_types[i % len(request_types)],
            "status": statuses[i % len(statuses)],
            "description": f"Test servis talebi #{i+1} - {ownership.product.name} için"
        }
    )
    if created:
        print(f"  🔧 {ownership.customer.first_name}: {ownership.product.name} ({sr.get_request_type_display()})")

# Summary
print("\n" + "=" * 50)
print("✅ TEST VERİSİ OLUŞTURMA TAMAMLANDI!")
print("=" * 50)
print(f"""
📊 Özet:
  • Müşteri: {len(test_customers)}
  • Atama (PLANNED): {ProductAssignment.objects.filter(status='PLANNED').count()}
  • Atama (SCHEDULED): {ProductAssignment.objects.filter(status='SCHEDULED').count()}
  • Atama (OUT_FOR_DELIVERY): {ProductAssignment.objects.filter(status='OUT_FOR_DELIVERY').count()}
  • Atama (DELIVERED): {ProductAssignment.objects.filter(status='DELIVERED').count()}
  • Değerlendirme: {Review.objects.filter(customer__in=test_customers).count()}
  • Servis Talebi: {ServiceRequest.objects.filter(customer__in=test_customers).count()}
""")
