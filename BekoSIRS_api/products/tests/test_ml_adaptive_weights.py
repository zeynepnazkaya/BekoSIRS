"""
Oneri motorundaki adaptif hibrit agirlik davranisini dogrulayan testler.
"""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from products.ml_recommender import HybridRecommender
from products.models import Category, Product, Recommendation

User = get_user_model()


def _build_recommender_for_unit_test():
    """Singleton yukleme yan etkileri olmadan hafif bir recommender ornegi kurar."""
    recommender = object.__new__(HybridRecommender)
    recommender._last_runtime_weights = {}
    return recommender


def test_cold_start_user_gets_high_popularity_weight():
    """0 etkilesimli kullanicida populerlik agirligi baskin olmali."""
    recommender = _build_recommender_for_unit_test()
    ncf, content, popularity = recommender._get_adaptive_weights({})

    assert ncf == pytest.approx(0.0)
    assert content == pytest.approx(0.2)
    assert popularity >= 0.7


def test_active_user_gets_high_ncf_weight():
    """Yuksek etkilesimli kullanicida NCF agirligi baskin olmali."""
    recommender = _build_recommender_for_unit_test()
    interactions = {product_id: 1.0 for product_id in range(1, 26)}
    ncf, content, popularity = recommender._get_adaptive_weights(interactions)

    assert ncf >= 0.5
    assert content == pytest.approx(0.3)
    assert popularity <= 0.1


@pytest.mark.django_db
def test_recommendation_list_returns_weights_used_for_cold_start():
    """API, frontend skor dokumu icin kullanilan agirliklari dondurmeli."""
    category = Category.objects.create(name='Adaptive Weight Category')
    product = Product.objects.create(
        name='Önerilen Ürün',
        brand='Beko',
        category=category,
        price=Decimal('9999.99'),
        stock=10,
    )
    user = User.objects.create_user(
        username='adaptive-user',
        password='Adaptive123!',
        role='customer',
    )
    Recommendation.objects.create(
        customer=user,
        product=product,
        score=0.91,
        reason='Test önerisi',
    )

    client = APIClient()
    client.force_authenticate(user=user)
    response = client.get('/api/v1/recommendations/')

    # Bu alanlar mobil ekrandaki skor kirilimini besledigi icin API seviyesinde
    # dogruluyoruz; soguk baslangicta NCF sifir, populerlik ise en yuksek olmalidir.
    assert response.status_code == 200
    assert response.data['ml_metrics']['weights_used']['ncf'] == pytest.approx(0.0)
    assert response.data['ml_metrics']['weights_used']['content'] == pytest.approx(0.2)
    assert response.data['ml_metrics']['weights_used']['popularity'] == pytest.approx(0.8)
    assert response.data['ml_metrics']['weights_used']['user_tier'] == 'cold_start'
