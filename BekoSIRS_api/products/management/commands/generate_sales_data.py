# products/management/commands/generate_sales_data.py
"""
Generate realistic synthetic ProductAssignment records for sales forecast training.

Creates 6 months of back-dated sales history with seasonal patterns so the
MLPRegressor has enough weekly samples to train on.

Seasonal patterns used (Beko product categories):
  - Klima / Air conditioning : peaks June-August
  - Isıtıcı / Heater         : peaks November-February
  - Buzdolabı / Fridge       : steady, slight summer bump
  - Çamaşır Makinesi / WM   : steady year-round
  - Küçük Ev Aletleri        : peaks December (gifts)
  - Others                   : uniform

Usage:
    python manage.py generate_sales_data              # 6 months, all products
    python manage.py generate_sales_data --months 12  # longer history
    python manage.py generate_sales_data --clear      # wipe generated records first
"""

import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from products.models import CustomUser, Product, ProductAssignment


# ── Seasonal multipliers per calendar month (1=Jan … 12=Dec) ──────────────
# Keys are substrings to match against the category name (case-insensitive).
SEASONAL = {
    "klima":         [0.2, 0.2, 0.3, 0.5, 0.9, 1.5, 2.0, 1.8, 1.0, 0.4, 0.2, 0.2],
    "isıtıcı":       [1.8, 1.6, 1.0, 0.4, 0.2, 0.1, 0.1, 0.1, 0.3, 0.8, 1.5, 1.9],
    "fırın":         [0.8, 0.8, 0.9, 1.0, 1.0, 0.9, 0.8, 0.8, 1.0, 1.1, 1.2, 1.5],
    "buzdolabı":     [0.9, 0.9, 1.0, 1.0, 1.1, 1.3, 1.4, 1.3, 1.0, 0.9, 0.9, 1.0],
    "çamaşır":       [1.0, 1.0, 1.1, 1.0, 0.9, 0.9, 0.8, 0.9, 1.0, 1.0, 1.1, 1.2],
    "küçük ev":      [0.7, 0.7, 0.8, 0.9, 1.0, 1.0, 0.9, 0.9, 1.0, 1.1, 1.2, 1.8],
    "süpürge":       [0.9, 0.9, 1.1, 1.2, 1.0, 0.8, 0.8, 0.8, 1.0, 1.0, 1.1, 1.3],
}
DEFAULT_SEASONAL = [1.0] * 12   # uniform for unknown categories


def _multiplier(category_name: str, month: int) -> float:
    """Return the seasonal demand multiplier for a category in a given month."""
    name_lower = (category_name or "").lower()
    for key, mults in SEASONAL.items():
        if key in name_lower:
            return mults[month - 1]
    return DEFAULT_SEASONAL[month - 1]


class Command(BaseCommand):
    help = "Generate synthetic ProductAssignment records for sales forecast model training"

    def add_arguments(self, parser):
        parser.add_argument("--months", type=int, default=6,
                            help="Months of history to generate (default 6)")
        parser.add_argument("--base-sales", type=int, default=4,
                            help="Average weekly sales per product before seasonality (default 4)")
        parser.add_argument("--clear", action="store_true",
                            help="Delete previously generated synthetic sales data first")

    def handle(self, *args, **options):
        months = options["months"]
        base_sales = options["base_sales"]
        clear = options["clear"]

        if clear:
            deleted, _ = ProductAssignment.objects.filter(
                notes__startswith="[SYNTH-SALES]"
            ).delete()
            self.stdout.write(f"🧹 Deleted {deleted} synthetic sales records")

        products = list(Product.objects.select_related("category").all())
        if not products:
            self.stderr.write("❌ No products found — import products first.")
            return

        # Use any existing customer; create a placeholder if none exist
        customer = CustomUser.objects.filter(role="customer").first()
        if not customer:
            customer, _ = CustomUser.objects.get_or_create(
                username="synth_sales_customer",
                defaults={
                    "email": "synth_sales@synthetic.test",
                    "first_name": "Synth",
                    "last_name": "SalesCustomer",
                    "role": "customer",
                }
            )
            if customer._state.adding:
                customer.set_password("synthetic1234")
                customer.save()

        admin = CustomUser.objects.filter(role="admin").first()

        now = timezone.now()
        start = now - timedelta(days=months * 30)

        self.stdout.write(
            f"📅 Generating {months} months of weekly sales data "
            f"for {len(products)} products…"
        )

        # Process one week at a time:
        #   1. bulk_create the week's records (fast, single INSERT)
        #   2. immediately update assigned_at on those PKs (auto_now_add
        #      ignores values set on the instance, so we must update after)
        total_created = 0
        n_weeks = 0
        week_cursor = start

        while week_cursor < now:
            month = week_cursor.month
            week_label = week_cursor.strftime('%Y-%m-%d')
            week_records = []

            for product in products:
                cat_name = product.category.name if product.category else ""
                mult = _multiplier(cat_name, month)
                qty = max(1, int(base_sales * mult + random.gauss(0, 0.8)))

                week_records.append(ProductAssignment(
                    customer=customer,
                    product=product,
                    quantity=qty,
                    assigned_by=admin,
                    status="DELIVERED",
                    notes=f"[SYNTH-SALES] week {week_label}",
                ))

            # bulk_create returns objects with PKs set (PostgreSQL RETURNING)
            created = ProductAssignment.objects.bulk_create(week_records, batch_size=500)
            ids = [obj.pk for obj in created if obj.pk]

            # Backdate assigned_at — pick a random day within the week
            sale_date = week_cursor + timedelta(days=random.randint(0, 6))
            if ids:
                ProductAssignment.objects.filter(pk__in=ids).update(assigned_at=sale_date)

            total_created += len(created)
            n_weeks += 1
            week_cursor += timedelta(days=7)

        self.stdout.write(self.style.SUCCESS(
            f"\n✅ Created {total_created} synthetic sales records "
            f"({n_weeks} weeks × {len(products)} products)\n"
            f"   Run: python manage.py train_sales_model"
        ))
