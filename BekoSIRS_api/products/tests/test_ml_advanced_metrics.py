"""
Calisma anindaki oneri listesi metriklerini dogrulayan testler.
"""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from products.ml_recommender import HybridRecommender
from products.models import Category, Product, Recommendation

User = get_user_model()


def _build_recommender_for_metrics_unit_test():
    """Singleton yan etkilerini tetiklemeden metrik helper'ini test eder."""
    recommender = object.__new__(HybridRecommender)
    recommender._last_runtime_weights = {}
    return recommender


def test_advanced_metrics_capture_diversity_coverage_and_price_variance():
    """Liste metrikleri cesitlilik, kapsama ve fiyat yayilimini ozetlemeli."""
    recommender = _build_recommender_for_metrics_unit_test()
    metrics = recommender.get_advanced_metrics(
        [
            {
                'product_id': 1,
                'score': 0.9,
                'product': {
                    'id': 1,
                    'price': '100.00',
                    'category_name': 'Kitchen',
                },
            },
            {
                'product_id': 2,
                'score': 0.6,
                'product': {
                    'id': 2,
                    'price': '200.00',
                    'category_name': 'Laundry',
                },
            },
        ],
        all_products_count=4,
    )

    # 2 urun 2 ayri kategoriden geldigi icin cesitlilik 2/2 = 1.0 olmalidir.
    assert metrics['diversity_score'] == pytest.approx(1.0)
    assert metrics['catalog_coverage'] == pytest.approx(0.5)
    assert metrics['avg_recommendation_score'] == pytest.approx(0.75)
    assert metrics['price_variance_in_list'] == pytest.approx(2500.0)


@pytest.mark.django_db
def test_recommendation_api_returns_advanced_runtime_metrics():
    """Oneri API'si, frontend icin liste seviyesi metrikleri dondurmeli."""
    category_a = Category.objects.create(name='Kitchen')
    category_b = Category.objects.create(name='Laundry')
    user = User.objects.create_user(
        username='metrics-user',
        password='Metrics123!',
        role='customer',
    )

    created_products = []
    for index in range(10):
        category = category_a if index < 5 else category_b
        product = Product.objects.create(
            name=f'Metric Product {index + 1}',
            brand='Beko',
            category=category,
            price=Decimal(f'{1000 + (index * 100)}.00'),
            stock=10,
        )
        Recommendation.objects.create(
            customer=user,
            product=product,
            score=1 - (index * 0.05),
            reason='Metric coverage seed',
        )
        created_products.append(product)

    client = APIClient()
    client.force_authenticate(user=user)
    response = client.get('/api/v1/recommendations/')

    # 10 urunluk cevap 10 urunluk katalogtan geldigi icin kapsama 1.0 beklenir.
    # Iki kategori 10 urune dagildigi icin cesitlilik 2/10 = 0.2 olur.
    assert response.status_code == 200
    assert len(response.data['recommendations']) == 10
    assert response.data['ml_metrics']['catalog_coverage'] == pytest.approx(1.0)
    assert response.data['ml_metrics']['diversity_score'] == pytest.approx(0.2)
    assert response.data['ml_metrics']['avg_recommendation_score'] > 0
    assert response.data['ml_metrics']['price_variance_in_list'] > 0
