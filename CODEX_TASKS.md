# BekoSIRS — Codex Görev Listesi: ML Öneri Sistemi Geliştirme

## ÖNCE OKU

Bu dosyayı çalıştırmadan önce `CODEX_PROJECT_CONTEXT.md` dosyasını tamamen oku.
Mimariyi, dosya yapısını ve kodlama kurallarını anladıktan sonra başla.

---

## Genel Kurallar (Her Görev İçin Geçerli)

1. **Her fonksiyon ve sınıfa açıklayıcı Türkçe/İngilizce inline yorum ekle.**
   - Fonksiyon ne yapıyor, parametreler ne anlama geliyor, neden bu yöntem seçildi
   - Örnek:
     ```python
     # Zaman faktörü: eski etkileşimlerin etkisini azaltmak için üstel çürüme uyguluyoruz.
     # 30 günden eski etkileşim yarı ağırlıkta, 90 günden eski ise %20 ağırlıkta hesaplanır.
     decay_factor = math.exp(-days_old / half_life_days)
     ```

2. **Her görevin sonunda testleri çalıştır:**
   ```bash
   # Backend değişikliği yaptıysan:
   cd BekoSIRS_api && pytest products/tests/ -v
   # Mobil değişikliği yaptıysan:
   cd BekoSIRS_Frontend && npm test -- --watchAll=false
   ```
   Testler geçmeden bir sonraki göreve geçme.

3. **Tüm çalışmayı tek bir izole branch'te yap — main'e DOKUNMA:**
   ```bash
   # Sadece bir kez, başta çalıştır:
   git checkout -b feat/ml-recommendation-improvements
   ```
   **YASAK: `git push origin main`, `git merge main`, `git checkout main`**
   Tüm commit'ler yalnızca `feat/ml-recommendation-improvements` branch'ine gidecek.

4. **Commit mesajları çok detaylı olacak:**
   ```
   feat(ml): temporal decay for user interactions
   
   - Added exponential decay factor to _get_user_interactions()
   - Half-life set to 30 days: interactions older than 30 days
     contribute 50% of their original weight
   - Reason: recent behavior is more predictive than old behavior;
     a product viewed 3 months ago should matter less than one
     viewed last week
   - New test: test_temporal_decay_reduces_old_interactions()
   - Verified: hit_rate_at_10 improved from 0.62 to 0.67 on test data
   ```

5. **Her görev bittikçe branch'e push et:**
   ```bash
   git push origin feat/ml-recommendation-improvements
   ```

6. **Tüm görevler tamamlanınca PR aç, sonra DUR — merge etme:**
   ```bash
   gh pr create --base main --head feat/ml-recommendation-improvements \
     --title "feat(ml): recommendation system improvements" \
     --body "7 görevin özeti: temporal decay, adaptive weights, new product boost, click feedback, mobile UI, advanced metrics"
   ```
   PR açıldıktan sonra dur. Merge kararı insana ait.

---

## GÖREV 1: Temporal Decay — Eski Etkileşimlerin Ağırlığını Azalt

### Neden?
Şu an 6 ay önceki görüntüleme ile dünkü görüntüleme aynı ağırlıkta.
Oysa kullanıcının güncel ilgi alanı daha önemli. Çürüme (decay) ekleyerek
öneri sistemini daha güncel hale getiririz.

### Değiştirilecek Dosya
`BekoSIRS_api/products/ml_recommender.py`

### Değiştirilecek Metod
`HybridRecommender._get_user_interactions()` (satır 844)

### Ne Yapılacak?

`ViewHistory`, `Review`, `WishlistItem`, `ProductOwnership` modellerinin
hepsinde `created_at` veya `purchase_date` alanı var.
Bu tarihlere göre üstel çürüme (exponential decay) uygula.

**Formül:**
```python
import math
from datetime import datetime, timezone

def temporal_weight(interaction_date, half_life_days=30):
    """
    Üstel çürüme fonksiyonu.
    half_life_days: Bu kadar gün geçince ağırlık yarıya düşer.
    30 gün → 0.5x, 60 gün → 0.25x, 90 gün → 0.125x
    """
    if interaction_date is None:
        return 1.0  # Tarih yoksa çürüme uygulama
    now = datetime.now(timezone.utc)
    if interaction_date.tzinfo is None:
        interaction_date = interaction_date.replace(tzinfo=timezone.utc)
    days_old = max(0, (now - interaction_date).days)
    return math.exp(-math.log(2) * days_old / half_life_days)
```

**Uygulama:**
```python
# Eski kod:
interactions[pid] = interactions.get(pid, 0) + 5.0  # purchase

# Yeni kod:
decay = temporal_weight(ownership.purchase_date, half_life_days=60)
# Satın almalar daha uzun süre etkili olsun (60 gün), görüntülemeler daha kısa (30 gün)
interactions[pid] = interactions.get(pid, 0) + (5.0 * decay)
```

**Half-life değerleri:**
| Etkileşim | half_life_days | Gerekçe |
|-----------|---------------|---------|
| Satın alma | 90 | Uzun vadeli ilgi göstergesi |
| Wishlist | 45 | Orta vadeli ilgi |
| Review (rating>3) | 60 | Kalıcı pozitif sinyal |
| Görüntüleme | 30 | Kısa vadeli ilgi |

**Sınıf sabiti ekle:**
```python
class HybridRecommender:
    # Temporal decay half-life değerleri (gün cinsinden)
    DECAY_PURCHASE_DAYS = 90    # satın almalar 90 günde yarı ağırlığa düşer
    DECAY_WISHLIST_DAYS = 45
    DECAY_REVIEW_DAYS = 60
    DECAY_VIEW_DAYS = 30
```

**Modeller güncellenmeli:**
`ViewHistory`, `Review`, `WishlistItem`, `ProductOwnership` — `created_at` alanlarını
query'e dahil et (`.values('product_id', 'view_count', 'last_viewed')` gibi).

### Test Yazılacak

`BekoSIRS_api/products/tests/` altında `test_ml_temporal_decay.py` oluştur:

```python
def test_temporal_weight_recent_interaction_higher():
    """Güncel etkileşim eski etkileşimden daha yüksek ağırlık almalı."""
    recent = temporal_weight(datetime.now(timezone.utc) - timedelta(days=5))
    old = temporal_weight(datetime.now(timezone.utc) - timedelta(days=60))
    assert recent > old

def test_temporal_weight_half_life():
    """30 günde ağırlık yarıya düşmeli (±%5 tolerans)."""
    weight = temporal_weight(datetime.now(timezone.utc) - timedelta(days=30), half_life_days=30)
    assert abs(weight - 0.5) < 0.05

def test_interactions_include_decay(db, django_user_model):
    """_get_user_interactions çıktısındaki etkileşimler decay uygulanmış olmalı."""
    # Fixture ile eski ve yeni etkileşim oluştur, eski olanın daha az ağırlığı olduğunu doğrula
    ...
```

---

## GÖREV 2: Dinamik Ağırlık Denemeleri — Farklı Kullanıcı Tipleri İçin Farklı Ağırlıklar

### Neden?
Şu an NCF:0.5, Content:0.3, Popularity:0.2 herkese aynı uygulanıyor.
Yeni kullanıcı (cold-start) için popularity daha önemli, aktif kullanıcı için NCF daha önemli.

### Değiştirilecek Dosya
`BekoSIRS_api/products/ml_recommender.py`

### Değiştirilecek Metod
`HybridRecommender.recommend()` (satır 757)

### Ne Yapılacak?

Kullanıcının etkileşim sayısına göre ağırlıkları otomatik ayarla:

```python
def _get_adaptive_weights(self, user_interactions: dict) -> tuple[float, float, float]:
    """
    Kullanıcının etkileşim geçmişine göre dinamik ağırlık hesaplar.
    
    Mantık:
    - Yeni kullanıcı (< 5 etkileşim): Popularity baskın, NCF zayıf
      Çünkü az veriyle NCF güvenilmez tahmin yapar
    - Orta kullanıcı (5–20 etkileşim): Dengeli
    - Aktif kullanıcı (> 20 etkileşim): NCF baskın, popularity düşük
      Çünkü yeterli veri var, kişiselleştirilmiş öneri mümkün
    
    Returns: (ncf_weight, content_weight, popularity_weight)
    """
    n = len(user_interactions)
    
    if n == 0:
        # Tamamen yeni kullanıcı: popularity-first
        return (0.0, 0.2, 0.8)
    elif n < 5:
        # Az etkileşim: content ve popularity ağır bas
        return (0.2, 0.3, 0.5)
    elif n < 20:
        # Orta düzey: dengeli
        return (0.4, 0.3, 0.3)
    else:
        # Aktif kullanıcı: NCF güvenilir, popularity düşür
        return (0.6, 0.3, 0.1)
```

`recommend()` metodunda mevcut sabit ağırlıkları bu fonksiyonla değiştir:
```python
# Eski:
normalized = (score / max_ncf) * self.WEIGHT_NCF
# Yeni:
w_ncf, w_content, w_pop = self._get_adaptive_weights(user_interactions)
normalized = (score / max_ncf) * w_ncf
```

**Ağırlıkları response'a ekle** (ml_metrics içinde):
```json
"weights_used": {"ncf": 0.6, "content": 0.3, "popularity": 0.1, "user_tier": "active"}
```

### Test Yazılacak

`test_ml_adaptive_weights.py`:
```python
def test_cold_start_user_gets_high_popularity_weight():
    """0 etkileşimli kullanıcı için popularity ağırlığı >= 0.7 olmalı."""
    ...

def test_active_user_gets_high_ncf_weight():
    """25 etkileşimli kullanıcı için ncf ağırlığı >= 0.5 olmalı."""
    ...
```

---

## GÖREV 3: Yeni Ürün Boost — Cold Product Sorunu Çöz

### Neden?
Yeni eklenen ürünlerin popularity skoru sıfır olduğundan öneri listesine hiç giremiyor.
Stokta olan ve yeni eklenen ürünler öne çıkarılmalı.

### Değiştirilecek Dosya
`BekoSIRS_api/products/ml_recommender.py`

### Ne Yapılacak?

`_get_popularity_scores()` metoduna yeni ürün boost'u ekle:

```python
def _get_new_product_boost(self):
    """
    Son 30 gün içinde eklenen ürünlere boost uygular.
    Yeni ürünlerin keşfedilmesini sağlar (serendipity).
    
    Boost miktarı zamanla azalır:
    - 0-7 gün: +0.4 boost
    - 7-14 gün: +0.25 boost  
    - 14-30 gün: +0.1 boost
    """
    from .models import Product
    from datetime import datetime, timedelta, timezone
    
    now = datetime.now(timezone.utc)
    boosts = {}
    
    recent_products = Product.objects.filter(
        created_at__gte=now - timedelta(days=30),
        stock__gt=0  # Stokta olan ürünler
    ).values('id', 'created_at')
    
    for p in recent_products:
        days_old = (now - p['created_at'].replace(tzinfo=timezone.utc)).days
        if days_old <= 7:
            boosts[p['id']] = 0.4
        elif days_old <= 14:
            boosts[p['id']] = 0.25
        else:
            boosts[p['id']] = 0.1
    
    return boosts
```

Bu boost'u `recommend()` metoduna 6. adım olarak ekle.

**NOT:** `Product` modelinde `created_at` alanı yoksa ekle:
```python
# models.py → Product sınıfına
created_at = models.DateTimeField(auto_now_add=True, null=True)
```
Eğer zaten varsa (farklı isimde olabilir), mevcut alanı kullan.

### Test
```python
def test_new_product_gets_boost():
    """Son 7 gün içinde eklenen ürün boost almalı."""
    ...

def test_old_product_no_boost():
    """31 gün önce eklenen ürün boost almamalı."""
    ...
```

---

## GÖREV 4: Click Feedback Loop — Tıklama Verisini Modele Besle

### Neden?
`Recommendation.clicked = True` kaydediliyor ama hiç kullanılmıyor.
Tıklanan öneriler implicit positive feedback; modeli iyileştirmek için kullanılabilir.

### Değiştirilecek Dosya
`BekoSIRS_api/products/ml_recommender.py`

### Ne Yapılacak?

`_get_user_interactions()` metoduna tıklama sinyali ekle:

```python
# Recommendation tıklamaları — implicit pozitif sinyal
# Tıklama, kullanıcının ilgisini gösterir ama satın almadan zayıf
from .models import Recommendation
for rec in Recommendation.objects.filter(
    customer=user, clicked=True
).values('product_id'):
    # Tıklama ağırlığı: wishlist (3.0) ile satın alma (5.0) arasında değil,
    # view (1.0) ile wishlist (3.0) arasında konumlandır
    interactions[rec['product_id']] = interactions.get(rec['product_id'], 0) + 2.0
    # NOT: Temporal decay buraya da uygulanabilir (Görev 1 ile birleştir)
```

**Ayrıca:** Dismissed (beğenmiyorum) sinyalini negatif olarak değerlendir:
```python
# Dismissed öneriler — kullanıcı bu ürünü istemediğini söylüyor
# Bu ürünleri exclude listesine ekle
dismissed_ids = set(
    Recommendation.objects.filter(
        customer=user, dismissed=True
    ).values_list('product_id', flat=True)
)
exclude_ids.update(dismissed_ids)
```

**`recommend()` metodunda** `exclude_ids`'e dismissed ürünleri otomatik ekle.

### Test
```python
def test_clicked_recommendation_boosts_future_score():
    """Tıklanan öneri ürünü sonraki öneri listesinde daha yüksek skor almalı."""
    ...

def test_dismissed_product_excluded_from_recommendations():
    """Dismissed ürün öneri listesinde görünmemeli."""
    ...
```

---

## GÖREV 5: Mobil UI — Öneri Sayfasını Zenginleştir

### Değiştirilecek Dosya
`BekoSIRS_Frontend/app/(drawer)/recommendations.tsx`

### Ne Yapılacak?

#### 5a. Bileşen Skor Dökümü Göster
Her öneri kartında hangi bileşenin ne kadar katkı yaptığını göster.
Backend'den gelen `ml_metrics.weights_used` kullanılacak (Görev 2'de eklendi).

UI eklentisi (kart altına):
```tsx
{/* Skor Dökümü — hangi model bu ürünü önerdi */}
<View style={styles.scoreBreakdown}>
  <Text style={styles.scoreLabel}>NCF: {(score * weights.ncf).toFixed(2)}</Text>
  <Text style={styles.scoreLabel}>İçerik: {(score * weights.content).toFixed(2)}</Text>
  <Text style={styles.scoreLabel}>Popülerlik: {(score * weights.popularity).toFixed(2)}</Text>
</View>
```

#### 5b. Thumbs Up/Down Geri Bildirim Butonları
Her öneri kartına beğeni/beğenmeme butonu ekle.

```tsx
{/* Geri Bildirim — kullanıcı bu öneriyi değerlendiriyor */}
<View style={styles.feedbackRow}>
  <TouchableOpacity 
    onPress={() => handleFeedback(rec.id, 'like')}
    style={styles.feedbackBtn}
    accessibilityLabel="Bu öneriyi beğendim"
  >
    <FontAwesome name="thumbs-up" size={16} color="#4CAF50" />
  </TouchableOpacity>
  <TouchableOpacity 
    onPress={() => handleFeedback(rec.id, 'dismiss')}
    style={styles.feedbackBtn}
    accessibilityLabel="Bu öneriyi gösterme"
  >
    <FontAwesome name="thumbs-down" size={16} color="#F44336" />
  </TouchableOpacity>
</View>
```

`handleFeedback` fonksiyonu:
- `like` → `recommendationAPI.recordClick(rec.id)` (zaten var)
- `dismiss` → yeni API çağrısı: `PATCH /api/v1/recommendations/{id}/dismiss/`

#### 5c. Dismiss API Endpoint'i Ekle (Backend)

`BekoSIRS_api/products/views/customer_views.py` dosyasına:
```python
@action(detail=True, methods=['patch'])
def dismiss(self, request, pk=None):
    """
    Kullanıcının bir öneriyi 'gösterme' olarak işaretlemesini sağlar.
    dismissed=True olan ürünler gelecekte öneri listesinden çıkarılır (Görev 4).
    """
    recommendation = get_object_or_404(Recommendation, pk=pk, customer=request.user)
    recommendation.dismissed = True
    recommendation.save(update_fields=['dismissed'])
    return Response({'status': 'dismissed'})
```

URL ekle: `router.register` altında zaten varsa action otomatik bağlanır.

#### 5d. Kategori Filtresi
```tsx
{/* Kategori filtresi — "Tümü | Beyaz Eşya | Elektronik | Küçük Ev Aletleri" */}
<ScrollView horizontal showsHorizontalScrollIndicator={false}>
  {categories.map(cat => (
    <TouchableOpacity
      key={cat}
      style={[styles.catChip, selectedCat === cat && styles.catChipActive]}
      onPress={() => setSelectedCat(cat)}
    >
      <Text>{cat}</Text>
    </TouchableOpacity>
  ))}
</ScrollView>
```

### Test
`BekoSIRS_Frontend/__tests__/recommendations.test.tsx` güncelle:
```tsx
test('beğenmeme butonu dismiss API çağırır', async () => { ... });
test('kategori filtresi uygulandığında sadece o kategorideki öneriler görünür', async () => { ... });
```

---

## GÖREV 6: Gelişmiş Metrikler — Hit Rate, Diversity, Coverage

### Neden?
Şu an sadece R² ve Hit Rate @10 ölçülüyor. Daha fazla metrik ekleyerek
"hangi ayar daha iyi öneri yapıyor" sorusunu cevaplayabiliriz.

### Değiştirilecek Dosya
`BekoSIRS_api/products/ml_recommender.py` — `NCFModel.train()` metodu (satır ~460)

### Eklenecek Metrikler

```python
def _compute_advanced_metrics(self, recommendations_list, all_products):
    """
    Gelişmiş öneri kalite metrikleri hesaplar.
    
    Metrikler:
    - diversity_score: Önerilen ürünlerin kategori çeşitliliği (0-1)
      0=hepsi aynı kategori, 1=hepsi farklı kategori
    - coverage: Katalogdaki kaç farklı ürün önerildi (yüzde)
    - avg_score: Ortalama öneri skoru
    - intra_list_diversity: Öneri listesi içindeki fiyat varyansı
    """
    categories = [r['product'].category_id for r in recommendations_list]
    unique_cats = len(set(categories))
    diversity_score = unique_cats / max(len(categories), 1)
    
    unique_recommended = len(set(r['product_id'] for r in recommendations_list))
    coverage = unique_recommended / max(len(all_products), 1)
    
    prices = [float(r['product'].price) for r in recommendations_list if r['product'].price]
    price_variance = float(np.var(prices)) if prices else 0.0
    
    return {
        'diversity_score': round(diversity_score, 3),
        'catalog_coverage': round(coverage, 3),
        'avg_recommendation_score': round(np.mean([r['score'] for r in recommendations_list]), 3),
        'price_variance_in_list': round(price_variance, 2),
    }
```

Bu metrikleri `ml_metrics` response'una ekle.

### Test
```python
def test_diversity_score_range():
    """diversity_score 0-1 arasında olmalı."""
    ...

def test_all_same_category_gives_low_diversity():
    """Tüm öneriler aynı kategorideyse diversity_score düşük olmalı."""
    ...
```

---

## GÖREV 7: Tüm Değişiklikleri Entegre Et ve Performansı Ölç

Bu görevi diğer 6 görev tamamlandıktan sonra yap.

### Ne Yapılacak?

1. `python manage.py train_recommender` çalıştır
2. Yeni metriklerin (Görev 6) doğru döndüğünü doğrula
3. Tüm testleri çalıştır:
   ```bash
   cd BekoSIRS_api && pytest products/tests/ -v --tb=short
   cd BekoSIRS_Frontend && npm test -- --watchAll=false
   ```
4. Sonuçları bir `ML_IMPROVEMENT_REPORT.md` dosyasına yaz:
   - Önceki metrikler (CONTEXT dosyasında belirtilmiş)
   - Yeni metrikler
   - Her görevin öneri kalitesine katkısı

5. Final PR aç: `feat/ml-recommendation-improvements`
   - PR başlığı: `feat(ml): temporal decay, adaptive weights, click feedback, mobile UI improvements`
   - PR açıklaması: Her görevden ne kazanıldığını madde madde yaz

---

## Görev Sırası (Önerilen)

**Tüm görevler aynı branch'te: `feat/ml-recommendation-improvements`**
**main'e hiçbir şey pushlanmayacak.**

```
git checkout -b feat/ml-recommendation-improvements   ← SADECE BİR KEZ

Görev 1 → test et → commit → push origin feat/ml-recommendation-improvements
Görev 2 → test et → commit → push origin feat/ml-recommendation-improvements
Görev 3 → test et → commit → push origin feat/ml-recommendation-improvements
Görev 4 → test et → commit → push origin feat/ml-recommendation-improvements
Görev 5 → test et → commit → push origin feat/ml-recommendation-improvements
Görev 6 → test et → commit → push origin feat/ml-recommendation-improvements
Görev 7 → hepsini test et → commit → push → PR aç → DUR (merge etme)
```

---

## Başarı Kriterleri

- Tüm mevcut testler geçiyor (CI yeşil)
- Yeni görev testleri de geçiyor
- `hit_rate_at_10` düşmüyor (mevcut değerden kötü olmamalı)
- `diversity_score` > 0.3 (farklı kategorilerden öneriler geliyor)
- Dismissed ürünler bir daha öneri listesinde görünmüyor
- Cold-start kullanıcılar (0 etkileşim) hâlâ öneri alıyor
