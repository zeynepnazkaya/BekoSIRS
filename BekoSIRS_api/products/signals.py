# products/signals.py
"""
Automatic AuditLog generation for key model CRUD operations.
Registers Django post_save and post_delete signals for important models.
"""
import logging
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

logger = logging.getLogger(__name__)


def _create_audit_log(action, instance, model_name, user=None, changes=None):
    """Helper to create an AuditLog entry."""
    try:
        from products.models import AuditLog
        AuditLog.objects.create(
            user=user,
            action=action,
            model_name=model_name,
            object_id=instance.pk,
            object_repr=str(instance)[:255],
            changes=changes,
        )
    except Exception as e:
        logger.warning("AuditLog creation failed: %s", e)


def _extract_user(instance):
    """Try to extract a user from common model fields."""
    for attr in ('assigned_by', 'created_by', 'user', 'customer', 'delivered_by'):
        user = getattr(instance, attr, None)
        if user is not None:
            return user
    return None


# ─── ProductAssignment ───
@receiver(post_save, sender='products.ProductAssignment')
def log_assignment_save(sender, instance, created, **kwargs):
    action = 'create' if created else 'update'
    user = _extract_user(instance)
    changes = {
        'product': str(instance.product) if instance.product else None,
        'customer': str(instance.customer) if instance.customer else None,
        'quantity': instance.quantity,
        'status': instance.status,
    }
    _create_audit_log(action, instance, 'ProductAssignment', user=user, changes=changes)


@receiver(post_delete, sender='products.ProductAssignment')
def log_assignment_delete(sender, instance, **kwargs):
    _create_audit_log('delete', instance, 'ProductAssignment', user=_extract_user(instance))


# ─── Product ───
@receiver(post_save, sender='products.Product')
def log_product_save(sender, instance, created, **kwargs):
    action = 'create' if created else 'update'
    changes = {
        'name': instance.name,
        'stock': instance.stock,
        'price': str(instance.price) if instance.price else None,
    }
    _create_audit_log(action, instance, 'Product', changes=changes)


@receiver(post_delete, sender='products.Product')
def log_product_delete(sender, instance, **kwargs):
    _create_audit_log('delete', instance, 'Product')


# ─── ServiceRequest ───
@receiver(post_save, sender='products.ServiceRequest')
def log_service_save(sender, instance, created, **kwargs):
    action = 'create' if created else 'update'
    changes = {
        'status': instance.status,
        'request_type': instance.request_type,
    }
    _create_audit_log(action, instance, 'ServiceRequest', user=instance.customer, changes=changes)


# ─── Delivery ───
@receiver(post_save, sender='products.Delivery')
def log_delivery_save(sender, instance, created, **kwargs):
    action = 'create' if created else 'update'
    changes = {'status': instance.status}
    _create_audit_log(action, instance, 'Delivery', user=_extract_user(instance), changes=changes)


# ─── InstallmentPlan ───
@receiver(post_save, sender='products.InstallmentPlan')
def log_installment_plan_save(sender, instance, created, **kwargs):
    action = 'create' if created else 'update'
    changes = {
        'total_amount': str(instance.total_amount),
        'status': instance.status,
        'installment_count': instance.installment_count,
    }
    _create_audit_log(action, instance, 'InstallmentPlan', user=_extract_user(instance), changes=changes)
