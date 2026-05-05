"""
Gercek kullanici yolculuklarini bastan sona dogrulayan sistem testleri.
"""

from datetime import date
from decimal import Decimal

from django.core.cache import cache
from rest_framework.test import APIClient

from products.conftest import APITestCase
from products.ml_recommender import get_recommender
from products.models import CustomUser, Product, ProductOwnership, Recommendation, ViewHistory


class SystemJourneyTestCase(APITestCase):
    """Musteri ve admin yolculuklarini is kurali sirasi ile test eder."""

    def setUp(self):
        super().setUp()
        cache.clear()
        recommender = get_recommender()
        if hasattr(recommender, "_last_runtime_weights"):
            recommender._last_runtime_weights.clear()

        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff"])

    def _login_client(self, username, password, platform):
        """Gercek JWT token endpoint'i ile kimlik dogrulanmis istemci dondurur."""
        token_client = APIClient()
        token_response = token_client.post(
            "/api/v1/token/",
            {
                "username": username,
                "password": password,
                "platform": platform,
            },
            format="json",
        )
        self.assertEqual(token_response.status_code, 200, token_response.data)

        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_response.data['access']}")
        return client, token_response.data

    def _register_customer(self, username, email):
        """Sistem testlerinde bagimsiz musteri olusturmak icin register endpoint'ini kullanir."""
        response = self.client.post(
            "/api/v1/register/",
            {
                "username": username,
                "password": "Journey123!",
                "email": email,
                "first_name": "Sistem",
                "last_name": "Musteri",
                "role": "customer",
                "phone_number": "",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        return CustomUser.objects.get(username=username)

    # Bu senaryo yeni bir musterinin kayit olup mobil token alabildigini test eder;
    # kayit ve login kirilirse uygulamanin ilk kullanim deneyimi tamamen durur.
    def test_new_customer_can_register_and_login_on_mobile(self):
        self._register_customer("system_customer_login", "system_customer_login@test.com")

        token_response = self.client.post(
            "/api/v1/token/",
            {
                "username": "system_customer_login",
                "password": "Journey123!",
                "platform": "mobile",
            },
            format="json",
        )
        self.assertEqual(token_response.status_code, 200, token_response.data)
        self.assertIn("access", token_response.data)
        self.assertIn("refresh", token_response.data)

        registered_user = CustomUser.objects.get(username="system_customer_login")
        self.assertEqual(registered_user.role, "customer")
        self.assertTrue(registered_user.check_password("Journey123!"))

    # Bu senaryo hic etkilesimi olmayan yeni musteride cold-start mantiginin
    # populerlige agirlik verdigini test eder; bu kural yeni kullanicilar icin kritik.
    def test_new_customer_receives_cold_start_recommendations(self):
        user = self._register_customer(
            "system_customer_cold", "system_customer_cold@test.com"
        )
        customer_client, _ = self._login_client(user.username, "Journey123!", "mobile")

        recommendation_response = customer_client.get("/api/v1/recommendations/")
        self.assertEqual(recommendation_response.status_code, 200, recommendation_response.data)
        self.assertGreater(len(recommendation_response.data["recommendations"]), 0)

        weights = recommendation_response.data["ml_metrics"]["weights_used"]
        self.assertEqual(weights["user_tier"], "cold_start")
        self.assertEqual(weights["ncf"], 0.0)
        self.assertEqual(weights["content"], 0.2)
        self.assertEqual(weights["popularity"], 0.8)

        self.assertTrue(Recommendation.objects.filter(customer=user).exists())

    # Bu senaryo musteri urunlere goz attiginda ViewHistory kaydinin endpoint
    # uzerinden olustugunu test eder; oneri motoru bu veriye dayandigi icin onemlidir.
    def test_browsing_products_records_view_history(self):
        customer_client, _ = self._login_client(
            self.customer_user.username,
            "CustomerPass123!",
            "mobile",
        )

        list_response = customer_client.get("/api/v1/products/")
        self.assertEqual(list_response.status_code, 200, list_response.data)

        detail_response = customer_client.get(f"/api/v1/products/{self.product_washer.id}/")
        self.assertEqual(detail_response.status_code, 200, detail_response.data)

        record_response = customer_client.post(
            "/api/v1/view-history/record/",
            {"product_id": self.product_washer.id},
            format="json",
        )
        self.assertEqual(record_response.status_code, 200, record_response.data)
        self.assertEqual(record_response.data["view_count"], 1)

        view_entry = ViewHistory.objects.get(
            customer=self.customer_user,
            product=self.product_washer,
        )
        self.assertEqual(view_entry.view_count, 1)

    # Bu senaryo once anlamli etkilesim biriktirip sonra satin alma ekleyerek
    # kullanicinin balanced seviyesine gecmesini test eder; NCF agirliginin artmasi
    # ML tarafindaki asamali kisilestirme kuralini dogrular.
    def test_customer_moves_from_light_to_balanced_after_enough_interactions_and_purchase(self):
        user = self._register_customer(
            "system_customer_balanced", "system_customer_balanced@test.com"
        )
        customer_client, _ = self._login_client(user.username, "Journey123!", "mobile")
        admin_client, _ = self._login_client(
            self.admin_user.username,
            "AdminPass123!",
            "web",
        )

        extra_product_one = Product.objects.create(
            name="Ek Urun Bir",
            brand="Beko",
            category=self.category_appliances,
            description="Sistem testi icin ek urun",
            price=Decimal("7499.99"),
            stock=8,
            warranty_duration_months=24,
        )
        extra_product_two = Product.objects.create(
            name="Ek Urun Iki",
            brand="Grundig",
            category=self.category_electronics,
            description="Sistem testi icin satin alma urunu",
            price=Decimal("9999.99"),
            stock=6,
            warranty_duration_months=24,
        )

        # ASAMA 1: Etkilesim eklenmeden once cold_start agirligini dogrula.
        # Yeni kullanici hic etkilesim gecmisi olmadan sisteme girdiginde
        # populerlik agirliginin 0.8 olmasi gerekir.
        initial_rec_response = customer_client.get("/api/v1/recommendations/")
        self.assertEqual(initial_rec_response.status_code, 200, initial_rec_response.data)
        initial_weights = initial_rec_response.data["ml_metrics"]["weights_used"]
        self.assertEqual(
            initial_weights["user_tier"],
            "cold_start",
            "Etkilesim oncesi kullanici cold_start seviyesinde olmali",
        )
        self.assertEqual(
            initial_weights["popularity"],
            0.8,
            "cold_start seviyesinde populerlik agirliginin 0.8 olmasi bekleniyor",
        )

        # ASAMA 2: Yeterli etkilesim ve satin alma ile balanced seviyesine gec.
        for product in [
            self.product_fridge,
            self.product_washer,
            self.product_tv,
            extra_product_one,
        ]:
            record_response = customer_client.post(
                "/api/v1/view-history/record/",
                {"product_id": product.id},
                format="json",
            )
            self.assertEqual(record_response.status_code, 200, record_response.data)

        ownership_response = admin_client.post(
            "/api/v1/product-ownerships/",
            {
                "customer": user.id,
                "product": extra_product_two.id,
                "purchase_date": str(date.today()),
                "serial_number": "SYS-BAL-001",
            },
            format="json",
        )
        self.assertEqual(ownership_response.status_code, 201, ownership_response.data)

        cache.clear()
        recommender = get_recommender()
        if hasattr(recommender, "_last_runtime_weights"):
            recommender._last_runtime_weights.pop(user.id, None)

        recommendation_response = customer_client.get("/api/v1/recommendations/")
        self.assertEqual(recommendation_response.status_code, 200, recommendation_response.data)

        weights = recommendation_response.data["ml_metrics"]["weights_used"]
        self.assertEqual(weights["user_tier"], "balanced")
        self.assertEqual(weights["interaction_count"], 5)
        self.assertEqual(weights["ncf"], 0.4)
        self.assertEqual(weights["content"], 0.3)
        self.assertEqual(weights["popularity"], 0.3)

        self.assertEqual(ViewHistory.objects.filter(customer=user).count(), 4)
        self.assertTrue(
            ProductOwnership.objects.filter(
                customer=user,
                product=extra_product_two,
            ).exists()
        )

    # Bu senaryo adminin urun ekleme, stok guncelleme ve analytics goruntuleme
    # akisini test eder; boylece yonetim panelinin temel operasyonlari korunur.
    def test_admin_can_create_update_product_and_view_analytics(self):
        admin_client, _ = self._login_client(
            self.admin_user.username,
            "AdminPass123!",
            "web",
        )

        create_response = admin_client.post(
            "/api/v1/products/",
            {
                "name": "Admin Yonetim Urunu",
                "brand": "Beko",
                "category": self.category_appliances.id,
                "description": "Yonetici sistemi testi urunu",
                "price": "12345.67",
                "stock": 9,
                "warranty_duration_months": 24,
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, 201, create_response.data)
        product_id = create_response.data["id"]

        update_response = admin_client.patch(
            f"/api/v1/products/{product_id}/",
            {"stock": 21},
            format="json",
        )
        self.assertEqual(update_response.status_code, 200, update_response.data)

        analytics_response = admin_client.get("/api/v1/analytics/marketing/")
        self.assertEqual(analytics_response.status_code, 200, analytics_response.data)
        self.assertIn("summary", analytics_response.data)
        self.assertGreaterEqual(
            analytics_response.data["summary"]["total_customers"],
            1,
        )

        created_product = Product.objects.get(id=product_id)
        self.assertEqual(created_product.stock, 21)

