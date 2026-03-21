"""
Custom data loading script for BekoSIRS.
Loads db_export.json into the database, skipping duplicates gracefully.
Run: py load_data.py
"""
import os
import sys
import json
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'bekosirs_backend.settings')
os.environ.setdefault('PYTHONIOENCODING', 'utf-8')

# Load .env manually
from pathlib import Path
env_path = Path(__file__).resolve().parent / '.env'
if env_path.exists():
    with open(env_path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, _, val = line.partition('=')
                os.environ.setdefault(key.strip(), val.strip())

django.setup()

from django.contrib.auth.models import Group
from django.db import transaction, IntegrityError
from django.contrib.contenttypes.models import ContentType

# Import all models
from products.models import (
    CustomUser, Category, Product, ProductAssignment, ProductOwnership,
    CustomerAddress, Area, District, DepotLocation,
    InstallmentPlan, Installment,
    Notification, UserNotificationPreference,
    ServiceRequest, ServiceQueue,
    Recommendation, Review, SearchHistory, ViewHistory,
    Wishlist, WishlistItem,
    Delivery, DeliveryRoute, DeliveryRouteStop,
)

try:
    from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
    HAS_TOKEN_BLACKLIST = True
except ImportError:
    HAS_TOKEN_BLACKLIST = False

def load_fixture(filepath='db_export.json'):
    print(f"Loading {filepath}...")
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Group by model
    by_model = {}
    for item in data:
        model = item['model']
        by_model.setdefault(model, []).append(item)

    print(f"Found {len(data)} total records across {len(by_model)} model types")

    stats = {'loaded': 0, 'skipped': 0, 'errors': 0}

    # ----------------------------------------------------------------
    # 1. auth.group
    # ----------------------------------------------------------------
    _load_groups(by_model.get('auth.group', []), stats)

    # ----------------------------------------------------------------
    # 2. products.customuser (no FK dependencies beyond groups)
    # ----------------------------------------------------------------
    _load_users(by_model.get('products.customuser', []), stats)

    # ----------------------------------------------------------------
    # 3. Geography models
    # ----------------------------------------------------------------
    _load_simple(Area, by_model.get('products.area', []), stats)
    _load_simple(District, by_model.get('products.district', []), stats)
    _load_simple(DepotLocation, by_model.get('products.depotlocation', []), stats)

    # ----------------------------------------------------------------
    # 4. Categories & Products
    # ----------------------------------------------------------------
    _load_simple(Category, by_model.get('products.category', []), stats)
    _load_simple(Product, by_model.get('products.product', []), stats)
    _load_simple(ProductAssignment, by_model.get('products.productassignment', []), stats)
    _load_simple(ProductOwnership, by_model.get('products.productownership', []), stats)

    # ----------------------------------------------------------------
    # 5. Customer & Addresses
    # ----------------------------------------------------------------
    _load_simple(CustomerAddress, by_model.get('products.customeraddress', []), stats)

    # ----------------------------------------------------------------
    # 6. Installments
    # ----------------------------------------------------------------
    _load_simple(InstallmentPlan, by_model.get('products.installmentplan', []), stats)
    _load_simple(Installment, by_model.get('products.installment', []), stats)

    # ----------------------------------------------------------------
    # 7. Notifications
    # ----------------------------------------------------------------
    _load_simple(Notification, by_model.get('products.notification', []), stats)
    _load_simple(UserNotificationPreference, by_model.get('products.usernotificationpreference', []), stats)

    # ----------------------------------------------------------------
    # 8. Service
    # ----------------------------------------------------------------
    _load_simple(ServiceRequest, by_model.get('products.servicerequest', []), stats)
    _load_simple(ServiceQueue, by_model.get('products.servicequeue', []), stats)

    # ----------------------------------------------------------------
    # 9. Activity & Recommendations
    # ----------------------------------------------------------------
    _load_simple(Recommendation, by_model.get('products.recommendation', []), stats)
    _load_simple(Review, by_model.get('products.review', []), stats)
    _load_simple(SearchHistory, by_model.get('products.searchhistory', []), stats)
    _load_simple(ViewHistory, by_model.get('products.viewhistory', []), stats)
    _load_simple(Wishlist, by_model.get('products.wishlist', []), stats)
    _load_simple(WishlistItem, by_model.get('products.wishlistitem', []), stats)

    # ----------------------------------------------------------------
    # 10. Delivery
    # ----------------------------------------------------------------
    _load_simple(Delivery, by_model.get('products.delivery', []), stats)
    _load_simple(DeliveryRoute, by_model.get('products.deliveryroute', []), stats)
    _load_simple(DeliveryRouteStop, by_model.get('products.deliveryroutestop', []), stats)

    # ----------------------------------------------------------------
    # 11. Token blacklist (optional, skip if model not available)
    # ----------------------------------------------------------------
    if HAS_TOKEN_BLACKLIST:
        _load_simple(OutstandingToken, by_model.get('token_blacklist.outstandingtoken', []), stats)
        _load_simple(BlacklistedToken, by_model.get('token_blacklist.blacklistedtoken', []), stats)

    print(f"\n{'='*50}")
    print(f"Done! Loaded: {stats['loaded']}, Skipped: {stats['skipped']}, Errors: {stats['errors']}")
    print(f"{'='*50}")


def _load_groups(items, stats):
    for item in items:
        pk = item['pk']
        fields = item['fields']
        try:
            obj, created = Group.objects.get_or_create(pk=pk, defaults={'name': fields['name']})
            if created:
                stats['loaded'] += 1
            else:
                stats['skipped'] += 1
        except Exception as e:
            print(f"  ERROR auth.group pk={pk}: {e}")
            stats['errors'] += 1


def _load_users(items, stats):
    for item in items:
        pk = item['pk']
        fields = item['fields']
        try:
            if CustomUser.objects.filter(pk=pk).exists():
                stats['skipped'] += 1
                continue
            if CustomUser.objects.filter(username=fields.get('username', '')).exists():
                stats['skipped'] += 1
                continue

            obj = CustomUser(pk=pk)
            for k, v in fields.items():
                if k in ('groups', 'user_permissions'):
                    continue
                try:
                    setattr(obj, k, v)
                except Exception:
                    pass
            obj.save()

            # groups M2M
            if fields.get('groups'):
                for gid in fields['groups']:
                    try:
                        g = Group.objects.get(pk=gid)
                        obj.groups.add(g)
                    except Group.DoesNotExist:
                        pass

            stats['loaded'] += 1
        except IntegrityError as e:
            stats['skipped'] += 1
        except Exception as e:
            print(f"  ERROR products.customuser pk={pk}: {e}")
            stats['errors'] += 1


def _load_simple(ModelClass, items, stats):
    model_name = f"{ModelClass._meta.app_label}.{ModelClass._meta.model_name}"
    loaded = 0
    skipped = 0
    errors = 0

    for item in items:
        pk = item['pk']
        fields = item['fields']

        try:
            if ModelClass.objects.filter(pk=pk).exists():
                skipped += 1
                continue

            obj = ModelClass(pk=pk)
            for k, v in fields.items():
                field = None
                try:
                    field = ModelClass._meta.get_field(k)
                except Exception:
                    pass

                if field is None:
                    continue

                from django.db.models.fields.related import (
                    ForeignKey, OneToOneField, ManyToManyField
                )

                if isinstance(field, ManyToManyField):
                    continue  # Handle after save

                if isinstance(field, (ForeignKey, OneToOneField)):
                    if v is not None:
                        # Set the FK id directly
                        try:
                            setattr(obj, f"{k}_id", v)
                        except Exception:
                            pass
                    continue

                try:
                    setattr(obj, k, v)
                except Exception:
                    pass

            obj.save()

            # Handle M2M fields
            for k, v in fields.items():
                try:
                    field = ModelClass._meta.get_field(k)
                    from django.db.models.fields.related import ManyToManyField
                    if isinstance(field, ManyToManyField) and v:
                        getattr(obj, k).set(v)
                except Exception:
                    pass

            loaded += 1

        except IntegrityError as e:
            skipped += 1
        except Exception as e:
            print(f"  ERROR {model_name} pk={pk}: {e}")
            errors += 1

    if loaded + skipped + errors > 0:
        print(f"  {model_name}: +{loaded} loaded, {skipped} skipped, {errors} errors")
    stats['loaded'] += loaded
    stats['skipped'] += skipped
    stats['errors'] += errors


if __name__ == '__main__':
    import sys
    filepath = sys.argv[1] if len(sys.argv) > 1 else 'db_export.json'
    load_fixture(filepath)
