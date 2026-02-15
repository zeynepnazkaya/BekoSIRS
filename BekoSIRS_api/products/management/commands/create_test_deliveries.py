"""
Django management command to create test delivery data for delivery_test user.
Usage: python manage.py create_test_deliveries
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import date, timedelta
from products.models import CustomUser, Product, ProductAssignment, Delivery


class Command(BaseCommand):
    help = 'Creates test delivery data for delivery_test user'

    def handle(self, *args, **options):
        try:
            # Get delivery_test user
            delivery_user = CustomUser.objects.get(username='delivery_test')
            self.stdout.write(f'Found user: {delivery_user.username}')
        except CustomUser.DoesNotExist:
            self.stdout.write(self.style.ERROR('User delivery_test not found!'))
            return

        # Get some customers
        customers = CustomUser.objects.filter(role='customer')[:3]
        if customers.count() == 0:
            self.stdout.write(self.style.ERROR('No customers found! Creating test customer...'))
            customer = CustomUser.objects.create_user(
                username='test_customer_1',
                email='customer1@test.com',
                password='password123',
                role='customer',
                first_name='Ahmet',
                last_name='Yılmaz'
            )
            customers = [customer]

        # Get some products
        products = Product.objects.all()[:3]
        if products.count() == 0:
            self.stdout.write(self.style.ERROR('No products found!'))
            return

        today = date.today()
        
        # Sample addresses in KKTC
        addresses = [
            {'address': 'Atatürk Cad. No:45, Lefkoşa', 'lat': 35.1856, 'lng': 33.3823},
            {'address': 'Salamis Yolu No:12, Gazimağusa', 'lat': 35.1250, 'lng': 33.9419},
            {'address': 'Kordonboyu No:78, Girne', 'lat': 35.3380, 'lng': 33.3200},
        ]
        
        delivery_order = 1
        for i, customer in enumerate(customers):
            product = products[i % products.count()]
            addr = addresses[i % len(addresses)]
            
            # Create or get assignment
            assignment, created = ProductAssignment.objects.get_or_create(
                customer=customer,
                product=product,
                defaults={
                    'assigned_at': timezone.now(),
                    'status': 'PENDING',
                }
            )
            
            # Create delivery
            delivery, created = Delivery.objects.get_or_create(
                assignment=assignment,
                defaults={
                    'delivered_by': delivery_user,
                    'status': 'WAITING' if i > 0 else 'OUT_FOR_DELIVERY',
                    'scheduled_date': today,
                    'address': addr['address'],
                    'address_lat': addr['lat'],
                    'address_lng': addr['lng'],
                    'delivery_order': delivery_order,
                    'notes': f'Test teslimat #{delivery_order}',
                }
            )
            
            if created:
                self.stdout.write(self.style.SUCCESS(
                    f'Created delivery #{delivery_order} for {customer.username} - {product.name}'
                ))
            else:
                # Update existing delivery to today
                delivery.scheduled_date = today
                delivery.delivered_by = delivery_user
                delivery.save()
                self.stdout.write(f'Updated existing delivery for {customer.username}')
            
            delivery_order += 1

        self.stdout.write(self.style.SUCCESS(
            f'\nTotal deliveries for {delivery_user.username} today: '
            f'{Delivery.objects.filter(delivered_by=delivery_user, scheduled_date=today).count()}'
        ))
