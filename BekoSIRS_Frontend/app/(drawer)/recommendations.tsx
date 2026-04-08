import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Text,
  View,
  TouchableOpacity,
  RefreshControl,
  Image,
  Alert,
  ScrollView,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { recommendationAPI, wishlistAPI, viewHistoryAPI, getImageUrl } from '../../services';
import { useRouter } from 'expo-router';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../i18n';

interface Recommendation {
  id?: number;
  product: {
    id: number;
    name: string;
    brand: string;
    price: string;
    stock: number;
    image?: string;
    category_name?: string;
  };
  score: number;
  reason: string;
  is_shown?: boolean;
  clicked?: boolean;
}

interface MLMetrics {
  train_r2?: number | null;
  test_r2?: number | null;
  hit_rate_at_10?: number | null;
  n_interactions?: number | null;
  n_users?: number | null;
  n_products?: number | null;
  n_epochs?: number | null;
  final_loss?: number | null;
  trained_at?: string | null;
  content_products?: number;
  weights?: { ncf?: number; content?: number; popularity?: number };
  weights_used?: {
    ncf?: number;
    content?: number;
    popularity?: number;
    user_tier?: string;
    interaction_count?: number;
  };
  user_tier?: string;
  error?: string;
}

const RecommendationsScreen = () => {
  const router = useRouter();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [mlMetrics, setMlMetrics] = useState<MLMetrics>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wishlistIds, setWishlistIds] = useState<number[]>([]);
  const [showMetrics, setShowMetrics] = useState(true);
  const { language } = useLanguage();
  const [selectedCat, setSelectedCat] = useState('Tümü');

  const getRecommendationCategory = (item: Recommendation) => item.product.category_name || 'Diğer';
  const activeWeights = mlMetrics.weights_used || mlMetrics.weights || {};
  const categories = ['Tümü', ...Array.from(new Set(recommendations.map(getRecommendationCategory)))];
  const filteredRecommendations = selectedCat === 'Tümü'
    ? recommendations
    : recommendations.filter(item => getRecommendationCategory(item) === selectedCat);

  // Turetilmis kategori listesi ve agirliklar render akisinda hesaplanir;
  // boylece filtreleme ve skor kirilimi icin ek API cagrisi gerekmez.
  const fetchWishlistIds = useCallback(async () => {
    try {
      const response = await wishlistAPI.getWishlist();
      if (response.data && response.data.items) {
        const ids = response.data.items.map((item: any) => item.product.id);
        setWishlistIds(ids);
      }
    } catch (error) {
      console.log('Wishlist fetch error', error);
    }
  }, []);

  const fetchRecommendations = useCallback(async (forceRefresh = false) => {
    try {
      const response = await recommendationAPI.getRecommendations(forceRefresh);
      const data = response.data;
      
      // Yeni response biciminde oneriler ve ml_metrics ayni payload'da gelebilir.
      if (data.recommendations) {
        setRecommendations(Array.isArray(data.recommendations) ? data.recommendations : []);
      } else {
        setRecommendations(Array.isArray(data) ? data : []);
      }
      
      if (data.ml_metrics) {
        setMlMetrics(data.ml_metrics);
      }
    } catch (error) {
      console.error('Recommendations fetch error:', error);
      setRecommendations([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRecommendations(false); // Ilk yuklemede cache'teki oneri listesini hizli goster.
    fetchWishlistIds();
  }, [fetchRecommendations, fetchWishlistIds]);

  useEffect(() => {
    const availableCategories = new Set(recommendations.map(getRecommendationCategory));
    // Dismiss sonrasi secili kategori bos kalirsa kullaniciyi otomatik olarak
    // tum sonuclara geri tasiyoruz; boylece ekran bos sanilmaz.
    if (selectedCat !== 'Tümü' && !availableCategories.has(selectedCat)) {
      setSelectedCat('Tümü');
    }
  }, [recommendations, selectedCat]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRecommendations(true); // Asagi cekmede backend'i yeniden skor hesaplamaya zorla.
    fetchWishlistIds();
  }, [fetchRecommendations, fetchWishlistIds]);

  const handleAddToWishlist = async (productId: number, productName: string) => {
    try {
      await wishlistAPI.addItem(productId);
      setWishlistIds(prev => [...prev, productId]);
      Alert.alert(t('common.success'), `"${productName}" ${t('home.addedToWishlist')}`);
    } catch (error: any) {
      if (error.response?.data?.error) {
        Alert.alert(t('common.error'), error.response.data.error);
      } else {
        Alert.alert(t('common.error'), t('home.addFailed'));
      }
    }
  };

  const handleProductClick = (item: Recommendation) => {
    router.push(`/product/${item.product.id}`);
  };

  // Tek geri bildirim akisi kullanildi; boylece begen ve dismiss aksiyonlari
  // ayni hata yonetimi ve anlik UI guncellemesiyle tutarli davranir.
  const handleFeedback = async (item: Recommendation, feedbackType: 'like' | 'dismiss') => {
    if (!item.id) return;
    try {
      if (feedbackType === 'like') {
        await recommendationAPI.recordClick(item.id);
        // Tiklama olumlu sinyaldir; local state'i hemen guncelleyerek tam liste
        // yenilemesini beklemeden kartin geri bildirime tepki vermesini sagliyoruz.
        setRecommendations(prev => prev.map(rec => (
          rec.id === item.id ? { ...rec, clicked: true } : rec
        )));
        return;
      }

      // Dismiss edilen karti listeden hemen cikararak kullaniciya anlik geri
      // bildirim veriyoruz; backend yeni oneriyi arka planda uretebilir.
      await recommendationAPI.dismissRecommendation(item.id);
      setRecommendations(prev => prev.filter(r => r.id !== item.id));
    } catch (error) {
      Alert.alert(
        'Hata',
        feedbackType === 'like' ? 'Geri bildirim kaydedilemedi' : 'İşlem başarısız',
      );
    }
  };

  // Skor rengi, kullanicinin oneri gucunu hizli okumasini kolaylastirir.
  const getScoreColor = (score: number) => {
    if (score >= 1.0) return '#2E7D32';
    if (score >= 0.7) return '#4CAF50';
    if (score >= 0.4) return '#FF9800';
    if (score >= 0.2) return '#2196F3';
    return '#9E9E9E';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 1.0) return t('recs.veryHigh');
    if (score >= 0.7) return t('recs.high');
    if (score >= 0.4) return t('recs.medium');
    if (score >= 0.2) return t('recs.low');
    return t('recs.basic');
  };

  // Sira rozeti, ilk uc adayi tek bakista ayirt etmeyi saglar.
  const getRankEmoji = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `#${index + 1}`;
  };

  const renderMLMetricsCard = () => {
    if (!showMetrics) return null;
    
    const r2 = mlMetrics.test_r2;
    const hitRate = mlMetrics.hit_rate_at_10;
    const trainedAt = mlMetrics.trained_at;
    
    return (
      <View style={styles.metricsCard}>
        {/* Test bildirimi sadece bu kartin gelistirme amacli oldugunu hatirlatir. */}
        <View style={styles.testingBanner}>
          <FontAwesome name="flask" size={14} color="#fff" />
          <Text style={styles.testingBannerText}>
            {t('recs.testMode')}
          </Text>
        </View>

        <View style={styles.metricsContent}>
          <Text style={styles.metricsTitle}>{t('recs.mlMetrics')}</Text>
          <Text style={styles.metricsSubtitle}>Neural Collaborative Filtering (NCF)</Text>
          
          <View style={styles.metricsGrid}>
            {/* R2 kutusu modelin test basarisini ozetler. */}
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>R² Score (Test)</Text>
              <Text style={[
                styles.metricValue,
                { color: r2 != null && r2 > 0 ? '#4CAF50' : '#f44336' }
              ]}>
                {r2 != null ? r2.toFixed(4) : 'N/A'}
              </Text>
              <Text style={styles.metricNote}>
                {r2 != null && r2 > 0 ? t('recs.good') : r2 != null ? t('recs.moreDataNeeded') : '—'}
              </Text>
            </View>

            {/* Hit rate kutusu ilk 10 tahminde isabet oranini gosterir. */}
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Hit Rate @10</Text>
              <Text style={[
                styles.metricValue,
                { color: hitRate != null && hitRate > 0.5 ? '#4CAF50' : '#FF9800' }
              ]}>
                {hitRate != null ? `${(hitRate * 100).toFixed(1)}%` : 'N/A'}
              </Text>
              <Text style={styles.metricNote}>
                {hitRate != null && hitRate > 0.5 ? t('recs.good') : hitRate != null ? t('recs.moderate') : '—'}
              </Text>
            </View>

            {/* Egitim verisi kutusu modelin beslendigi sinyal miktarini gosterir. */}
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>{t('recs.trainingData')}</Text>
              <Text style={styles.metricValue}>
                {mlMetrics.n_interactions ?? '—'}
              </Text>
              <Text style={styles.metricNote}>{t('recs.interactions')}</Text>
            </View>

            {/* Loss kutusu egitim sonunda kalan hatayi ozetler. */}
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Final Loss</Text>
              <Text style={styles.metricValue}>
                {mlMetrics.final_loss != null ? mlMetrics.final_loss.toFixed(4) : 'N/A'}
              </Text>
              <Text style={styles.metricNote}>
                {mlMetrics.n_epochs ? `${mlMetrics.n_epochs} epoch` : '—'}
              </Text>
            </View>
          </View>

          {/* Agirliklar bolumu hangi hibrit karisimin kullanildigini aciklar. */}
          {(mlMetrics.weights_used || mlMetrics.weights) && (
            <View style={styles.weightsRow}>
              <Text style={styles.weightsLabel}>{t('recs.weights')}</Text>
              <Text style={styles.weightsText}>
                NCF: {((activeWeights.ncf ?? 0) * 100).toFixed(0)}% | 
                {t('recs.content')}: {((activeWeights.content ?? 0) * 100).toFixed(0)}% | 
                {t('recs.popularity')}: {((activeWeights.popularity ?? 0) * 100).toFixed(0)}%
              </Text>
            </View>
          )}

          {mlMetrics.user_tier && (
            <Text style={styles.weightTier}>
              Kullanıcı seviyesi: {mlMetrics.user_tier}
            </Text>
          )}

          {trainedAt && (
            <Text style={styles.trainedAt}>{t('recs.lastTrained')}: {trainedAt}</Text>
          )}
        </View>

        <TouchableOpacity 
          style={styles.hideMetricsBtn}
          onPress={() => setShowMetrics(false)}
        >
          <Text style={styles.hideMetricsBtnText}>{t('recs.hideMetrics')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderItem = ({ item, index }: { item: Recommendation; index: number }) => {
    const product = item.product;
    const isInStock = product.stock > 0;
    const inWishlist = wishlistIds.includes(product.id);
    const scoreColor = getScoreColor(item.score);
    const scoreLabel = getScoreLabel(item.score);
    const maxScore = recommendations.length > 0 ? recommendations[0].score : 1;
    const barWidth = maxScore > 0 ? (item.score / maxScore) * 100 : 0;

    return (
      <View style={[styles.card, item.clicked && styles.clickedCard]}>
        <TouchableOpacity
          onPress={() => handleProductClick(item)}
          activeOpacity={0.7}
        >
          {/* Kart basligi sira ve toplam skoru ayni satirda gosterir. */}
          <View style={styles.cardHeader}>
            <View style={styles.rankContainer}>
              <Text style={styles.rankText}>{getRankEmoji(index)}</Text>
            </View>
            <View style={styles.scoreContainer}>
              <Text style={[styles.scoreLabel, { color: scoreColor }]}>{scoreLabel}</Text>
              <Text style={[styles.scoreValue, { color: scoreColor }]}>
                {item.score.toFixed(3)}
              </Text>
            </View>
          </View>

          {/* Benzerlik cubugu skoru gorsel olarak goreceli hale getirir. */}
          <View style={styles.similarityBarBg}>
            <View style={[styles.similarityBarFill, { width: `${barWidth}%`, backgroundColor: scoreColor }]} />
          </View>

          <View style={styles.cardContent}>
            {product.image ? (
              <Image source={{ uri: getImageUrl(product.image) || '' }} style={styles.image} />
            ) : (
              <View style={[styles.image, styles.imagePlaceholder]}>
                <FontAwesome name="image" size={36} color="#ddd" />
              </View>
            )}

            <View style={styles.info}>
              <Text style={styles.productName} numberOfLines={2}>
                {product.name}
              </Text>
              {product.brand ? (
                <Text style={styles.brand}>{product.brand}</Text>
              ) : null}
              
              {/* Neden etiketi, urunun neden listede oldugunu kisaca aciklar. */}
              <View style={styles.reasonChip}>
                <FontAwesome name="lightbulb-o" size={12} color="#7B1FA2" />
                <Text style={styles.reasonText}>{item.reason}</Text>
              </View>

              {/* Skor dokumu toplam skoru aktif agirliklara gore yaklasik parcaliyor.
                  Ornek: toplam skor 0.90 ve NCF agirligi 0.40 ise NCF katkisi 0.36 gorunur. */}
              <View style={styles.scoreBreakdown}>
                <Text style={styles.scoreBreakdownItem}>
                  NCF: {(item.score * (activeWeights.ncf ?? 0)).toFixed(2)}
                </Text>
                <Text style={styles.scoreBreakdownItem}>
                  İçerik: {(item.score * (activeWeights.content ?? 0)).toFixed(2)}
                </Text>
                <Text style={styles.scoreBreakdownItem}>
                  Popülerlik: {(item.score * (activeWeights.popularity ?? 0)).toFixed(2)}
                </Text>
              </View>

              <View style={styles.priceRow}>
                <Text style={styles.price}>
                  {parseFloat(product.price).toLocaleString('tr-TR', {
                    style: 'currency',
                    currency: 'TRY',
                  })}
                </Text>
                <View
                  style={[
                    styles.stockBadge,
                    { backgroundColor: isInStock ? '#4CAF50' : '#f44336' },
                  ]}
                >
                  <Text style={styles.stockText}>
                    {isInStock ? t('home.inStock') : t('home.outOfStock')}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </TouchableOpacity>

        {/* Aksiyon satiri hem istek listesi hem de oneri geri bildirimi icin tek alandir. */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.wishlistButton, inWishlist && styles.disabledButton]}
            onPress={() => !inWishlist && handleAddToWishlist(product.id, product.name)}
            disabled={inWishlist}
          >
            <FontAwesome
              name={inWishlist ? "heart" : "heart-o"}
              size={16}
              color={inWishlist ? "#9E9E9E" : "#f44336"}
            />
            <Text style={[styles.wishlistButtonText, inWishlist && { color: '#9E9E9E' }]}>
              {inWishlist ? t('home.inWishlist') : t('home.addToWishlist')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.feedbackButton}
            onPress={() => handleFeedback(item, 'like')}
            accessibilityLabel="Bu öneriyi beğendim"
            testID={`like-feedback-${item.id ?? product.id}`}
          >
            {/* Begen butonu tiklamayi pozitif sinyal olarak kaydeder. */}
            <FontAwesome name="thumbs-up" size={14} color="#4CAF50" />
            <Text style={styles.likeButtonText}>Beğendim</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.feedbackButton}
            onPress={() => handleFeedback(item, 'dismiss')}
            accessibilityLabel="Bu öneriyi gösterme"
            testID={`dismiss-feedback-${item.id ?? product.id}`}
          >
            {/* Gosterme butonu karti listeden cikarir ve backend'e sert exclude sinyali yollar. */}
            <FontAwesome name="thumbs-down" size={14} color="#F44336" />
            <Text style={styles.dismissButtonText}>Gösterme</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#7B1FA2" testID="loading-recommendations" />
        <Text style={styles.loadingText}>{t('recs.loading')}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={filteredRecommendations}
        renderItem={renderItem}
        keyExtractor={(item, index) => item.id?.toString() || `rec-${item.product.id}-${index}`}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7B1FA2" />
        }
        ListHeaderComponent={
          <View>
            {/* Baslik alani ekranin ML baglamini tanitir. */}
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>{t('recs.title')}</Text>
                <Text style={styles.subtitle}>
                  {t('recs.subtitle')}
                </Text>
              </View>
              {!showMetrics && (
                <TouchableOpacity
                  style={styles.showMetricsBtn}
                  onPress={() => setShowMetrics(true)}
                >
                  <FontAwesome name="bar-chart" size={14} color="#7B1FA2" />
                </TouchableOpacity>
              )}
            </View>

            {/* ML metrik karti gelistirme amacli tanisal bilgileri gosterir. */}
            {renderMLMetricsCard()}

            {/* Kategori ciplari mevcut sonuc listesinden uretilir; bu sayede
                filtreler backend'den ayri metadata beklemeden her zaman guncel kalir. */}
            <View style={styles.categoryFilterSection}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryFilterContent}
              >
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.catChip,
                      selectedCat === cat && styles.catChipActive,
                    ]}
                    onPress={() => setSelectedCat(cat)}
                  >
                    <Text
                      style={[
                        styles.catChipText,
                        selectedCat === cat && styles.catChipTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Oneri sayisi kullaniciya filtre sonrasi kalan sonucu ozetler. */}
            {filteredRecommendations.length > 0 && (
              <View style={styles.countRow}>
                <Text style={styles.countText}>
                  {filteredRecommendations.length} {t('recs.productsRecommended')}
                </Text>
                <Text style={styles.countSubtext}>
                  {t('recs.pullToRefresh')}
                </Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <FontAwesome name="lightbulb-o" size={80} color="#ccc" />
            <Text style={styles.emptyTitle}>{t('recs.noRecs')}</Text>
            <Text style={styles.emptyText}>
              {t('recs.noRecsDesc')}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f6fa',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f6fa',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    marginTop: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
    fontStyle: 'italic',
  },
  showMetricsBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f0e6f6',
  },

  // ML metrik karti
  metricsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e8e0f0',
    shadowColor: '#7B1FA2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  testingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E65100',
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  testingBannerText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  metricsContent: {
    padding: 16,
  },
  metricsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    marginBottom: 2,
  },
  metricsSubtitle: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricBox: {
    flex: 1,
    minWidth: '45%' as any,
    backgroundColor: '#fafafa',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    color: '#888',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#333',
  },
  metricNote: {
    fontSize: 10,
    color: '#aaa',
    marginTop: 2,
  },
  weightsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  weightsLabel: {
    fontSize: 11,
    color: '#888',
    fontWeight: '600',
    marginRight: 6,
  },
  weightsText: {
    fontSize: 11,
    color: '#666',
    flex: 1,
  },
  trainedAt: {
    fontSize: 10,
    color: '#bbb',
    marginTop: 8,
    textAlign: 'right',
  },
  weightTier: {
    fontSize: 11,
    color: '#7B1FA2',
    fontWeight: '600',
    marginTop: 8,
  },
  hideMetricsBtn: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingVertical: 8,
    alignItems: 'center',
  },
  hideMetricsBtnText: {
    fontSize: 12,
    color: '#999',
  },

  // Oneri sayisi satiri
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  countText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  countSubtext: {
    fontSize: 11,
    color: '#bbb',
  },
  categoryFilterSection: {
    marginBottom: 12,
  },
  categoryFilterContent: {
    paddingVertical: 4,
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e7e7e7',
    marginRight: 8,
  },
  catChipActive: {
    backgroundColor: '#7B1FA2',
    borderColor: '#7B1FA2',
  },
  catChipText: {
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
  },
  catChipTextActive: {
    color: '#fff',
  },

  // Urun karti
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    overflow: 'hidden',
  },
  clickedCard: {
    opacity: 0.85,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  rankContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankText: {
    fontSize: 18,
    fontWeight: '700',
  },
  scoreContainer: {
    alignItems: 'flex-end',
  },
  scoreLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scoreValue: {
    fontSize: 16,
    fontWeight: '800',
  },

  // Benzerlik cubugu
  similarityBarBg: {
    height: 4,
    backgroundColor: '#f0f0f0',
    marginHorizontal: 14,
    borderRadius: 2,
    marginBottom: 8,
    overflow: 'hidden',
  },
  similarityBarFill: {
    height: '100%',
    borderRadius: 2,
  },

  cardContent: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  image: {
    width: 90,
    height: 90,
    borderRadius: 12,
    backgroundColor: '#f8f8f8',
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#222',
    lineHeight: 19,
    marginBottom: 3,
  },
  brand: {
    fontSize: 11,
    color: '#888',
    fontWeight: '500',
    marginBottom: 4,
  },
  reasonChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3e5f5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
    gap: 6,
  },
  reasonText: {
    fontSize: 12,
    color: '#7B1FA2',
    fontWeight: '600',
    flex: 1,
  },
  scoreBreakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  scoreBreakdownItem: {
    fontSize: 11,
    color: '#5b5b5b',
    backgroundColor: '#f6f6f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  price: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111',
  },
  stockBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stockText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f5f5f5',
  },
  wishlistButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
    backgroundColor: '#fafafa',
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#f0f0f0',
  },
  wishlistButtonText: {
    color: '#f44336',
    fontWeight: '600',
    fontSize: 12,
  },
  disabledButton: {
    opacity: 1,
    backgroundColor: '#f5f5f5',
  },
  feedbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
    backgroundColor: '#fafafa',
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#f0f0f0',
  },
  likeButtonText: {
    color: '#4CAF50',
    fontWeight: '600',
    fontSize: 12,
  },
  dismissButtonText: {
    color: '#F44336',
    fontWeight: '600',
    fontSize: 12,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginTop: 24,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});

export default RecommendationsScreen;
