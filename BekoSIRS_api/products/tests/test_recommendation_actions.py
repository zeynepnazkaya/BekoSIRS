"""
API tests for recommendation feedback actions.
"""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from products.models import Category, Product, Recommendation

User = get_user_model()


@pytest.fixture
def recommendation_action_setup(db):
    """Create a user and recommendation record used by dismiss action tests."""
    category = Category.objects.create(name='Action Category')
    product = Product.objects.create(
        name='Aksiyon Ürünü',
        brand='Beko',
        category=category,
        price=Decimal('7000.00'),
        stock=9,
    )
    user = User.objects.create_user(
        username='action-user',
        password='Action123!',
        role='customer',
    )
    recommendation = Recommendation.objects.create(
        customer=user,
        product=product,
        score=0.71,
        reason='Aksiyon testi',
    )
    return user, recommendation


@pytest.mark.django_db
def test_patch_dismiss_marks_recommendation_dismissed(recommendation_action_setup):
    """PATCH dismiss endpoint should mark the recommendation dismissed for new clients."""
    user, recommendation = recommendation_action_setup
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.patch(f'/api/v1/recommendations/{recommendation.id}/dismiss/')
    recommendation.refresh_from_db()

    assert response.status_code == 200
    assert response.data['status'] == 'dismissed'
    assert recommendation.dismissed is True


@pytest.mark.django_db
def test_post_dismiss_remains_backward_compatible(recommendation_action_setup):
    """Legacy POST dismiss endpoint should keep working during the mobile transition."""
    user, recommendation = recommendation_action_setup
    client = APIClient()
    client.force_authenticate(user=user)

    response = client.post(f'/api/v1/recommendations/{recommendation.id}/dismiss/')
    recommendation.refresh_from_db()

    assert response.status_code == 200
    assert response.data['success'] is True
    assert recommendation.dismissed is True
