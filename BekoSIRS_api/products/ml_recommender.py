# products/ml_recommender.py
# ==============================================================================
# BEKOSIRS HİBRİT ÖNERİ SİSTEMİ (RECOMMENDATION ENGINE) TEKNİK REFERANS REHBERİ
# ==============================================================================
#
# ADIM 1: GİRDİ VERİLERİ VE ETKİLEŞİM AĞIRLIKLARI. //?????????????bu puanlar neye göre veriliyor??????????????? puanlama ağırlıklaırnla oyna

# ------------------------------------------------------------------------------
# 1.1. Etkileşim Puanları (İki farklı yerde hesaplanır):
#   - Satın Alma (Purchase): 5.0 Puan (En güçlü sinyal)
#   - Yorum (Review): Verilen yıldız puanı kadar (Modelde), Canlı puanda sadece >3 yıldız olanlar.
#   - İstek Listesi (Wishlist): 3.0 Puan
#   - Görüntüleme (View):
#       * NCF Eğitimi için: Görüntüleme sayısı kadar, maksimum 5 ile sınırlandırılır (Cap).
#       * Canlı İçerik Puanı için: Görüntüleme sayısı kadar, maksimum 15 ile sınırlandırılır.
#   - Reddedilen Öneriler (Dismissed): -3.0 Puan (Sadece canlı puanlamada eksi sinyal olarak).
#
# 1.2. Ürün Metin Verisi (Content):
#   - İsim + Açıklama + Marka + (Kategori Adı x 3) birleştirilerek tek metin yapılır. 
#   - Kategori isminin 3 kez yazılması, kategori ağırlığını yapay zeka gözünde artırır.
#
# ADIM 2: MODELLERİN EĞİTİLMESİ VE MATEMATİKSEL HESAPLAMALAR
# ------------------------------------------------------------------------------
# 2.1. Neural Collaborative Filtering (NCF) - Yapay Sinir Ağı:
#   - Mimari: Scikit-learn MLPRegressor (128 -> 64 -> 32 -> 16 -> 1 nöronlu ReLU ağ).
#   - Modele Giren 14 Özellik (Feature Vector):
#       1. Kategori (Label Encoded)
#       2. Fiyat / Ortalama Fiyat (Normalize Fiyat)
#       3. Fiyat Sepeti (0-4 arası, Price Bucket)
#       4. Kullanıcının verdiği/aldığı ortalama puan
#       5. Kullanıcının toplam etkileşim sayısı
#       6. Kullanıcının puanlarının standart sapması
#       7. Kullanıcının etkileşime girdiği benzersiz ürün sayısı
#       8. Ürünün sitedeki ortalama yıldız puanı
#       9. Ürüne yapılan toplam yorum sayısı
#      10. Ürünün toplam görüntülenme sayısı
#      11. Ürünün toplam satın alınma sayısı
#      12. Ürünün kaç kişinin istek listesinde olduğu
#      13. Kullanıcı - Kategori Yakınlığı (Kullanıcı bu kategoriyle ne kadar ilgili?)
#      14. Kullanıcının özel olarak bu ürünü kaç kez görüntülediği.
#   - Tüm bu veriler MinMaxScaler ile 0-1 arasına çekilip ağa sokulur.
#
# 2.2. İçerik Tabanlı Filtreleme (Content-Based - TF-IDF & Kosinüs Benzerliği): //.  ??????????bag of words yoksa sadece tf idf?????  
#   - TF-IDF Vectorizer en çok geçen 5000 kelime/ikili kelime grubunu (1-2 ngram) çıkarır.
#   - Ürünler arası Kosinüs Benzerliği (Cosine Similarity) hesaplanır.
#   - Kategori Bonusu: Eğer iki ürün aynı kategorideyse, benzerlik skorlarına statik +0.15 eklenir.
#
# 2.3. Popülerlik (Cold-Start / Yedek Sistem):
#   - Formül: (Toplam Görüntüleme x 1) + (Toplam Yorum x 3) + (Toplam Satın Alma x 5)
#
# ADIM 3: CANLI PUANLAMA VE BONUS HESAPLAMALARI (Kullanıcı İstek Attığında)
# ------------------------------------------------------------------------------
# 1. Ham Skorların Çekilmesi ve Normalize Edilmesi:
#   - NCF, Content ve Popülerlik modellerinden gelen skorlar kendi içlerindeki en yüksek değere (max) 
#     bölünerek 0 ile 1 arasına (Normalize) çekilir.
# 
# 2. Hibrit Formül Ağırlıkları (WEIGHTS): //genel weightleri değiştir r2 değişiyor mu
#   - Nihai Puan = (NCF Skoru x 0.5) + (Content Skoru x 0.3) + (Popülerlik Skoru x 0.2)
#
# 3. Anlık Bonuslar (Boosts):
#   - Arama Bonusu (Search Boost): Kullanıcının son 5 araması ürünün TF-IDF metninde geçiyorsa,
#     ürünün nihai puanına DİREKT +2.0 eklenir.
#   - Fiyat Duyarlılığı Bonusu (Price Sensitivity Boost): Kullanıcının daha önce aldığı ve baktığı 
#     ürünlerin ortalama fiyatı (avg_price) bulunur. Eğer aday ürünün fiyatı bu ortalamanın 
#     %70'i ile %130'u arasındaysa, nihai puana +0.5 eklenir.
#
# ADIM 4: FİLTRELEME, DİVERSİFİKASYON VE KULLANICIYA SUNUM
# ------------------------------------------------------------------------------
# - Kesin Elemeler: Kullanıcının daha önce satın aldığı ürünler listeden tamamen çıkartılır.
# - Kategori Kısıtlaması (Diversity):
#   * Sistemin tek tip ürün önermemesi için aynı kategoriden en fazla 4 ürün alınır.
#   * Sadece kullanıcının geçmişte etkileşime girdiği (tıkladığı, aldığı vb.) kategorilerdeki
#     ürünler listeye dahil edilir. 
#   * Eğer listede yeterli (Top-N) ürün kalmazsa, bu kısıtlama esnetilir ve diğer kategoriler açılır.
# - Etiketleme (Reasoning): Ürünün puanı en çok nereden geldiyse veya hangi bonusu aldıysa,
#   "Aramalarınıza göre", "Bütçenize uygun", "[Kategori] beğenenler bunu da beğendi" gibi dinamik metinler üretilir.
# ==============================================================================    
import math
import os
import time
import threading
import logging
import warnings
from datetime import date as dt_date, datetime as dt_datetime, time as dt_time, timedelta, timezone as dt_timezone

import numpy as np
import pandas as pd
import joblib
from functools import lru_cache

from django.conf import settings
from django.core.cache import cache

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import LabelEncoder, MinMaxScaler
from sklearn.model_selection import train_test_split

warnings.filterwarnings('ignore', category=FutureWarning)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ML_MODELS_DIR = os.path.join(settings.BASE_DIR, 'ml_models')
NCF_MODEL_PATH = os.path.join(ML_MODELS_DIR, 'ncf_model.pkl')
CONTENT_MODEL_PATH = os.path.join(ML_MODELS_DIR, 'content_model.pkl')
ENCODERS_PATH = os.path.join(ML_MODELS_DIR, 'encoders.pkl')
METRICS_PATH = os.path.join(ML_MODELS_DIR, 'metrics.pkl')


# ---------------------------------------------------------------------------
# Time-aware scoring helpers
# ---------------------------------------------------------------------------
def temporal_weight(interaction_date, half_life_days=30):
    """
    Compute an exponential decay multiplier for time-sensitive interactions.

    We use half-life based decay because it is easy to reason about:
    every `half_life_days` window halves the original contribution instead of
    dropping it abruptly at a fixed threshold.
    """
    # Some legacy rows may not have a timestamp; keeping full weight is safer
    # than discarding a valid interaction signal entirely.
    if interaction_date is None:
        return 1.0

    normalized_date = interaction_date
    if isinstance(normalized_date, dt_date) and not isinstance(normalized_date, dt_datetime):
        # Purchase rows store only a calendar date, so we normalize them to the
        # start of that day in UTC to keep the decay formula consistent.
        normalized_date = dt_datetime.combine(normalized_date, dt_time.min)

    if normalized_date.tzinfo is None:
        # Recommendation timestamps should be compared in the same timezone so
        # the half-life behaves deterministically across environments.
        normalized_date = normalized_date.replace(tzinfo=dt_timezone.utc)

    now = dt_datetime.now(dt_timezone.utc)
    days_old = max(0, (now - normalized_date).days)

    # Exponential decay keeps recent activity dominant while still preserving
    # a diminishing contribution from older interactions.
    return math.exp(-math.log(2) * days_old / half_life_days)


# ---------------------------------------------------------------------------
# Database Sync Helpers (for shared model storage via Supabase PostgreSQL)
# ---------------------------------------------------------------------------
def _save_model_to_db(file_path):
    """Upload a local model file to the MLModelStore database table."""
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
    """Download a model file from the MLModelStore database table to local disk."""
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
# 1. NEURAL COLLABORATIVE FILTERING MODEL
# ═══════════════════════════════════════════════════════════════════════════
class NCFModel:
    """
    Neural Collaborative Filtering using scikit-learn MLPRegressor.
    
    Instead of a simple matrix factorization (SVD), this uses a neural network
    that takes user_id and product_id as encoded features, concatenates them
    with auxiliary features (price bucket, category), and predicts an
    interaction score.

    Architecture:
      Input:  [user_encoded, product_encoded, category_encoded, price_bucket]
      Hidden: 128 → 64 → 32 (ReLU activations)
      Output: predicted interaction score
    """

    def __init__(self):
        self.model = None
        self.user_encoder = LabelEncoder()
        self.product_encoder = LabelEncoder()
        self.category_encoder = LabelEncoder()
        self.scaler = MinMaxScaler()
        self.is_trained = False
        self.training_metrics = {}

    def _build_interaction_matrix(self):
        """Collect all user-product interactions from the database."""
        from .models import ViewHistory, WishlistItem, Review, ProductOwnership

        interactions = []

        # Views (implicit signal, weight=1.0 per view, max 5)
        views = ViewHistory.objects.all().values('customer_id', 'product_id', 'view_count')
        for v in views:
            interactions.append({
                'user_id': v['customer_id'],
                'product_id': v['product_id'],
                'score': min(v['view_count'], 5) * 1.0,
                'source': 'view'
            })

        # Wishlist (intent signal, weight=3.0)
        wishlist_items = WishlistItem.objects.filter(
            wishlist__customer__isnull=False
        ).values('wishlist__customer_id', 'product_id')
        for w in wishlist_items:
            interactions.append({
                'user_id': w['wishlist__customer_id'],
                'product_id': w['product_id'],
                'score': 3.0,
                'source': 'wishlist'
            })

        # Reviews (explicit signal, weight=rating)
        reviews = Review.objects.all().values('customer_id', 'product_id', 'rating')
        for r in reviews:
            interactions.append({
                'user_id': r['customer_id'],
                'product_id': r['product_id'],
                'score': float(r['rating']),
                'source': 'review'
            })

        # Purchases (strongest signal, weight=5.0)
        purchases = ProductOwnership.objects.all().values('customer_id', 'product_id')
        for p in purchases:
            interactions.append({
                'user_id': p['customer_id'],
                'product_id': p['product_id'],
                'score': 5.0,
                'source': 'purchase'
            })

        if not interactions:
            return None

        df = pd.DataFrame(interactions)
        # Aggregate: sum scores per (user, product) pair
        df = df.groupby(['user_id', 'product_id'])['score'].sum().reset_index()
        return df

    def _prepare_features(self, interactions_df, products_df):
        """Build a rich feature matrix with user stats, product stats, and cross features."""
        from .models import ViewHistory, Review, ProductOwnership, WishlistItem

        # ── User-level statistics ──
        user_stats = {}
        for uid in interactions_df['user_id'].unique():
            user_interactions = interactions_df[interactions_df['user_id'] == uid]
            user_stats[uid] = {
                'avg_score': user_interactions['score'].mean(),
                'n_interactions': len(user_interactions),
                'score_std': user_interactions['score'].std() if len(user_interactions) > 1 else 0,
                'n_unique_products': user_interactions['product_id'].nunique(),
            }
        user_stats_df = pd.DataFrame(user_stats).T
        user_stats_df.index.name = 'user_id'
        user_stats_df = user_stats_df.reset_index()

        # ── Product-level statistics ──  
        product_stats = {}
        
        # Calculate from raw data
        all_reviews = list(Review.objects.values('product_id', 'rating'))
        review_by_prod = {}
        for r in all_reviews:
            review_by_prod.setdefault(r['product_id'], []).append(r['rating'])
        
        all_views = dict(ViewHistory.objects.values_list('product_id', 'view_count'))
        all_purchases = {}
        for po in ProductOwnership.objects.values('product_id'):
            all_purchases[po['product_id']] = all_purchases.get(po['product_id'], 0) + 1
        
        all_wishlist = {}
        for wi in WishlistItem.objects.values('product__id'):
            pid = wi['product__id']
            all_wishlist[pid] = all_wishlist.get(pid, 0) + 1

        for pid in interactions_df['product_id'].unique():
            ratings = review_by_prod.get(pid, [])
            product_stats[pid] = {
                'prod_avg_rating': sum(ratings) / len(ratings) if ratings else 0,
                'prod_n_reviews': len(ratings),
                'prod_total_views': all_views.get(pid, 0),
                'prod_n_purchases': all_purchases.get(pid, 0),
                'prod_n_wishlist': all_wishlist.get(pid, 0),
            }
        product_stats_df = pd.DataFrame(product_stats).T
        product_stats_df.index.name = 'product_id'
        product_stats_df = product_stats_df.reset_index()

        # ── Per-user per-product view count ──
        user_product_views = {}
        for vh in ViewHistory.objects.values('customer_id', 'product_id', 'view_count'):
            key = (vh['customer_id'], vh['product_id'])
            user_product_views[key] = vh['view_count']
        
        # Add user_view_count column to interactions_df
        interactions_df['user_view_count'] = interactions_df.apply(
            lambda row: user_product_views.get((row['user_id'], row['product_id']), 0), axis=1
        )

        # ── Merge everything ──
        merged = interactions_df.merge(
            products_df[['id', 'category__name', 'price']],
            left_on='product_id', right_on='id', how='left'
        )
        merged = merged.merge(user_stats_df, on='user_id', how='left')
        merged = merged.merge(product_stats_df, on='product_id', how='left')

        # ── Encode categoricals ──
        merged['category__name'] = merged['category__name'].fillna('Unknown')
        merged['category_enc'] = self.category_encoder.fit_transform(merged['category__name'])

        # ── Price features ──
        merged['price'] = pd.to_numeric(merged['price'], errors='coerce').fillna(0)
        price_mean = merged['price'].mean() if merged['price'].mean() > 0 else 1
        merged['price_normalized'] = merged['price'] / price_mean
        merged['price_bucket'] = pd.cut(
            merged['price'], bins=5, labels=[0, 1, 2, 3, 4], duplicates='drop'
        ).astype(float).fillna(2)

        # ── User-category affinity (how often this user interacts with this category) ──
        user_cat_counts = merged.groupby(['user_id', 'category_enc']).size().reset_index(name='user_cat_count')
        merged = merged.merge(user_cat_counts, on=['user_id', 'category_enc'], how='left')
        merged['user_cat_affinity'] = merged['user_cat_count'] / merged['n_interactions'].clip(lower=1)

        # ── Feature matrix (14 features) ──
        feature_cols = [
            'category_enc',
            'price_normalized',
            'price_bucket',
            # User stats
            'avg_score',
            'n_interactions',
            'score_std',
            'n_unique_products',
            # Product stats
            'prod_avg_rating',
            'prod_n_reviews',
            'prod_total_views',
            'prod_n_purchases',
            'prod_n_wishlist',
            # Cross features
            'user_cat_affinity',
            'user_view_count',
        ]

        # Fill NaN
        for col in feature_cols:
            merged[col] = merged[col].fillna(0)

        X = merged[feature_cols].values.astype(float)
        y = merged['score'].values.astype(float)

        # Normalize features
        X = self.scaler.fit_transform(X)

        return X, y

    def train(self, epochs=50, verbose=True):
        """Train the NCF model on all available interaction data."""
        from .models import Product

        if verbose:
            print("📊 Loading interaction data...")

        interactions_df = self._build_interaction_matrix()
        if interactions_df is None or len(interactions_df) < 5:
            msg = "⚠️  Not enough interaction data to train NCF (need at least 5 interactions)"
            if verbose:
                print(msg)
            logger.warning(msg)
            self.is_trained = False
            return False

        # Load product metadata
        products_df = pd.DataFrame(list(
            Product.objects.all().values('id', 'category__name', 'price')
        ))

        if verbose:
            print(f"   Found {len(interactions_df)} user-product interactions")
            print(f"   Unique users: {interactions_df['user_id'].nunique()}")
            print(f"   Unique products: {interactions_df['product_id'].nunique()}")

        # Prepare features
        X, y = self._prepare_features(interactions_df, products_df)

        # Train/test split for evaluation
        if len(X) > 10:
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42
            )
        else:
            X_train, y_train = X, y
            X_test, y_test = X, y

        if verbose:
            print(f"\n🧠 Training Neural Collaborative Filtering model...")
            print(f"   Architecture: Input({X.shape[1]}) → 128 → 64 → 32 → 16 → 1")
            print(f"   Training samples: {len(X_train)}, Test samples: {len(X_test)}")

        # Build and train MLP — tuned for small-to-large datasets
        self.model = MLPRegressor(
            hidden_layer_sizes=(128, 64, 32, 16),
            activation='relu',
            solver='adam',
            learning_rate='adaptive',
            learning_rate_init=0.0003,
            max_iter=epochs,
            batch_size=min(64, len(X_train)),
            early_stopping=True if len(X_train) > 20 else False,
            validation_fraction=0.15 if len(X_train) > 20 else 0.0,
            n_iter_no_change=50,
            tol=1e-6,
            random_state=42,
            verbose=False
        )

        self.model.fit(X_train, y_train)

        # Evaluate
        train_score = self.model.score(X_train, y_train)
        test_score = self.model.score(X_test, y_test)

        # Calculate Hit Rate @ K
        if len(X_test) > 0:
            predictions = self.model.predict(X_test)
            hit_rate = self._calculate_hit_rate(y_test, predictions, k=10)
        else:
            hit_rate = 0.0

        self.training_metrics = {
            'train_r2': round(train_score, 4),
            'test_r2': round(test_score, 4),
            'hit_rate_at_10': round(hit_rate, 4),
            'n_interactions': len(interactions_df),
            'n_users': interactions_df['user_id'].nunique(),
            'n_products': interactions_df['product_id'].nunique(),
            'n_epochs': self.model.n_iter_,
            'final_loss': round(self.model.loss_, 6) if hasattr(self.model, 'loss_') else None,
            'trained_at': time.strftime('%Y-%m-%d %H:%M:%S'),
        }

        if verbose:
            print(f"\n📈 Training Results:")
            print(f"   Epochs completed: {self.model.n_iter_}")
            print(f"   Final loss:       {self.training_metrics['final_loss']}")
            print(f"   Train R² score:   {train_score:.4f}")
            print(f"   Test R² score:    {test_score:.4f}")
            print(f"   Hit Rate @10:     {hit_rate:.4f}")

        self.is_trained = True
        return True

    def _calculate_hit_rate(self, y_true, y_pred, k=10):
        """Calculate Hit Rate @ K — how often the top-K includes relevant items."""
        if len(y_true) == 0:
            return 0.0
        # Consider items with true score > median as "relevant"
        threshold = np.median(y_true)
        relevant = y_true > threshold
        # Check if top-K predicted items include relevant items
        top_k_indices = np.argsort(y_pred)[-k:]
        hits = np.sum(relevant[top_k_indices])
        total_relevant = np.sum(relevant)
        if total_relevant == 0:
            return 0.0
        return hits / min(total_relevant, k)

    def predict_for_user(self, user_id, all_product_ids, products_df):
        """Predict interaction scores for a user across all products."""
        if not self.is_trained or self.model is None:
            return {}
        
        from .models import ViewHistory, Review, ProductOwnership, WishlistItem

        # ── Precompute user-level stats from DB ──
        user_reviews = list(Review.objects.filter(customer_id=user_id).values('product_id', 'rating'))
        user_views = dict(ViewHistory.objects.filter(customer_id=user_id).values_list('product_id', 'view_count'))
        user_purchases = set(ProductOwnership.objects.filter(customer_id=user_id).values_list('product_id', flat=True))
        
        # User-level stats (same as training)
        all_user_scores = []
        for r in user_reviews:
            all_user_scores.append(float(r['rating']))
        for _ in user_views:
            all_user_scores.append(1.0)  # view implicit score
        for _ in user_purchases:
            all_user_scores.append(5.0)  # purchase score
        
        if all_user_scores:
            user_avg_score = sum(all_user_scores) / len(all_user_scores)
            user_n_interactions = len(all_user_scores)
            user_score_std = (sum((s - user_avg_score) ** 2 for s in all_user_scores) / len(all_user_scores)) ** 0.5 if len(all_user_scores) > 1 else 0
            user_n_unique = len(set(list(user_views.keys()) + [r['product_id'] for r in user_reviews] + list(user_purchases)))
        else:
            user_avg_score = 0
            user_n_interactions = 0
            user_score_std = 0
            user_n_unique = 0

        # User category interaction counts
        user_cat_counts = {}
        for pid in list(user_views.keys()) + [r['product_id'] for r in user_reviews]:
            prod_row = products_df[products_df['id'] == pid]
            if not prod_row.empty:
                cat = prod_row['category__name'].values[0] or 'Unknown'
                user_cat_counts[cat] = user_cat_counts.get(cat, 0) + 1

        # ── Precompute product-level stats ──
        all_prod_reviews = list(Review.objects.values('product_id', 'rating'))
        review_by_prod = {}
        for r in all_prod_reviews:
            review_by_prod.setdefault(r['product_id'], []).append(r['rating'])
        
        all_prod_views = dict(ViewHistory.objects.values_list('product_id', 'view_count'))
        
        purchase_counts = {}
        for po in ProductOwnership.objects.values('product_id'):
            purchase_counts[po['product_id']] = purchase_counts.get(po['product_id'], 0) + 1
        
        wishlist_counts = {}
        for wi in WishlistItem.objects.values('product__id'):
            wishlist_counts[wi['product__id']] = wishlist_counts.get(wi['product__id'], 0) + 1

        # ── Price normalization (use same mean as would be computed from all products) ──
        all_prices = [float(row['price'] or 0) for _, row in products_df.iterrows()]
        price_mean = sum(all_prices) / len(all_prices) if all_prices else 1
        if price_mean == 0:
            price_mean = 1

        # ── Predict for all product IDs ──
        scores = {}
        for pid in all_product_ids:
            prod_row = products_df[products_df['id'] == pid]
            if prod_row.empty:
                continue

            cat_name = prod_row['category__name'].values[0] or 'Unknown'
            price = float(prod_row['price'].values[0] or 0)

            # Category encoding
            if cat_name in self.category_encoder.classes_:
                cat_enc = self.category_encoder.transform([cat_name])[0]
            else:
                cat_enc = 0

            # Price features
            price_normalized = price / price_mean
            price_bucket = min(int(price / max(1, max(all_prices) / 5)), 4) if all_prices else 2

            # Product stats
            p_ratings = review_by_prod.get(pid, [])
            prod_avg_rating = sum(p_ratings) / len(p_ratings) if p_ratings else 0
            prod_n_reviews = len(p_ratings)
            prod_total_views = all_prod_views.get(pid, 0)
            prod_n_purchases = purchase_counts.get(pid, 0)
            prod_n_wishlist = wishlist_counts.get(pid, 0)

            # User-category affinity
            user_cat_affinity = user_cat_counts.get(cat_name, 0) / max(user_n_interactions, 1)

            # Per-user view count for THIS product (0 if never viewed)
            user_view_count = user_views.get(pid, 0)

            # Build feature vector — MUST match training order (14 features)
            features = np.array([[
                cat_enc,
                price_normalized,
                price_bucket,
                user_avg_score,
                user_n_interactions,
                user_score_std,
                user_n_unique,
                prod_avg_rating,
                prod_n_reviews,
                prod_total_views,
                prod_n_purchases,
                prod_n_wishlist,
                user_cat_affinity,
                user_view_count,
            ]])
            features = self.scaler.transform(features)

            score = self.model.predict(features)[0]
            scores[pid] = max(score, 0)

        return scores

    def save(self, path=None):
        """Save trained model to disk and to the shared database."""
        os.makedirs(ML_MODELS_DIR, exist_ok=True)
        joblib.dump(self.model, path or NCF_MODEL_PATH)
        joblib.dump({
            'user_encoder': self.user_encoder,
            'product_encoder': self.product_encoder,
            'category_encoder': self.category_encoder,
            'scaler': self.scaler,
            'metrics': self.training_metrics,
        }, ENCODERS_PATH)
        joblib.dump(self.training_metrics, METRICS_PATH)
        logger.info("✅ NCF model saved to %s", ML_MODELS_DIR)

        # Sync to shared database
        for file_path in [path or NCF_MODEL_PATH, ENCODERS_PATH, METRICS_PATH]:
            _save_model_to_db(file_path)

    def load(self, path=None):
        """Load trained model from disk, falling back to database if local files are missing."""
        model_path = path or NCF_MODEL_PATH

        # If local files are missing, try downloading from database
        if not os.path.exists(model_path) or not os.path.exists(ENCODERS_PATH):
            logger.info("📥 Local NCF model files missing, trying database...")
            for file_path in [model_path, ENCODERS_PATH, METRICS_PATH]:
                _load_model_from_db(file_path)

        # Now try loading from local files
        if not os.path.exists(model_path) or not os.path.exists(ENCODERS_PATH):
            return False

        try:
            self.model = joblib.load(model_path)
            encoders = joblib.load(ENCODERS_PATH)
            self.user_encoder = encoders['user_encoder']
            self.product_encoder = encoders['product_encoder']
            self.category_encoder = encoders['category_encoder']
            self.scaler = encoders['scaler']
            self.training_metrics = encoders.get('metrics', {})
            self.is_trained = True
            logger.info("✅ NCF model loaded from %s", model_path)
            return True
        except Exception as e:
            logger.error("❌ Failed to load NCF model: %s", e)
            return False


# ═══════════════════════════════════════════════════════════════════════════
# 2. CONTENT-BASED FILTERING MODEL
# ═══════════════════════════════════════════════════════════════════════════
class ContentBasedModel:
    """
    Content-Based filtering using TF-IDF similarity.
    
    Builds a text profile for each product from name + description + brand +
    category, then computes cosine similarity between all product pairs.
    
    Enhancement over the original:
    - Category-aware weighting (same-category products get a boost)
    - Price-range similarity incorporated
    """

    def __init__(self):
        self.similarity_matrix = None
        self.products_df = None
        self.indices = None
        self.tfidf_matrix = None
        self.is_trained = False

    def train(self, verbose=True):
        """Build the content similarity matrix from all products."""
        from .models import Product

        if verbose:
            print("\n📝 Training Content-Based model...")

        products = Product.objects.all().values(
            'id', 'name', 'description', 'brand', 'category__name', 'price'
        )
        self.products_df = pd.DataFrame(list(products))

        if self.products_df.empty:
            if verbose:
                print("   ⚠️  No products found in database")
            return False

        # Build composite text feature — weight category more heavily
        self.products_df['content'] = (
            self.products_df['name'].fillna('') + " " +
            self.products_df['description'].fillna('') + " " +
            self.products_df['brand'].fillna('') + " " +
            # Repeat category 3x for higher weight
            (self.products_df['category__name'].fillna('') + " ") * 3
        ).str.lower().str.strip()

        self.products_df['price'] = pd.to_numeric(
            self.products_df['price'], errors='coerce'
        ).fillna(0)

        # Build TF-IDF vectors
        tfidf = TfidfVectorizer(
            max_features=5000,
            ngram_range=(1, 2),  # Unigrams + bigrams for richer features
            min_df=1,
            max_df=0.95,
        )
        self.tfidf_matrix = tfidf.fit_transform(self.products_df['content'])

        # Compute cosine similarity
        self.similarity_matrix = cosine_similarity(self.tfidf_matrix)

        # Category boost: products in the same category get +0.15 similarity
        categories = self.products_df['category__name'].values
        for i in range(len(categories)):
            for j in range(i + 1, len(categories)):
                if categories[i] and categories[j] and categories[i] == categories[j]:
                    self.similarity_matrix[i][j] += 0.15
                    self.similarity_matrix[j][i] += 0.15

        # Build product index mapping
        self.indices = pd.Series(
            self.products_df.index,
            index=self.products_df['id']
        ).drop_duplicates()

        self.is_trained = True

        if verbose:
            print(f"   ✅ Built similarity matrix for {len(self.products_df)} products")
            print(f"   TF-IDF features: {self.tfidf_matrix.shape[1]}")

        return True

    def get_similar_products(self, product_id, top_n=10):
        """Get top-N most similar products to a given product."""
        if not self.is_trained or product_id not in self.indices.index:
            return {}

        idx = self.indices[product_id]
        sim_scores = self.similarity_matrix[idx]

        scores = {}
        for i, score in enumerate(sim_scores):
            pid = self.products_df.iloc[i]['id']
            if pid != product_id and score > 0.05:
                scores[pid] = float(score)

        return dict(sorted(scores.items(), key=lambda x: x[1], reverse=True)[:top_n])

    def get_user_content_scores(self, user_interactions, exclude_ids=None):
        """
        Given a dict of {product_id: interaction_weight}, compute content-based
        scores for all other products.
        """
        if not self.is_trained or not user_interactions:
            return {}

        exclude_ids = set(exclude_ids or [])
        scores = {}

        for product_id, weight in user_interactions.items():
            if product_id not in self.indices.index:
                continue
            idx = self.indices[product_id]
            sim_scores = self.similarity_matrix[idx]

            for i in range(len(sim_scores)):
                pid = self.products_df.iloc[i]['id']
                if pid not in exclude_ids and sim_scores[i] > 0.05:
                    scores[pid] = scores.get(pid, 0) + (sim_scores[i] * weight)

        return scores

    def save(self, path=None):
        """Save content model to disk and to the shared database."""
        os.makedirs(ML_MODELS_DIR, exist_ok=True)
        save_path = path or CONTENT_MODEL_PATH
        joblib.dump({
            'similarity_matrix': self.similarity_matrix,
            'products_df': self.products_df,
            'indices': self.indices,
        }, save_path)

        # Sync to shared database
        _save_model_to_db(save_path)

    def load(self, path=None):
        """Load content model from disk, falling back to database if local file is missing."""
        model_path = path or CONTENT_MODEL_PATH

        # If local file is missing, try downloading from database
        if not os.path.exists(model_path):
            logger.info("📥 Local content model missing, trying database...")
            _load_model_from_db(model_path)

        if not os.path.exists(model_path):
            return False
        try:
            data = joblib.load(model_path)
            self.similarity_matrix = data['similarity_matrix']
            self.products_df = data['products_df']
            self.indices = data['indices']
            self.is_trained = True
            return True
        except Exception as e:
            logger.error("❌ Failed to load content model: %s", e)
            return False


# ═══════════════════════════════════════════════════════════════════════════
# 3. HYBRID RECOMMENDER (Main Entry Point)
# ═══════════════════════════════════════════════════════════════════════════
class HybridRecommender:
    """
    Singleton hybrid recommender combining NCF + Content-Based + Popularity.

    Scoring formula per product:
      final_score = (α × ncf_score) + (β × content_score) + (γ × popularity_score)
                    + search_boost + price_sensitivity_boost
    
    Where α=0.5, β=0.3, γ=0.2 (learned/tunable weights).
    
    Cold-start handling:
      - New users (no interactions): popularity + content-based on categories
      - New products (no interactions): content-based only
    """

    _instance = None
    _lock = threading.Lock()

    # Hybrid weights
    WEIGHT_NCF = 0.5
    WEIGHT_CONTENT = 0.3
    WEIGHT_POPULARITY = 0.2

    # Temporal decay half-life values are tuned by interaction intent:
    # purchases stay meaningful longer, while views should reflect recency.
    DECAY_PURCHASE_DAYS = 90
    DECAY_WISHLIST_DAYS = 45
    DECAY_REVIEW_DAYS = 60
    DECAY_VIEW_DAYS = 30

    # Newly added in-stock products deserve a temporary discovery boost so
    # they can surface before historical popularity signals accumulate.
    NEW_PRODUCT_MAX_AGE_DAYS = 30

    CACHE_TTL = getattr(settings, 'CACHE_TTL_LONG', 7200)

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    inst = super().__new__(cls)
                    inst._init_models()
                    cls._instance = inst
        return cls._instance

    def _init_models(self):
        """Initialize sub-models, try to load, and auto-train in background if needed."""
        self.ncf = NCFModel()
        self.content = ContentBasedModel()
        self._loaded = False
        self._training = False
        self._last_runtime_weights = {}

        # Try loading persisted models (checks local disk, then DB)
        ncf_loaded = self.ncf.load()
        content_loaded = self.content.load()
        self._loaded = ncf_loaded or content_loaded

        if self._loaded:
            logger.info("✅ Recommender loaded saved models from disk")
            if not getattr(settings, 'ML_DISABLE_BACKGROUND_JOBS', False):
                # Pre-generate recommendations for active users in background
                # only outside test mode where background DB writes are expected.
                self._pregenerate_in_background()
        else:
            logger.info("ℹ️  No saved models found — starting background training...")
            if not getattr(settings, 'ML_DISABLE_BACKGROUND_JOBS', False):
                self._train_in_background()

    def _pregenerate_in_background(self):
        """Pre-generate recommendations for active customers so pages load instantly."""
        import threading
        def _bg_pregen():
            try:
                from .models import Recommendation
                from django.contrib.auth import get_user_model
                User = get_user_model()
                # Only customers who don't already have recommendations
                customers = User.objects.filter(role='customer')
                for user in customers:
                    has_recs = Recommendation.objects.filter(customer=user).exists()
                    if not has_recs:
                        try:
                            recs = self.recommend(user, top_n=10, ignore_cache=True)
                            if recs:
                                for rec in recs:
                                    Recommendation.objects.create(
                                        customer=user,
                                        product_id=rec['product_id'],
                                        score=rec.get('score', 0),
                                        reason=rec.get('reason', 'AI önerisi')
                                    )
                                logger.info("📦 Pre-generated recs for user %s", user.id)
                        except Exception as e:
                            logger.debug("Pre-gen failed for user %s: %s", user.id, e)
                logger.info("✅ Background pre-generation complete")
            except Exception as e:
                logger.warning("⚠️  Background pre-generation failed: %s", e)
        t = threading.Thread(target=_bg_pregen, daemon=True)
        t.start()

    def _train_in_background(self):
        """Run training in a background thread so it never blocks requests."""
        if self._training:
            return
        self._training = True
        import threading
        def _bg_train():
            try:
                self.train(epochs=300, verbose=False)
                logger.info("✅ Background training complete")
            except Exception as e:
                logger.warning("⚠️  Background auto-train failed: %s", e)
            finally:
                self._training = False
        t = threading.Thread(target=_bg_train, daemon=True)
        t.start()

    def train(self, epochs=300, verbose=True):
        """Train all sub-models and persist them."""
        if verbose:
            print("=" * 60)
            print("🚀 BekoSIRS ML Recommendation System — Training Pipeline")
            print("=" * 60)

        start_time = time.time()

        # 1. Train content model (always works if products exist)
        content_ok = self.content.train(verbose=verbose)

        # 2. Train NCF model (needs interaction data)
        ncf_ok = self.ncf.train(epochs=epochs, verbose=verbose)

        # 3. Save models
        if content_ok:
            self.content.save()
        if ncf_ok:
            self.ncf.save()

        elapsed = time.time() - start_time

        if verbose:
            print(f"\n{'=' * 60}")
            print(f"✅ Training complete in {elapsed:.1f}s")
            print(f"   NCF model:     {'✅ trained' if ncf_ok else '⚠️  skipped (not enough data)'}")
            print(f"   Content model: {'✅ trained' if content_ok else '⚠️  skipped (no products)'}")
            print(f"   Models saved:  {ML_MODELS_DIR}")
            print(f"{'=' * 60}")

        self._loaded = content_ok or ncf_ok
        return content_ok or ncf_ok

    def recommend(self, user, top_n=10, ignore_cache=False, exclude_ids=None):
        """
        Main recommendation entry point.
        
        Returns list of dicts: [{'product': Product, 'product_id': int, 'score': float, 'reason': str}]
        """
        # Auto-train content model if not loaded
        if not self.content.is_trained:
            self.content.train(verbose=False)
            if self.content.is_trained:
                self.content.save()

        if self.content.products_df is None or self.content.products_df.empty:
            return []

        exclude_ids = set(exclude_ids or [])

        # Gather user's interaction history
        user_interactions = self._get_user_interactions(user, ignore_cache)
        owned_product_ids = self._get_owned_product_ids(user)
        exclude_ids.update(owned_product_ids)  # Don't recommend already purchased items

        # Adaptive weights make cold-start users rely on safer popularity
        # signals while active users get stronger personalized NCF ranking.
        weight_details = self._build_weight_details(user_interactions)
        self._last_runtime_weights[user.id] = weight_details

        final_scores = {}
        reasons = {}  # Stores (source_type, extra_info) tuples

        all_product_ids = self.content.products_df['id'].tolist()

        # ── 1. NCF Scores ──
        if self.ncf.is_trained:
            ncf_scores = self.ncf.predict_for_user(
                user.id, all_product_ids, self.content.products_df
            )
            if ncf_scores:
                max_ncf = max(ncf_scores.values()) or 1
                for pid, score in ncf_scores.items():
                    if pid not in exclude_ids:
                        normalized = (score / max_ncf) * weight_details['ncf']
                        final_scores[pid] = normalized
                        reasons[pid] = ('ncf', None)

        # ── 2. Content-Based Scores ──
        if self.content.is_trained and user_interactions:
            content_scores = self.content.get_user_content_scores(
                user_interactions, exclude_ids
            )
            if content_scores:
                max_content = max(content_scores.values()) or 1
                for pid, score in content_scores.items():
                    if pid not in exclude_ids:
                        normalized = (score / max_content) * weight_details['content']
                        final_scores[pid] = final_scores.get(pid, 0) + normalized
                        if pid not in reasons:
                            reasons[pid] = ('content', None)

        # ── 3. Popularity Scores (cold-start fallback) ──
        popularity_scores = self._get_popularity_scores()
        if popularity_scores:
            max_pop = max(popularity_scores.values()) or 1
            for pid, score in popularity_scores.items():
                if pid not in exclude_ids:
                    normalized = (score / max_pop) * weight_details['popularity']
                    final_scores[pid] = final_scores.get(pid, 0) + normalized
                    if pid not in reasons:
                        reasons[pid] = ('popular', None)

        # ── 4. Search History Boost ──
        search_boosts = self._get_search_boosts(user)
        for pid, boost in search_boosts.items():
            if pid not in exclude_ids:
                final_scores[pid] = final_scores.get(pid, 0) + boost
                reasons[pid] = ('search', None)

        # ── 5. Price Sensitivity Boost ──
        price_boosts = self._get_price_sensitivity_boosts(user)
        for pid, boost in price_boosts.items():
            if pid not in exclude_ids and pid in final_scores:
                final_scores[pid] += boost
                if boost > 0.1 and reasons.get(pid, (None,))[0] not in ('search',):
                    reasons[pid] = ('price', None)

        # ── 6. New Product Discovery Boost ──
        for pid, boost in self._get_new_product_boost().items():
            if pid not in exclude_ids:
                final_scores[pid] = final_scores.get(pid, 0) + boost
                if boost > 0 and reasons.get(pid, (None,))[0] not in ('search', 'price'):
                    reasons[pid] = ('new', None)

        # ── Format and return ──
        return self._format_results(final_scores, reasons, top_n, exclude_ids, user=user)

    # ───────────────────────────────────────────────────────────────────────
    # Helper Methods
    # ───────────────────────────────────────────────────────────────────────

    def _count_meaningful_interactions(self, user_interactions):
        """
        Count positive interaction entries used for user-tier classification.

        We intentionally ignore zero/negative entries so cold-start detection is
        not distorted by future negative-feedback signals such as dismissals.
        """
        return sum(1 for score in user_interactions.values() if score > 0)

    def _get_user_tier(self, user_interactions):
        """Map interaction depth to a human-readable recommendation tier."""
        interaction_count = self._count_meaningful_interactions(user_interactions)
        if interaction_count == 0:
            return 'cold_start'
        if interaction_count < 5:
            return 'light'
        if interaction_count < 20:
            return 'balanced'
        return 'active'

    def _get_adaptive_weights(self, user_interactions):
        """
        Choose hybrid weights dynamically from the user's interaction depth.

        Cold-start users get popularity-heavy weights because collaborative
        models are unreliable without enough history. As the user engages more,
        we progressively increase the NCF share to favor personalization.
        """
        interaction_count = self._count_meaningful_interactions(user_interactions)

        if interaction_count == 0:
            return (0.0, 0.2, 0.8)
        if interaction_count < 5:
            return (0.2, 0.3, 0.5)
        if interaction_count < 20:
            return (0.4, 0.3, 0.3)
        return (0.6, 0.3, 0.1)

    def _build_weight_details(self, user_interactions):
        """Build the response-ready adaptive weight payload for one user."""
        ncf_weight, content_weight, popularity_weight = self._get_adaptive_weights(user_interactions)
        return {
            'ncf': ncf_weight,
            'content': content_weight,
            'popularity': popularity_weight,
            'user_tier': self._get_user_tier(user_interactions),
            'interaction_count': self._count_meaningful_interactions(user_interactions),
        }

    def get_runtime_weight_details(self, user, ignore_cache=False):
        """
        Return adaptive runtime weights for the given user.

        Views can call this even when recommendations are served from cache so
        the frontend always receives the same weight logic the scorer would use.
        """
        cached_details = self._last_runtime_weights.get(user.id)
        if cached_details is not None and not ignore_cache:
            return cached_details

        user_interactions = self._get_user_interactions(user, ignore_cache=ignore_cache)
        weight_details = self._build_weight_details(user_interactions)
        self._last_runtime_weights[user.id] = weight_details
        return weight_details

    def _get_user_interactions(self, user, ignore_cache=False):
        """Gather user interaction scores: {product_id: weight}."""
        from .models import ProductOwnership, Review, WishlistItem, ViewHistory, Recommendation

        cache_key = f'ml_user_interactions_{user.id}'
        if not ignore_cache:
            cached = cache.get(cache_key)
            if cached is not None:
                return cached

        interactions = {}

        # Purchases are a durable preference signal, so we decay them slowly.
        for ownership in ProductOwnership.objects.filter(
            customer=user
        ).values('product_id', 'purchase_date'):
            decay = temporal_weight(
                ownership['purchase_date'],
                half_life_days=self.DECAY_PURCHASE_DAYS,
            )
            interactions[ownership['product_id']] = (
                interactions.get(ownership['product_id'], 0) + (5.0 * decay)
            )

        # Positive reviews stay useful for longer because they capture explicit intent.
        for r in Review.objects.filter(
            customer=user, rating__gt=3
        ).values('product_id', 'rating', 'created_at'):
            decay = temporal_weight(
                r['created_at'],
                half_life_days=self.DECAY_REVIEW_DAYS,
            )
            interactions[r['product_id']] = (
                interactions.get(r['product_id'], 0) + (float(r['rating']) * decay)
            )

        # Wishlist intent can go stale faster than a purchase but should still
        # outlive casual browsing, so it gets a medium half-life.
        for item in WishlistItem.objects.filter(
            wishlist__customer=user
        ).values('product_id', 'added_at'):
            decay = temporal_weight(
                item['added_at'],
                half_life_days=self.DECAY_WISHLIST_DAYS,
            )
            interactions[item['product_id']] = (
                interactions.get(item['product_id'], 0) + (3.0 * decay)
            )

        # Views reflect short-term intent, so they decay fastest. We still cap
        # view_count to prevent one heavily refreshed page from dominating.
        for vh in ViewHistory.objects.filter(customer=user).values('product_id', 'view_count', 'viewed_at'):
            weight = min(vh['view_count'], 15)
            decay = temporal_weight(
                vh['viewed_at'],
                half_life_days=self.DECAY_VIEW_DAYS,
            )
            interactions[vh['product_id']] = interactions.get(vh['product_id'], 0) + (weight * decay)

        # Dismissed recommendations (weight=-3.0) — negative signal
        # Mirrors wishlist's +3.0 but inverted: penalizes similar products
        for pid in Recommendation.objects.filter(
            customer=user, dismissed=True
        ).values_list('product_id', flat=True):
            interactions[pid] = interactions.get(pid, 0) - 3.0

        cache.set(cache_key, interactions, 300)
        return interactions

    def _get_owned_product_ids(self, user):
        """Get IDs of products the user already owns."""
        from .models import ProductOwnership
        return set(
            ProductOwnership.objects.filter(
                customer=user
            ).values_list('product_id', flat=True)
        )

    def _get_popularity_scores(self):
        """Calculate product popularity from aggregate interactions."""
        cache_key = 'ml_popularity_scores'
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        from .models import ViewHistory, Review, ProductOwnership
        from django.db.models import Count, Sum

        scores = {}

        # Count interactions per product
        view_counts = dict(
            ViewHistory.objects.values('product_id').annotate(
                total=Sum('view_count')
            ).values_list('product_id', 'total')
        )
        review_counts = dict(
            Review.objects.values('product_id').annotate(
                total=Count('id')
            ).values_list('product_id', 'total')
        )
        purchase_counts = dict(
            ProductOwnership.objects.values('product_id').annotate(
                total=Count('id')
            ).values_list('product_id', 'total')
        )

        # Weighted popularity
        all_pids = set(view_counts) | set(review_counts) | set(purchase_counts)
        for pid in all_pids:
            scores[pid] = (
                (view_counts.get(pid, 0) * 1.0) +
                (review_counts.get(pid, 0) * 3.0) +
                (purchase_counts.get(pid, 0) * 5.0)
            )

        cache.set(cache_key, scores, 1800)  # Cache for 30 min
        return scores

    def _get_new_product_boost(self):
        """
        Return a short-lived boost for recent in-stock catalog additions.

        Popularity-heavy systems naturally underserve fresh products because
        they start with zero interaction history. This helper injects a small,
        time-boxed exploration bonus so users can discover new arrivals.
        """
        from .models import Product

        boosts = {}
        now = dt_datetime.now(dt_timezone.utc)

        recent_products = Product.objects.filter(
            created_at__gte=now - timedelta(days=self.NEW_PRODUCT_MAX_AGE_DAYS),
            stock__gt=0,
        ).values('id', 'created_at')

        for product in recent_products:
            created_at = product['created_at']
            if created_at is None:
                continue

            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=dt_timezone.utc)

            days_old = max(0, (now - created_at).days)
            # The boost decays in coarse buckets to keep the behavior easy to
            # explain to product teams and stable across retraining cycles.
            if days_old <= 7:
                boosts[product['id']] = 0.4
            elif days_old <= 14:
                boosts[product['id']] = 0.25
            elif days_old <= self.NEW_PRODUCT_MAX_AGE_DAYS:
                boosts[product['id']] = 0.1

        return boosts

    def _get_search_boosts(self, user):
        """Boost products matching user's recent search terms."""
        from .models import SearchHistory

        if self.content.products_df is None or 'content' not in self.content.products_df.columns:
            return {}

        boosts = {}
        recent_searches = SearchHistory.objects.filter(
            customer=user
        ).order_by('-created_at')[:5]

        for search in recent_searches:
            term = search.query.lower()
            matches = self.content.products_df[
                self.content.products_df['content'].str.contains(term, na=False)
            ]
            for _, row in matches.iterrows():
                boosts[row['id']] = boosts.get(row['id'], 0) + 2.0

        return boosts

    def _get_price_sensitivity_boosts(self, user):
        """Boost products in the user's typical price range."""
        from .models import ProductOwnership, ViewHistory

        boosts = {}
        if self.content.products_df is None or 'price' not in self.content.products_df.columns:
            return boosts

        owned_prices = list(ProductOwnership.objects.filter(
            customer=user
        ).values_list('product__price', flat=True))
        viewed_prices = list(ViewHistory.objects.filter(
            customer=user
        ).values_list('product__price', flat=True)[:10])

        all_prices = [float(p) for p in owned_prices + viewed_prices if p]
        if not all_prices:
            return boosts

        avg_price = np.mean(all_prices)
        price_min = avg_price * 0.7
        price_max = avg_price * 1.3

        mask = (
            (self.content.products_df['price'] >= price_min) &
            (self.content.products_df['price'] <= price_max)
        )
        for _, row in self.content.products_df[mask].iterrows():
            boosts[row['id']] = 0.5

        return boosts

    def _format_results(self, scores, reasons, top_n, exclude_ids, user=None):
        """Sort and format final recommendation results with category diversity."""
        from .models import Product, ViewHistory, Review, ProductOwnership, WishlistItem

        filtered = {
            pid: score for pid, score in scores.items()
            if pid not in exclude_ids and score > 0
        }
        # Sort ALL candidates by score
        sorted_items = sorted(filtered.items(), key=lambda x: x[1], reverse=True)

        # ── Get categories the user has actually interacted with ──
        user_categories = set()
        # Build a map of category -> most viewed product name (for rich reasons)
        category_top_product = {}  # {category_name: product_name}
        if user:
            # From views — get the most viewed product per category
            view_data = ViewHistory.objects.filter(
                customer=user
            ).select_related('product__category').order_by('-view_count')
            for vh in view_data:
                cat_name = vh.product.category.name if vh.product.category else None
                if cat_name:
                    cat_name = str(cat_name).strip()
                    user_categories.add(cat_name)
                    if cat_name not in category_top_product:
                        category_top_product[cat_name] = vh.product.name
            
            # From reviews
            review_cats = Review.objects.filter(
                customer=user
            ).values_list('product__category__name', flat=True).distinct()
            user_categories.update(str(c).strip() for c in review_cats if c)
            
            # From purchases
            purchase_cats = ProductOwnership.objects.filter(
                customer=user
            ).values_list('product__category__name', flat=True).distinct()
            user_categories.update(str(c).strip() for c in purchase_cats if c)
            
            # From wishlist
            wishlist_cats = WishlistItem.objects.filter(
                wishlist__customer=user
            ).values_list('product__category__name', flat=True).distinct()
            user_categories.update(str(c).strip() for c in wishlist_cats if c)

        def _build_reason(product, reason_tuple):
            """Build a specific, user-friendly reason string."""
            source = reason_tuple[0] if reason_tuple else 'default'
            cat_name = product.category.name if product.category else None
            
            # Find the user's top viewed product in this category
            top_viewed = category_top_product.get(cat_name) if cat_name else None
            
            if source == 'search':
                return f"Aramalarınıza göre önerildi"
            elif source == 'price':
                if cat_name:
                    return f"{cat_name} — bütçenize uygun"
                return "Fiyat aralığınıza uygun"
            elif source == 'content':
                if top_viewed:
                    # Truncate long product names
                    short_name = top_viewed[:30] + ('…' if len(top_viewed) > 30 else '')
                    return f"\"{short_name}\" incelemenize benzer"
                elif cat_name:
                    return f"{cat_name} ilgi alanınıza göre"
                return "Görüntüleme geçmişinize göre"
            elif source == 'ncf':
                if top_viewed:
                    short_name = top_viewed[:30] + ('…' if len(top_viewed) > 30 else '')
                    return f"\"{short_name}\" beğenenler bunu da beğendi"
                elif cat_name:
                    return f"{cat_name} kategorisinde sizin için seçildi"
                return "Kullanıcı davranışlarınıza göre"
            elif source == 'popular':
                if cat_name:
                    return f"{cat_name} kategorisinde popüler"
                return "Çok tercih edilen ürün"
            elif source == 'new':
                if cat_name:
                    return f"Yeni eklenen {cat_name} ürünü"
                return "Yeni gelen ürün"
            else:
                if cat_name:
                    return f"{cat_name} — sizin için seçildi"
                return "Sizin için seçildi"

        # ── Category diversity: max 4 items per category, only from user's categories ──
        MAX_PER_CATEGORY = 4
        category_counts = {}
        diverse_items = []
        added_pids = set()

        # Pass 1: Strict filtering based on user's known categories
        for pid, score in sorted_items:
            if len(diverse_items) >= top_n:
                break
            try:
                # Ensure pid is int for DB lookup
                p_id = int(pid)
                product = Product.objects.select_related('category').get(id=p_id)
                cat_name = str(product.category.name).strip() if product.category else 'Other'

                # Skip categories the user has never interacted with (if we have user data)
                if user_categories and cat_name not in user_categories:
                    continue

                if category_counts.get(cat_name, 0) < MAX_PER_CATEGORY:
                    reason_tuple = reasons.get(pid, ('default', None))
                    diverse_items.append({
                        'product': product,
                        'product_id': p_id,
                        'score': round(float(score), 4),
                        'reason': _build_reason(product, reason_tuple),
                    })
                    category_counts[cat_name] = category_counts.get(cat_name, 0) + 1
                    added_pids.add(p_id)
            except (Product.DoesNotExist, ValueError, TypeError):
                continue

        # Pass 2: If we still don't have enough items, relax the category constraint
        if len(diverse_items) < top_n:
            for pid, score in sorted_items:
                if len(diverse_items) >= top_n:
                    break
                p_id = int(pid)
                if p_id in added_pids:
                    continue
                    
                try:
                    product = Product.objects.select_related('category').get(id=p_id)
                    cat_name = str(product.category.name).strip() if product.category else 'Other'

                    if category_counts.get(cat_name, 0) < MAX_PER_CATEGORY:
                        reason_tuple = reasons.get(pid, ('default', None))
                        diverse_items.append({
                            'product': product,
                            'product_id': p_id,
                            'score': round(float(score), 4),
                            'reason': _build_reason(product, reason_tuple),
                        })
                        category_counts[cat_name] = category_counts.get(cat_name, 0) + 1
                        added_pids.add(p_id)
                except (Product.DoesNotExist, ValueError, TypeError):
                    continue

        # ── Format and return ──
        logger.info(f"📊 Recommending for user {user.id if user else 'Guest'}: {len(filtered)} candidates -> Filtered to {len(diverse_items)}")
        
        if not diverse_items and sorted_items:
             logger.warning(f"⚠️  All {len(sorted_items)} candidates were filtered out for user {user.id if user else 'Guest'}")
             # Check one for debug
             pid, score = sorted_items[0]
             try:
                 p_id = int(pid)
                 p = Product.objects.get(id=p_id)
                 p_cat = str(p.category.name).strip() if p.category else 'Other'
                 logger.info(f"   Debug candidate 0: ID={p_id}, Name={p.name}, Cat={p_cat}, UserCats={user_categories}")
             except Exception as e: 
                 logger.error(f"   Debug failed: {e}")

        return diverse_items

    def get_metrics(self):
        """Return training metrics for diagnostics."""
        return {
            'ncf': self.ncf.training_metrics if self.ncf.is_trained else None,
            'content': {
                'n_products': len(self.content.products_df) if self.content.products_df is not None else 0,
                'is_trained': self.content.is_trained,
            },
            'models_loaded': self._loaded,
            'weights': {
                'ncf': self.WEIGHT_NCF,
                'content': self.WEIGHT_CONTENT,
                'popularity': self.WEIGHT_POPULARITY,
            }
        }

    def invalidate_cache(self):
        """Clear all cached data."""
        cache.delete('ml_popularity_scores')
        # Invalidate user-specific caches can't be done generically,
        # but they expire in 5 minutes anyway

    @classmethod
    def get_instance(cls):
        return cls()

    def _get_model_age_hours(self):
        """Return the age of the saved model in hours, or None if unknown."""
        if os.path.exists(METRICS_PATH):
            try:
                mtime = os.path.getmtime(METRICS_PATH)
                age_seconds = time.time() - mtime
                return age_seconds / 3600
            except OSError:
                pass
        return None

    def retrain_if_stale(self):
        """Retrain models if they are older than the configured interval."""
        retrain_interval = getattr(settings, 'ML_RETRAIN_INTERVAL_HOURS', 6)
        age_hours = self._get_model_age_hours()

        if age_hours is not None and age_hours < retrain_interval:
            logger.info(
                "⏰ ML model is %.1f hours old (threshold: %d hours) — skipping retrain",
                age_hours, retrain_interval
            )
            return False

        logger.info(
            "🔄 ML model is %s — starting retraining...",
            f"{age_hours:.1f} hours old" if age_hours is not None else "not found"
        )

        try:
            success = self.train(epochs=300, verbose=False)
            if success:
                logger.info("✅ Periodic retraining complete")
                # Invalidate caches so new recommendations use fresh model
                self.invalidate_cache()
            else:
                logger.warning("⚠️  Periodic retraining did not produce a model (insufficient data?)")
            return success
        except Exception as e:
            logger.error("❌ Periodic retraining failed: %s", e)
            return False


# ═══════════════════════════════════════════════════════════════════════════
# Backward-compatible aliases
# ═══════════════════════════════════════════════════════════════════════════
ContentBasedRecommender = HybridRecommender


def get_recommender():
    """Factory function to get the singleton recommender instance."""
    return HybridRecommender.get_instance()
