"""
Birden fazla backend katmanini ayni HTTP zinciri icinde dogrulayan entegrasyon testleri.
"""

from datetime import date

from django.core.cache import cache
from rest_framework.test import APIClient

from products.conftest import APITestCase
from products.ml_recommender import get_recommender
from products.models import CustomUser, Recommendation, ServiceRequest, WishlistItem


class IntegrationFlowTestCase(APITestCase):
    """JWT auth, view, serializer ve DB katmanlarini ayni akista test eder."""

    def setUp(self):
        super().setUp()
        cache.clear()
        recommender = get_recommender()
        if hasattr(recommender, "_last_runtime_weights"):
            recommender._last_runtime_weights.clear()

        # Product ownership create endpoint'i DRF IsAdminUser kullandigi icin
        # admin rolune ek olarak is_staff bayragini da aciyoruz.
        self.admin_user.is_staff = True
        self.admin_user.save(update_fields=["is_staff"])

    def _login_client(self, username, password, platform):
        """Verilen kullanici icin gercek token endpoint'i uzerinden Bearer client dondurur."""
        login_client = APIClient()
        token_response = login_client.post(
            "/api/v1/token/",
            {
                "username": username,
                "password": password,
                "platform": platform,
            },
            format="json",
        )
        self.assertEqual(token_response.status_code, 200, token_response.data)

        authed_client = APIClient()
        authed_client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {token_response.data['access']}"
        )
        return authed_client, token_response.data

    # Bu zincir register -> token -> refresh adimlarinin ayni kullanici uzerinde
    # birlikte calistigini test eder; auth akisinin kirilmasi tum mobil girisleri bozar.
    def test_register_token_and_refresh_flow(self):
        register_response = self.client.post(
            "/api/v1/register/",
            {
                "username": "integration_customer",
                "password": "Integration123!",
                "email": "integration_customer@test.com",
                "first_name": "Entegrasyon",
                "last_name": "Musteri",
                "role": "customer",
                "phone_number": "",
            },
            format="json",
        )
        self.assertEqual(register_response.status_code, 201, register_response.data)

        token_response = self.client.post(
            "/api/v1/token/",
            {
                "username": "integration_customer",
                "password": "Integration123!",
                "platform": "mobile",
            },
            format="json",
        )
        self.assertEqual(token_response.status_code, 200, token_response.data)
        self.assertIn("access", token_response.data)
        self.assertIn("refresh", token_response.data)

        refresh_response = self.client.post(
            "/api/v1/token/refresh/",
            {"refresh": token_response.data["refresh"]},
            format="json",
        )
        self.assertEqual(refresh_response.status_code, 200, refresh_response.data)
        self.assertIn("access", refresh_response.data)

        registered_user = CustomUser.objects.get(username="integration_customer")
        self.assertEqual(registered_user.role, "customer")
        self.assertTrue(registered_user.check_password("Integration123!"))
        self.assertEqual(register_response.data["user_id"], registered_user.id)

    # Bu zincir login sonrasi urun listeleme, detay, wishlist ekleme ve listeleme
    # akisini dogrular; boylece serializer ve iliskili tablo yazimlari birlikte test edilir.
    def test_product_listing_detail_and_wishlist_flow(self):
        customer_client, _ = self._login_client(
            self.customer_user.username,
            "CustomerPass123!",
            "mobile",
        )

        list_response = customer_client.get("/api/v1/products/")
        self.assertEqual(list_response.status_code, 200, list_response.data)
        self.assertGreaterEqual(len(list_response.data), 1)

        detail_response = customer_client.get(f"/api/v1/products/{self.product_fridge.id}/")
        self.assertEqual(detail_response.status_code, 200, detail_response.data)
        self.assertEqual(detail_response.data["id"], self.product_fridge.id)

        add_response = customer_client.post(
            "/api/v1/wishlist/add-item/",
            {"product_id": self.product_fridge.id},
            format="json",
        )
        self.assertEqual(add_response.status_code, 201, add_response.data)

        wishlist_response = customer_client.get("/api/v1/wishlist/")
        self.assertEqual(wishlist_response.status_code, 200, wishlist_response.data)
        wishlist_product_ids = [
            item["product"]["id"] for item in wishlist_response.data["items"]
        ]
        self.assertIn(self.product_fridge.id, wishlist_product_ids)

        self.assertTrue(
            WishlistItem.objects.filter(
                wishlist__customer=self.customer_user,
                product=self.product_fridge,
            ).exists()
        )

    # Bu zincir onerinin uretilmesi, tiklama ile pozitif sinyal, dismiss ile negatif
    # sinyal ve sonraki listede urunun elenmesi davranisini uctan uca dogrular.
    def test_recommendation_click_and_dismiss_flow(self):
        customer_client, _ = self._login_client(
            self.customer_user.username,
            "CustomerPass123!",
            "mobile",
        )

        first_response = customer_client.get("/api/v1/recommendations/")
        self.assertEqual(first_response.status_code, 200, first_response.data)
        self.assertGreater(len(first_response.data["recommendations"]), 0)

        weights = first_response.data["ml_metrics"]["weights_used"]
        self.assertEqual(weights["user_tier"], "cold_start")
        self.assertEqual(weights["ncf"], 0.0)
        self.assertEqual(weights["content"], 0.2)
        self.assertEqual(weights["popularity"], 0.8)

        recommendation_id = first_response.data["recommendations"][0]["id"]
        product_id = first_response.data["recommendations"][0]["product"]["id"]

        click_response = customer_client.post(
            f"/api/v1/recommendations/{recommendation_id}/click/"
        )
        self.assertEqual(click_response.status_code, 200, click_response.data)

        dismiss_response = customer_client.patch(
            f"/api/v1/recommendations/{recommendation_id}/dismiss/"
        )
        self.assertEqual(dismiss_response.status_code, 200, dismiss_response.data)

        second_response = customer_client.get("/api/v1/recommendations/")
        self.assertEqual(second_response.status_code, 200, second_response.data)
        second_product_ids = [
            recommendation["product"]["id"]
            for recommendation in second_response.data["recommendations"]
        ]
        self.assertNotIn(product_id, second_product_ids)

        stored_recommendation = Recommendation.objects.get(id=recommendation_id)
        self.assertTrue(stored_recommendation.clicked)
        self.assertTrue(stored_recommendation.dismissed)
        self.assertTrue(
            Recommendation.objects.filter(
                customer=self.customer_user,
                product_id=product_id,
                dismissed=True,
            ).exists()
        )

    # Bu zincir servis talebinin musteri tarafinda acilip admin tarafinda durumunun
    # guncellenmesini ve son durumda DB kaydinin da dogru olmasini test eder.
    def test_service_request_creation_status_update_and_retrieval_flow(self):
        ownership = self.create_product_ownership(
            customer=self.customer_user,
            product=self.product_fridge,
            purchase_date=date.today(),
        )

        customer_client, _ = self._login_client(
            self.customer_user.username,
            "CustomerPass123!",
            "mobile",
        )
        admin_client, _ = self._login_client(
            self.admin_user.username,
            "AdminPass123!",
            "web",
        )

        create_response = customer_client.post(
            "/api/v1/service-requests/",
            {
                "product_ownership": ownership.id,
                "request_type": "repair",
                "description": "Kapak acilmiyor.",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, 201, create_response.data)

        request_id = create_response.data.get("id")
        if request_id is None:
            request_id = ServiceRequest.objects.filter(customer=self.customer_user).latest("id").id

        update_response = admin_client.post(
            f"/api/v1/service-requests/{request_id}/start/"
        )
        self.assertEqual(update_response.status_code, 200, update_response.data)

        retrieve_response = customer_client.get(f"/api/v1/service-requests/{request_id}/")
        self.assertEqual(retrieve_response.status_code, 200, retrieve_response.data)
        self.assertEqual(retrieve_response.data["status"], "in_progress")

        service_request = ServiceRequest.objects.get(id=request_id)
        self.assertEqual(service_request.customer, self.customer_user)
        self.assertEqual(service_request.product_ownership, ownership)
        self.assertEqual(service_request.status, "in_progress")
