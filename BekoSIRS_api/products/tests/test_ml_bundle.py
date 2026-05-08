"""
Bundle co-occurrence testleri.

Bir urunun birlikte sik satin alindigi diger urunler dogru sirayla dondurulmeli;
endpoint mevcut olmayan urun isteginde 404 vermeli ve kullanicinin daha once
satin aldigi urunleri filtrelemeli.
"""

from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from products.ml_recommender import HybridRecommender
from products.models import Category, Product, ProductOwnership

User = get_user_model()


@pytest.fixture
def customer(db):
    return User.objects.create_user(
        username='bundle-user',
        password='Bundle123!',
        role='customer',
    )


@pytest.fixture
def category(db):
    return Category.objects.create(name='Bundle Category')


@pytest.fixture
def products(db, category):
    """Anchor + iki birlikte alinan urun + bir baska urun."""
    anchor = Product.objects.create(
        name='Anchor Refrigerator',
        brand='Beko',
        category=category,
        price=Decimal('20000.00'),
        stock=10,
    )
    cooked_with_a = Product.objects.create(
        name='Frequent Companion A',
        brand='Beko',
        category=category,
        price=Decimal('5000.00'),
        stock=10,
    )
    cooked_with_b = Product.objects.create(
        name='Frequent Companion B',
        brand='Beko',
        category=category,
        price=Decimal('3000.00'),
        stock=10,
    )
    other = Product.objects.create(
        name='Standalone Product',
        brand='Beko',
        category=category,
        price=Decimal('2500.00'),
        stock=10,
    )
    return anchor, cooked_with_a, cooked_with_b, other


def _build_recommender_for_unit_test():
    return object.__new__(HybridRecommender)


@pytest.mark.django_db
def test_co_purchase_orders_by_frequency(db, products):
    """En sik beraber satin alinan urun listenin basinda olmali."""
    anchor, comp_a, comp_b, _other = products

    # Iki musteri ayni demir koc + companion A'yi alirsa bu cifte daha guclu sinyal
    # vermeliyiz; bir musteri demir koc + companion B alir.
    buyer_1 = User.objects.create_user(username='buyer-1', password='X!', role='customer')
    buyer_2 = User.objects.create_user(username='buyer-2', password='X!', role='customer')
    buyer_3 = User.objects.create_user(username='buyer-3', password='X!', role='customer')

    today = timezone.now().date()
    for buyer in (buyer_1, buyer_2, buyer_3):
        ProductOwnership.objects.create(customer=buyer, product=anchor, purchase_date=today)

    # 3 musteri companion A aldi.
    for buyer in (buyer_1, buyer_2, buyer_3):
        ProductOwnership.objects.create(customer=buyer, product=comp_a, purchase_date=today)
    # Sadece 1 musteri companion B aldi.
    ProductOwnership.objects.create(customer=buyer_1, product=comp_b, purchase_date=today)

    recommender = _build_recommender_for_unit_test()
    bundle = recommender.get_co_purchase_products(anchor.id, top_n=5)

    # Companion A en yuksek frequencyle ilk sirada olmali.
    assert bundle, 'bundle should not be empty'
    assert bundle[0]['product_id'] == comp_a.id
    assert bundle[0]['co_purchase_count'] >= bundle[-1]['co_purchase_count']


@pytest.mark.django_db
def test_co_purchase_excludes_anchor_itself(db, products):
    """Anchor urunu kendi bundle'inda dondurulmemeli."""
    anchor, comp_a, _comp_b, _other = products

    buyer = User.objects.create_user(username='solo-buyer', password='X!', role='customer')
    today = timezone.now().date()
    ProductOwnership.objects.create(customer=buyer, product=anchor, purchase_date=today)
    ProductOwnership.objects.create(customer=buyer, product=comp_a, purchase_date=today)

    recommender = _build_recommender_for_unit_test()
    bundle = recommender.get_co_purchase_products(anchor.id, top_n=5)

    pids = [item['product_id'] for item in bundle]
    assert anchor.id not in pids


@pytest.mark.django_db
def test_co_purchase_empty_when_no_buyers(db, products):
    """Hic alici yoksa bundle bos liste donmeli."""
    anchor = products[0]
    recommender = _build_recommender_for_unit_test()
    bundle = recommender.get_co_purchase_products(anchor.id, top_n=5)
    assert bundle == []


@pytest.mark.django_db
def test_bundle_endpoint_returns_404_for_unknown_product(customer):
    """Bilinmeyen urun id'si icin endpoint 404 vermeli."""
    client = APIClient()
    client.force_authenticate(user=customer)
    response = client.get('/api/v1/recommendations/bundle/99999/')
    assert response.status_code == 404


@pytest.mark.django_db
def test_bundle_endpoint_returns_co_purchase_data(customer, products):
    """Endpoint dogru urun listesini hydrate edip dondurmeli."""
    anchor, comp_a, comp_b, _other = products

    buyer = User.objects.create_user(username='endpoint-buyer', password='X!', role='customer')
    today = timezone.now().date()
    ProductOwnership.objects.create(customer=buyer, product=anchor, purchase_date=today)
    ProductOwnership.objects.create(customer=buyer, product=comp_a, purchase_date=today)
    ProductOwnership.objects.create(customer=buyer, product=comp_b, purchase_date=today)

    client = APIClient()
    client.force_authenticate(user=customer)
    response = client.get(f'/api/v1/recommendations/bundle/{anchor.id}/')

    assert response.status_code == 200
    data = response.json()
    assert data['product_id'] == anchor.id
    bundle_pids = {item['product_id'] for item in data['bundles']}
    assert comp_a.id in bundle_pids
    assert comp_b.id in bundle_pids
    # Anchor kendi bundle'ina karismamali; bunu uctan uca dogruluyoruz.
    assert anchor.id not in bundle_pids


@pytest.mark.django_db
def test_bundle_endpoint_filters_already_owned(customer, products):
    """Kullanicinin sahip oldugu urun bundle'da gozukmemeli."""
    anchor, comp_a, comp_b, _other = products

    today = timezone.now().date()
    # Baska bir alici co-purchase sinyalini uretir.
    other_buyer = User.objects.create_user(username='other-buyer', password='X!', role='customer')
    ProductOwnership.objects.create(customer=other_buyer, product=anchor, purchase_date=today)
    ProductOwnership.objects.create(customer=other_buyer, product=comp_a, purchase_date=today)
    ProductOwnership.objects.create(customer=other_buyer, product=comp_b, purchase_date=today)

    # Bizim kullanici companion A'ya zaten sahip; tekrar onerilmemeli.
    ProductOwnership.objects.create(customer=customer, product=comp_a, purchase_date=today)

    client = APIClient()
    client.force_authenticate(user=customer)
    response = client.get(f'/api/v1/recommendations/bundle/{anchor.id}/')
    assert response.status_code == 200
    bundle_pids = {item['product_id'] for item in response.json()['bundles']}
    assert comp_a.id not in bundle_pids
    assert comp_b.id in bundle_pids
