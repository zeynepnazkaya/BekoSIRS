from rest_framework import serializers, validators
from django.contrib.auth.models import Group, Permission
from .models import (
    Category, Product, ProductOwnership, CustomUser,
    Wishlist, WishlistItem, ViewHistory, Review,
    ServiceRequest, ServiceQueue, Notification, Recommendation,
    District, Area, DepotLocation,
    ProductAssignment, Delivery, DeliveryRoute, DeliveryRouteStop,
    InstallmentPlan, Installment, AuditLog
)

# ---------------------------
# Category Serializer
# ---------------------------
class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = ['id', 'name', 'parent', 'product_count']


# ---------------------------
# Product Serializer (Stok ve Kategori İsmi Dahil)
# ---------------------------
class ProductSerializer(serializers.ModelSerializer):
    # Kategori detaylarını obje olarak döner (read_only)
    category = CategorySerializer(read_only=True)
    # Kategori ismini düz metin olarak da döner (Frontend kolaylığı için)
    category_name = serializers.SerializerMethodField()

    def get_category_name(self, obj):
        return obj.category.name if obj.category else None
    
    class Meta:
        model = Product
        # 'stock', 'category_name' ve 'image' alanlarının burada olduğundan emin olun
        fields = [
            "id", 
            "name", 
            "brand", 
            "description", 
            "price", 
            "stock", 
            "category", 
            "category_name", 
            "image",
            "model_code",
            "warranty_code",
            "price_list",
            "price_cash",
            "campaign_tag"
        ]

    def to_representation(self, instance):
        """
        Görsel alanı bir URL ise (http/https ile başlıyorsa), 
        Django'nun otomatik eklediği media url prefixini kaldır ve orijinal URL'i döndür.
        """
        representation = super().to_representation(instance)
        try:
            # instance.image bir FieldFile objesidir. instance.image.name veritabanındaki raw stringi verir.
            if instance.image and str(instance.image.name).startswith(('http', 'https')):
                representation['image'] = instance.image.name
        except Exception:
            pass
        return representation


# ---------------------------
# User Serializers (Kullanıcı Listeleme ve Arama)
# ---------------------------
class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = ["id", "username", "email", "first_name", "last_name", "role", "is_active", "phone_number", "biometric_enabled"]


class UserSearchSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'role', 'phone_number']


# ---------------------------
# Product Ownership (Ürün Sahipliği)
# ---------------------------
class ProductOwnershipSerializer(serializers.ModelSerializer):
    # Ürün detaylarını tam göstermek için ProductSerializer'ı içe gömüyoruz
    product = ProductSerializer(read_only=True)
    warranty_end_date = serializers.DateField(read_only=True)

    class Meta:
        model = ProductOwnership
        fields = ['id', 'product', 'purchase_date', 'serial_number', 'warranty_end_date']


class ProductOwnershipCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductOwnership
        fields = ['customer', 'product', 'purchase_date', 'serial_number']


# ---------------------------
# Group & Permission Serializers (Rol Yönetimi)
# ---------------------------
class GroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ["id", "name"]

class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ["id", "name", "codename"]


# ------------------------------------------------------------
# 🔹 Register Serializer (Tam Düzeltilmiş Versiyon)
# ------------------------------------------------------------
class RegisterSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = ("username", "password", "email", "first_name", "last_name", "role", "phone_number")
        extra_kwargs = {
            "password": {"write_only": True},
            "email": {
                "required": True,
                "allow_blank": False,
                "validators": [
                    validators.UniqueValidator(
                        CustomUser.objects.all(), 
                        "Bu e-posta adresi ile bir kullanıcı zaten mevcut."
                    )
                ],
            },
            # Telefon numarasının boş geçilebilmesi için ayarlar:
            "phone_number": {"required": False, "allow_null": True, "allow_blank": True}
        }

    def create(self, validated_data):
        # ❗ SQL Server Unique Constraint Hatası Çözümü:
        # Eğer telefon numarası boş string ("") gelirse, onu veritabanına None (NULL) olarak kaydet.
        # Böylece birden fazla kişi telefon numarasını boş bırakabilir.
        phone = validated_data.get("phone_number")
        if phone == "" or phone is None:
            phone = None 

        # create_user metodu şifreyi otomatik olarak hashler (pbkdf2_sha256)
        user = CustomUser.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            # Eğer rol gönderilmezse varsayılan olarak 'customer' ata
            role=validated_data.get("role", "customer"),
            phone_number=phone
        )
        return user


# ---------------------------
# Wishlist Serializers (İstek Listesi)
# ---------------------------
class WishlistItemSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(), source='product', write_only=True
    )

    class Meta:
        model = WishlistItem
        fields = ['id', 'product', 'product_id', 'added_at', 'note',
                  'notify_on_price_drop', 'notify_on_restock']
        read_only_fields = ['id', 'added_at']


class WishlistSerializer(serializers.ModelSerializer):
    items = WishlistItemSerializer(many=True, read_only=True)
    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Wishlist
        fields = ['id', 'customer', 'items', 'item_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'customer', 'created_at', 'updated_at']


# ---------------------------
# ViewHistory Serializer (Görüntüleme Geçmişi)
# ---------------------------
class ViewHistorySerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(), source='product', write_only=True
    )

    class Meta:
        model = ViewHistory
        fields = ['id', 'product', 'product_id', 'viewed_at', 'view_count']
        read_only_fields = ['id', 'viewed_at', 'view_count']


# ---------------------------
# Review Serializers (Ürün Değerlendirmesi)
# ---------------------------
class ReviewSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.username', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = Review
        fields = ['id', 'customer', 'customer_name', 'product', 'product_name',
                  'rating', 'comment', 'created_at', 'updated_at', 'is_approved']
        read_only_fields = ['id', 'customer', 'created_at', 'updated_at']


class ReviewCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Review
        fields = ['product', 'rating', 'comment']

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("Puan 1-5 arasında olmalıdır.")
        return value


# ---------------------------
# ServiceRequest Serializers (Servis Talebi)
# ---------------------------
class ServiceQueueSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceQueue
        fields = ['id', 'queue_number', 'priority', 'estimated_wait_time', 'entered_queue_at']
        read_only_fields = ['id', 'entered_queue_at']


class ServiceRequestSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.username', read_only=True)
    customer_phone = serializers.CharField(source='customer.phone_number', read_only=True)
    customer_email = serializers.CharField(source='customer.email', read_only=True)
    customer_address = serializers.SerializerMethodField()
    product_name = serializers.CharField(source='product_ownership.product.name', read_only=True)
    assigned_to_name = serializers.CharField(source='assigned_to.username', read_only=True)
    queue_entry = ServiceQueueSerializer(read_only=True)
    product_ownership_detail = ProductOwnershipSerializer(source='product_ownership', read_only=True)

    class Meta:
        model = ServiceRequest
        fields = ['id', 'customer', 'customer_name', 'customer_phone', 'customer_email', 'customer_address',
                  'product_ownership', 'product_ownership_detail',
                  'product_name', 'request_type', 'status', 'description', 'created_at', 'updated_at',
                  'assigned_to', 'assigned_to_name', 'resolution_notes', 'resolved_at', 'queue_entry']
        read_only_fields = ['id', 'customer', 'created_at', 'updated_at', 'resolved_at']

    def get_customer_address(self, obj):
        """Build customer address from various fields."""
        customer = obj.customer
        parts = []
        if customer.open_address:
            parts.append(customer.open_address)
        if hasattr(customer, 'area') and customer.area:
            parts.append(customer.area.name)
        if hasattr(customer, 'district') and customer.district:
            parts.append(customer.district.name)
        if customer.address:
            return customer.address
        return ", ".join(parts) if parts else None


class ServiceRequestCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceRequest
        fields = ['product_ownership', 'request_type', 'description']


# ---------------------------
# Notification Serializer (Bildirim)
# ---------------------------
class NotificationSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='related_product.name', read_only=True)

    class Meta:
        model = Notification
        fields = ['id', 'notification_type', 'title', 'message', 'is_read',
                  'created_at', 'related_product', 'product_name', 'related_service_request']
        read_only_fields = ['id', 'created_at']


# ---------------------------
# Recommendation Serializer (Öneri)
# ---------------------------
class RecommendationSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)

    class Meta:
        model = Recommendation
        fields = ['id', 'product', 'score', 'reason', 'created_at', 'is_shown', 'clicked']
        read_only_fields = ['id', 'created_at']


# ---------------------------
# Password Reset Serializers
# ---------------------------
class PasswordResetRequestSerializer(serializers.Serializer):
    """Serializer for requesting a password reset email."""
    email = serializers.EmailField()

    def validate_email(self, value):
        """Check if user with this email exists."""
        if not CustomUser.objects.filter(email=value).exists():
            # Don't reveal if email exists or not for security
            pass  # Still return success to prevent email enumeration
        return value


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Serializer for confirming password reset with token."""
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=8, write_only=True)
    confirm_password = serializers.CharField(min_length=8, write_only=True)

    def validate(self, attrs):
        """Validate that passwords match and token is valid."""
        if attrs['new_password'] != attrs['confirm_password']:
            raise serializers.ValidationError({
                'confirm_password': 'Şifreler eşleşmiyor.'
            })
        
        from .models import PasswordResetToken
        try:
            token_obj = PasswordResetToken.objects.get(token=attrs['token'])
            if not token_obj.is_valid():
                raise serializers.ValidationError({
                    'token': 'Bu şifre sıfırlama bağlantısı geçersiz veya süresi dolmuş.'
                })
            attrs['token_obj'] = token_obj
        except PasswordResetToken.DoesNotExist:
            raise serializers.ValidationError({
                'token': 'Geçersiz şifre sıfırlama bağlantısı.'
            })
        
        return attrs

    def save(self):
        """Reset the user's password."""
        token_obj = self.validated_data['token_obj']
        user = token_obj.user
        user.set_password(self.validated_data['new_password'])
        user.save()
        token_obj.use()
        return user


# ---------------------------
# Biometric Authentication Serializers
# ---------------------------
class BiometricEnableSerializer(serializers.Serializer):
    """Serializer for enabling biometric authentication."""
    device_id = serializers.CharField(max_length=255)
    refresh_token = serializers.CharField(write_only=True)


class BiometricLoginSerializer(serializers.Serializer):
    """Serializer for biometric login."""
    device_id = serializers.CharField(max_length=255)
    user_id = serializers.IntegerField()


# ---------------------------
# KKTC Location Serializers
# ---------------------------
class DistrictSerializer(serializers.ModelSerializer):
    """Serializer for District (İlçe)"""
    class Meta:
        model = District
        fields = ['id', 'name', 'center_lat', 'center_lng']


class AreaSerializer(serializers.ModelSerializer):
    """Serializer for Area (Mahalle/Köy)"""
    district_name = serializers.CharField(source='district.name', read_only=True)
    
    class Meta:
        model = Area
        fields = ['id', 'name', 'district', 'district_name']


# ---------------------------
# Customer Management Serializers
# ---------------------------
class CustomerListSerializer(serializers.ModelSerializer):
    """List serializer for customers with basic info"""
    district_name = serializers.CharField(source='district.name', read_only=True)
    area_name = serializers.CharField(source='area.name', read_only=True)
    full_name = serializers.SerializerMethodField()
    
    class Meta:
        model = CustomUser
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'full_name',
            'phone_number', 'district', 'district_name', 'area', 'area_name'
        ]
    
    def get_full_name(self, obj):
        """Returns full name or username if names are empty"""
        full = f"{obj.first_name} {obj.last_name}".strip()
        return full if full else obj.username


class CustomerDetailSerializer(serializers.ModelSerializer):
    """Detail serializer for customer with all information"""
    district_name = serializers.CharField(source='district.name', read_only=True)
    area_name = serializers.CharField(source='area.name', read_only=True)
    full_name = serializers.SerializerMethodField()
    
    class Meta:
        model = CustomUser
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'full_name',
            'phone_number', 'role', 'is_active',
            'district', 'district_name', 'area', 'area_name', 'open_address',
            'address', 'address_city', 'address_lat', 'address_lng',
            'notify_service_updates', 'notify_price_drops', 'notify_restock',
            'notify_recommendations', 'notify_warranty_expiry', 'notify_general',
            'biometric_enabled', 'date_joined', 'last_login'
        ]
        read_only_fields = ['id', 'username', 'role', 'date_joined', 'last_login']
    
    def get_full_name(self, obj):
        full = f"{obj.first_name} {obj.last_name}".strip()
        return full if full else obj.username


class CustomerUpdateSerializer(serializers.ModelSerializer):
    """Update serializer for customer PATCH/PUT operations"""
    
    class Meta:
        model = CustomUser
        fields = [
            'first_name', 'last_name', 'email', 'phone_number',
            'district', 'area', 'open_address', 'address_city',
            'address_lat', 'address_lng',
            'notify_service_updates', 'notify_price_drops', 'notify_restock',
            'notify_recommendations', 'notify_warranty_expiry', 'notify_general'
        ]
    
    def validate(self, attrs):
        """Validate that area belongs to selected district"""
        district = attrs.get('district')
        area = attrs.get('area')
        
        # If area is provided, district must also be provided
        if area and not district:
            # Check if instance has district
            if not (self.instance and self.instance.district):
                raise serializers.ValidationError({
                    'area': 'Mahalle seçmek için önce ilçe seçmelisiniz.'
                })
        
        # Validate area belongs to district
        if area and district:
            if area.district != district:
                raise serializers.ValidationError({
                    'area': 'Seçilen mahalle, seçilen ilçeye ait değil.'
                })
        
        return attrs


# ---------------------------
# Delivery & Assignment Serializers
# ---------------------------

class CustomerSummarySerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    formatted_address = serializers.SerializerMethodField()
    
    class Meta:
        model = CustomUser
        fields = ['id', 'username', 'first_name', 'last_name', 'full_name', 'email', 'phone_number', 'address', 'formatted_address']
        
    def get_full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}".strip() or obj.username

    def get_formatted_address(self, obj):
        if obj.address:
            return obj.address
        
        parts = []
        if obj.open_address:
            parts.append(obj.open_address)
        if obj.area:
            parts.append(obj.area.name)
        if obj.district:
            parts.append(obj.district.name)
        
        return ", ".join(parts) if parts else ""

class ProductAssignmentSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(), source='product', write_only=True
    )
    customer = CustomerSummarySerializer(read_only=True)
    customer_id = serializers.PrimaryKeyRelatedField(
        queryset=CustomUser.objects.filter(role='customer'), source='customer', write_only=True
    )
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    delivery_info = serializers.SerializerMethodField()

    class Meta:
        model = ProductAssignment
        fields = [
            'id', 'customer', 'customer_id', 'product', 'product_id', 
            'quantity', 'assigned_at', 'status', 'status_display', 'notes', 
            'assigned_by', 'delivery_info'
        ]
        read_only_fields = ['id', 'assigned_at', 'assigned_by']

    def get_delivery_info(self, obj):
        if hasattr(obj, 'delivery'):
            return {
                'id': obj.delivery.id,
                'status': obj.delivery.status,
                'status_display': obj.delivery.get_status_display(),
                'scheduled_date': obj.delivery.scheduled_date,
                'time_window_start': obj.delivery.time_window_start,
                'time_window_end': obj.delivery.time_window_end
            }
        return None


class DeliverySerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='assignment.customer.username', read_only=True)
    product_name = serializers.CharField(source='assignment.product.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    class Meta:
        model = Delivery
        fields = [
            'id', 'assignment', 'customer_name', 'product_name',
            'scheduled_date', 'time_window_start', 'time_window_end',
            'status', 'status_display', 'delivered_at', 'delivered_by',
            'delivery_order', 'route_batch_id', 'distance_km', 'eta_minutes',
            'customer_phone_snapshot', 'address_snapshot'
        ]
        read_only_fields = ['id', 'created_at']

class DeliveryRouteStopSerializer(serializers.ModelSerializer):
    delivery = DeliverySerializer(read_only=True)
    
    class Meta:
        model = DeliveryRouteStop
        fields = [
            'id', 'delivery', 'stop_order', 'distance_from_previous_km', 
            'duration_from_previous_min', 'estimated_arrival'
        ]

class DeliveryRouteSerializer(serializers.ModelSerializer):
    stops = DeliveryRouteStopSerializer(many=True, read_only=True)
    
    class Meta:
        model = DeliveryRoute
        fields = [
            'id', 'date', 'store_address', 'total_distance_km', 
            'total_duration_min', 'is_optimized', 'optimized_at', 'stops'
        ]


# ---------------------------
# Depot Location Serializers
# ---------------------------
class DepotLocationSerializer(serializers.ModelSerializer):
    """Serializer for DepotLocation - full details"""
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    
    class Meta:
        model = DepotLocation
        fields = [
            'id', 'name', 'latitude', 'longitude', 'is_default',
            'created_by', 'created_by_name', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']


class DepotLocationCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating depots"""
    
    class Meta:
        model = DepotLocation
        fields = ['name', 'latitude', 'longitude', 'is_default']
    
    def validate_name(self, value):
        # Check if depot with this name already exists (excluding self in update)
        queryset = DepotLocation.objects.filter(name=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        
        if queryset.exists():
            raise serializers.ValidationError("Bu isimde bir depo zaten mevcut.")
        
        return value


# ---------------------------
# 🔹 INSTALLMENT SERIALIZERS
# ---------------------------

class InstallmentSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    is_overdue = serializers.SerializerMethodField()
    days_until_due = serializers.SerializerMethodField()

    class Meta:
        model = Installment
        fields = [
            'id', 'installment_number', 'amount', 'due_date', 'payment_date',
            'status', 'status_display', 'is_overdue', 'days_until_due',
            'customer_confirmed_at', 'admin_confirmed_at'
        ]

    def get_is_overdue(self, obj):
        from django.utils import timezone
        if obj.status == 'pending' and obj.due_date < timezone.now().date():
            return True
        return False

    def get_days_until_due(self, obj):
        from django.utils import timezone
        delta = obj.due_date - timezone.now().date()
        return delta.days


class InstallmentPlanSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.get_full_name', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    remaining_amount = serializers.SerializerMethodField()
    paid_amount = serializers.SerializerMethodField()
    progress_percentage = serializers.SerializerMethodField()
    installments = InstallmentSerializer(many=True, read_only=True)

    class Meta:
        model = InstallmentPlan
        fields = [
            'id', 'customer', 'customer_name', 'product', 'product_name',
            'total_amount', 'down_payment', 'installment_count', 'start_date',
            'status', 'status_display', 'notes', 'created_at',
            'remaining_amount', 'paid_amount', 'progress_percentage',
            'installments'
        ]

    def get_paid_amount(self, obj):
        paid = sum(inst.amount for inst in obj.installments.filter(status='paid'))
        return paid + obj.down_payment

    def get_remaining_amount(self, obj):
        return obj.total_amount - self.get_paid_amount(obj)

    def get_progress_percentage(self, obj):
        if obj.total_amount == 0:
            return 0
        return round((self.get_paid_amount(obj) / obj.total_amount) * 100)


class InstallmentPlanListSerializer(InstallmentPlanSerializer):
    class Meta(InstallmentPlanSerializer.Meta):
        fields = [
            'id', 'customer', 'customer_name', 'product', 'product_name',
            'total_amount', 'remaining_amount', 'progress_percentage',
            'status', 'status_display', 'start_date'
        ]


class InstallmentPlanDetailSerializer(InstallmentPlanSerializer):
    pass


class InstallmentPlanCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = InstallmentPlan
        fields = [
            'customer', 'product', 'total_amount', 'down_payment',
            'installment_count', 'start_date', 'notes'
        ]


class CustomerConfirmPaymentSerializer(serializers.Serializer):
    pass


class AdminApprovePaymentSerializer(serializers.Serializer):
    payment_date = serializers.DateField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True)


# ---------------------------
# 🔹 AUDIT LOG SERIALIZER
# ---------------------------

class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = '__all__'


