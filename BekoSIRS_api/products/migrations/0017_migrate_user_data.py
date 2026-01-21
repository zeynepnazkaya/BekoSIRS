from django.db import migrations

def migrate_user_data(apps, schema_editor):
    CustomUser = apps.get_model('products', 'CustomUser')
    UserNotificationPreference = apps.get_model('products', 'UserNotificationPreference')
    CustomerAddress = apps.get_model('products', 'CustomerAddress')

    for user in CustomUser.objects.all():
        # 1. Bildirim Tercihlerini Taşı
        # notify fields may not exist if they were removed from the model definition in code, 
        # but since we are running this BEFORE removing them from the DB, the data is still in the table/model schema state.
        # However, apps.get_model uses the HISTORICAL model.
        # Ensure we access fields safely.

        preference, created = UserNotificationPreference.objects.get_or_create(user=user)
        # Sadece created ise güncelle veya her durumda güncelle?
        # En güvenlisi veriyi kopyalamak
        preference.notify_service_updates = getattr(user, 'notify_service_updates', True)
        preference.notify_price_drops = getattr(user, 'notify_price_drops', True)
        preference.notify_restock = getattr(user, 'notify_restock', True)
        preference.notify_recommendations = getattr(user, 'notify_recommendations', True)
        preference.notify_warranty_expiry = getattr(user, 'notify_warranty_expiry', True)
        preference.notify_general = getattr(user, 'notify_general', True)
        preference.save()

        # 2. Adres Bilgilerini Taşı
        # Kontrol edelim: Herhangi bir adres verisi var mı?
        has_address_data = any([
            getattr(user, 'district_id', None),
            getattr(user, 'area_id', None),
            getattr(user, 'address', None),
            getattr(user, 'open_address', None),
            getattr(user, 'address_lat', None)
        ])

        if has_address_data:
            address_obj, created = CustomerAddress.objects.get_or_create(user=user)
            
            # ForeignKey ID'leri direkt kopyalayabiliriz
            address_obj.district_id = getattr(user, 'district_id', None)
            address_obj.area_id = getattr(user, 'area_id', None)
            
            # Text alanlar
            # open_address varsa onu al, yoksa eski 'address' alanına bak
            open_addr = getattr(user, 'open_address', None)
            legacy_addr = getattr(user, 'address', None)
            address_obj.open_address = open_addr if open_addr else legacy_addr
            
            address_obj.address_city = getattr(user, 'address_city', None)
            address_obj.latitude = getattr(user, 'address_lat', None)
            address_obj.longitude = getattr(user, 'address_lng', None)
            address_obj.geocoded_at = getattr(user, 'geocoded_at', None)
            
            address_obj.save()

def reverse_migrate_user_data(apps, schema_editor):
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('products', '0016_alter_productassignment_status_and_more'),
    ]

    operations = [
        migrations.RunPython(migrate_user_data, reverse_migrate_user_data),
    ]
