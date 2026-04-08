"""
Hybrid recommender icindeki yeni urun kesif bonusunu dogrulayan testler.
"""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from products.ml_recommender import HybridRecommender
from products.models import Category, Product


def _build_recommender_for_unit_test():
    """Yalnizca helper davranisini test etmek icin hafif recommender kurar."""
    return object.__new__(HybridRecommender)


@pytest.mark.django_db
def test_new_product_gets_boost():
    """Son 7 gun icinde eklenen urun en yuksek bonusu almali."""
    category = Category.objects.create(name='Yeni Ürün Kategorisi')
    new_product = Product.objects.create(
        name='Yeni Model Buzdolabı',
        brand='Beko',
        category=category,
        price=Decimal('21000.00'),
        stock=8,
    )
    # 3 gunluk urun ilk kovaya girer ve 0.4 bonus almali.
    Product.objects.filter(pk=new_product.pk).update(
        created_at=timezone.now() - timedelta(days=3)
    )

    recommender = _build_recommender_for_unit_test()
    boosts = recommender._get_new_product_boost()

    assert boosts[new_product.id] == pytest.approx(0.4)


@pytest.mark.django_db
def test_old_product_no_boost():
    """30 gunu gecen urun kesif bonusu almamali."""
    category = Category.objects.create(name='Eski Ürün Kategorisi')
    old_product = Product.objects.create(
        name='Eski Model Süpürge',
        brand='Beko',
        category=category,
        price=Decimal('8000.00'),
        stock=4,
    )
    # 31 gunluk urun maksimum kesif penceresinin disinda kaldigi icin listeye girmez.
    Product.objects.filter(pk=old_product.pk).update(
        created_at=timezone.now() - timedelta(days=31)
    )

    recommender = _build_recommender_for_unit_test()
    boosts = recommender._get_new_product_boost()

    assert old_product.id not in boosts
