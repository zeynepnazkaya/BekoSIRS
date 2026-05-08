"""
Time-of-day affinity bonus testleri.

Kullanicinin gun icindeki gezinti aliskanligini yakaladigini ve recommender'in
saatlik kategori sinyalini kucuk bir bonusa cevirdigini dogrular.
"""

from datetime import datetime, timezone as dt_timezone
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache

from products.ml_recommender import HybridRecommender
from products.models import Category, Product, ViewHistory

User = get_user_model()


@pytest.fixture(autouse=True)
def clear_ml_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def customer(db):
    return User.objects.create_user(
        username='time-user',
        password='Time123!',
        role='customer',
    )


@pytest.fixture
def categories(db):
    """Sabah ve aksam aliskanliklarini ayri kategoriler uzerinden test etmek icin
    iki bagimsiz kategori kuruyoruz."""
    morning_cat = Category.objects.create(name='Morning Browse Category')
    evening_cat = Category.objects.create(name='Evening Browse Category')
    return morning_cat, evening_cat


@pytest.fixture
def products(db, categories):
    morning_cat, evening_cat = categories
    morning_product = Product.objects.create(
        name='Morning Coffee Maker',
        brand='Beko',
        category=morning_cat,
        price=Decimal('3000.00'),
        stock=10,
    )
    evening_product = Product.objects.create(
        name='Evening Smart TV',
        brand='Beko',
        category=evening_cat,
        price=Decimal('25000.00'),
        stock=4,
    )
    return morning_product, evening_product


def _build_recommender_for_unit_test():
    return object.__new__(HybridRecommender)


def test_hour_bucket_classification():
    """Hour bucket yardimcisi gunu dort dilimde dogru parcalamali."""
    bucket = HybridRecommender._hour_bucket
    # Sinir saatleri kasitli olarak test ediliyor cunku off-by-one'a yatkin alanlar.
    assert bucket(8) == 'morning'
    assert bucket(13) == 'afternoon'
    assert bucket(20) == 'evening'
    assert bucket(2) == 'night'
    assert bucket(5) == 'night'  # 5 sinir oncesi gece kovasinda kalir


@pytest.mark.django_db
def test_morning_view_boosts_morning_category_only_in_morning(customer, products):
    """Sabah goruntulenen kategori, ogleden sonra cagrilirken bonus almamali."""
    morning_product, _ = products
    view = ViewHistory.objects.create(
        customer=customer,
        product=morning_product,
        view_count=5,
    )
    # Sabah saatine sabit bir zaman koyarak takvim tabanli kayisi izole ediyoruz.
    morning_time = datetime(2026, 5, 8, 9, 0, tzinfo=dt_timezone.utc)
    ViewHistory.objects.filter(pk=view.pk).update(viewed_at=morning_time)

    recommender = _build_recommender_for_unit_test()

    # Ogleden sonra cagrildiginda bu kategori bonus listesine girmemeli.
    afternoon_now = datetime(2026, 5, 8, 14, 0, tzinfo=dt_timezone.utc)
    afternoon_boosts = recommender._get_time_affinity_boost(customer, now=afternoon_now)
    assert morning_product.id not in afternoon_boosts


@pytest.mark.django_db
def test_morning_view_boosts_morning_category_in_morning(customer, products):
    """Sabah goruntulenen kategori, sabah cagrilirken bonus almali."""
    morning_product, _ = products
    view = ViewHistory.objects.create(
        customer=customer,
        product=morning_product,
        view_count=5,
    )
    morning_time = datetime(2026, 5, 8, 9, 0, tzinfo=dt_timezone.utc)
    ViewHistory.objects.filter(pk=view.pk).update(viewed_at=morning_time)

    recommender = _build_recommender_for_unit_test()
    morning_now = datetime(2026, 5, 8, 10, 0, tzinfo=dt_timezone.utc)
    boosts = recommender._get_time_affinity_boost(customer, now=morning_now)

    assert morning_product.id in boosts
    assert boosts[morning_product.id] == pytest.approx(
        recommender.TIME_AFFINITY_BOOST,
    )


@pytest.mark.django_db
def test_no_history_returns_empty(customer, products):
    """Hicbir gecmis yoksa bonus haritasi bos donmeli."""
    recommender = _build_recommender_for_unit_test()
    now = datetime(2026, 5, 8, 10, 0, tzinfo=dt_timezone.utc)
    boosts = recommender._get_time_affinity_boost(customer, now=now)
    assert boosts == {}
