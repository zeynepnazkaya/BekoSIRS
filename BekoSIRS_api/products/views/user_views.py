# products/views/user_views.py
"""
User management views: users, groups, profile, notification settings.
"""

from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from django.contrib.auth.models import Group, Permission
from django.contrib.contenttypes.models import ContentType

from products.models import CustomUser
from products.serializers import RegisterSerializer, UserSerializer, GroupSerializer


class UserManagementViewSet(viewsets.ModelViewSet):
    """User CRUD with role management."""
    queryset = CustomUser.objects.all()

    def get_queryset(self):
        qs = super().get_queryset()
        role = self.request.query_params.get('role')
        if role:
            qs = qs.filter(role=role)
        return qs

    def get_serializer_class(self):
        if self.action == "create":
            return RegisterSerializer
        return UserSerializer

    def get_permissions(self):
        if self.action == "create":
            return [AllowAny()]
        from products.permissions import IsAdmin
        return [IsAdmin()]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        
        try:
            from products.email_service import EmailService
            EmailService.send_welcome_email(user)
        except Exception as e:
            print(f"Failed to send welcome email: {e}")
        
        return Response(
            {
                "success": True,
                "message": f"{user.username} başarıyla oluşturuldu.",
                "user_id": user.id,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def set_role(self, request, pk=None):
        user = self.get_object()
        role = request.data.get("role")
        if role not in ["admin", "seller", "customer", "delivery"]:
            return Response({"error": "Geçersiz rol"}, status=status.HTTP_400_BAD_REQUEST)
        user.role = role
        user.save()
        return Response({"success": f"Rol {role} olarak güncellendi."})


class GroupViewSet(viewsets.ModelViewSet):
    """Group management for permissions."""
    queryset = Group.objects.all()
    permission_classes = [IsAdminUser]

    serializer_class = GroupSerializer

    def list(self, request, *args, **kwargs):
        # Varsayılan rolleri oluştur (Eğer yoksa)
        system_roles = ['Admin', 'Satıcı', 'Müşteri']
        for role in system_roles:
            Group.objects.get_or_create(name=role)
        
        return super().list(request, *args, **kwargs)

    @action(detail=False, methods=['get'])
    def available_permissions(self, request):
        """Atanabilir tüm izinleri listele (Sadece ilgili app'ler)."""
        # Sadece business logic ve auth yetkilerini getir
        perms = Permission.objects.filter(content_type__app_label__in=['products', 'auth'])
        data = list(perms.values('id', 'name', 'codename', 'content_type__model'))
        return Response(data)

    @action(detail=True, methods=['get'])
    def permissions(self, request, pk=None):
        """Seçili grubun izinlerini (ID listesi olarak) döndür."""
        group = self.get_object()
        perm_ids = group.permissions.values_list('id', flat=True)
        return Response(perm_ids)

    @action(detail=True, methods=['post'])
    def update_permissions(self, request, pk=None):
        """Grubun izinlerini güncelle."""
        group = self.get_object()
        permission_ids = request.data.get('permission_ids', [])
        # Permission validation yapılabilir ama şimdilik doğrudan set ediyoruz
        group.permissions.set(permission_ids)
        return Response({
            'success': True, 
            'message': f'{group.name} rolünün yetkileri güncellendi.'
        })


@api_view(["GET", "PUT", "PATCH"])
@permission_classes([IsAuthenticated])
def profile_view(request):
    """GET/PUT/PATCH /api/profile/ - User profile management."""
    user = request.user

    if request.method == "GET":
        return Response({
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "phone_number": getattr(user, 'phone_number', ''),
            "role": user.role,
            "date_joined": user.date_joined,
            # Adres Bilgileri - Using getattr for safety after migration
            "address": getattr(user, 'address', ''),
            "address_city": getattr(user, 'address_city', ''),
            "address_lat": getattr(user, 'address_lat', None),
            "address_lng": getattr(user, 'address_lng', None),
        })

    data = request.data
    if "first_name" in data:
        user.first_name = data["first_name"]
    if "last_name" in data:
        user.last_name = data["last_name"]
    if "email" in data:
        user.email = data["email"]
    if "phone_number" in data:
        user.phone_number = data["phone_number"]
    
    # Adres güncelleme - safely check if attributes exist
    if "address" in data and hasattr(user, 'address'):
        user.address = data["address"]
    if "address_city" in data and hasattr(user, 'address_city'):
        user.address_city = data["address_city"]
    # Koordinatlar genelde mobilden gelmez ama admin güncellerse diye açık bırakalım
    if "address_lat" in data and hasattr(user, 'address_lat'):
        user.address_lat = data["address_lat"]
    if "address_lng" in data and hasattr(user, 'address_lng'):
        user.address_lng = data["address_lng"]

    if "new_password" in data and data["new_password"]:
        current_password = data.get("current_password", "")
        if not user.check_password(current_password):
            return Response(
                {"error": "Mevcut şifre yanlış"},
                status=status.HTTP_400_BAD_REQUEST
            )
        user.set_password(data["new_password"])

    user.save()

    return Response({
        "success": True,
        "message": "Profil başarıyla güncellendi",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "phone_number": getattr(user, 'phone_number', ''),
            "role": user.role,
            "address": getattr(user, 'address', ''),
            "address_city": getattr(user, 'address_city', ''),
        }
    })


@api_view(["GET", "PUT", "PATCH"])
@permission_classes([IsAuthenticated])
def notification_settings_view(request):
    """GET/PUT/PATCH /api/notification-settings/ - Notification preferences."""
    from products.models import UserNotificationPreference
    
    user = request.user
    prefs, _ = UserNotificationPreference.objects.get_or_create(user=user)

    if request.method == "GET":
        return Response({
            "notify_service_updates": prefs.notify_service_updates,
            "notify_price_drops": prefs.notify_price_drops,
            "notify_restock": prefs.notify_restock,
            "notify_recommendations": prefs.notify_recommendations,
            "notify_warranty_expiry": prefs.notify_warranty_expiry,
            "notify_general": prefs.notify_general,
        })

    data = request.data
    if "notify_service_updates" in data:
        prefs.notify_service_updates = data["notify_service_updates"]
    if "notify_price_drops" in data:
        prefs.notify_price_drops = data["notify_price_drops"]
    if "notify_restock" in data:
        prefs.notify_restock = data["notify_restock"]
    if "notify_recommendations" in data:
        prefs.notify_recommendations = data["notify_recommendations"]
    if "notify_warranty_expiry" in data:
        prefs.notify_warranty_expiry = data["notify_warranty_expiry"]
    if "notify_general" in data:
        prefs.notify_general = data["notify_general"]

    prefs.save()

    return Response({
        "success": True,
        "message": "Bildirim ayarları güncellendi",
        "settings": {
            "notify_service_updates": prefs.notify_service_updates,
            "notify_price_drops": prefs.notify_price_drops,
            "notify_restock": prefs.notify_restock,
            "notify_recommendations": prefs.notify_recommendations,
            "notify_warranty_expiry": prefs.notify_warranty_expiry,
            "notify_general": prefs.notify_general,
        }
    })

