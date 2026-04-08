# products/management/commands/generate_interactions.py
"""
Generate realistic synthetic interaction data for ML training.

Creates users with distinct preference profiles (category affinities, price
ranges) and generates views, wishlist, reviews, and purchases that follow
those profiles.  This gives the NCF model clear patterns to learn.

Usage:
    python manage.py generate_interactions            # default 30 users
    python manage.py generate_interactions --users 50 # custom count
    python manage.py generate_interactions --clear    # wipe old synthetic data first
"""

import random
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import date, timedelta

from products.models import (
    CustomUser, Product, Category, ProductOwnership,
    Review, Wishlist, WishlistItem, ViewHistory,
)


# ── User-profile templates ────────────────────────────────────────────────
# Each profile defines which categories the user is most interested in and
# a preferred price range.  This makes the generated data have learnable
# structure (e.g. "kitchen lovers buy kitchen products").
PROFILES = [
    {"name": "kitchen_lover",   "cats": ["Küçük Ev Aletleri", "Pişirme"],           "price": (500, 5000)},
    {"name": "laundry_fan",     "cats": ["Çamaşır Makinesi", "Kurutma Makinesi"],   "price": (3000, 15000)},
    {"name": "cooling_fan",     "cats": ["Buzdolabı", "Derin Dondurucu"],           "price": (5000, 25000)},
    {"name": "cleaning_fan",    "cats": ["Süpürge", "Elektrikli Süpürge"],          "price": (1000, 8000)},
    {"name": "dishwasher_fan",  "cats": ["Bulaşık Makinesi"],                       "price": (4000, 15000)},
    {"name": "budget_buyer",    "cats": [],                                          "price": (0, 3000)},
    {"name": "premium_buyer",   "cats": [],                                          "price": (10000, 50000)},
    {"name": "explorer",        "cats": [],                                          "price": (0, 50000)},
]


class Command(BaseCommand):
    help = "Generate realistic synthetic interaction data to improve ML model training"

    def add_arguments(self, parser):
        parser.add_argument("--users", type=int, default=30, help="Number of synthetic users")
        parser.add_argument("--clear", action="store_true", help="Delete previous synthetic users & data first")

    def handle(self, *args, **options):
        n_users = options["users"]
        clear = options["clear"]

        if clear:
            self._clear_synthetic_data()

        all_products = list(Product.objects.select_related("category").all())
        all_categories = list(Category.objects.all())

        if not all_products:
            self.stderr.write("❌ No products in database — import products first.")
            return

        self.stdout.write(f"\n📊 Found {len(all_products)} products in {len(all_categories)} categories")

        # Build category → products lookup
        cat_products = {}
        for p in all_products:
            cat_name = p.category.name if p.category else "Other"
            cat_products.setdefault(cat_name, []).append(p)

        users = self._create_users(n_users)
        self.stdout.write(f"👤 {len(users)} synthetic users ready\n")

        stats = {"views": 0, "wishlist": 0, "reviews": 0, "purchases": 0}

        for user in users:
            profile = random.choice(PROFILES)
            # Determine products this user would be interested in
            preferred = self._get_preferred_products(profile, cat_products, all_products)
            other = [p for p in all_products if p not in preferred]

            # ── Views (10-40 per user) ─────────────────────────────────
            n_views = random.randint(10, 40)
            # 70 % of views go to preferred products
            view_products = (
                random.choices(preferred, k=int(n_views * 0.7)) +
                random.choices(other, k=int(n_views * 0.3)) if preferred and other
                else random.choices(all_products, k=n_views)
            )
            for product in view_products:
                vh, created = ViewHistory.objects.get_or_create(
                    customer=user, product=product,
                    defaults={"view_count": random.randint(1, 8)}
                )
                if not created:
                    vh.view_count += random.randint(1, 3)
                    vh.save()
                stats["views"] += 1

            # ── Wishlist (2-8 per user, mostly preferred) ──────────────
            wishlist, _ = Wishlist.objects.get_or_create(customer=user)
            n_wish = random.randint(2, 8)
            wish_pool = preferred[:n_wish] if preferred else random.sample(all_products, min(n_wish, len(all_products)))
            for product in wish_pool:
                WishlistItem.objects.get_or_create(wishlist=wishlist, product=product)
                stats["wishlist"] += 1

            # ── Reviews (1-5 per user, preferred get higher ratings) ───
            n_reviews = random.randint(1, 5)
            reviewed = random.sample(preferred, min(n_reviews, len(preferred))) if preferred else random.sample(all_products, min(n_reviews, len(all_products)))
            for product in reviewed:
                # Preferred products get 4-5; non-preferred get 2-4
                is_preferred = product in preferred
                rating = random.randint(4, 5) if is_preferred else random.randint(2, 4)
                Review.objects.get_or_create(
                    customer=user, product=product,
                    defaults={
                        "rating": rating,
                        "comment": f"Synthetic review — {profile['name']}",
                        "is_approved": True,
                    }
                )
                stats["reviews"] += 1

            # ── Purchases (1-3 per user, almost always preferred) ──────
            n_purchases = random.randint(1, 3)
            purchase_pool = random.sample(preferred, min(n_purchases, len(preferred))) if preferred else random.sample(all_products, min(n_purchases, len(all_products)))
            for product in purchase_pool:
                ProductOwnership.objects.get_or_create(
                    customer=user, product=product,
                    defaults={
                        "purchase_date": date.today() - timedelta(days=random.randint(1, 365)),
                        "serial_number": f"SYN-{product.id:04d}-{user.id:05d}",
                    }
                )
                stats["purchases"] += 1

        self.stdout.write(self.style.SUCCESS(
            f"\n✅ Done! Generated interactions:\n"
            f"   Views:     {stats['views']}\n"
            f"   Wishlist:  {stats['wishlist']}\n"
            f"   Reviews:   {stats['reviews']}\n"
            f"   Purchases: {stats['purchases']}\n"
            f"   Total:     {sum(stats.values())}\n"
        ))

    # ── Helpers ────────────────────────────────────────────────────────────

    def _create_users(self, n):
        """Create n synthetic customer users."""
        users = []
        for i in range(n):
            username = f"synth_user_{i:04d}"
            user, created = CustomUser.objects.get_or_create(
                username=username,
                defaults={
                    "email": f"{username}@synthetic.test",
                    "first_name": f"Synth{i}",
                    "last_name": "User",
                    "role": "customer",
                }
            )
            if created:
                user.set_password("synthetic1234")
                user.save()
            users.append(user)
        return users

    def _get_preferred_products(self, profile, cat_products, all_products):
        """Return products that match the user profile."""
        preferred = []

        # Category affinity
        if profile["cats"]:
            for cat_name in profile["cats"]:
                preferred.extend(cat_products.get(cat_name, []))

        # Price range filter
        price_min, price_max = profile["price"]
        if preferred:
            preferred = [p for p in preferred if price_min <= float(p.price) <= price_max]
        else:
            # No category preference → filter all by price
            preferred = [p for p in all_products if price_min <= float(p.price) <= price_max]

        # Fallback: at least 5 random products
        if len(preferred) < 5:
            extras = random.sample(all_products, min(10, len(all_products)))
            preferred = list(set(preferred + extras))

        return preferred

    def _clear_synthetic_data(self):
        """Remove all synthetic users and their interactions."""
        synth_users = CustomUser.objects.filter(username__startswith="synth_user_")
        count = synth_users.count()
        synth_users.delete()
        self.stdout.write(f"🧹 Cleared {count} synthetic users and their cascade data")
