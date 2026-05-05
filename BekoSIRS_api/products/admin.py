from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import (
    CustomUser, Category, Product, ProductOwnership, UserActivity,
    Wishlist, WishlistItem, ViewHistory, Review,
    ServiceRequest, ServiceQueue, Notification, Recommendation,
    CustomerAddress, UserNotificationPreference
)


class UserNotificationPreferenceInline(admin.StackedInline):
    model = UserNotificationPreference
    can_delete = False
    verbose_name_plural = 'Bildirim Tercihleri'

class CustomerAddressInline(admin.StackedInline):
    model = CustomerAddress
    can_delete = False
    verbose_name_plural = 'Adres Bilgileri'

# @admin.register: Bu dekoratör, belirtilen modeli Django Admin paneline kaydeder.
@admin.register(CustomUser)
class CustomUserAdmin(BaseUserAdmin):
    # list_display: Admin panelindeki ana listede hangi sütunların görüneceğini belirler.
    list_display = ('username', 'email', 'role', 'is_active', 'is_staff')
    # list_filter: Panel sağ tarafında hızlı filtreleme (Örn: Role göre) kutusu oluşturur.
    list_filter = ('role', 'is_staff')
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Ek Bilgiler', {'fields': ('role', 'phone_number', 'biometric_enabled')}),
    )
    # inlines: Bir kaydı (Kullanıcı) düzenlerken, ona bağlı diğer tabloları (Adres, Tercihler) 
    # aynı ekranın altında görmemizi ve düzenlememizi sağlar.
    inlines = [CustomerAddressInline, UserNotificationPreferenceInline]


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name',)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'brand', 'category', 'price', 'stock', 'warranty_duration_months')
    list_filter = ('category', 'brand')
    # search_fields: Üstteki arama kutusunun hangi alanlarda arama yapacağını belirler.
    search_fields = ('name', 'description')


@admin.register(ProductOwnership)
class ProductOwnershipAdmin(admin.ModelAdmin):
    list_display = ('customer', 'product', 'purchase_date', 'warranty_end_date')
    list_filter = ('purchase_date',)
    search_fields = ('customer__username', 'product__name', 'serial_number')


@admin.register(UserActivity)
class UserActivityAdmin(admin.ModelAdmin):
    list_display = ('user', 'product', 'activity_type', 'timestamp')
    list_filter = ('activity_type', 'timestamp')


# ----------------------------------------
# Yeni Eklenen Modeller
# ----------------------------------------

class WishlistItemInline(admin.TabularInline):
    model = WishlistItem
    extra = 0
    readonly_fields = ('added_at',)


@admin.register(Wishlist)
class WishlistAdmin(admin.ModelAdmin):
    list_display = ('customer', 'item_count', 'created_at', 'updated_at')
    search_fields = ('customer__username',)
    inlines = [WishlistItemInline]


@admin.register(WishlistItem)
class WishlistItemAdmin(admin.ModelAdmin):
    list_display = ('wishlist', 'product', 'added_at', 'notify_on_price_drop', 'notify_on_restock')
    list_filter = ('notify_on_price_drop', 'notify_on_restock', 'added_at')
    search_fields = ('wishlist__customer__username', 'product__name')


@admin.register(ViewHistory)
class ViewHistoryAdmin(admin.ModelAdmin):
    list_display = ('customer', 'product', 'view_count', 'viewed_at')
    list_filter = ('viewed_at',)
    search_fields = ('customer__username', 'product__name')


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ('customer', 'product', 'rating', 'is_approved', 'created_at')
    list_filter = ('rating', 'is_approved', 'created_at')
    search_fields = ('customer__username', 'product__name', 'comment')
    # actions: Birden fazla kaydı seçip tek tıkla toplu işlem yapmamızı sağlar.
    actions = ['approve_reviews']

    @admin.action(description='Seçili yorumları onayla')
    def approve_reviews(self, request, queryset):
        queryset.update(is_approved=True)


class ServiceQueueInline(admin.StackedInline):
    model = ServiceQueue
    extra = 0


@admin.register(ServiceRequest)
class ServiceRequestAdmin(admin.ModelAdmin):
    list_display = ('id', 'customer', 'get_product_name', 'request_type', 'status', 'assigned_to', 'created_at')
    list_filter = ('status', 'request_type', 'created_at')
    search_fields = ('customer__username', 'product_ownership__product__name', 'description')
    inlines = [ServiceQueueInline]

    @admin.display(description='Ürün')
    def get_product_name(self, obj):
        return obj.product_ownership.product.name


@admin.register(ServiceQueue)
class ServiceQueueAdmin(admin.ModelAdmin):
    list_display = ('queue_number', 'service_request', 'priority', 'estimated_wait_time', 'entered_queue_at')
    list_filter = ('priority', 'entered_queue_at')
    ordering = ('priority', 'entered_queue_at')


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('user', 'notification_type', 'title', 'is_read', 'created_at')
    list_filter = ('notification_type', 'is_read', 'created_at')
    search_fields = ('user__username', 'title', 'message')


@admin.register(Recommendation)
class RecommendationAdmin(admin.ModelAdmin):
    list_display = ('customer', 'product', 'score', 'reason', 'is_shown', 'clicked', 'created_at')
    list_filter = ('is_shown', 'clicked', 'created_at')
    search_fields = ('customer__username', 'product__name', 'reason')
