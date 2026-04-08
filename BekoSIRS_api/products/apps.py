from django.apps import AppConfig


class ProductsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'products'

    def ready(self):
        # Import signals to register them
        import products.signals

        # Start periodic ML retraining (only in the main runserver process)
        self._start_ml_retraining_scheduler()

    def _start_ml_retraining_scheduler(self):
        """Schedule periodic ML model retraining using threading.Timer."""
        import os
        import sys
        import logging
        import threading

        from django.conf import settings

        logger = logging.getLogger(__name__)

        # Only run in the main process (not during migrations, shell, etc.)
        # Django's runserver runs the main module twice — skip the reloader child
        if not getattr(settings, 'ML_AUTO_RETRAIN', True):
            logger.info("ℹ️  ML auto-retraining is disabled (ML_AUTO_RETRAIN=False)")
            return

        # Only start scheduler for 'runserver' command, not migrate/shell/etc.
        is_runserver = 'runserver' in sys.argv
        if not is_runserver:
            return

        # Skip the reloader's outer process (RUN_MAIN is set in the inner one)
        if os.environ.get('RUN_MAIN') != 'true':
            return

        retrain_interval_hours = getattr(settings, 'ML_RETRAIN_INTERVAL_HOURS', 6)
        retrain_interval_seconds = retrain_interval_hours * 3600
        initial_delay_seconds = 5 * 60  # Wait 5 minutes after boot

        def _periodic_retrain():
            """Retrain ML models and reschedule."""
            try:
                from products.ml_recommender import get_recommender
                recommender = get_recommender()
                recommender.retrain_if_stale()
            except Exception as e:
                logger.error("❌ Periodic recommender retraining error: %s", e)

            try:
                from products.ml_sales_forecaster import SalesForecastModel
                sales_model = SalesForecastModel()
                if sales_model.train(verbose=True):
                    sales_model.save()
                    logger.info("✅ Sales forecast model retrained successfully")
                else:
                    logger.warning("⚠️  Sales forecast model retraining skipped — insufficient data")
            except Exception as e:
                logger.error("❌ Periodic sales forecast retraining error: %s", e)

            # Reschedule for next interval
            timer = threading.Timer(retrain_interval_seconds, _periodic_retrain)
            timer.daemon = True
            timer.start()

        # Schedule the first run after initial delay
        timer = threading.Timer(initial_delay_seconds, _periodic_retrain)
        timer.daemon = True
        timer.start()

        logger.info(
            "🔄 ML auto-retraining scheduled: first run in %d min, then every %d hours",
            initial_delay_seconds // 60,
            retrain_interval_hours
        )
