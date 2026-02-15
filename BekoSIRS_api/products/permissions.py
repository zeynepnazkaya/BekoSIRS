# products/permissions.py
# Custom permission classes for role-based access control

from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsAdminOrReadOnly(BasePermission):
    """
    Allow read-only access to any user.
    Write access only for admin users.
    """
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return request.user.is_authenticated and request.user.role == 'admin'


class IsAdmin(BasePermission):
    """Allow access only to admin users."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'


class IsSeller(BasePermission):
    """Allow access to seller and admin users."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['seller', 'admin']


class IsCustomer(BasePermission):
    """Allow access only to customer users."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'customer'


class IsOwnerOrAdmin(BasePermission):
    """
    Allow access to the owner of an object or admin users.
    Object must have a 'customer' or 'user' field.
    """
    def has_object_permission(self, request, view, obj):
        if request.user.role == 'admin':
            return True
        # Check common owner field names
        owner = getattr(obj, 'customer', None) or getattr(obj, 'user', None)
        return owner == request.user


class IsDeliveryPerson(BasePermission):
    """Allow access only to delivery personnel."""
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'delivery'
