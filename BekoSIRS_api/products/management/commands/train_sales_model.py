# products/management/commands/train_sales_model.py
"""
Management command to train (or retrain) the Ridge Regression sales forecast model.

Usage:
    python manage.py train_sales_model

The trained model is saved to ml_models/sales_forecast_model.pkl and synced
to the MLModelStore table, mirroring the train_recommender command pattern.
"""
from django.core.management.base import BaseCommand
from products.ml_sales_forecaster import SalesForecastModel


class Command(BaseCommand):
    help = 'Train the Ridge Regression sales forecast model with current ProductAssignment data'

    def handle(self, *args, **options):
        self.stdout.write('🔄 Starting Ridge Regression sales forecast training...')

        model = SalesForecastModel()
        success = model.train(verbose=True)

        if success:
            model.save()
            self.stdout.write(self.style.SUCCESS('\n✓ Sales forecast model trained successfully'))
            self.stdout.write(f"  - Model type      : Ridge Regression (alpha=1.0, L2 regularisation)")
            self.stdout.write(f"  - Features        : 20 (cyclical month/quarter, 12 lags, rolling avg, category, price, year)")
            self.stdout.write(f"  - Train R²        : {model.metrics.get('train_r2')}")
            self.stdout.write(f"  - Test  R²        : {model.metrics.get('test_r2')}")
            self.stdout.write(f"  - Train MAE       : {model.metrics.get('train_mae')}")
            self.stdout.write(f"  - Test  MAE       : {model.metrics.get('test_mae')}")
            self.stdout.write(f"  - Residual std    : {model.metrics.get('residual_std')}  (95% CI ± {round(1.96 * model.metrics.get('residual_std', 0), 2)})")
            self.stdout.write(f"  - Samples         : {model.metrics.get('n_samples')}")
        else:
            self.stdout.write(self.style.WARNING(
                '\n⚠️  Training did not complete — insufficient data.\n'
                '    Each product needs at least 4 months of sales history\n'
                '    and at least 5 total samples across all products.\n'
                '    Check that ProductAssignment records exist in the database.'
            ))
