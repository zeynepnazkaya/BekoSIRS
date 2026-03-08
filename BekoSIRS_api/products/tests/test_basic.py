import pytest
from django.contrib.auth import get_user_model

@pytest.mark.django_db
def test_user_creation():
    User = get_user_model()
    user = User.objects.create_user(username='testuser', password='password123', role='customer')
    assert user.username == 'testuser'
    assert user.role == 'customer'
    assert user.check_password('password123')
