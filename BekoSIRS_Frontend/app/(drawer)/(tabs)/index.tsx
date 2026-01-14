import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import api, { wishlistAPI, productAPI } from '../../../services/api';
import { ProductCard } from '../../../components/ProductCard';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

const getImageUrl = (imagePath: string | null): string | null => {
  if (!imagePath) return null;
  if (imagePath.startsWith('http')) return imagePath;
  const baseUrl = (api.defaults.baseURL || '').replace(/\/$/, '');
  return `${baseUrl}${imagePath}`;
};

interface Category {
  id: number;
  name: string;
}

interface Product {
  id: number;
  name: string;
  brand: string;
  price: string;
  stock: number;
  image?: string;
  category?: { id: number; name: string } | null;
  category_name?: string;
  review_count?: number;
  average_rating?: number;
}

const HomeScreen = () => {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [popularProducts, setPopularProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'all' | 'reviews' | 'comments' | 'popular'>('all');
  const [wishlistIds, setWishlistIds] = useState<Set<number>>(new Set());

  const fetchData = useCallback(async () => {
    try {
      const { getToken } = await import('../../../storage/storage.native');
      const token = await getToken();

      const requests: Promise<any>[] = [
        api.get('/api/v1/products/?page_size=1000'),
        api.get('/api/v1/categories/?page_size=1000'),
        productAPI.getPopularProducts(),
      ];

      if (token) {
        requests.push(wishlistAPI.getWishlist());
      }

      const responses = await Promise.all(requests);
      const productsRes = responses[0];
      const categoriesRes = responses[1];
      const popularRes = responses[2];
      const wishlistRes = token ? responses[3] : null;

      const productsData = Array.isArray(productsRes.data) ? productsRes.data : productsRes.data.results || [];
      const categoriesData = Array.isArray(categoriesRes.data) ? categoriesRes.data : categoriesRes.data.results || [];
      const popularData = Array.isArray(popularRes.data) ? popularRes.data : popularRes.data.results || [];

      if (wishlistRes?.data && wishlistRes.data.items) {
        const ids = wishlistRes.data.items.map((item: any) => item.product.id);
        setWishlistIds(new Set(ids));
      }

      setProducts(productsData);
      setFilteredProducts(productsData);
      setCategories(categoriesData);
      setPopularProducts(popularData.slice(0, 6));
    } catch (error) {
      console.error('Veri yükleme hatası:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    filterProducts();
  }, [searchQuery, selectedCategory, sortBy, products]);

  const filterProducts = () => {
    let result = [...products];

    // Kategori filtresi
    if (selectedCategory !== null) {
      result = result.filter((p) => p.category?.id === selectedCategory);
    }

    // Arama filtresi
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.brand.toLowerCase().includes(query)
      );
    }

    // Sıralama filtresi
    if (sortBy === 'reviews' || sortBy === 'comments') {
      // En çok değerlendirilen / yorumlanan (aynı mantık)
      result.sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
    } else if (sortBy === 'popular') {
      // Popüler ürünler (ID'ye göre - backend'den geliyor olabilir)
      result.sort((a, b) => b.id - a.id);
    }

    setFilteredProducts(result);
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setSearchQuery('');
    setSelectedCategory(null);
    fetchData();
  }, [fetchData]);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory(null);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#000000" />
      </View>
    );
  }

  const PopularProductCard = ({ item }: { item: Product }) => (
    <TouchableOpacity
      style={styles.popularCard}
      onPress={() => router.push(`/product/${item.id}`)}
      activeOpacity={0.8}
    >
      {item.image ? (
        <Image
          source={{ uri: getImageUrl(item.image) || '' }}
          style={styles.popularImage}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.popularImage, styles.imagePlaceholder]}>
          <FontAwesome name="cube" size={40} color="#D1D5DB" />
        </View>
      )}
      <View style={styles.popularInfo}>
        <Text style={styles.popularBrand} numberOfLines={1}>{item.brand}</Text>
        <Text style={styles.popularName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.popularPrice}>{item.price} TL</Text>
      </View>
    </TouchableOpacity>
  );

  /* Simplified Header Logic */
  const ListHeader = () => (
    <View style={styles.headerContainer}>
      {/* Arama Kutusu */}
      <View style={styles.searchContainer}>
        <FontAwesome name="search" size={16} color="#9CA3AF" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Ürün veya marka ara..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
            <FontAwesome name="times-circle" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Popular Products Section */}
      {popularProducts.length > 0 && (
        <View style={styles.popularSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Popüler Ürünler</Text>
            <TouchableOpacity>
              <Text style={styles.seeAll}>Tümünü Gör</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.popularScroll}
          >
            {popularProducts.map((product) => (
              <PopularProductCard key={product.id} item={product} />
            ))}
          </ScrollView>
        </View>
      )}

      {/* Kategori Filtreleri */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryContainer}
      >
        <TouchableOpacity
          style={[
            styles.categoryChip,
            selectedCategory === null && styles.categoryChipActive,
          ]}
          onPress={() => setSelectedCategory(null)}
        >
          <Text
            style={[
              styles.categoryChipText,
              selectedCategory === null && styles.categoryChipTextActive,
            ]}
          >
            Tümü
          </Text>
        </TouchableOpacity>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.categoryChip,
              selectedCategory === cat.id && styles.categoryChipActive,
            ]}
            onPress={() => setSelectedCategory(cat.id)}
          >
            <Text
              style={[
                styles.categoryChipText,
                selectedCategory === cat.id && styles.categoryChipTextActive,
              ]}
            >
              {cat.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Sıralama Filtreleri */}
      <View style={styles.sortSection}>
        <Text style={styles.sortTitle}>Sırala:</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortContainer}
        >
          <TouchableOpacity
            style={[styles.sortChip, sortBy === 'all' && styles.sortChipActive]}
            onPress={() => setSortBy('all')}
          >
            <Text style={[styles.sortChipText, sortBy === 'all' && styles.sortChipTextActive]}>
              Tümü
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortChip, sortBy === 'reviews' && styles.sortChipActive]}
            onPress={() => setSortBy('reviews')}
          >
            <Text style={[styles.sortChipText, sortBy === 'reviews' && styles.sortChipTextActive]}>
              En Çok Değerlendirilen
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortChip, sortBy === 'comments' && styles.sortChipActive]}
            onPress={() => setSortBy('comments')}
          >
            <Text style={[styles.sortChipText, sortBy === 'comments' && styles.sortChipTextActive]}>
              En Çok Yorum Alan
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortChip, sortBy === 'popular' && styles.sortChipActive]}
            onPress={() => setSortBy('popular')}
          >
            <Text style={[styles.sortChipText, sortBy === 'popular' && styles.sortChipTextActive]}>
              En Çok Satılan
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Aktif Filtre Bilgisi */}
      {
        (searchQuery || selectedCategory !== null) && (
          <View style={styles.activeFilterContainer}>
            <Text style={styles.activeFilterText}>
              {selectedCategory !== null &&
                `Kategori: ${categories.find((c) => c.id === selectedCategory)?.name}`}
              {searchQuery && selectedCategory !== null && ' • '}
              {searchQuery && `Arama: "${searchQuery}"`}
            </Text>
            <TouchableOpacity onPress={clearFilters} style={styles.clearFiltersButton}>
              <Text style={styles.clearFiltersText}>Temizle</Text>
            </TouchableOpacity>
          </View>
        )
      }
    </View >
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={filteredProducts}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            initialInWishlist={wishlistIds.has(item.id)}
            compact={true}
          />
        )}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.list}
        ListHeaderComponent={ListHeader}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#000']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <FontAwesome name="search" size={60} color="#ccc" />
            <Text style={styles.emptyTitle}>Ürün Bulunamadı</Text>
            <Text style={styles.emptyText}>
              Arama kriterlerinize uygun ürün bulunamadı.
            </Text>
            <TouchableOpacity style={styles.clearButton2} onPress={clearFilters}>
              <Text style={styles.clearButton2Text}>Filtreleri Temizle</Text>
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
    backgroundColor: '#fff', // White background for cleaner look
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContainer: {
    paddingTop: 10,
    paddingBottom: 15,
  },
  title: {
    fontSize: 28, // Large modern title
    fontWeight: '800',
    color: '#111827',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  /* Removed Subtitle style */
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6', // Light gray bg
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    height: 50,
    /* No border */
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  clearButton: {
    padding: 8,
  },
  popularSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  seeAll: {
    fontSize: 14,
    color: '#F97316',
    fontWeight: '600',
  },
  popularScroll: {
    paddingRight: 16,
    gap: 12,
  },
  popularCard: {
    width: CARD_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  popularImage: {
    width: '100%',
    height: 180,
    backgroundColor: '#F3F4F6',
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  popularInfo: {
    padding: 12,
  },
  popularBrand: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  popularName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
    height: 36,
  },
  popularPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F97316',
  },
  categoryScroll: {
    marginBottom: 10,
  },
  categoryContainer: {
    paddingRight: 16,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100, // Pill shape
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    /* Subtle shadow instead of strong border */
  },
  categoryChipActive: {
    backgroundColor: '#111827', // Black
    borderColor: '#111827',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  activeFilterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 5,
  },
  activeFilterText: {
    fontSize: 13,
    color: '#374151',
    flex: 1,
  },
  clearFiltersButton: {
    marginLeft: 10,
  },
  clearFiltersText: {
    fontSize: 13,
    color: '#EF4444',
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
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
  clearButton2: {
    marginTop: 20,
    backgroundColor: '#000000',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  clearButton2Text: {
    color: '#fff',
    fontWeight: '600',
  },
  // Grid Layout Styles
  gridRow: {
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    gap: 8,
  },
  // Sort Filter Styles
  sortSection: {
    marginBottom: 15,
    marginTop: 10,
  },
  sortTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },
  sortContainer: {
    gap: 8,
    paddingRight: 16,
  },
  sortChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sortChipActive: {
    backgroundColor: '#E31E24',
    borderColor: '#E31E24',
  },
  sortChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  sortChipTextActive: {
    color: '#FFFFFF',
  },
});

export default HomeScreen;
