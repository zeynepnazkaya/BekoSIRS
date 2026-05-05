# products/ml_sales_forecaster.py


import os
import logging
import warnings
from datetime import timedelta

import numpy as np
import pandas as pd
import joblib

from django.conf import settings

from sklearn.linear_model import Ridge
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score, mean_absolute_error

warnings.filterwarnings('ignore')
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths  (same directory as NCF / content models)
# ---------------------------------------------------------------------------
ML_MODELS_DIR = os.path.join(settings.BASE_DIR, 'ml_models')
SALES_MODEL_PATH = os.path.join(ML_MODELS_DIR, 'sales_forecast_model.pkl')


# ---------------------------------------------------------------------------
# Database Sync Helpers  (mirrors ml_recommender.py helpers)
# ---------------------------------------------------------------------------
def _save_model_to_db(file_path):
    try:
        from .models import MLModelStore
        file_name = os.path.basename(file_path)
        with open(file_path, 'rb') as f:
            data = f.read()
        MLModelStore.objects.update_or_create(
            name=file_name,
            defaults={'data': data}
        )
        logger.info("☁️  Synced %s to database (%.1f KB)", file_name, len(data) / 1024)
    except Exception as e:
        logger.warning("⚠️  Could not sync %s to database: %s", file_path, e)


def _load_model_from_db(file_path):
    try:
        from .models import MLModelStore
        file_name = os.path.basename(file_path)
        record = MLModelStore.objects.filter(name=file_name).first()
        if record and record.data:
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, 'wb') as f:
                f.write(bytes(record.data))
            logger.info("📥 Downloaded %s from database (%.1f KB)", file_name, len(record.data) / 1024)
            return True
        return False
    except Exception as e:
        logger.warning("⚠️  Could not load %s from database: %s", file_path, e)
        return False


# ═══════════════════════════════════════════════════════════════════════════
# SALES FORECAST MODEL
# ═══════════════════════════════════════════════════════════════════════════
class SalesForecastModel:

    def __init__(self):
        self.model = None
        self.category_encoder = LabelEncoder()
        self.scaler = StandardScaler()
        self.price_33 = 0.0
        self.price_66 = 0.0
        self.residual_std = 1.0   # used for 95% confidence interval
        self.is_trained = False
        self.metrics = {}
        self.pkl_mtime = 0.0

    # -----------------------------------------------------------------------
    # Feature engineering helpers
    # -----------------------------------------------------------------------
    @staticmethod
    def _cyclical(value, period):
        """Encode a periodic variable as (sin, cos) pair."""
        angle = 2 * np.pi * value / period
        return np.sin(angle), np.cos(angle)

    def _price_bucket(self, price: float) -> int:
        return 0 if price <= self.price_33 else (1 if price <= self.price_66 else 2)

    def _build_feature_row(
        self,
        target_month: int,
        target_year: int,
        lag1: float,
        lag2: float,
        lag3: float,
        lag4: float,
        lag5: float,
        lag6: float,
        lag7: float,
        lag8: float,
        lag9: float,
        lag10: float,
        lag11: float,
        lag12: float,
        cat_enc: float,
        price_bucket: float,
        trend_index: float,
    ) -> list:
        month_sin, month_cos = self._cyclical(target_month, 12)
        quarter = (target_month - 1) // 3 + 1
        qtr_sin, qtr_cos = self._cyclical(quarter, 4)
        lags = [lag1, lag2, lag3, lag4, lag5, lag6, lag7, lag8, lag9, lag10, lag11, lag12]
        rolling_avg = sum(lags) / 12.0
        year_scaled = float(target_year - 2020)
        return [
            month_sin, month_cos,
            qtr_sin, qtr_cos,
            *lags, rolling_avg,
            cat_enc, price_bucket,
            year_scaled,
        ]

    # -----------------------------------------------------------------------
    # Training
    # -----------------------------------------------------------------------
    def _build_training_data(self):
        """
        Aggregate ProductAssignment records by (product, year-month) and
        create sliding-window samples with 3 lags.

        Uses all available historical data — not limited to recent months —
        to capture long-term trends and seasonality patterns.
        """
        from .models import ProductAssignment

        qs = ProductAssignment.objects.values(
            'product_id',
            'assigned_at',
            'quantity',
            'product__category__name',
            'product__price',
        )

        if not qs.exists():
            logger.warning("No ProductAssignment records found for training.")
            return None, None

        df = pd.DataFrame(list(qs))
        df['assigned_at'] = pd.to_datetime(df['assigned_at'], utc=True)
        df['year'] = df['assigned_at'].dt.year
        df['month'] = df['assigned_at'].dt.month
        df['year_month'] = df['year'] * 100 + df['month']
        df['price'] = pd.to_numeric(df['product__price'], errors='coerce').fillna(0.0)
        df['category'] = df['product__category__name'].fillna('Diğer')

        # Aggregate monthly totals per product
        monthly = (
            df.groupby(['product_id', 'year_month', 'year', 'month', 'category', 'price'])
            ['quantity']
            .sum()
            .reset_index()
            .sort_values(['product_id', 'year_month'])
        )

        self.category_encoder.fit(monthly['category'].unique())
        self.price_33 = float(monthly['price'].quantile(0.33))
        self.price_66 = float(monthly['price'].quantile(0.66))

        samples = []
        for _, group in monthly.groupby('product_id'):
            group = group.reset_index(drop=True)
            if len(group) < 13:   # need 12 lags + 1 target
                continue

            cat_enc = float(self.category_encoder.transform([group['category'].iloc[0]])[0])
            price = float(group['price'].iloc[0])
            pb = float(self._price_bucket(price))

            sales = group['quantity'].values.astype(float)
            months = group['month'].values.astype(int)
            years = group['year'].values.astype(int)

            for i in range(12, len(group)):
                row = self._build_feature_row(
                    target_month=int(months[i]),
                    target_year=int(years[i]),
                    lag1=sales[i - 1],
                    lag2=sales[i - 2],
                    lag3=sales[i - 3],
                    lag4=sales[i - 4],
                    lag5=sales[i - 5],
                    lag6=sales[i - 6],
                    lag7=sales[i - 7],
                    lag8=sales[i - 8],
                    lag9=sales[i - 9],
                    lag10=sales[i - 10],
                    lag11=sales[i - 11],
                    lag12=sales[i - 12],
                    cat_enc=cat_enc,
                    price_bucket=pb,
                    trend_index=float(i),
                )
                samples.append(row + [float(sales[i])])

        if not samples:
            logger.warning("No training samples — each product needs ≥13 months of history.")
            return None, None

        arr = np.array(samples, dtype=float)
        return arr[:, :-1], arr[:, -1]

    def train(self, verbose=False):
        X, y = self._build_training_data()
        if X is None or len(X) < 5:
            return False

        X_scaled = self.scaler.fit_transform(X)

        if len(X_scaled) > 20:
            X_train, X_test, y_train, y_test = train_test_split(
                X_scaled, y, test_size=0.2, random_state=42
            )
        else:
            X_train = X_test = X_scaled
            y_train = y_test = y

        self.model = Ridge(alpha=1.0)
        self.model.fit(X_train, y_train)

        # Residual std on training set — used for confidence intervals
        train_preds = self.model.predict(X_train)
        residuals = y_train - train_preds
        self.residual_std = float(np.std(residuals)) if len(residuals) > 1 else 1.0

        self.metrics = {
            'train_r2':  round(float(r2_score(y_train, train_preds)), 4),
            'test_r2':   round(float(r2_score(y_test,  self.model.predict(X_test))),  4),
            'train_mae': round(float(mean_absolute_error(y_train, train_preds)), 2),
            'test_mae':  round(float(mean_absolute_error(y_test,  self.model.predict(X_test))), 2),
            'n_samples': len(X),
            'residual_std': round(self.residual_std, 2),
        }
        self.is_trained = True

        if verbose:
            logger.info(
                "✅ Sales forecast model trained — Test R²=%.3f  MAE=%.2f  CI±=%.2f  (n=%d samples)",
                self.metrics['test_r2'], self.metrics['test_mae'],
                1.96 * self.residual_std, self.metrics['n_samples'],
            )
        return True

    # -----------------------------------------------------------------------
    # Prediction  (direct, NOT auto-regressive)
    # -----------------------------------------------------------------------
    def predict_next_n_months(
        self,
        last_12_months_sales: list,
        category: str,
        price: float,
        base_date,
        n_months: int = 3,
    ) -> list:
        """
        Predict sales for the next N calendar months with 95% confidence intervals.

        Args:
            last_12_months_sales : [m-12, ..., m-1]  actual monthly sales (oldest first)
            category             : product category name
            price                : product price
            base_date            : datetime of the current period
            n_months             : number of months to predict (default 3, max 12)

        Returns:
            List of N dicts: {"predicted": int, "lower": int, "upper": int}
        """
        if not self.is_trained or self.model is None:
            return None

        n_months = min(max(n_months, 1), 12)

        try:
            cat_enc = float(self.category_encoder.transform([category])[0])
        except ValueError:
            cat_enc = 0.0

        pb = float(self._price_bucket(price))
        sales = [float(x) for x in last_12_months_sales]

        ci_half = 1.96 * self.residual_std

        results = []
        for step in range(n_months):
            future_month = ((base_date.month - 1 + step + 1) % 12) + 1
            future_year = base_date.year + ((base_date.month + step) // 12)

            # Confidence widens slightly for further months
            step_ci = ci_half * (1.0 + step * 0.05)

            row = self._build_feature_row(
                target_month=future_month,
                target_year=future_year,
                lag1=sales[11], lag2=sales[10], lag3=sales[9],
                lag4=sales[8],  lag5=sales[7],  lag6=sales[6],
                lag7=sales[5],  lag8=sales[4],  lag9=sales[3],
                lag10=sales[2], lag11=sales[1], lag12=sales[0],
                cat_enc=cat_enc,
                price_bucket=pb,
                trend_index=float(step),
            )
            features = np.array([row], dtype=float)
            pred = float(self.model.predict(self.scaler.transform(features))[0])
            results.append({
                "predicted": max(0, int(round(pred))),
                "lower":     max(0, int(round(pred - step_ci))),
                "upper":     max(0, int(round(pred + step_ci))),
            })

        return results

    # Backward compatibility wrapper
    def predict_next_3_months(self, last_12_months_sales, category, price, base_date):
        return self.predict_next_n_months(last_12_months_sales, category, price, base_date, n_months=3)

    # -----------------------------------------------------------------------
    # Persistence
    # -----------------------------------------------------------------------
    def save(self):
        os.makedirs(ML_MODELS_DIR, exist_ok=True)
        joblib.dump(self, SALES_MODEL_PATH)
        self.pkl_mtime = os.path.getmtime(SALES_MODEL_PATH)
        logger.info("💾 Sales forecast model saved to %s", SALES_MODEL_PATH)
        _save_model_to_db(SALES_MODEL_PATH)

    # Number of features produced by _build_feature_row — bump when features change.
    _N_FEATURES = 20  # 4 cyclical + 12 lags + rolling_avg + cat_enc + price_bucket + year_scaled

    @classmethod
    def _is_compatible(cls, instance) -> bool:
        """Return False if the loaded model was trained with a different feature set."""
        if not isinstance(instance, cls) or not instance.is_trained:
            return False
        # Must have residual_std (added in Ridge refactor)
        if not hasattr(instance, 'residual_std'):
            return False
        # Scaler must have been fitted with the current number of features
        try:
            if instance.scaler.n_features_in_ != cls._N_FEATURES:
                return False
        except AttributeError:
            return False
        return True

    @classmethod
    def load(cls):
        if not os.path.exists(SALES_MODEL_PATH):
            _load_model_from_db(SALES_MODEL_PATH)
        if os.path.exists(SALES_MODEL_PATH):
            try:
                instance = joblib.load(SALES_MODEL_PATH)
                if cls._is_compatible(instance):
                    instance.pkl_mtime = os.path.getmtime(SALES_MODEL_PATH)
                    logger.info("✅ Sales forecast model loaded from disk")
                    return instance
                else:
                    logger.warning(
                        "⚠️  Stale/incompatible sales forecast model on disk — will retrain"
                    )
                    os.remove(SALES_MODEL_PATH)
            except Exception as e:
                logger.warning("Could not deserialise sales forecast model: %s", e)
        return None


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------
_instance: SalesForecastModel | None = None


def get_sales_forecaster() -> SalesForecastModel | None:
    """
    Return the trained singleton.
    Auto-reloads if the pkl file was updated (e.g. after train_sales_model).
    """
    global _instance
    if _instance is not None and _instance.is_trained:
        if os.path.exists(SALES_MODEL_PATH):
            if os.path.getmtime(SALES_MODEL_PATH) <= _instance.pkl_mtime:
                return _instance
            logger.info("🔄 Newer sales forecast model detected — reloading...")
            _instance = None

    _instance = SalesForecastModel.load()
    if _instance is not None:
        return _instance

    logger.info("🔄 No saved sales forecast model — training now...")
    _instance = SalesForecastModel()
    if _instance.train(verbose=True):
        _instance.save()
        return _instance

    _instance = None
    return None
