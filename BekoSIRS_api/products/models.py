from django.db import models
from django.contrib.auth.models import AbstractUser
from dateutil.relativedelta import relativedelta

# -------------------------------
# 🔹 KKTC Address Models
# -------------------------------
class District(models.Model):
    """KKTC İlçe/Bölge"""
    name = models.CharField(max_length=100, unique=True, verbose_name="İlçe Adı")
    center_lat = models.DecimalField(
        max_digits=10, decimal_places=7, 
        null=True, blank=True,
        verbose_name="Merkez Enlem"
    )
    center_lng = models.DecimalField(
        max_digits=10, decimal_places=7, 
        null=True, blank=True,
        verbose_name="Merkez Boylam"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['name']
        verbose_name = "İlçe"
        verbose_name_plural = "İlçeler"
    
    def __str__(self):
        return self.name


class Area(models.Model):
    """KKTC Mahalle/Köy"""
    district = models.ForeignKey(
        District, 
        on_delete=models.CASCADE, 
        related_name='areas',
        verbose_name="İlçe"
    )
    name = models.CharField(max_length=100, verbose_name="Mahalle/Köy Adı")
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['district__name', 'name']
        unique_together = [['district', 'name']]
        verbose_name = "Mahalle/Köy"
        verbose_name_plural = "Mahalle/Köyler"
    
    def __str__(self):
        return f"{self.district.name} - {self.name}"


# -------------------------------
# 🔹 Custom User Model
# -------------------------------
class CustomUser(AbstractUser):
    ROLE_CHOICES = (
        ('admin', 'Admin'),
        ('seller', 'Satıcı'),
        ('customer', 'Müşteri'),
        ('delivery', 'Teslimat Personeli'),
    )
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='customer')
    phone_number = models.CharField(max_length=15, unique=True, null=True, blank=True)

    # Bildirim Tercihleri (Taşındı -> UserNotificationPreference)
    # notify_* fields removed

    # Push Notification Token (Expo)
    push_token = models.CharField(max_length=200, blank=True, null=True, verbose_name="Push Token")

    # Biometric Authentication (Face ID / Face Unlock via DeepFace)
    biometric_enabled = models.BooleanField(default=False, verbose_name="Biyometrik Giriş")
    face_encoding = models.JSONField(
        null=True, 
        blank=True, 
        verbose_name="Yüz Özellik Vektörü",
        help_text="Mathematical representation of the user's face (extracted via DeepFace)"
    )

    # Adres Bilgileri (Taşındı -> CustomerAddress)
    # address_* fields removed

    # KKTC Structured Address (Taşındı -> CustomerAddress)
    # district, area, open_address fields removed

    def save(self, *args, **kwargs):
        # Convert empty phone_number to None to avoid unique constraint violation
        # SQL Server treats '' as a duplicate value, but NULL is allowed multiple times
        if self.phone_number is not None and self.phone_number.strip() == '':
            self.phone_number = None
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.username} ({self.role})"


# -------------------------------
# 🔹 Category Model
# -------------------------------
class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='subcategories')

    class Meta:
        verbose_name_plural = "Categories"

    def __str__(self):
        return self.name


# -------------------------------
# 🔹 Product Model
# -------------------------------
class Product(models.Model):
    name = models.CharField(max_length=100)
    brand = models.CharField(max_length=50)
    category = models.ForeignKey(Category, related_name='products', on_delete=models.SET_NULL, null=True)
    description = models.TextField(blank=True, null=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    image = models.ImageField(upload_to='products/', blank=True, null=True, max_length=500)
    
    # New fields from Excel Import
    model_code = models.CharField(max_length=100, unique=True, null=True, blank=True, verbose_name="Model Kodu")
    warranty_code = models.CharField(max_length=50, null=True, blank=True, verbose_name="Ek Garanti Kodu")
    price_list = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, verbose_name="Liste Fiyatı")
    price_cash = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, verbose_name="Peşin Fiyat")
    campaign_tag = models.TextField(null=True, blank=True, verbose_name="Kampanya")
    
    #status = models.CharField(max_length=20, default='in_stock')
    warranty_duration_months = models.PositiveIntegerField(default=24, help_text="Garanti süresi (ay olarak)")
    stock = models.IntegerField(default=0, verbose_name="Stok Adedi")
    # Ürünün sisteme eklenme zamanı recommendation katmanında yeni ürünleri
    # kontrollü biçimde öne çıkarmak için tutulur.
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)

    def __str__(self):
        return self.name


# -------------------------------
# 🔹 Product Ownership (Kim aldı?)
# -------------------------------
class ProductOwnership(models.Model):
    customer = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='owned_products',
        limit_choices_to={'role': 'customer'}
    )
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    purchase_date = models.DateField()
    serial_number = models.CharField(max_length=100, blank=True, null=True)

    def __str__(self):
        return f"{self.customer.username} owns {self.product.name}"

    @property
    def warranty_end_date(self):
        if self.purchase_date:
            return self.purchase_date + relativedelta(months=self.product.warranty_duration_months)
        return None


# -------------------------------
# 🔹 Kullanıcı Aktivite Takibi
# -------------------------------
class UserActivity(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    activity_type = models.CharField(max_length=10)  # 'view', 'search'
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username} - {self.activity_type} - {self.product.name}"


class SearchHistory(models.Model):
    """Kullanıcı arama geçmişi (Öneri sistemi için)."""
    customer = models.ForeignKey(
        CustomUser, 
        on_delete=models.CASCADE, 
        related_name='search_history',
        limit_choices_to={'role': 'customer'}
    )
    query = models.CharField(max_length=255, verbose_name="Arama Terimi")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Arama Geçmişi"
        verbose_name_plural = "Arama Geçmişleri"

    def __str__(self):
        return f"{self.customer.username} searched '{self.query}'"


# -------------------------------
# 🔹 Wishlist (İstek Listesi)
# -------------------------------
class Wishlist(models.Model):
    customer = models.OneToOneField(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='wishlist',
        limit_choices_to={'role': 'customer'}
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.customer.username}'s Wishlist"

    @property
    def item_count(self):
        return self.items.count()


# -------------------------------
# 🔹 WishlistItem (İstek Listesi Öğesi)
# -------------------------------
class WishlistItem(models.Model):
    wishlist = models.ForeignKey(
        Wishlist,
        on_delete=models.CASCADE,
        related_name='items'
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='wishlisted_by'
    )
    added_at = models.DateTimeField(auto_now_add=True)
    note = models.TextField(blank=True, null=True, help_text="Kullanıcı notu")
    notify_on_price_drop = models.BooleanField(default=True, help_text="Fiyat düşüşünde bildirim")
    notify_on_restock = models.BooleanField(default=True, help_text="Stok geldiğinde bildirim")

    class Meta:
        unique_together = ('wishlist', 'product')
        ordering = ['-added_at']

    def __str__(self):
        return f"{self.wishlist.customer.username} - {self.product.name}"


# -------------------------------
# 🔹 ViewHistory (Görüntüleme Geçmişi)
# -------------------------------
class ViewHistory(models.Model):
    customer = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='view_history',
        limit_choices_to={'role': 'customer'}
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='viewed_by'
    )
    viewed_at = models.DateTimeField(auto_now_add=True)
    view_count = models.PositiveIntegerField(default=1)

    class Meta:
        unique_together = ('customer', 'product')
        ordering = ['-viewed_at']

    def __str__(self):
        return f"{self.customer.username} viewed {self.product.name}"


# -------------------------------
# 🔹 Review (Ürün Değerlendirmesi)
# -------------------------------
class Review(models.Model):
    customer = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='reviews',
        limit_choices_to={'role': 'customer'}
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='reviews'
    )
    rating = models.PositiveIntegerField(help_text="1-5 arası puan")
    comment = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_approved = models.BooleanField(default=False, help_text="Admin onayı")

    class Meta:
        unique_together = ('customer', 'product')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.customer.username} - {self.product.name} ({self.rating}/5)"


# -------------------------------
# 🔹 ServiceRequest (Servis Talebi)
# -------------------------------
class ServiceRequest(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Beklemede'),
        ('in_queue', 'Sırada'),
        ('in_progress', 'İşlemde'),
        ('completed', 'Tamamlandı'),
        ('cancelled', 'İptal Edildi'),
    )
    REQUEST_TYPE_CHOICES = (
        ('repair', 'Tamir'),
        ('maintenance', 'Bakım'),
        ('warranty', 'Garanti'),
        ('complaint', 'Şikayet'),
        ('other', 'Diğer'),
    )

    customer = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='service_requests',
        limit_choices_to={'role': 'customer'}
    )
    product_ownership = models.ForeignKey(
        ProductOwnership,
        on_delete=models.CASCADE,
        related_name='service_requests',
        null=True, blank=True
    )
    product_assignment = models.ForeignKey(
        'ProductAssignment',
        on_delete=models.CASCADE,
        related_name='service_requests',
        null=True, blank=True
    )
    request_type = models.CharField(max_length=20, choices=REQUEST_TYPE_CHOICES, default='repair')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    description = models.TextField(help_text="Sorun açıklaması")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    assigned_to = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_requests',
        limit_choices_to={'role__in': ['admin', 'seller']}
    )
    resolution_notes = models.TextField(blank=True, null=True, help_text="Çözüm notları")
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status'], name='svcreq_status_idx'),
            models.Index(fields=['customer', 'status'], name='svcreq_cust_status_idx'),
            models.Index(fields=['created_at'], name='svcreq_created_idx'),
        ]

    def __str__(self):
        if self.product_ownership:
            product_name = self.product_ownership.product.name
        elif self.product_assignment:
            product_name = self.product_assignment.product.name
        else:
            product_name = 'Ürün yok'
        return f"SR-{self.id}: {self.customer.username} - {product_name}"


# -------------------------------
# 🔹 ServiceQueue (Servis Kuyruğu)
# -------------------------------
class ServiceQueue(models.Model):
    PRIORITY_CHOICES = (
        (1, 'Yüksek Öncelik'),
        (2, 'Normal Öncelik'),
        (3, 'Düşük Öncelik'),
    )

    service_request = models.OneToOneField(
        ServiceRequest,
        on_delete=models.CASCADE,
        related_name='queue_entry'
    )
    queue_number = models.PositiveIntegerField()
    priority = models.PositiveIntegerField(
        choices=PRIORITY_CHOICES,
        default=2,
        help_text="Öncelik Seviyesi (1=Yüksek, 2=Normal, 3=Düşük)"
    )
    estimated_wait_time = models.PositiveIntegerField(default=0, help_text="Tahmini bekleme süresi (dakika)")
    entered_queue_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['priority', 'entered_queue_at']

    def __str__(self):
        return f"Queue #{self.queue_number} - SR-{self.service_request.id}"


# -------------------------------
# 🔹 Notification (Bildirim)
# -------------------------------
class Notification(models.Model):
    NOTIFICATION_TYPE_CHOICES = (
        ('price_drop', 'Fiyat Düşüşü'),
        ('restock', 'Stok Geldi'),
        ('service_update', 'Servis Güncellemesi'),
        ('recommendation', 'Öneri'),
        ('general', 'Genel'),
    )

    user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    notification_type = models.CharField(max_length=20, choices=NOTIFICATION_TYPE_CHOICES, default='general')
    title = models.CharField(max_length=200)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    related_product = models.ForeignKey(
        Product,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='notifications'
    )
    related_service_request = models.ForeignKey(
        ServiceRequest,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='notifications'
    )

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_read'], name='notif_user_read_idx'),
            models.Index(fields=['notification_type'], name='notif_type_idx'),
            models.Index(fields=['created_at'], name='notif_created_idx'),
        ]

    def __str__(self):
        return f"{self.user.username} - {self.title}"


# -------------------------------
# 🔹 Recommendation (Öneri)
# -------------------------------
class Recommendation(models.Model):
    customer = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='recommendations',
        limit_choices_to={'role': 'customer'}
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='recommended_to'
    )
    score = models.FloatField(help_text="Öneri skoru (0-1)")
    reason = models.CharField(max_length=200, help_text="Öneri sebebi")
    created_at = models.DateTimeField(auto_now_add=True)
    is_shown = models.BooleanField(default=False)
    clicked = models.BooleanField(default=False)
    dismissed = models.BooleanField(default=False, help_text="Kullanıcı bu öneriyi reddetmiş")
    dismissed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('customer', 'product')
        ordering = ['-score', '-created_at']

    def __str__(self):
        return f"Recommendation: {self.product.name} for {self.customer.username}"


# -------------------------------
# 🔹 Password Reset Token Model
# -------------------------------
class PasswordResetToken(models.Model):
    """
    Token for password reset requests.
    Expires after 1 hour.
    """
    user = models.ForeignKey(
        CustomUser,
        on_delete=models.CASCADE,
        related_name='password_reset_tokens'
    )
    token = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Password reset token for {self.user.username}"

    @classmethod
    def generate_token(cls):
        """Generate a secure random token."""
        import secrets
        return secrets.token_urlsafe(48)

    @classmethod
    def create_for_user(cls, user):
        """Create a new password reset token for a user."""
        from django.utils import timezone
        from datetime import timedelta
        
        # Invalidate any existing tokens for this user
        cls.objects.filter(user=user, is_used=False).update(is_used=True)
        
        # Create new token with 1 hour expiration
        token = cls.generate_token()
        expires_at = timezone.now() + timedelta(hours=1)
        
        return cls.objects.create(
            user=user,
            token=token,
            expires_at=expires_at
        )

    def is_valid(self):
        """Check if token is valid (not used and not expired)."""
        from django.utils import timezone
        return not self.is_used and self.expires_at > timezone.now()

    def use(self):
        """Mark token as used."""
        self.is_used = True
        self.save()




# -------------------------------
# 🔹 Delivery Route (Günlük Rota)
# -------------------------------
class DeliveryRoute(models.Model):
    """Belirli bir gün için optimize edilmiş teslimat rotası."""
    ROUTE_STATUS_CHOICES = (
        ('PLANNED', 'Planlandı'),
        ('IN_PROGRESS', 'Devam Ediyor'),
        ('COMPLETED', 'Tamamlandı'),
    )

    date = models.DateField(verbose_name="Tarih")
    
    # Atanan teslimatçı
    assigned_driver = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_routes',
        verbose_name="Teslimatçı",
        limit_choices_to={'role': 'delivery'}
    )
    status = models.CharField(
        max_length=20,
        choices=ROUTE_STATUS_CHOICES,
        default='PLANNED',
        verbose_name="Rota Durumu"
    )
    
    # Mağaza (başlangıç noktası) koordinatları
    store_address = models.TextField(
        default="Beko Mağaza, Lefkoşa",
        verbose_name="Mağaza Adresi"
    )
    store_lat = models.DecimalField(
        max_digits=10, decimal_places=7, 
        default=35.1856,  # Lefkoşa
        verbose_name="Mağaza Enlemi"
    )
    store_lng = models.DecimalField(
        max_digits=10, decimal_places=7, 
        default=33.3823,  # Lefkoşa
        verbose_name="Mağaza Boylamı"
    )
    
    # Rota istatistikleri
    total_distance_km = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        verbose_name="Toplam Mesafe (km)"
    )
    total_duration_min = models.IntegerField(
        null=True, blank=True,
        verbose_name="Toplam Süre (dk)"
    )
    # Google Maps Polyline
    route_polyline = models.TextField(blank=True, null=True, verbose_name="Rota Polyline")
    
    is_optimized = models.BooleanField(default=False, verbose_name="Optimize Edildi")
    optimized_at = models.DateTimeField(null=True, blank=True, verbose_name="Optimizasyon Tarihi")

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Teslimat Rotası"
        verbose_name_plural = "Teslimat Rotaları"

    def __str__(self):
        driver = self.assigned_driver.username if self.assigned_driver else 'Atanmamış'
        return f"Rota: {self.date} - {driver} ({self.total_distance_km or 0} km)"


class DeliveryRouteStop(models.Model):
    """Rota üzerindeki duraklar ve sıralaması."""
    route = models.ForeignKey(
        DeliveryRoute, 
        on_delete=models.CASCADE, 
        related_name='stops',
        verbose_name="Rota"
    )
    delivery = models.OneToOneField(
        'Delivery', 
        on_delete=models.CASCADE, 
        related_name='route_stop',
        verbose_name="Teslimat"
    )
    stop_order = models.PositiveIntegerField(verbose_name="Sıra No")
    
    distance_from_previous_km = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        verbose_name="Önceki Noktadan Mesafe (km)"
    )
    duration_from_previous_min = models.IntegerField(
        null=True, blank=True,
        verbose_name="Önceki Noktadan Süre (dk)"
    )
    estimated_arrival = models.DateTimeField(null=True, blank=True, verbose_name="Tahmini Varış")
    
    class Meta:
        ordering = ['stop_order']
        unique_together = ['route', 'stop_order']
        verbose_name = "Teslimat Durağı"
        verbose_name_plural = "Teslimat Durakları"
    
    def __str__(self):
        return f"Stop {self.stop_order}: {self.delivery.customer.username}"


# -------------------------------
# 🔹 Product Assignment (Satış / Ürün Atama)
# -------------------------------
class ProductAssignment(models.Model):
    """Müşteriye atanan/satılan ürünün kaydı."""
    STATUS_CHOICES = (
        ('PLANNED', 'Satış Yapıldı'),         # Yeni satış, teslimat henüz planlanmadı
        ('SCHEDULED', 'Teslimat Planlandı'),  # Teslimat tarihi belirlendi
        ('OUT_FOR_DELIVERY', 'Yolda'),
        ('DELIVERED', 'Teslim Edildi'),
        ('CANCELLED', 'İptal'),
    )

    customer = models.ForeignKey(
        CustomUser, 
        on_delete=models.CASCADE, 
        related_name='assignments',
        verbose_name="Müşteri",
        limit_choices_to={'role': 'customer'}
    )
    product = models.ForeignKey(
        Product, 
        on_delete=models.CASCADE, 
        related_name='assignments',
        verbose_name="Ürün"
    )
    quantity = models.PositiveIntegerField(default=1, verbose_name="Adet")
    assigned_at = models.DateTimeField(auto_now_add=True, verbose_name="Atama Tarihi")
    assigned_by = models.ForeignKey(
        CustomUser, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='created_assignments',
        verbose_name="Atayan Kullanıcı"
    )
    status = models.CharField(
        max_length=20, 
        choices=STATUS_CHOICES, 
        default='PLANNED',
        verbose_name="Durum"
    )
    notes = models.TextField(blank=True, null=True, verbose_name="Notlar")

    class Meta:
        ordering = ['-assigned_at']
        verbose_name = "Ürün Atama"
        verbose_name_plural = "Ürün Atamaları"

    def __str__(self):
        return f"{self.customer.first_name} - {self.product.name} ({self.get_status_display()})"



# -------------------------------
# 🔹 Depot Location (Depo Konumu)
# -------------------------------
class DepotLocation(models.Model):
    """Teslimat başlangıç noktası - Depo/Mağaza konumu"""
    name = models.CharField(
        max_length=100, 
        unique=True,
        verbose_name="Depo Adı",
        help_text="Örn: Lefkoşa Ana Depo, Gazimağusa Şube"
    )
    latitude = models.DecimalField(
        max_digits=10, 
        decimal_places=7,
        verbose_name="Enlem"
    )
    longitude = models.DecimalField(
        max_digits=10, 
        decimal_places=7,
        verbose_name="Boylam"
    )
    is_default = models.BooleanField(
        default=False,
        verbose_name="Varsayılan Depo",
        help_text="Yalnızca bir depo varsayılan olabilir"
    )
    created_by = models.ForeignKey(
        CustomUser,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_depots',
        verbose_name="Oluşturan"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-is_default', 'name']
        verbose_name = "Depo Konumu"
        verbose_name_plural = "Depo Konumları"

    def __str__(self):
        default_tag = " (Varsayılan)" if self.is_default else ""
        return f"{self.name}{default_tag}"
    
    def save(self, *args, **kwargs):
        # If this depot is being set as default, unset all others
        if self.is_default:
            DepotLocation.objects.filter(is_default=True).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)


# -------------------------------
# 🔹 Delivery (Teslimat Kaydı)
# -------------------------------
class Delivery(models.Model):
    """Teslimat operasyonlarını yöneten model."""
    STATUS_CHOICES = (
        ('WAITING', 'Bekliyor'),
        ('OUT_FOR_DELIVERY', 'Yolda'),
        ('DELIVERED', 'Teslim Edildi'),
        ('FAILED', 'Başarısız'),
    )

    assignment = models.OneToOneField(
        'ProductAssignment', 
        on_delete=models.CASCADE,
        related_name='delivery',
        verbose_name="Satış Kaydı",
        null=True,
        blank=True
    )
    
    scheduled_date = models.DateField(null=True, blank=True, verbose_name="Planlanan Tarih")
    time_window_start = models.TimeField(null=True, blank=True, verbose_name="Zaman Aralığı Başlangıç")
    time_window_end = models.TimeField(null=True, blank=True, verbose_name="Zaman Aralığı Bitiş")
    
    # Teslimat Adresi (Snapshot veya Override)
    address = models.TextField(null=True, blank=True, verbose_name="Teslimat Adresi")
    address_lat = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True, verbose_name="Enlem")
    address_lng = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True, verbose_name="Boylam")
    
    status = models.CharField(
        max_length=20, 
        choices=STATUS_CHOICES, 
        default='WAITING',
        verbose_name="Durum"
    )
    
    # Teslimat Sonuçları
    delivered_at = models.DateTimeField(null=True, blank=True, verbose_name="Teslim Tarihi")
    delivered_by = models.ForeignKey(
        CustomUser, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='completed_deliveries',
        verbose_name="Teslim Eden Personel"
    )
    
    # Depo Bağlantısı (YENİ)
    depot = models.ForeignKey(
        DepotLocation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='deliveries',
        verbose_name="Başlangıç Deposu"
    )
    
    # Optimizasyon Alanları
    delivery_order = models.PositiveIntegerField(default=0, verbose_name="Teslimat Sırası")
    route_batch_id = models.CharField(max_length=100, null=True, blank=True, verbose_name="Rota Batch ID")
    distance_km = models.FloatField(null=True, blank=True, verbose_name="Mesafe (KM)")
    eta_minutes = models.IntegerField(null=True, blank=True, verbose_name="Tahmini Süre (dk)")
    
    # Snapshot Alanları (Loglama için)
    customer_phone_snapshot = models.CharField(max_length=20, null=True, blank=True, verbose_name="Müşteri Tel (Snapshot)")
    address_snapshot = models.TextField(null=True, blank=True, verbose_name="Adres (Snapshot)")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['delivery_order', 'scheduled_date']
        verbose_name = "Teslimat"
        verbose_name_plural = "Teslimatlar"
        indexes = [
            models.Index(fields=['scheduled_date']),
            models.Index(fields=['status']),
            models.Index(fields=['route_batch_id']),
        ]

    def __str__(self):
        return f"Delivery for {self.assignment}"
    
    @property
    def customer(self):
        """Shortcut to get customer from assignment"""
        return self.assignment.customer if self.assignment else None


# -------------------------------
# 🔹 Installment Plan Models
# -------------------------------
class InstallmentPlan(models.Model):
    customer = models.ForeignKey(
        CustomUser, 
        on_delete=models.CASCADE, 
        related_name='installment_plans',
        limit_choices_to={'role': 'customer'},
        verbose_name="Müşteri"
    )
    product = models.ForeignKey(
        Product, 
        on_delete=models.CASCADE, 
        related_name='installment_plans',
        verbose_name="Ürün"
    )
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Toplam Tutar")
    down_payment = models.DecimalField(max_digits=10, decimal_places=2, default=0, verbose_name="Peşinat")
    installment_count = models.PositiveIntegerField(verbose_name="Taksit Sayısı")
    start_date = models.DateField(verbose_name="Başlangıç Tarihi")
    
    STATUS_CHOICES = (
        ('active', 'Aktif'),
        ('completed', 'Tamamlandı'),
        ('cancelled', 'İptal Edildi'),
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active', verbose_name="Durum")
    notes = models.TextField(blank=True, null=True, verbose_name="Notlar")
    
    created_by = models.ForeignKey(
        CustomUser, 
        on_delete=models.SET_NULL, 
        null=True, 
        related_name='created_installment_plans',
        limit_choices_to={'role__in': ['admin', 'seller']},
        verbose_name="Oluşturan"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Taksit Planı"
        verbose_name_plural = "Taksit Planları"
        indexes = [
            models.Index(fields=['customer', 'status'], name='instplan_cust_status_idx'),
            models.Index(fields=['status'], name='instplan_status_idx'),
        ]

    def __str__(self):
        return f"{self.customer} - {self.product} ({self.get_status_display()})"


class Installment(models.Model):
    plan = models.ForeignKey(
        InstallmentPlan, 
        on_delete=models.CASCADE, 
        related_name='installments',
        verbose_name="Taksit Planı"
    )
    installment_number = models.PositiveIntegerField(verbose_name="Taksit No")
    amount = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Tutar")
    due_date = models.DateField(verbose_name="Vade Tarihi")
    payment_date = models.DateField(null=True, blank=True, verbose_name="Ödeme Tarihi")
    
    STATUS_CHOICES = (
        ('pending', 'Bekliyor'),
        ('customer_confirmed', 'Müşteri Onayladı'),
        ('paid', 'Ödendi'),
        ('overdue', 'Gecikmiş'),
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', verbose_name="Durum")
    
    customer_confirmed_at = models.DateTimeField(null=True, blank=True, verbose_name="Müşteri Onay Zamanı")
    admin_confirmed_at = models.DateTimeField(null=True, blank=True, verbose_name="Admin Onay Zamanı")

    class Meta:
        ordering = ['plan', 'installment_number']
        verbose_name = "Taksit"
        verbose_name_plural = "Taksitler"
        unique_together = ['plan', 'installment_number']
        indexes = [
            models.Index(fields=['status'], name='inst_status_idx'),
            models.Index(fields=['due_date'], name='inst_due_date_idx'),
            models.Index(fields=['plan', 'status'], name='inst_plan_status_idx'),
        ]

    def __str__(self):
        return f"{self.plan} - Taksit {self.installment_number}"


# -------------------------------
# 🔹 Audit Log (Denetim Kaydı)
# -------------------------------
class AuditLog(models.Model):
    ACTION_CHOICES = (
        ('create', 'Oluşturma'),
        ('update', 'Güncelleme'),
        ('delete', 'Silme'),
        ('login', 'Giriş'),
        ('logout', 'Çıkış'),
        ('login_failed', 'Başarısız Giriş'),
        ('password_change', 'Şifre Değişikliği'),
        ('password_reset', 'Şifre Sıfırlama'),
        ('permission_change', 'Yetki Değişikliği'),
        ('export', 'Veri Dışa Aktarma'),
        ('api_access', 'API Erişimi'),
        ('bulk_operation', 'Toplu İşlem'),
    )

    user = models.ForeignKey(
        CustomUser, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='audit_logs',
        verbose_name="Kullanıcı"
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES, verbose_name="İşlem")
    model_name = models.CharField(max_length=100, null=True, blank=True, verbose_name="Model Adı")
    object_id = models.IntegerField(null=True, blank=True, verbose_name="Nesne ID")
    object_repr = models.CharField(max_length=255, null=True, blank=True, verbose_name="Nesne Temsili")
    
    changes = models.JSONField(null=True, blank=True, verbose_name="Değişiklikler")
    
    ip_address = models.GenericIPAddressField(null=True, blank=True, verbose_name="IP Adresi")
    user_agent = models.CharField(max_length=500, null=True, blank=True, verbose_name="User Agent")
    timestamp = models.DateTimeField(auto_now_add=True, verbose_name="Zaman Damgası")

    class Meta:
        ordering = ['-timestamp']
        verbose_name = "Denetim Kaydı"
        verbose_name_plural = "Denetim Kayıtları"
        indexes = [
            models.Index(fields=['user', 'action'], name='audit_user_action_idx'),
            models.Index(fields=['model_name', 'object_id'], name='audit_model_obj_idx'),
            models.Index(fields=['timestamp'], name='audit_timestamp_idx'),
        ]

    def __str__(self):
        return f"{self.user} - {self.action} - {self.timestamp}"


# -------------------------------
# 🔹 Optimization Models (New)
# -------------------------------
class UserNotificationPreference(models.Model):
    """
    Separated notification settings to optimize CustomUser table size.
    """
    user = models.OneToOneField('CustomUser', on_delete=models.CASCADE, related_name='notification_preferences', verbose_name="Kullanıcı")
    
    # Bildirim Tercihleri
    notify_service_updates = models.BooleanField(default=True, verbose_name="Servis Güncellemeleri")
    notify_price_drops = models.BooleanField(default=True, verbose_name="Fiyat Düşüşleri")
    notify_restock = models.BooleanField(default=True, verbose_name="Stok Bildirimleri")
    notify_recommendations = models.BooleanField(default=True, verbose_name="Ürün Önerileri")
    notify_warranty_expiry = models.BooleanField(default=True, verbose_name="Garanti Süresi Uyarıları")
    notify_general = models.BooleanField(default=True, verbose_name="Genel Bildirimler")

    class Meta:
        verbose_name = "Bildirim Tercihi"
        verbose_name_plural = "Bildirim Tercihleri"

    def __str__(self):
        return f"{self.user.username} - Bildirim Ayarları"


class CustomerAddress(models.Model):
    """
    Separated address information to optimize CustomUser table size.
    """
    user = models.OneToOneField('CustomUser', on_delete=models.CASCADE, related_name='customer_address', verbose_name="Kullanıcı")
    
    # KKTC Structured Address
    district = models.ForeignKey(
        'District', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        verbose_name="İlçe",
        related_name="customer_addresses"
    )
    area = models.ForeignKey(
        'Area', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        verbose_name="Mahalle/Köy",
        related_name="customer_addresses"
    )
    
    # Open Address fields
    open_address = models.TextField(
        blank=True, 
        null=True, 
        verbose_name="Açık Adres",
        help_text="Ev/Apartman numarası, cadde, sokak vb."
    )
    address_city = models.CharField(max_length=100, blank=True, null=True, verbose_name="Şehir (Legacy)")
    
    # Coordinates
    latitude = models.DecimalField(
        max_digits=10, decimal_places=7, null=True, blank=True,
        verbose_name="Enlem", help_text="Latitude koordinatı"
    )
    longitude = models.DecimalField(
        max_digits=10, decimal_places=7, null=True, blank=True,
        verbose_name="Boylam", help_text="Longitude koordinatı"
    )
    
    geocoded_at = models.DateTimeField(null=True, blank=True, verbose_name="Son Geocode Tarihi")

    class Meta:
        verbose_name = "Müşteri Adresi"
        verbose_name_plural = "Müşteri Adresleri"

    def __str__(self):
        location = self.open_address or "Adres Girilmemiş"
        if self.district:
            location += f", {self.district.name}"
        return f"{self.user.username} - {location}"


# -------------------------------
# 🔹 MLModelStore (ML Model Depolama)
# -------------------------------
class MLModelStore(models.Model):
    """
    Stores serialized ML model files (pickle) as binary data in the database.
    This allows all developers to share trained models via the shared Supabase DB
    without needing to copy files manually or retrain locally.
    """
    name = models.CharField(
        max_length=100,
        unique=True,
        verbose_name="Model Dosya Adı",
        help_text="Örn: ncf_model.pkl, content_model.pkl"
    )
    data = models.BinaryField(verbose_name="Model Verisi")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Son Güncelleme")

    class Meta:
        verbose_name = "ML Model Deposu"
        verbose_name_plural = "ML Model Depoları"

    def __str__(self):
        size_kb = len(self.data) / 1024 if self.data else 0
        return f"{self.name} ({size_kb:.1f} KB) - {self.updated_at}"
