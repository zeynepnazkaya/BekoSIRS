
import os
import django
from django.utils import timezone
from datetime import timedelta

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'bekosirs_backend.settings')
django.setup()

from products.models import CustomUser, Product, ProductAssignment, Delivery, DeliveryRoute

def create_test_data():
    # 1. Create Delivery Person
    username = 'delivery_test'
    password = 'password123'
    email = 'delivery@test.com'
    
    user, created = CustomUser.objects.get_or_create(username=username, defaults={
        'email': email,
        'first_name': 'Ali',
        'last_name': 'Yılmaz',
        'role': 'delivery'
    })
    
    if created:
        user.set_password(password)
        user.save()
        print(f"Created delivery user: {username} / {password}")
    else:
        print(f"User {username} already exists")

    # 2. Get some products and customers for assignments
    # Assuming some exist, if not create dummy
    customer, _ = CustomUser.objects.get_or_create(username='customer_test', defaults={'role':'customer'})
    if _: customer.set_password('pass'); customer.save()
    
    product, _ = Product.objects.get_or_create(name='Beko Buzdolabı', defaults={'price': 10000, 'brand': 'Beko'})
    
    # 3. Create Assignments and Deliveries
    today = timezone.now().date()
    
    # Delivery 1
    # Note: signals.py might auto-create a delivery with status 'WAITING'
    assignment1 = ProductAssignment.objects.create(
        customer=customer,
        product=product,
        quantity=1,
        status='SCHEDULED'
    )
    
    # Fetch auto-created delivery or create if not exists
    delivery1, _ = Delivery.objects.get_or_create(assignment=assignment1)
    delivery1.scheduled_date = today
    delivery1.status = 'OUT_FOR_DELIVERY'
    delivery1.delivered_by = user
    delivery1.delivery_order = 1
    delivery1.address = "Lefkoşa Merkez, Atatürk Cad. No:10"
    delivery1.address_lat = 35.1856
    delivery1.address_lng = 33.3823
    delivery1.save()

    # Delivery 2
    assignment2 = ProductAssignment.objects.create(
        customer=customer,
        product=product,
        quantity=1,
        status='SCHEDULED'
    )
    
    delivery2, _ = Delivery.objects.get_or_create(assignment=assignment2)
    delivery2.scheduled_date = today
    delivery2.status = 'WAITING'
    delivery2.delivered_by = user
    delivery2.delivery_order = 2
    delivery2.address = "Girne Liman, Kordonboyu"
    delivery2.address_lat = 35.3407
    delivery2.address_lng = 33.3198
    delivery2.save()

    print("Created 2 test deliveries for today.")

if __name__ == '__main__':
    create_test_data()
