"""
Django signals for Products app.
Auto-creates Delivery record when ProductAssignment is created.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone
from .models import ProductAssignment, Delivery, DepotLocation, ProductOwnership, Product


@receiver(post_save, sender=ProductAssignment)
def create_delivery_for_assignment(sender, instance, created, **kwargs):
    """
    Automatically create a Delivery record when a ProductAssignment is created.
    Sets delivery address from customer's profile.
    """
    if created:
        # Get customer address
        customer = instance.customer
        
        # Get default depot (if exists)
        try:
            default_depot = DepotLocation.objects.get(is_default=True)
        except DepotLocation.DoesNotExist:
            default_depot = None
        
        # Create formatted address and get coordinates
        # Safely check for address relation using hasattr or try-except
        address_text = "Adres Bulunamadı"
        lat = None
        lng = None
        
        try:
            if hasattr(customer, 'customer_address') and customer.customer_address:
                addr = customer.customer_address
                parts = []
                if addr.open_address: parts.append(addr.open_address)
                if addr.area: parts.append(addr.area.name)
                if addr.district: parts.append(addr.district.name)
                
                if parts:
                    address_text = ", ".join(parts)
                
                lat = addr.latitude
                lng = addr.longitude
        except Exception as e:
            pass  # Could not fetch address; use default
            
        # Create delivery
        Delivery.objects.create(
            assignment=instance,
            address=address_text,
            address_lat=lat,
            address_lng=lng,
            depot=default_depot,
            customer_phone_snapshot=customer.phone_number or "",
            address_snapshot=address_text,
            status='WAITING'
        )
@receiver(post_save, sender=Delivery)
def create_ownership_on_delivery(sender, instance, **kwargs):
    """
    When delivery is marked as DELIVERED, create ProductOwnership record.
    This enables warranty tracking and product reviews.
    """
    if instance.status == 'DELIVERED':
        # Get related assignment and product
        assignment = instance.assignment
        if not assignment:
            return

        customer = assignment.customer
        product = assignment.product
        
        # Check if ownership already exists to avoid duplicates
        if not ProductOwnership.objects.filter(customer=customer, product=product).exists():
            ProductOwnership.objects.create(
                customer=customer,
                product=product,
                purchase_date=instance.delivered_at.date() if instance.delivered_at else timezone.now().date(),
                serial_number=f"BEKO-{assignment.id}-{product.id}" # Auto-generate serial
            )

