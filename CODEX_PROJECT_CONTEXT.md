# BekoSIRS — Codex Proje Bağlamı

Bu dosya, görevlere başlamadan önce okunması zorunlu bağlam belgesidir.
Projeyi anlamadan kod yazma.

---

## Proje Nedir?

BekoSIRS, Beko KKTC mağazaları için geliştirilmiş tam yığın e-ticaret yönetim sistemidir.
Üç katmandan oluşur:

| Katman | Dizin | Teknoloji |
|--------|-------|-----------|
| Backend | `BekoSIRS_api/` | Django 4.2 + DRF + Python 3.11 |
| Web Paneli | `BekoSIRS_Web/` | React 19 + TypeScript + Vite |
| Mobil Uygulama | `BekoSIRS_Frontend/` | React Native + Expo 54 |

**Dil:** Türkçe (tüm UI metinleri Türkçe, commit mesajları İngilizce)
**GitHub:** `sutozremzi/BekoSIRS`

---

## Kritik Dizin Yapısı

```
BekoSIRS/
├── BekoSIRS_api/
│   ├── bekosirs_backend/settings.py       ← Django ayarları
│   ├── products/
│   │   ├── models.py                      ← Tüm DB modelleri (User, Product, ViewHistory, WishlistItem, Review, ProductOwnership, SearchHistory, Recommendation...)
│   │   ├── ml_recommender.py              ← HİBRİT ML SİSTEMİ (1132 satır) — BU DOSYA GÖREVIN MERKEZİ
│   │   ├── serializers.py                 ← DRF serializers
│   │   ├── views/
│   │   │   ├── customer_views.py          ← Recommendation API endpoint'leri
│   │   │   ├── analytics_views.py         ← Analitik endpoint'leri
│   │   │   └── product_views.py           ← Ürün CRUD
│   │   ├── management/commands/
│   │   │   └── train_recommender.py       ← python manage.py train_recommender
│   │   └── tests/                         ← Backend testleri
│   ├── ml_models/                         ← Eğitilmiş model dosyaları (.pkl)
│   └── requirements.txt
├── BekoSIRS_Frontend/
│   ├── app/
│   │   ├── (drawer)/
│   │   │   ├── (tabs)/index.tsx           ← Ana sayfa (ürün listeleme + recommendations widget)
│   │   │   └── recommendations.tsx        ← Tam ekran öneri sayfası
│   │   └── product/[id].tsx              ← Ürün detay sayfası
│   ├── components/
│   ├── services/
│   │   ├── api.ts                         ← Axios instance + interceptors
│   │   └── serviceModule.ts              ← recommendationAPI, wishlistAPI, vb.
│   └── __tests__/                         ← Jest testleri
└── BekoSIRS_Web/
    └── src/pages/
        └── AnalyticsPage.tsx              ← Web analitik sayfası (bunu dokunma)
```

---

## ML Recommendation Sistemi — Detaylı Mimari

### Dosya: `BekoSIRS_api/products/ml_recommender.py`

Üç sınıf var:

#### 1. `NCFModel` (satır 52–519)
- scikit-learn `MLPRegressor` kullanan neural collaborative filtering
- Katmanlar: `Input(14) → 64 → 32 → 16 → 1`
- Aktivasyon: ReLU, Optimizer: Adam

**14 Feature:**
```python
['category_enc', 'price_normalized', 'price_bucket',
 'avg_score', 'n_interactions', 'score_std', 'n_unique_products',
 'prod_avg_rating', 'prod_n_reviews', 'prod_total_views',
 'prod_n_purchases', 'prod_n_wishlist',
 'user_cat_affinity', 'user_view_count']
```

#### 2. `ContentBasedModel` (satır 521–671)
- TF-IDF (max 5000 features, unigram+bigram)
- İçerik: `name + description + brand + (category × 3)`
- Cosine similarity + kategori boost (+0.15)

#### 3. `HybridRecommender` (satır 673–1132) — Singleton
**Mevcut sabit ağırlıklar:**
```python
WEIGHT_NCF = 0.5        # satır 692
WEIGHT_CONTENT = 0.3    # satır 693
WEIGHT_POPULARITY = 0.2 # satır 694
```

**Nihai skor:**
```
final = (NCF × 0.5) + (Content × 0.3) + (Popularity × 0.2)
      + search_boost(+2.0 per search term match)
      + price_boost(+0.5 if in user's price range ×0.7–1.3)
```

**Etkileşim Ağırlıkları (`_get_user_interactions`, satır 844):**
```python
purchase  → +5.0
wishlist  → +3.0
review    → +rating (yalnızca rating > 3)
view      → +min(view_count, 15)
```

**Popularity (`_get_popularity_scores`, satır 891):**
```python
score = views×1.0 + reviews×3.0 + purchases×5.0
```
Cache: 30 dakika

### İlgili Django Modeller (`models.py`)

```python
ViewHistory(customer, product, view_count, last_viewed)
WishlistItem(wishlist, product)
Review(customer, product, rating, comment)
ProductOwnership(customer, product, purchase_date)
SearchHistory(customer, query, created_at)
Recommendation(customer, product, score, reason, is_shown, clicked, dismissed)
```

### Recommendation API Endpoint

```
GET  /api/v1/recommendations/          ← öneri listesi
POST /api/v1/recommendations/generate/ ← yeni öneri üret
POST /api/v1/recommendations/{id}/click/ ← tıklama kaydı
```

**Mevcut response:**
```json
{
  "recommendations": [{"id": 1, "product": {...}, "score": 0.75, "reason": "ML modeli tarafından önerildi", ...}],
  "ml_metrics": {"train_r2": 0.8, "test_r2": 0.7, "hit_rate_at_10": 0.65, "weights": {...}}
}
```

### Mobil Uygulama

- `recommendations.tsx` — Tam öneri sayfası, API'den çeker, skor gösterir
- `index.tsx` — Ana sayfa, "Sana Özel" ve "Popüler" ürün kartları
- `serviceModule.ts` — `recommendationAPI.getRecommendations(forceRefresh)`

---

## Test Altyapısı

### Backend
```bash
cd BekoSIRS_api
pytest                    # tüm testler
pytest products/tests/    # sadece products
pytest --cov=products     # coverage
```
Test dosyaları: `BekoSIRS_api/products/tests/`

### Mobil
```bash
cd BekoSIRS_Frontend
npm test -- --watchAll=false
```
Test dosyaları: `BekoSIRS_Frontend/__tests__/`

### CI
`.github/workflows/ci.yml` — push/PR'da otomatik çalışır.
**Tüm testler geçmeden commit kabul edilmez.**

---

## Geliştirme Ortamı

### Backend başlatma
```bash
cd BekoSIRS_api
source venv/bin/activate   # Windows: venv\Scripts\activate
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

### ML modeli eğitme
```bash
python manage.py train_recommender
```

### Mobil başlatma
```bash
cd BekoSIRS_Frontend
npx expo start
```

---

## Kodlama Kuralları

1. **Türkçe UI metinleri** — tüm kullanıcıya görünen metinler Türkçe
2. **İngilizce commit mesajları** — `feat:`, `fix:`, `refactor:` prefix
3. **Test yaz** — her yeni özellik için test zorunlu; CI'dan geçmeyen kod merge edilmez
4. **Mevcut pattern'ları koru** — yeni utility yaratma, mevcut fonksiyonları genişlet
5. **`ml_recommender.py`'de sınıf yapısını bozma** — NCFModel, ContentBasedModel, HybridRecommender sınıfları korunacak
6. **Cache key'lerini standart tut** — `ml_user_interactions_{user.id}`, `ml_popularity_scores` gibi
7. **Pickle uyumluluğu** — model kaydetme/yükleme `joblib` ile yapılıyor, değiştirme

---

## Bağımlılıklar (requirements.txt'te mevcut)

```
scikit-learn
numpy
pandas
joblib
django-cacheops (veya django cache framework)
```

Yeni bağımlılık ekleme — mevcut stack yeterli.
