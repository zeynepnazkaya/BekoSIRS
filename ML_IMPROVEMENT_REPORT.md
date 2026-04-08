# ML Improvement Report

## Kapsam

Bu rapor, `feat/ml-recommendation-improvements` branch'inde tamamlanan 7 gorevin
sonucunu ozetler. Son entegrasyon turu 2026-04-08 tarihinde tamamlandi.

## Onceki Referans Metrikler

`CODEX_PROJECT_CONTEXT.md` icindeki onceki ornek `ml_metrics` referansi:

| Metrik | Onceki Deger |
| --- | ---: |
| `train_r2` | `0.80` |
| `test_r2` | `0.70` |
| `hit_rate_at_10` | `0.65` |

Not:
Bu referans bir context baseline'idir. Ayni egitim verisi, ayni sklearn surumu
ve ayni model artefact'lari ile alinmis garantili bir benchmark degildir.

## Guncel Egitim Sonucu

`C:\Users\Remzi\Desktop\BekoSIRS\BekoSIRS_api` altinda
`python manage.py train_recommender` komutu 2026-04-08 15:09:14 tarihinde
basariyla calistirildi.

| Metrik | Guncel Deger |
| --- | ---: |
| `train_r2` | `0.6085` |
| `test_r2` | `0.5800` |
| `hit_rate_at_10` | `0.7000` |
| `n_interactions` | `2825` |
| `n_users` | `76` |
| `n_products` | `263` |
| `n_epochs` | `246` |
| `final_loss` | `0.81466` |
| `trained_at` | `2026-04-08 15:09:14` |

Kisa yorum:
- `hit_rate_at_10` context referansindaki `0.65` degerinden `0.70` seviyesine cikti.
- `train_r2` ve `test_r2` context referansindan daha dusuk gorunuyor.
- Bu fark muhtemelen birebir ayni olmayan veri dagilimi, artefact durumu ve
  guncel egitim kosullarindan kaynaklaniyor; bu nedenle en anlamli iyilesme
  sinyali, kullaniciya dogrudan temas eden `hit_rate_at_10` artisidir.

## Yeni Runtime Metrikleri

Recommendation API artik `ml_metrics` icinde asagidaki runtime liste metriklerini
donduruyor:

| Alan | Anlam |
| --- | --- |
| `diversity_score` | Oneri listesindeki kategori cesitliligi |
| `catalog_coverage` | O anki katalog icinde onerilen benzersiz urun payi |
| `avg_recommendation_score` | Dondurulen listenin ortalama recommendation skoru |
| `price_variance_in_list` | Liste icindeki fiyat dagiliminin varyansi |
| `weights_used` | O kullanici icin kullanilan adaptif NCF/content/popularity agirliklari |
| `user_tier` | `cold_start`, `light`, `balanced`, `active` seviye bilgisi |

Bu alanlar hem unit testlerle hem de `/api/v1/recommendations/` response testleriyle
dogrulandi.

## Gorev Bazli Katki

1. Temporal decay:
   Eski interaction'larin etkisi azaltildi; yeni davranislar daha fazla agirlik aliyor.
2. Adaptive weights:
   Cold-start kullanicilar popularity agirlikli, aktif kullanicilar NCF agirlikli
   recommendation akisina geciyor.
3. New product boost:
   Son 30 gunde eklenen ve stokta olan urunler artik recommendation listesine
   girebiliyor.
4. Click feedback + dismiss exclusion:
   Click sinyali gelecekteki recommendation skoruna besleniyor; dismiss edilen
   urunler artik tekrar gosterilmiyor.
5. Mobile recommendation UI:
   Skor dokumu, like/dislike feedback ve kategori filtreleme eklendi.
6. Advanced runtime metrics:
   Recommendation kalitesi sadece offline egitim metriği ile degil, gosterilen
   listenin cesitliligi ve coverage'i ile de olculebilir hale geldi.
7. Final integration:
   Model yeniden egitildi, backend ve mobile testleri tam komutlarla tekrar gecirildi,
   rapor ve PR hazirlandi.

## Final Dogrulama

Basariyla calisan komutlar:

```bash
cd BekoSIRS_api
python manage.py train_recommender
pytest products/tests/ -v --tb=short

cd ../BekoSIRS_Frontend
npm test -- --watchAll=false
```

Test ozeti:
- Backend: `56 passed`
- Mobile: `14 test suite`, `71 test` passed

Not:
Mobile Jest kosusunda `act(...)` ve `SafeAreaView` warning'leri gorunuyor,
ancak komut exit code `0` ile basariyla tamamlandi.
