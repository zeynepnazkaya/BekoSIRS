# products/views/biometric_views.py
"""
Biometric authentication views (Face ID / Face Unlock).
"""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny

from products.models import CustomUser
from products.serializers import BiometricEnableSerializer, BiometricLoginSerializer


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def biometric_enable(request):
    """
    POST /api/biometric/enable/
    Enable biometric login for the authenticated user.
    Stores the device ID for verification.
    """
    serializer = BiometricEnableSerializer(data=request.data)
    if not serializer.is_valid():
        print("Biometric Enable Error - Request Data:", request.data)
        print("Biometric Enable Error - Serializer Errors:", serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    device_id = serializer.validated_data['device_id']
    user = request.user
    
    user.biometric_enabled = True
    user.biometric_device_id = device_id
    user.save()
    
    return Response({
        'success': True,
        'message': 'Biyometrik giriş etkinleştirildi.',
        'biometric_enabled': True,
        'device_id': device_id
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def biometric_disable(request):
    """
    POST /api/biometric/disable/
    Disable biometric login for the authenticated user.
    """
    user = request.user
    user.biometric_enabled = False
    user.biometric_device_id = None
    user.save()
    
    return Response({
        'success': True,
        'message': 'Biyometrik giriş devre dışı bırakıldı.',
        'biometric_enabled': False
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def biometric_status(request):
    """
    GET /api/biometric/status/
    Check if biometric login is enabled for the user.
    """
    user = request.user
    return Response({
        'biometric_enabled': user.biometric_enabled,
        'has_device': bool(user.biometric_device_id)
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def biometric_verify_device(request):
    """
    POST /api/biometric/verify-device/
    Verify a device for biometric login.
    Called from mobile app before prompting biometric.
    """
    serializer = BiometricLoginSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    user_id = serializer.validated_data['user_id']
    device_id = serializer.validated_data['device_id']

    try:
        user = CustomUser.objects.get(id=user_id)
        
        if not user.biometric_enabled:
            return Response({
                'success': False,
                'error': 'Biyometrik giriş bu hesap için etkin değil.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if user.biometric_device_id != device_id:
            return Response({
                'success': False,
                'error': 'Bu cihaz biyometrik giriş için yetkilendirilmemiş.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        return Response({
            'success': True,
            'message': 'Cihaz doğrulandı. Yenileme token\'ını kullanarak giriş yapabilirsiniz.',
            'user_id': user.id,
            'username': user.username
        })
        
    except CustomUser.DoesNotExist:
        return Response({
            'success': False,
            'error': 'Kullanıcı bulunamadı.'
        }, status=status.HTTP_404_NOT_FOUND)
