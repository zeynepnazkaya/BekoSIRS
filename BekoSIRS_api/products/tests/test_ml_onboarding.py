"""
Onboarding category preference testleri.

Yeni kullanicinin sectigi kategorilerin recommender icin tohum sinyali olarak
saklandigi, etkilesim sayisi belli esige ulasinca bonusun otomatik devre disi
kaldigi ve API endpoint'inin idempotent davrandigi dogrulanir.
"""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from products.ml_recommender import HybridRecommender
from products.models import (
    Category,
    Product,
    ProductOwnership,
    UserCategoryPreference,
    Wishlist,
    WishlistItem,
)

User = get_user_model()


@pytest.fixture(autouse=True)
def clear_ml_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def customer(db):
    return User.objects.create_user(
        username='onboarding-user',
        password='Onboard123!',
        role='customer',
    )


@pytest.fixture
def categories(db):
    return [
        Category.objects.create(name=f'Onboarding Cat {idx}')
        for idx in range(3)
    ]


@pytest.fixture
def products(db, categories):
    """Her kategori icin bir urun yaratir; bonus haritasi bu urunlere yansir."""
    return [
        Product.objects.create(
            name=f'Onboarding Product {idx}',
            brand='Beko',
            category=cat,
            price=Decimal('5000.00'),
            stock=5,
        )
        for idx, cat in enumerate(categories)
    ]


def _build_recommender_for_unit_test():
    return object.__new__(HybridRecommender)


@pytest.mark.django_db
def test_cold_start_user_gets_onboarding_boost(customer, categories, products):
    """Hicbir etkilesimi olmayan kullanici tercih ettigi kategoride bonus almali."""
    target_cat = categories[0]
    target_product = products[0]

    UserCategoryPreference.objects.create(customer=customer, category=target_cat)

    recommender = _build_recommender_for_unit_test()
    boosts = recommender._get_onboarding_preference_boost(customer, user_interactions={})

    assert target_product.id in boosts
    assert boosts[target_product.id] == pytest.approx(recommender.ONBOARDING_BOOST)


@pytest.mark.django_db
def test_active_user_does_not_get_onboarding_boost(customer, categories, products):
    """Etkilesim sayisi esigi gectikten sonra onboarding sinyali kapanmali."""
    target_cat = categories[0]
    UserCategoryPreference.objects.create(customer=customer, category=target_cat)

    # Etkilesim esigini bilincli olarak asiyoruz; recommender bonusu otomatik
    # olarak devre disi birakmali ki davranis sinyali bastirilmasin.
    fake_interactions = {pid: 1.0 for pid in range(1, 20)}

    recommender = _build_recommender_for_unit_test()
    boosts = recommender._get_onboarding_preference_boost(
        customer, user_interactions=fake_interactions,
    )

    assert boosts == {}


@pytest.mark.django_db
def test_no_preferences_returns_empty(customer):
    """Tercih yoksa bonus haritasi bos donmeli."""
    recommender = _build_recommender_for_unit_test()
    boosts = recommender._get_onboarding_preference_boost(customer, user_interactions={})
    assert boosts == {}


@pytest.mark.django_db
def test_endpoint_post_persists_preferences(customer, categories):
    """POST cagrisi tercih listesini idempotent yazmali."""
    client = APIClient()
    client.force_authenticate(user=customer)

    target_ids = [cat.id for cat in categories[:2]]
    response = client.post(
        '/api/v1/recommendations/onboarding/preferences/',
        {'category_ids': target_ids},
        format='json',
    )

    assert response.status_code == 200
    data = response.json()
    assert data['success'] is True
    assert sorted(data['category_ids']) == sorted(target_ids)
    saved = UserCategoryPreference.objects.filter(customer=customer)
    assert saved.count() == len(target_ids)


@pytest.mark.django_db
def test_endpoint_post_replaces_existing_preferences(customer, categories):
    """Yeni POST cagrisi onceki tercihleri ezmeli."""
    UserCategoryPreference.objects.create(customer=customer, category=categories[0])

    client = APIClient()
    client.force_authenticate(user=customer)
    response = client.post(
        '/api/v1/recommendations/onboarding/preferences/',
        {'category_ids': [categories[1].id, categories[2].id]},
        format='json',
    )

    assert response.status_code == 200
    saved_ids = list(UserCategoryPreference.objects.filter(
        customer=customer,
    ).values_list('category_id', flat=True))
    # Eski tercih (categories[0]) silinmis olmali; yeni iki tercih kalmali.
    assert categories[0].id not in saved_ids
    assert sorted(saved_ids) == sorted([categories[1].id, categories[2].id])


@pytest.mark.django_db
def test_endpoint_get_returns_existing_preferences(customer, categories):
    """GET cagrisi mevcut tercihleri detay verisiyle birlikte dondurmeli."""
    UserCategoryPreference.objects.create(customer=customer, category=categories[0])

    client = APIClient()
    client.force_authenticate(user=customer)
    response = client.get('/api/v1/recommendations/onboarding/preferences/')

    assert response.status_code == 200
    payload = response.json()
    assert len(payload['preferences']) == 1
    assert payload['preferences'][0]['category_id'] == categories[0].id
    assert payload['preferences'][0]['category_name'] == categories[0].name


@pytest.mark.django_db
def test_endpoint_delete_clears_preferences(customer, categories):
    """DELETE cagrisi tum tercihleri silmeli."""
    UserCategoryPreference.objects.create(customer=customer, category=categories[0])
    UserCategoryPreference.objects.create(customer=customer, category=categories[1])

    client = APIClient()
    client.force_authenticate(user=customer)
    response = client.delete('/api/v1/recommendations/onboarding/preferences/')

    assert response.status_code == 200
    assert UserCategoryPreference.objects.filter(customer=customer).count() == 0


@pytest.mark.django_db
def test_endpoint_rejects_empty_category_list(customer):
    """Bos liste 400 ile reddedilmeli."""
    client = APIClient()
    client.force_authenticate(user=customer)
    response = client.post(
        '/api/v1/recommendations/onboarding/preferences/',
        {'category_ids': []},
        format='json',
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_endpoint_rejects_more_than_five_categories(customer, db):
    """5'ten fazla kategori 400 vermeli; sinyal cok genislerse zayiflar."""
    cats = [
        Category.objects.create(name=f'Limit Cat {i}')
        for i in range(6)
    ]
    client = APIClient()
    client.force_authenticate(user=customer)
    response = client.post(
        '/api/v1/recommendations/onboarding/preferences/',
        {'category_ids': [c.id for c in cats]},
        format='json',
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_endpoint_rejects_unknown_category_ids(customer):
    """Hicbiri gecerli olmayan id listesi 400 vermeli."""
    client = APIClient()
    client.force_authenticate(user=customer)
    response = client.post(
        '/api/v1/recommendations/onboarding/preferences/',
        {'category_ids': [99999]},
        format='json',
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_active_user_with_real_interactions_loses_boost(customer, categories, products):
    """Gercek etkilesim bilgileri ile etkilesim sayisi esigi gectiginde bonus kapanmali."""
    target_cat = categories[0]
    UserCategoryPreference.objects.create(customer=customer, category=target_cat)

    # 6 farkli urunde gercek etkilesim olusturuyoruz; ONBOARDING_BOOST_MAX
    # esigi 5 oldugu icin bonus iptal olmali.
    today = timezone.now().date()
    extra_cat = Category.objects.create(name='Extra Cat')
    for idx in range(6):
        prod = Product.objects.create(
            name=f'Extra Product {idx}',
            brand='Beko',
            category=extra_cat,
            price=Decimal('1000.00'),
            stock=5,
        )
        ProductOwnership.objects.create(
            customer=customer, product=prod, purchase_date=today,
        )

    recommender = _build_recommender_for_unit_test()
    interactions = recommender._get_user_interactions(customer, ignore_cache=True)
    boosts = recommender._get_onboarding_preference_boost(
        customer, user_interactions=interactions,
    )

    assert boosts == {}
