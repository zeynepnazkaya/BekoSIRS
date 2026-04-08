"""
Feedback loop tests for clicked and dismissed recommendation signals.
"""

from decimal import Decimal

import numpy as np
import pandas as pd
import pytest
from django.contrib.auth import get_user_model

from products.ml_recommender import ContentBasedModel, HybridRecommender
from products.models import Category, Product, Recommendation

User = get_user_model()


class _NCFStub:
    """Minimal NCF stub so recommend() can run content-only unit scenarios."""

    is_trained = False


def _build_content_stub(products):
    """Create a deterministic content model stub with strong cross-similarity."""
    content = object.__new__(ContentBasedModel)
    content.is_trained = True
    content.products_df = pd.DataFrame(
        [
            {'id': product.id, 'price': float(product.price), 'content': product.name}
            for product in products
        ]
    )
    content.indices = pd.Series(
        data=list(range(len(products))),
        index=[product.id for product in products],
    )
    content.similarity_matrix = np.array(
        [
            [1.0, 0.85],
            [0.85, 1.0],
        ]
    )
    return content


def _build_recommender(content):
    """Create a lightweight recommender configured for deterministic unit tests."""
    recommender = object.__new__(HybridRecommender)
    recommender.content = content
    recommender.ncf = _NCFStub()
    recommender._last_runtime_weights = {}
    recommender._get_popularity_scores = lambda: {}
    recommender._get_search_boosts = lambda user: {}
    recommender._get_price_sensitivity_boosts = lambda user: {}
    recommender._get_new_product_boost = lambda: {}
    recommender._get_owned_product_ids = lambda user: set()
    return recommender


@pytest.mark.django_db
def test_clicked_recommendation_boosts_future_score():
    """Tıklanan öneri, sonraki recommendation çağrısında benzer ürün üretmeli."""
    category = Category.objects.create(name='Feedback Category')
    seed_product = Product.objects.create(
        name='Kaynak Ürün',
        brand='Beko',
        category=category,
        price=Decimal('10000.00'),
        stock=6,
    )
    candidate_product = Product.objects.create(
        name='Benzer Ürün',
        brand='Beko',
        category=category,
        price=Decimal('10500.00'),
        stock=6,
    )
    user = User.objects.create_user(
        username='feedback-user',
        password='Feedback123!',
        role='customer',
    )

    recommender = _build_recommender(_build_content_stub([seed_product, candidate_product]))

    baseline = recommender.recommend(
        user,
        top_n=5,
        ignore_cache=True,
        exclude_ids={seed_product.id},
    )

    Recommendation.objects.create(
        customer=user,
        product=seed_product,
        score=0.75,
        reason='Önceki öneri',
        clicked=True,
    )

    boosted = recommender.recommend(
        user,
        top_n=5,
        ignore_cache=True,
        exclude_ids={seed_product.id},
    )

    assert baseline == []
    assert boosted
    assert boosted[0]['product_id'] == candidate_product.id
    assert boosted[0]['score'] > 0


@pytest.mark.django_db
def test_dismissed_product_excluded_from_recommendations():
    """Dismissed ürün recommendation adayları arasında olsa bile sonuçta görünmemeli."""
    category = Category.objects.create(name='Dismiss Category')
    seed_product = Product.objects.create(
        name='İlgi Ürünü',
        brand='Beko',
        category=category,
        price=Decimal('9000.00'),
        stock=5,
    )
    dismissed_product = Product.objects.create(
        name='Gösterme Ürünü',
        brand='Beko',
        category=category,
        price=Decimal('9200.00'),
        stock=5,
    )
    user = User.objects.create_user(
        username='dismiss-user',
        password='Dismiss123!',
        role='customer',
    )

    recommender = _build_recommender(_build_content_stub([seed_product, dismissed_product]))
    recommender._get_user_interactions = lambda user, ignore_cache=False: {seed_product.id: 2.0}

    Recommendation.objects.create(
        customer=user,
        product=dismissed_product,
        score=0.61,
        reason='Eski öneri',
        dismissed=True,
    )

    results = recommender.recommend(
        user,
        top_n=5,
        ignore_cache=True,
        exclude_ids={seed_product.id},
    )

    assert results == []
