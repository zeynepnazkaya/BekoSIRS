import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Text,
  View,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Image,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { wishlistAPI, viewHistoryAPI, getImageUrl } from '../../../services';
import { useRouter } from 'expo-router';
import { useLanguage } from '../../../context/LanguageContext';
import { t } from '../../../i18n';

interface WishlistItem {
  id: number;
  product: {
    id: number;
    name: string;
    brand: string;
    price: string;
    stock: number;
    image?: string;
    category_name?: string;
  };
  added_at: string;
  note?: string;
  notify_on_price_drop: boolean;
  notify_on_restock: boolean;
}

interface Wishlist {
  id: number;
  items: WishlistItem[];
  item_count: number;
}

const WishlistScreen = () => {
  const [wishlist, setWishlist] = useState<Wishlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const { language } = useLanguage();

  const fetchWishlist = useCallback(async () => {
    try {
      const response = await wishlistAPI.getWishlist();
      setWishlist(response.data);
    } catch (error) {
      console.error('Wishlist fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchWishlist();
  }, [fetchWishlist]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchWishlist();
  }, [fetchWishlist]);

  const handleRemoveItem = async (productId: number, productName: string) => {
    Alert.alert(
      t('wishlist.removeTitle'),
      `"${productName}" ${t('wishlist.removeConfirm')}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('wishlist.remove'),
          style: 'destructive',
          onPress: async () => {
            try {
              await wishlistAPI.removeItem(productId);
              fetchWishlist();
            } catch (error) {
              Alert.alert(t('common.error'), t('wishlist.removeFailed'));
            }
          },
        },
      ]
    );
  };

  const handleViewProduct = async (productId: number) => {
    try {
      await viewHistoryAPI.recordView(productId);
    } catch (error) {
      console.log('View recording failed:', error);
    }
    // Navigate to product detail if you have that screen
    // router.push(`/product/${productId}`);
  };

  const renderItem = ({ item }: { item: WishlistItem }) => {
    const product = item.product;
    const isInStock = product.stock > 0;

    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.cardContent}
          onPress={() => handleViewProduct(product.id)}
          activeOpacity={0.7}
        >
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
            {product.category_name && (
              <Text style={styles.category}>{product.category_name}</Text>
            )}
            <Text style={styles.price}>
              {parseFloat(product.price).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US', {
                style: 'currency',
                currency: 'TRY',
              })}
            </Text>
            <View style={styles.stockContainer}>
              <View
                style={[
                  styles.stockBadge,
                  { backgroundColor: isInStock ? '#4CAF50' : '#f44336' },
                ]}
              >
                <Text style={styles.stockText}>
                  {isInStock ? `${t('home.inStock')} (${product.stock})` : t('home.outOfStock')}
                </Text>
              </View>
            </View>
            {item.note && (
              <Text style={styles.note} numberOfLines={1}>
                {t('wishlist.note')}: {item.note}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        <View style={styles.actions}>
          <View style={styles.notifyIcons}>
            <TouchableOpacity
              onPress={async () => {
                try {
                  await wishlistAPI.updateItem(product.id, { notify_on_price_drop: !item.notify_on_price_drop });
                  fetchWishlist();
                } catch (e) {
                  Alert.alert(t('common.error'), t('wishlist.updateFailed'));
                }
              }}
              style={[styles.notifyBadge, !item.notify_on_price_drop && { backgroundColor: '#ddd' }]}
            >
              <FontAwesome name="tag" size={12} color={item.notify_on_price_drop ? "#fff" : "#666"} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={async () => {
                try {
                  await wishlistAPI.updateItem(product.id, { notify_on_restock: !item.notify_on_restock });
                  fetchWishlist();
                } catch (e) {
                  Alert.alert(t('common.error'), t('wishlist.updateFailed'));
                }
              }}
              style={[styles.notifyBadge, { backgroundColor: item.notify_on_restock ? '#2196F3' : '#ddd' }]}
            >
              <FontAwesome name="bell" size={12} color={item.notify_on_restock ? "#fff" : "#666"} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => handleRemoveItem(product.id, product.name)}
          >
            <FontAwesome name="trash" size={20} color="#f44336" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#000000" testID="loading-wishlist" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={wishlist?.items || []}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>{t('wishlist.title')}</Text>
            <Text style={styles.subtitle}>
              {wishlist?.item_count || 0} {t('wishlist.productCount')}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <FontAwesome name="heart-o" size={80} color="#ccc" />
            <Text style={styles.emptyTitle}>{t('wishlist.emptyTitle')}</Text>
            <Text style={styles.emptyText}>
              {t('wishlist.emptyDesc')}
            </Text>
            <TouchableOpacity
              style={styles.browseButton}
              onPress={() => router.push('/')}
            >
              <Text style={styles.browseButtonText}>{t('wishlist.browse')}</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  header: {
    marginTop: 10,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row',
    padding: 12,
  },
  image: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  brand: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  category: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  price: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    marginTop: 6,
  },
  stockContainer: {
    marginTop: 6,
  },
  stockBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  stockText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  note: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  notifyIcons: {
    flexDirection: 'row',
    gap: 6,
  },
  notifyBadge: {
    backgroundColor: '#FF9800',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButton: {
    padding: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  browseButton: {
    marginTop: 20,
    backgroundColor: '#000000',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  browseButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default WishlistScreen;
