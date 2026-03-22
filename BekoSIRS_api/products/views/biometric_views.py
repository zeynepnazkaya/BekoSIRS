# products/views/biometric_views.py
"""
Biometric authentication views (Face ID via Python DeepFace).
"""

import cv2
import numpy as np
from rest_framework import status
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework_simplejwt.tokens import RefreshToken

from products.models import CustomUser
from products.serializers import BiometricEnableSerializer, BiometricLoginSerializer


def get_tokens_for_user(user):
    refresh = RefreshToken.for_user(user)
    refresh['role'] = user.role
    refresh['username'] = user.username
    return {
        'refresh': str(refresh),
        'access': str(refresh.access_token),
    }


@api_view(['POST'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def biometric_enable(request):
    """
    POST /api/biometric/enable/
    Yüz fotoğrafını alır, DeepFace ile özellik vektörünü çıkarır ve kaydeder.
    """
    serializer = BiometricEnableSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    face_image = request.FILES.get('face_image')
    if not face_image:
        return Response({'success': False, 'error': 'Yüz fotoğrafı gerekli.'}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        from deepface import DeepFace
        
        # Load image into numpy array for cv2
        file_bytes = np.asarray(bytearray(face_image.read()), dtype=np.uint8)
        img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        
        # Extract features
        objs = DeepFace.represent(img_path=img, model_name="Facenet", enforce_detection=True)
        
        if len(objs) == 0:
            return Response({'success': False, 'error': 'Yüz algılanamadı.'}, status=status.HTTP_400_BAD_REQUEST)
            
        embedding = objs[0]["embedding"]
        user = request.user
        user.face_encoding = embedding
        user.biometric_enabled = True
        user.save()
        
        return Response({
            'success': True,
            'message': 'Biyometrik yüz doğrulama başarıyla aktifleştirildi.',
            'biometric_enabled': True
        })
    except ValueError as ve:
        return Response({'success': False, 'error': f'Yüz bulunamadı veya fotoğraf geçersiz: {str(ve)}'}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        import traceback
        return Response({'success': False, 'error': str(e), 'trace': traceback.format_exc()}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
@parser_classes([MultiPartParser, FormParser])
def biometric_login(request):
    """
    POST /api/biometric/login/
    Gelen fotoğrafın özelliklerini çıkarıp, sistemdekiyle karşılaştırır.
    """
    serializer = BiometricLoginSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    username = serializer.validated_data['username']
    face_image = request.FILES.get('face_image')
    
    try:
        user = CustomUser.objects.get(username=username)
        if not user.biometric_enabled or not user.face_encoding:
            return Response({'success': False, 'error': 'Biyometrik giriş bu hesap için açık değil.'}, status=status.HTTP_400_BAD_REQUEST)
            
        from deepface import DeepFace
        from deepface.modules import verification
        
        file_bytes = np.asarray(bytearray(face_image.read()), dtype=np.uint8)
        img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
        
        # Extract current face embedding
        objs = DeepFace.represent(img_path=img, model_name="Facenet", enforce_detection=True)
        if len(objs) == 0:
            return Response({'success': False, 'error': 'Gelen fotoğrafta yüz bulunamadı.'}, status=status.HTTP_400_BAD_REQUEST)
            
        incoming_embedding = objs[0]["embedding"]
        stored_embedding = user.face_encoding
        
        # Calculate Cosine Distance
        distance = verification.find_distance(stored_embedding, incoming_embedding, distance_metric='cosine')
        threshold = verification.find_threshold(model_name="Facenet", distance_metric="cosine")
        
        # Telefon kameralarındaki ışık/açı farklarından dolayı toleransı biraz artırıyoruz (oyuncak ayı vb geçmesin diye %4 olarak kısıldı)
        lenient_threshold = threshold + 0.04
        print(f"FaceID Login -> User: {username}, Distance: {distance}, Strict: {threshold}, Lenient: {lenient_threshold}")
        
        if distance <= lenient_threshold:
            tokens = get_tokens_for_user(user)
            return Response({
                'success': True,
                'message': 'Giriş başarılı!',
                'tokens': tokens,
                'user_id': user.id,
                'username': user.username,
                'role': user.role
            })
        else:
            return Response({'success': False, 'error': 'Yüz eşleşmedi (Mesafe çok uzak). Lütfen tekrar deneyin.'}, status=status.HTTP_401_UNAUTHORIZED)

    except CustomUser.DoesNotExist:
        return Response({'success': False, 'error': 'Kullanıcı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'success': False, 'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def biometric_disable(request):
    """
    POST /api/biometric/disable/
    """
    user = request.user
    user.biometric_enabled = False
    user.face_encoding = None
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
    """
    user = request.user
    return Response({
        'biometric_enabled': user.biometric_enabled,
        'has_encoding': bool(user.face_encoding)
    })

