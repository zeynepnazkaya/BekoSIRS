"""
Implicit negative sampling testleri.

Goruntulendi ama wishlist veya satin almaya donmemis urunler icin recommender
zayif bir negatif sinyal uygular. Bu testler hem cezanin uygulandigini hem de
pozitif aksiyona donen urunlerin korundugunu dogrular.
"""

from datetime import timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone

from products.ml_recommender import HybridRecommender
from products.models import (
    Category,
    Product,
    ProductOwnership,
    ViewHistory,
    Wishlist,
    WishlistItem,
)

User = get_user_model()


@pytest.fixture(autouse=True)
def clear_ml_cache():
    """Her testin sifirdan etkilesim kosmasini saglamak icin cache temizlenir."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def customer(db):
    return User.objects.create_user(
        username='neg-user',
        password='Neg123!',
        role='customer',
    )


@pytest.fixture
def category(db):
    return Category.objects.create(name='Implicit Negative Category')


@pytest.fixture
def products(db, category):
    """Iki urun: birine bakildi ve gecildi, digeri pozitif aksiyona dondu."""
    ignored_product = Product.objects.create(
        name='Ignored Refrigerator',
        brand='Beko',
        category=category,
        price=Decimal('15000.00'),
        stock=5,
    )
    positive_product = Product.objects.create(
        name='Loved Washing Machine',
        brand='Beko',
        category=category,
        price=Decimal('14000.00'),
        stock=5,
    )
    return ignored_product, positive_product


def _build_recommender_for_unit_test():
    """Singleton yan etkilerini tetiklemeden hafif bir recommender ornegi kurar."""
    return object.__new__(HybridRecommender)


@pytest.mark.django_db
def test_viewed_only_product_gets_negative_signal(customer, products):
    """Yalnizca goruntulenen ve eyleme donmeyen urun negatif sinyal almali."""
    ignored_product, _ = products
    ViewHistory.objects.create(
        customer=customer,
        product=ignored_product,
        view_count=3,
    )

    recommender = _build_recommender_for_unit_test()
    signals = recommender._get_implicit_negative_signals(customer)

    assert ignored_product.id in signals
    # Sinyal acikca negatif olmali; dogru kaynagi gelistiren ekiplerin teste
    # bakarak isaretin yonunu hizla teyit edebilmesi onemli.
    assert signals[ignored_product.id] < 0


@pytest.mark.django_db
def test_purchased_product_excluded_from_negative_signal(customer, products):
    """Satin alinan urun goruntulense bile negatif sinyalden muaf olmali."""
    _, positive_product = products
    ViewHistory.objects.create(
        customer=customer,
        product=positive_product,
        view_count=2,
    )
    ProductOwnership.objects.create(
        customer=customer,
        product=positive_product,
        purchase_date=timezone.now().date(),
    )

    recommender = _build_recommender_for_unit_test()
    signals = recommender._get_implicit_negative_signals(customer)

    assert positive_product.id not in signals


@pytest.mark.django_db
def test_wishlisted_product_excluded_from_negative_signal(customer, products):
    """Wishlist'e eklenen urun negatif sinyal listesine girmemeli."""
    _, positive_product = products
    ViewHistory.objects.create(
        customer=customer,
        product=positive_product,
        view_count=4,
    )

    wishlist = Wishlist.objects.create(customer=customer)
    WishlistItem.objects.create(wishlist=wishlist, product=positive_product)

    recommender = _build_recommender_for_unit_test()
    signals = recommender._get_implicit_negative_signals(customer)

    assert positive_product.id not in signals


@pytest.mark.django_db
def test_old_view_outside_lookback_window_ignored(customer, products):
    """Cok eski goruntuleme negatif sinyal penceresine girmemeli."""
    ignored_product, _ = products
    view = ViewHistory.objects.create(
        customer=customer,
        product=ignored_product,
        view_count=1,
    )
    # Pencere disindaki bir gorum penceresel testin sinirini yoklar.
    ViewHistory.objects.filter(pk=view.pk).update(
        viewed_at=timezone.now() - timedelta(days=120),
    )

    recommender = _build_recommender_for_unit_test()
    signals = recommender._get_implicit_negative_signals(customer)

    assert ignored_product.id not in signals
