# products/management/commands/train_recommender.py
from django.core.management.base import BaseCommand
from products.ml_recommender import get_recommender


class Command(BaseCommand):
    help = 'Train the ML recommendation model with current data'

    def add_arguments(self, parser):
        parser.add_argument("--epochs", type=int, default=300, help="Max training epochs (default 300)")

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Starting ML recommender training...'))
        
        try:
            recommender = get_recommender()
            success = recommender.train(epochs=options["epochs"], verbose=True)
            
            if success:
                self.stdout.write(self.style.SUCCESS(f'\n✓ Model trained successfully'))
                metrics = recommender.get_metrics()
                
                content = metrics.get('content', {})
                if content.get('is_trained'):
                    self.stdout.write(f"  - Content model trained with {content.get('n_products', 0)} products")
                else:
                    self.stdout.write(self.style.WARNING("  - Content model skipped or failed"))
                    
                ncf = metrics.get('ncf')
                if ncf:
                    self.stdout.write(f"  - NCF Hit Rate @10: {ncf.get('hit_rate_at_10')}")
                    self.stdout.write(f"  - NCF Train R2: {ncf.get('train_r2')}")
                else:
                    self.stdout.write(self.style.WARNING("  - NCF model skipped (insufficient interaction data)"))
                
            else:
                self.stdout.write(self.style.WARNING('\n⚠️ Training did not complete successfully (possibly not enough data).'))
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Training failed: {str(e)}'))
            raise
