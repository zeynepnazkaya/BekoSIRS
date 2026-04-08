"""
Tiklama ve dismiss sinyallerinin geri besleme etkisini dogrulayan testler.
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
    """recommend() cagrisi icerik odakli senaryolarda calissin diye minimal NCF stub'i."""

    is_trained = False


def _build_content_stub(products):
    """Benzerlik matrisi sabit bir icerik stub'i kurarak testi deterministik yapar."""
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
    """Sadece gerekli helper'lari olan hafif ve deterministik recommender kurar."""
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
    """Tiklanan oneri, sonraki cagrida benzer urun icin pozitif sinyal olusturmali."""
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

    # Ilk cagrida hic davranis sinyali yoktur; bu nedenle benzer urun cikmamasi beklenir.
    baseline = recommender.recommend(
        user,
        top_n=5,
        ignore_cache=True,
        exclude_ids={seed_product.id},
    )

    # Tiklanan onceki kart gelecekteki onerilere pozitif geri besleme olarak yazilir.
    Recommendation.objects.create(
        customer=user,
        product=seed_product,
        score=0.75,
        reason='Önceki öneri',
        clicked=True,
    )

    # Ayni cagrinin ikinci kosusunda tiklama sinyali benzer adayi one cikarmalidir.
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
    """Dismiss edilen urun adaylar arasinda olsa bile son listede gorunmemeli."""
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

    # Dismiss sert exclude olarak yorumlandigi icin skor alsa bile nihai listede kalamaz.
    results = recommender.recommend(
        user,
        top_n=5,
        ignore_cache=True,
        exclude_ids={seed_product.id},
    )

    assert results == []
