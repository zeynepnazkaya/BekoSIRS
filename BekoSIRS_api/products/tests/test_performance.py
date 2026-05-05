"""
Kritik endpoint ve model islemleri icin temel performans esikleri.
"""

import time
from decimal import Decimal

from django.core.cache import cache
from rest_framework.test import APIClient

from products.conftest import APITestCase
from products.ml_recommender import HybridRecommender, get_recommender
from products.models import CustomUser, Product


class PerformanceTestCase(APITestCase):
    """SQLite tabanli test ortaminda kabul edilebilir sure esiklerini dogrular."""

    def setUp(self):
        super().setUp()
        cache.clear()
        recommender = get_recommender()
        if hasattr(recommender, "_last_runtime_weights"):
            recommender._last_runtime_weights.clear()

    # NOT: Bu test SQLite uzerinde calisor. Supabase PostgreSQL uretim ortaminda
    # ag gecikmesi ve baglanti havuzu nedeniyle sureler farkli olabilir.
    # Uretim performansi ayri olarak izlenmeli (Sentry ile).
    def test_recommendation_api_responds_under_five_hundred_ms(self):
        warm_recommender = get_recommender()
        if hasattr(warm_recommender, "_last_runtime_weights"):
            warm_recommender._last_runtime_weights.pop(self.customer_user.id, None)

        client = APIClient()
        client.force_authenticate(user=self.customer_user)

        start_time = time.time()
        response = client.get("/api/v1/recommendations/")
        duration = time.time() - start_time

        self.assertEqual(response.status_code, 200, response.data)
        self.assertGreater(len(response.data["recommendations"]), 0)
        self.assertLess(duration, 0.5)

    # NOT: Bu test SQLite uzerinde calisor. Supabase PostgreSQL uretim ortaminda
    # ag gecikmesi ve baglanti havuzu nedeniyle sureler farkli olabilir.
    # Uretim performansi ayri olarak izlenmeli (Sentry ile).
    def test_hybrid_recommender_initializes_under_three_seconds(self):
        HybridRecommender._instance = None

        start_time = time.time()
        recommender = HybridRecommender()
        duration = time.time() - start_time

        self.assertIsNotNone(recommender)
        self.assertLess(duration, 3.0)

    # NOT: Bu test SQLite uzerinde calisor. Supabase PostgreSQL uretim ortaminda
    # ag gecikmesi ve baglanti havuzu nedeniyle sureler farkli olabilir.
    # Uretim performansi ayri olarak izlenmeli (Sentry ile).
    def test_product_list_with_fifty_items_responds_under_two_hundred_ms(self):
        additional_products = [
            Product(
                name=f"Performans Urunu {index}",
                brand="Beko",
                category=self.category_appliances,
                description="Performans listeleme testi",
                price=Decimal("1500.00") + Decimal(index),
                stock=10 + index,
                warranty_duration_months=24,
            )
            for index in range(47)
        ]
        Product.objects.bulk_create(additional_products)

        client = APIClient()

        start_time = time.time()
        response = client.get("/api/v1/products/")
        duration = time.time() - start_time

        self.assertEqual(response.status_code, 200, response.data)
        # Liste endpoint'i pagination aciksa toplam urun sayisi `count`,
        # kapaliysa dogrudan liste uzunlugu ile gelir. Iki sekli de kabul ediyoruz.
        if isinstance(response.data, dict) and "results" in response.data:
            self.assertGreaterEqual(response.data["count"], 50)
            self.assertGreaterEqual(len(response.data["results"]), 1)
        else:
            self.assertGreaterEqual(len(response.data), 50)
        self.assertLess(duration, 0.2)

    # NOT: Bu test SQLite uzerinde calisor. Supabase PostgreSQL uretim ortaminda
    # ag gecikmesi ve baglanti havuzu nedeniyle sureler farkli olabilir.
    # Uretim performansi ayri olarak izlenmeli (Sentry ile).
    def test_ten_users_receive_recommendations_under_five_seconds_total(self):
        extra_products = [
            Product(
                name=f"Toplu Oneri Urunu {index}",
                brand="Grundig",
                category=self.category_electronics,
                description="Toplu performans testi urunu",
                price=Decimal("3000.00") + Decimal(index),
                stock=5 + index,
                warranty_duration_months=24,
            )
            for index in range(10)
        ]
        Product.objects.bulk_create(extra_products)

        users = [
            CustomUser.objects.create_user(
                username=f"perf_customer_{index}",
                password="Perf123!",
                email=f"perf_customer_{index}@test.com",
                role="customer",
            )
            for index in range(10)
        ]

        get_recommender()
        start_time = time.time()

        for user in users:
            client = APIClient()
            client.force_authenticate(user=user)
            response = client.get("/api/v1/recommendations/")
            self.assertEqual(response.status_code, 200, response.data)
            self.assertGreater(len(response.data["recommendations"]), 0)

        total_duration = time.time() - start_time
        self.assertLess(total_duration, 5.0)
