# products/views/__init__.py
"""
Modular views package for BekoSIRS API.
Split from the original 1466-line views.py file for better maintainability.
"""

# Authentication views
from .auth_views import (
    CustomTokenObtainPairSerializer,
    CustomTokenObtainPairView,
)

# Product and Category views
from .product_views import (
    ProductViewSet,
    CategoryViewSet,
    my_products_direct,
    export_products_excel,
)

# User management views
from .user_views import (
    UserManagementViewSet,
    GroupViewSet,
    profile_view,
    notification_settings_view,
    save_push_token_view,
)

# Service request views
from .service_views import (
    ServiceRequestViewSet,
    ProductOwnershipViewSet,
    DashboardSummaryView,
)

# Wishlist and customer features
from .customer_views import (
    WishlistViewSet,
    ViewHistoryViewSet,
    ReviewViewSet,
    NotificationViewSet,
    RecommendationViewSet,
)

# Password reset views
from .password_views import (
    password_reset_request,
    password_reset_confirm,
)

# Biometric authentication views
from .biometric_views import (
    biometric_enable,
    biometric_disable,
    biometric_status,
    biometric_login,
)

# Delivery and route optimization views
from .delivery_views import (
    DeliveryViewSet,
    DeliveryRouteViewSet,
    ProductAssignmentViewSet,
    DeliveryPersonViewSet,
)

# New Analytics & Installment Views (Manually Added)
from .analytics_views import (
    ChartsView,
    SalesForecastView,
    SeasonalAnalysisView,
    MarketingAutomationView,
    AuditLogView
)
from .installment_views import (
    InstallmentPlanViewSet,
    InstallmentViewSet
)
from .stock_intelligence_views import (
    StockIntelligenceDashboardView
)

__all__ = [
    # Auth
    'CustomTokenObtainPairSerializer',
    'CustomTokenObtainPairView',
    # Products
    'ProductViewSet',
    'CategoryViewSet',
    'my_products_direct',
    'export_products_excel',
    # Users
    'UserManagementViewSet',
    'GroupViewSet',
    'profile_view',
    'notification_settings_view',
    # Services
    'ServiceRequestViewSet',
    'ProductOwnershipViewSet',
    'DashboardSummaryView',
    # Customer
    'WishlistViewSet',
    'ViewHistoryViewSet',
    'ReviewViewSet',
    'NotificationViewSet',
    'RecommendationViewSet',
    # Password
    'password_reset_request',
    'password_reset_confirm',
    # Biometric
    'biometric_enable',
    'biometric_disable',
    'biometric_status',
    'biometric_login',
    # Delivery
    'DeliveryViewSet',
    'DeliveryRouteViewSet',
    'ProductAssignmentViewSet',
    'DeliveryPersonViewSet',
    # Analytics & Installments
    'ChartsView', 
    'SalesForecastView',
    'SeasonalAnalysisView',
    'MarketingAutomationView', 
    'AuditLogView',
    'InstallmentPlanViewSet', 
    'InstallmentViewSet',
    'StockIntelligenceDashboardView'
]
