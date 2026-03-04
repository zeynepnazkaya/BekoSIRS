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
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { recommendationAPI, wishlistAPI, viewHistoryAPI, getImageUrl } from '../../services';
import { useRouter } from 'expo-router';

interface Recommendation {
  id?: number;  // Optional: ML API doesn't provide ID for real-time recommendations
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

const RecommendationsScreen = () => {
  const router = useRouter();
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  /* New wishlist state */
  const [wishlistIds, setWishlistIds] = useState<number[]>([]);

  const fetchWishlistIds = useCallback(async () => {
    try {
      const response = await wishlistAPI.getWishlist();
      // response.data is Wishlist object with items: WishlistItem[]
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
      const data = response.data.recommendations || response.data;
      setRecommendations(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Recommendations fetch error:', error);
      setRecommendations([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchRecommendations();
    fetchWishlistIds();
  }, [fetchRecommendations, fetchWishlistIds]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRecommendations(true); // Pull to refresh triggers retraining if true passed
    fetchWishlistIds();
  }, [fetchRecommendations, fetchWishlistIds]);

  /* ... handleGenerateRecommendations ... keep as is but maybe remove button */

  /* Modified handleAddToWishlist to update local state */
  const handleAddToWishlist = async (productId: number, productName: string) => {
    try {
      await wishlistAPI.addItem(productId);
      setWishlistIds(prev => [...prev, productId]);
      Alert.alert('Başarılı', `"${productName}" istek listenize eklendi!`);
    } catch (error: any) {
      if (error.response?.data?.error) {
        Alert.alert('Bilgi', error.response.data.error);
      } else {
        Alert.alert('Hata', 'Ürün eklenemedi');
      }
    }
  };

  const handleProductClick = (item: Recommendation) => {
    // Record click if needed, or just navigate
    router.push(`/product/${item.product.id}`);
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return '#4CAF50';
    if (score >= 0.5) return '#FF9800';
    return '#2196F3';
  };

  const renderItem = ({ item }: { item: Recommendation }) => {
    const product = item.product;
    const isInStock = product.stock > 0;
    const inWishlist = wishlistIds.includes(product.id);

    return (
      <TouchableOpacity
        style={[styles.card, item.clicked && styles.clickedCard]}
        onPress={() => handleProductClick(item)}
        activeOpacity={0.7}
      >
        {/* Match Score Badge */}
        <View style={[styles.scoreBadge, { backgroundColor: getScoreColor(item.score) }]}>
          <Text style={styles.scoreText}>{Math.round(item.score * 100)}%</Text>
        </View>

        <View style={styles.cardContent}>
          {product.image ? (
            <Image source={{ uri: getImageUrl(product.image) || '' }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]}>
              <FontAwesome name="image" size={40} color="#ccc" />
            </View>
          )}

          <View style={styles.info}>
            <Text style={styles.productName} numberOfLines={2}>
              {product.name}
            </Text>
            <Text style={styles.brand}>{product.brand}</Text>
            <Text style={styles.reason} numberOfLines={2}>
              {item.reason}
            </Text>
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
                  {isInStock ? 'Stokta' : 'Stok Yok'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.wishlistButton, inWishlist && styles.disabledButton]}
            onPress={() => !inWishlist && handleAddToWishlist(product.id, product.name)}
            disabled={inWishlist}
          >
            <FontAwesome
              name={inWishlist ? "heart" : "heart-o"}
              size={18}
              color={inWishlist ? "#9E9E9E" : "#f44336"}
            />
            <Text style={[styles.wishlistButtonText, inWishlist && { color: '#9E9E9E' }]}>
              {inWishlist ? 'İstek Listesinde' : 'İstek Listesine Ekle'}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#000000" testID="loading-recommendations" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={recommendations}
        renderItem={renderItem}
        keyExtractor={(item, index) => item.id?.toString() || `rec-${item.product.id}-${index}`}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Size Özel Öneriler</Text>
              <Text style={styles.subtitle}>
                Görüntüleme geçmişinize göre seçildi
              </Text>
            </View>
            {/* Removed Manual Refresh Button */}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <FontAwesome name="lightbulb-o" size={80} color="#ccc" />
            <Text style={styles.emptyTitle}>Henüz Öneri Yok</Text>
            <Text style={styles.emptyText}>
              Ürünleri görüntüledikçe size özel öneriler burada görünecek
            </Text>
            {/* Kept Browse (Check/Generate) Logic for empty state */}
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa', // Lighter background
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 10,
  },
  header: {
    marginBottom: 16,
    marginTop: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    overflow: 'hidden',
  },
  clickedCard: {
    opacity: 0.9,
  },
  scoreBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    zIndex: 1,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  scoreText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  cardContent: {
    flexDirection: 'row',
    padding: 12,
  },
  image: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  productName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    lineHeight: 20,
    marginBottom: 4,
  },
  brand: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    marginBottom: 4,
  },
  reason: {
    fontSize: 11,
    color: '#9C27B0',
    fontWeight: '500',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  stockBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  stockText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  actions: {
    borderTopWidth: 1,
    borderTopColor: '#f5f5f5',
  },
  wishlistButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
    backgroundColor: '#fafafa',
  },
  wishlistButtonText: {
    color: '#f44336',
    fontWeight: '600',
    fontSize: 13,
  },
  disabledButton: {
    opacity: 1, // Keep visible but styled grey
    backgroundColor: '#f5f5f5',
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
  generateButton: {
    display: 'none', // Hidden as requested
  },
  generateButtonText: {
    display: 'none',
  },
  browseButton: {
    display: 'none',
  },
  browseButtonText: {
    display: 'none',
  }
});


export default RecommendationsScreen;
