from unittest.mock import patch, MagicMock
import base64
from django.urls import reverse
from rest_framework import status
from .conftest import APITestCase
from django.core.files.uploadedfile import SimpleUploadedFile

class BiometricAPITest(APITestCase):
    """Tests for true biometric/Face ID API endpoints."""

    def setUp(self):
        super().setUp()
        self.enable_url = reverse('biometric_enable')
        self.disable_url = reverse('biometric_disable')
        self.status_url = reverse('biometric_status')
        self.login_url = reverse('biometric_login')
        
        # Create a tiny 1x1 PNG image to pass DRF's ImageField validation
        tiny_png_b64 = b"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        tiny_png_bytes = base64.b64decode(tiny_png_b64)
        
        self.test_image = SimpleUploadedFile(
            "test_face.png",
            tiny_png_bytes,
            content_type="image/png"
        )
        
        # Test encoding
        self.test_encoding = [0.1] * 128

    def test_enable_biometric_requires_auth(self):
        """Enable endpoint should require authentication."""
        response = self.client.post(self.enable_url, {'face_image': self.test_image})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch('products.views.biometric_views.cv2.imdecode')
    @patch('deepface.DeepFace.represent')
    def test_enable_biometric_success(self, mock_represent, mock_imdecode):
        """Authenticated user can enable biometric with a face image."""
        self.authenticate_customer()
        self.test_image.seek(0)
        
        # Mock DeepFace.represent to return a dummy encoding
        mock_represent.return_value = [{"embedding": self.test_encoding}]
        
        mock_imdecode.return_value = 'dummy_image_array'
        
        response = self.client.post(self.enable_url, {'face_image': self.test_image}, format='multipart')
        
        print("Enable Response:", response.data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertTrue(response.data['biometric_enabled'])
        
        # Verify in database
        self.customer_user.refresh_from_db()
        self.assertTrue(self.customer_user.biometric_enabled)
        self.assertEqual(self.customer_user.face_encoding, self.test_encoding)

    def test_disable_biometric_success(self):
        """Authenticated user can disable biometric."""
        self.authenticate_customer()
        
        # First enable
        self.customer_user.biometric_enabled = True
        self.customer_user.face_encoding = self.test_encoding
        self.customer_user.save()
        
        response = self.client.post(self.disable_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertFalse(response.data['biometric_enabled'])
        
        # Verify in database
        self.customer_user.refresh_from_db()
        self.assertFalse(self.customer_user.biometric_enabled)
        self.assertIsNone(self.customer_user.face_encoding)

    def test_get_biometric_status(self):
        """Can get biometric status for authenticated user."""
        self.authenticate_customer()
        
        response = self.client.get(self.status_url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('biometric_enabled', response.data)
        self.assertIn('has_encoding', response.data)

    @patch('products.views.biometric_views.cv2.imdecode')
    @patch('deepface.modules.verification.find_threshold')
    @patch('deepface.modules.verification.find_distance')
    @patch('deepface.DeepFace.represent')
    def test_biometric_login_success(self, mock_represent, mock_find_distance, mock_find_threshold, mock_imdecode):
        """Valid face login should return tokens."""
        self.test_image.seek(0)
        # Enable biometric for customer
        self.customer_user.biometric_enabled = True
        self.customer_user.face_encoding = self.test_encoding
        self.customer_user.save()
        
        # Mock DeepFace.represent to return the same encoding
        mock_represent.return_value = [{"embedding": self.test_encoding}]
        
        # Mock distance and threshold so distance <= lenient_threshold
        mock_find_distance.return_value = 0.1
        mock_find_threshold.return_value = 0.4
        mock_imdecode.return_value = 'dummy_image_array'
        
        response = self.client.post(self.login_url, {
            'username': self.customer_user.username,
            'face_image': self.test_image
        }, format='multipart')
        
        print("Login Response:", response.data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertIn('refresh', response.data['tokens'])
        self.assertIn('access', response.data['tokens'])
        self.assertIn('user_id', response.data)

    def test_biometric_login_missing_params(self):
        """Login without username or face_image should fail."""
        response = self.client.post(self.login_url, {})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
