# products/ml_recommender.py
"""
Hybrid Recommender System with performance optimizations.
Uses singleton pattern and lazy loading for efficient operation.
"""
import pandas as pd
import numpy as np
import threading
import time
from functools import lru_cache
from django.core.cache import cache
from django.conf import settings
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.decomposition import TruncatedSVD


class HybridRecommender:
    """
    Singleton recommender with lazy loading and caching.
    
    Performance optimizations:
    - Singleton pattern: Only one instance across the application
    - Lazy loading: Models only trained on first recommendation request
    - Caching: Similarity matrix and user interactions cached
    """
    _instance = None
    _lock = threading.Lock()
    _initialized = False
    
    # Cache keys
    CACHE_KEY_SIMILARITY = 'ml_similarity_matrix'
    CACHE_KEY_PRODUCTS = 'ml_products_df'
    CACHE_TTL = getattr(settings, 'CACHE_TTL_LONG', 7200)  # 2 hours default
    
    def __new__(cls):
        """Singleton pattern - only create one instance."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        """Initialize with lazy loading - don't train models yet."""
        if HybridRecommender._initialized:
            return
            
        self.products_df = None
        self.similarity_matrix = None
        self.user_product_matrix = None
        self.svd_model = None
        self.indices = None
        self._last_trained = None
        self._content_trained = False
        
        HybridRecommender._initialized = True

    def _ensure_trained(self):
        """Lazy loading - train models only when needed."""
        # Check if we need to retrain (cache expired or never trained)
        if self.similarity_matrix is not None:
            return
            
        # Try to load from cache first
        cached_similarity = cache.get(self.CACHE_KEY_SIMILARITY)
        cached_products = cache.get(self.CACHE_KEY_PRODUCTS)
        
        if cached_similarity is not None and cached_products is not None:
            self.similarity_matrix = cached_similarity
            self.products_df = cached_products
            if not self.products_df.empty:
                self.indices = pd.Series(
                    self.products_df.index, 
                    index=self.products_df['id']
                ).drop_duplicates()
            return
        
        # Train models if cache miss
        self._load_data()
        self._train_content_model()
        self._train_collaborative_model()
        
        # Cache the results
        if self.similarity_matrix is not None:
            cache.set(self.CACHE_KEY_SIMILARITY, self.similarity_matrix, self.CACHE_TTL)
        if self.products_df is not None:
            cache.set(self.CACHE_KEY_PRODUCTS, self.products_df, self.CACHE_TTL)
        
        self._last_trained = time.time()

    def _load_data(self):
        """Fetches all products from DB into a DataFrame."""
        from .models import Product  # Import here to avoid circular imports
        
        products = Product.objects.all().values(
            'id', 'name', 'description', 'brand', 'category__name', 'price'
        )
        self.products_df = pd.DataFrame(list(products))
        
        if not self.products_df.empty:
            # Convert price to numeric for efficient filtering
            self.products_df['price'] = pd.to_numeric(self.products_df['price'], errors='coerce')
            self.indices = pd.Series(
                self.products_df.index, 
                index=self.products_df['id']
            ).drop_duplicates()

    def _train_content_model(self):
        """Builds Content-Based logic using TF-IDF."""
        if self.products_df is None or self.products_df.empty:
            return

        # Combine text fields
        self.products_df['content'] = (
            self.products_df['name'] + " " + 
            self.products_df['description'].fillna('') + " " + 
            self.products_df['brand'].fillna('') + " " + 
            self.products_df['category__name'].fillna('')
        ).str.lower()

        # Create Vectors
        tfidf = TfidfVectorizer(stop_words='english', max_features=5000)
        tfidf_matrix = tfidf.fit_transform(self.products_df['content'])

        # Calculate Similarity
        self.similarity_matrix = cosine_similarity(tfidf_matrix)
        self._content_trained = True

    def _train_collaborative_model(self):
        """Builds Collaborative Filtering logic using SVD."""
        from .models import ViewHistory, WishlistItem, Review, ProductOwnership
        
        interactions = []

        # 1. Fetch all interactions efficiently
        views_data = ViewHistory.objects.all().values('customer_id', 'product_id', 'view_count')
        if views_data.exists():
            views = pd.DataFrame(list(views_data))
            views['score'] = views['view_count'].apply(lambda x: min(x, 5) * 1.0)
            interactions.append(views[['customer_id', 'product_id', 'score']])

        wishlist_data = WishlistItem.objects.filter(
            wishlist__customer__isnull=False
        ).values('wishlist__customer_id', 'product_id')
        if wishlist_data.exists():
            wishlist = pd.DataFrame(list(wishlist_data))
            wishlist = wishlist.rename(columns={'wishlist__customer_id': 'customer_id'})
            wishlist['score'] = 3.0
            interactions.append(wishlist)

        reviews_data = Review.objects.all().values('customer_id', 'product_id', 'rating')
        if reviews_data.exists():
            reviews = pd.DataFrame(list(reviews_data))
            reviews = reviews.rename(columns={'rating': 'score'})
            interactions.append(reviews)

        purchases_data = ProductOwnership.objects.all().values('customer_id', 'product_id')
        if purchases_data.exists():
            purchases = pd.DataFrame(list(purchases_data))
            purchases['score'] = 5.0
            interactions.append(purchases)

        # 2. Create the Matrix
        if not interactions:
            self.user_product_matrix = None
            return

        all_interactions = pd.concat(interactions, ignore_index=True)
        self.user_product_matrix = all_interactions.groupby(
            ['customer_id', 'product_id']
        )['score'].sum().unstack(fill_value=0)

        # 3. Apply SVD
        if (self.user_product_matrix.shape[0] > 5 and 
            self.user_product_matrix.shape[1] > 5):
            n_components = min(12, min(self.user_product_matrix.shape) - 1)
            self.svd_model = TruncatedSVD(n_components=n_components, random_state=42)
            self.svd_matrix = self.svd_model.fit_transform(self.user_product_matrix)
            self.corr_matrix = np.corrcoef(self.svd_matrix)

    def recommend(self, user, top_n=5, ignore_cache=False, exclude_ids=None):
        """Main function to get hybrid recommendations."""
        self._ensure_trained()
        
        if self.products_df is None or self.products_df.empty:
            return []

        exclude_ids = exclude_ids or set()

        # 1. Content-Based Scores
        content_results = self._recommend_content_based(user, limit=None, ignore_cache=ignore_cache) 
        
        # 2. Collaborative Scores
        collab_results = self._recommend_collaborative(user)
        
        # 3. Hybrid Merge (Weighted)
        final_scores = {}
        reasons = {}

        # Normalize and merge Content scores
        if content_results:
            max_content = max(content_results.values())
            for pid, score in content_results.items():
                if pid not in exclude_ids:
                    final_scores[pid] = (score / max_content) * 0.7
                    reasons[pid] = "İlgi alanlarınıza göre"
        
        # Normalize and merge Collab scores
        if collab_results:
            max_collab = max(collab_results.values())
            for pid, score in collab_results.items():
                if pid not in exclude_ids:
                    normalized = (score / max_collab) * 0.3
                    if pid in final_scores:
                        final_scores[pid] += normalized
                        if normalized > final_scores[pid] * 0.4:
                            reasons[pid] = "Benzer kullanıcılar tercih etti"
                    else:
                        final_scores[pid] = normalized
                        reasons[pid] = "Benzer kullanıcılar tercih etti"

        # 4. Search History Boost
        search_boosts = self._get_search_boosts(user)
        for pid, boost in search_boosts.items():
            if pid not in exclude_ids:
                final_scores[pid] = final_scores.get(pid, 0) + boost
                reasons[pid] = "Aramalarınıza göre"

        # 5. Price Sensitivity Boost
        price_boosts = self._get_price_sensitivity_boosts(user)
        for pid, boost in price_boosts.items():
            if pid not in exclude_ids and pid in final_scores:
                final_scores[pid] += boost
                if reasons.get(pid) != "Aramalarınıza göre" and boost > 0.1:
                    reasons[pid] = "Fiyat tercihlerinize uygun"

        # Sort and Format
        return self._format_final_results(final_scores, reasons, top_n, exclude_ids)

    def _recommend_content_based(self, user, limit=None, ignore_cache=False):
        """Return raw dictionary {product_id: score}."""
        user_interests = self._get_user_interactions_dict(user, ignore_cache)
        if not user_interests:
            return {}

        scores = {}
        # Calculate score for every product based on similarity to liked items
        for product_id, weight in user_interests.items():
            if product_id not in self.indices.index:
                continue
            idx = self.indices[product_id]
            
            # Get similarity scores for this product against all others
            sim_scores = self.similarity_matrix[idx]
            
            # Add weighted similarity to total score (vectorized)
            matches = np.where(sim_scores > 0.1)[0]
            for i in matches:
                pid = self.products_df.iloc[i]['id']
                scores[pid] = scores.get(pid, 0) + (sim_scores[i] * weight)
                    
        return scores

    def _recommend_collaborative(self, user):
        """Return raw dictionary {product_id: score} using SVD."""
        if self.svd_model is None or self.user_product_matrix is None:
            return {}
            
        user_id = user.id
        if user_id not in self.user_product_matrix.index:
            return {} # Cold start user
            
        # Get user's current vector in interaction matrix
        user_idx = self.user_product_matrix.index.get_loc(user_id)
        user_vector = self.user_product_matrix.iloc[user_idx].values.reshape(1, -1)
        
        # Transform to SVD space
        user_svd = self.svd_model.transform(user_vector)
        
        # Reconstruct (predict) ratings
        predicted_ratings = self.svd_model.inverse_transform(user_svd)[0]
        
        # Map back to product IDs
        scores = {}
        for i, score in enumerate(predicted_ratings):
            pid = self.user_product_matrix.columns[i]
            scores[pid] = score
            
        return scores

    def _format_final_results(self, scores_dict, reasons_dict, top_n, exclude_ids=None):
        from .models import Product
        
        exclude_ids = set(exclude_ids or [])
        
        # Filter and sort by score descending
        filtered_scores = {
            pid: score for pid, score in scores_dict.items() 
            if pid not in exclude_ids and score > 0
        }
        sorted_items = sorted(filtered_scores.items(), key=lambda x: x[1], reverse=True)[:top_n]
        
        results = []
        for pid, score in sorted_items:
            try:
                obj = Product.objects.get(id=pid)
                results.append({
                    'product': obj, 
                    'product_id': pid,
                    'score': score,
                    'reason': reasons_dict.get(pid, 'Sizin için seçildi')
                })
            except Product.DoesNotExist:
                continue
        return results

    def _get_search_boosts(self, user):
        """Boost products based on search history text matching."""
        from .models import SearchHistory
        
        boosts = {}
        if self.products_df is None or self.products_df.empty or 'content' not in self.products_df.columns:
            return boosts
            
        recent_searches = SearchHistory.objects.filter(customer=user).order_by('-created_at')[:5]
        if not recent_searches:
            return boosts
            
        # Compile search terms (content is already lowercase from _train_content_model)
        search_terms = [s.query.lower() for s in recent_searches]
        
        # Vectorized matching
        for term in search_terms:
            matches = self.products_df[self.products_df['content'].str.contains(term, na=False)].index
            for idx in matches:
                pid = self.products_df.iloc[idx]['id']
                boosts[pid] = boosts.get(pid, 0) + 2.0
                
        return boosts

    def _get_price_sensitivity_boosts(self, user):
        """Boost products that match the user's usual price range."""
        from .models import ProductOwnership, ViewHistory
        
        boosts = {}
        
        if 'price' not in self.products_df.columns:
            return boosts
        
        # Collect prices from purchases and views
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
        price_range_min = avg_price * 0.7
        price_range_max = avg_price * 1.3
        
        # Vectorized price filtering (prices already numeric)
        mask = (self.products_df['price'] >= price_range_min) & \
               (self.products_df['price'] <= price_range_max)
        
        for idx in self.products_df[mask].index:
            boosts[self.products_df.iloc[idx]['id']] = 0.5
                    
        return boosts

    def _get_user_interactions_dict(self, user, ignore_cache=False):
        """Gather raw interest scores for a single user with caching."""
        from .models import ProductOwnership, Review, WishlistItem, ViewHistory
        
        # Check user-specific cache
        cache_key = f'user_interactions_{user.id}'
        
        if not ignore_cache:
            cached = cache.get(cache_key)
            if cached is not None:
                return cached
        
        interactions = {}

        # 1. Purchases (Strong Base Interest: 5.0) - bulk query
        owned_ids = ProductOwnership.objects.filter(
            customer=user
        ).values_list('product_id', flat=True)
        for pid in owned_ids:
            interactions[pid] = interactions.get(pid, 0) + 5.0

        # 2. Reviews > 3 (High Satisfaction: 4.0) - bulk query
        reviewed_ids = Review.objects.filter(
            customer=user, rating__gt=3
        ).values_list('product_id', flat=True)
        for pid in reviewed_ids:
            interactions[pid] = interactions.get(pid, 0) + 4.0

        # 3. Wishlist (Intent to Buy: 3.0) - bulk query
        wishlisted_ids = WishlistItem.objects.filter(
            wishlist__customer=user
        ).values_list('product_id', flat=True)
        for pid in wishlisted_ids:
            interactions[pid] = interactions.get(pid, 0) + 3.0

        # 4. Recency Boost - Most recent views get highest scores
        recent_views = ViewHistory.objects.filter(
            customer=user
        ).order_by('-viewed_at')[:10].values_list('product_id', flat=True)
        for i, pid in enumerate(recent_views):
            recency_bonus = 10 - i
            interactions[pid] = interactions.get(pid, 0) + recency_bonus

        # Cache for 5 minutes
        cache.set(cache_key, interactions, 300)
        
        return interactions

    def invalidate_cache(self):
        """Invalidate all cached data - call when products change."""
        cache.delete(self.CACHE_KEY_SIMILARITY)
        cache.delete(self.CACHE_KEY_PRODUCTS)
        self.similarity_matrix = None
        self.products_df = None
        self._last_trained = None

    @classmethod
    def get_instance(cls):
        """Get the singleton instance."""
        return cls()


# Alias for backward compatibility
ContentBasedRecommender = HybridRecommender


def get_recommender():
    """Factory function to get the singleton recommender instance."""
    return HybridRecommender.get_instance()