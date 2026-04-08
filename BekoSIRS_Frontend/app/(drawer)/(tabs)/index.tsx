import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { FontAwesome } from '@expo/vector-icons';
import api, { wishlistAPI, productAPI, recommendationAPI } from '../../../services';
import { ProductCard } from '../../../components/ProductCard';
import { CompareModal } from '../../../components/CompareModal';
import { useRouter, Router } from 'expo-router';
import { getToken } from '../../../storage/storage.native';
import { useLanguage } from '../../../context/LanguageContext';
import { t } from '../../../i18n';

const { width } = Dimensions.get('window');
const GAP = 12;
const PADDING = 16;
const ITEM_WIDTH = (width - (PADDING * 2) - GAP) / 2;

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

// --- Extracted Components to preventing Re-render Focus Loss ---

const PopularProductCard = ({ item, router, compareMode, isSelected, onCompareSelect }: {
  item: Product;
  router: Router;
  compareMode?: boolean;
  isSelected?: boolean;
  onCompareSelect?: (p: Product) => void;
}) => (
  <View style={{ position: 'relative' }}>
    <TouchableOpacity
      style={[styles.popularCard, isSelected && { borderWidth: 2, borderColor: '#6366F1' }]}
      onPress={compareMode && onCompareSelect ? () => onCompareSelect(item) : () => router.push(`/product/${item.id}`)}
      activeOpacity={0.8}
    >
      {item.image ? (
        <Image
          source={{ uri: getImageUrl(item.image) || '' }}
          style={styles.popularImage}
          contentFit="cover"
          transition={200}
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
    {compareMode && (
      <View style={styles.popularCompareCheck}>
        <View style={[styles.compareCheck, isSelected && styles.compareCheckSelected]}>
          {isSelected && <FontAwesome name="check" size={12} color="#fff" />}
        </View>
      </View>
    )}
  </View>
);

interface HomeListHeaderProps {
  searchQuery: string;
  setSearchQuery: (text: string) => void;
  popularProducts: Product[];
  categories: Category[];
  selectedCategory: number | null;
  setSelectedCategory: (id: number | null) => void;
  sortBy: 'all' | 'reviews' | 'comments' | 'popular';
  setSortBy: (sort: 'all' | 'reviews' | 'comments' | 'popular') => void;
  clearFilters: () => void;
  recommendedProducts: any[];
  router: Router;
  isSearching: boolean;
  compareMode: boolean;
  setCompareMode: (v: boolean) => void;
  compareCount: number;
  compareProducts: Product[];
  toggleCompareProduct: (p: Product) => void;
}

const HomeListHeader = ({
  searchQuery,
  setSearchQuery,
  popularProducts,
  categories,
  selectedCategory,
  setSelectedCategory,
  sortBy,
  setSortBy,
  clearFilters,
  recommendedProducts,
  router,
  isSearching,
  compareMode,
  setCompareMode,
  compareCount,
  compareProducts,
  toggleCompareProduct,
}: HomeListHeaderProps) => (
  <View style={styles.headerContainer}>
    {/* Arama Kutusu */}
    <View style={styles.searchContainer}>
      <FontAwesome name="search" size={16} color="#9CA3AF" style={styles.searchIcon} />
      <TextInput
        style={styles.searchInput}
        placeholder={t('home.searchPlaceholder')}
        placeholderTextColor="#9CA3AF"
        value={searchQuery}
        onChangeText={setSearchQuery}
        autoCorrect={false}
        autoCapitalize="none"
      />
      {isSearching && (
        <ActivityIndicator size="small" color="#9CA3AF" style={{ marginRight: 8 }} />
      )}
      {searchQuery.length > 0 && !isSearching && (
        <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
          <FontAwesome name="times-circle" size={16} color="#9CA3AF" />
        </TouchableOpacity>
      )}
    </View>

    {/* Compare Mode Toggle */}
    {!searchQuery && (
      <TouchableOpacity
        style={[styles.compareToggle, compareMode && styles.compareToggleActive]}
        onPress={() => setCompareMode(!compareMode)}
      >
        <FontAwesome name="columns" size={14} color={compareMode ? '#fff' : '#6366F1'} />
        <Text style={[styles.compareToggleText, compareMode && styles.compareToggleTextActive]}>
          {compareMode ? `Karşılaştırma Modu (${compareCount}/2)` : 'Ürün Karşılaştır'}
        </Text>
      </TouchableOpacity>
    )}

    {/* Suggested for You Section - ML driven */}
    {recommendedProducts.length > 0 && !searchQuery && (
      <View style={styles.popularSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.recommendations')}</Text>
          <TouchableOpacity onPress={() => router.push('/(drawer)/recommendations')}>
            <Text style={styles.seeAll}>{t('home.seeAll')}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.popularScroll}
        >
          {recommendedProducts.map((rec, index) => (
            <PopularProductCard 
              key={rec.product.id || index} 
              item={rec.product} 
              router={router}
              compareMode={compareMode}
              isSelected={compareProducts.some(p => p.id === rec.product.id)}
              onCompareSelect={toggleCompareProduct}
            />
          ))}
        </ScrollView>
      </View>
    )}

    {/* Popular Products Section - Hide when searching */}
    {popularProducts.length > 0 && !searchQuery && (
      <View style={styles.popularSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.popular')}</Text>
          <TouchableOpacity>
            <Text style={styles.seeAll}>{t('home.seeAll')}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.popularScroll}
        >
          {popularProducts.map((product) => (
            <PopularProductCard
              key={product.id}
              item={product}
              router={router}
              compareMode={compareMode}
              isSelected={compareProducts.some(p => p.id === product.id)}
              onCompareSelect={toggleCompareProduct}
            />
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
          {t('home.all')}
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
      <Text style={styles.sortTitle}>{t('home.sortBy')}</Text>
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
            {t('home.all')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortChip, sortBy === 'reviews' && styles.sortChipActive]}
          onPress={() => setSortBy('reviews')}
        >
          <Text style={[styles.sortChipText, sortBy === 'reviews' && styles.sortChipTextActive]}>
            {t('home.mostReviewed')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortChip, sortBy === 'comments' && styles.sortChipActive]}
          onPress={() => setSortBy('comments')}
        >
          <Text style={[styles.sortChipText, sortBy === 'comments' && styles.sortChipTextActive]}>
            {t('home.mostCommented')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortChip, sortBy === 'popular' && styles.sortChipActive]}
          onPress={() => setSortBy('popular')}
        >
          <Text style={[styles.sortChipText, sortBy === 'popular' && styles.sortChipTextActive]}>
            {t('home.bestSelling')}
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
            {searchQuery && `${t('home.search')}: "${searchQuery}"`}
          </Text>
          <TouchableOpacity onPress={clearFilters} style={styles.clearFiltersButton}>
            <Text style={styles.clearFiltersText}>{t('home.clearFilters')}</Text>
          </TouchableOpacity>
        </View>
      )
    }
  </View >
);

// --- Main Component ---

const HomeScreen = () => {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [popularProducts, setPopularProducts] = useState<Product[]>([]);
  const [recommendedProducts, setRecommendedProducts] = useState<any[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'all' | 'reviews' | 'comments' | 'popular'>('all');
  const [wishlistIds, setWishlistIds] = useState<Set<number>>(new Set());
  const [compareMode, setCompareMode] = useState(false);
  const [compareProducts, setCompareProducts] = useState<Product[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Track if initial data has been loaded
  const isInitialLoadDone = useRef(false);

  // Initial data fetch (categories, popular, wishlist, initial products)
  const fetchInitialData = useCallback(async () => {
    try {
      const token = await getToken();

      const requests: Promise<any>[] = [
        api.get('/api/v1/products/?page_size=50'),
        api.get('/api/v1/categories/?page_size=1000'),
        productAPI.getPopularProducts(),
        token ? recommendationAPI.getRecommendations() : Promise.resolve({ data: { recommendations: [] } }),
      ];

      if (token) {
        requests.push(wishlistAPI.getWishlist());
      }

      const [productsRes, categoriesRes, popularRes, wishlistRes] = await Promise.all(requests);

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

      if (requests.length > 3) {
        const recommendationsRes = await requests[3];
        const recData = recommendationsRes.data?.recommendations || recommendationsRes.data || [];
        setRecommendedProducts(recData.slice(0, 6));
      }

      isInitialLoadDone.current = true;

      console.log('✅ Initial data loaded:', productsData.length, 'products');
    } catch (error) {
      console.error('❌ Initial data fetch error:', error);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Search products from API
  const searchProducts = useCallback(async (query: string, categoryId: number | null) => {
    // Skip if initial load hasn't completed
    if (!isInitialLoadDone.current) return;

    try {
      setIsSearching(true);

      let url = '/api/v1/products/?page_size=50';
      if (query && query.trim()) {
        url += `&search=${encodeURIComponent(query.trim())}`;
      }
      if (categoryId) {
        url += `&category=${categoryId}`;
      }

      console.log('🔍 Searching:', url);
      const res = await api.get(url);
      const data = Array.isArray(res.data) ? res.data : res.data.results || [];

      console.log('✅ Search results:', data.length, 'products found');
      setProducts(data);

      // Apply current sort
      let sortedData = [...data];
      if (sortBy === 'reviews' || sortBy === 'comments') {
        sortedData.sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
      } else if (sortBy === 'popular') {
        sortedData.sort((a, b) => b.id - a.id);
      }
      setFilteredProducts(sortedData);
    } catch (error) {
      console.error('❌ Search error:', error);
    } finally {
      setIsSearching(false);
    }
  }, [sortBy]);

  // Initial load
  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Debounced Search - triggers when search query OR category changes
  useEffect(() => {
    // Skip on initial mount (before first load completes)
    if (!isInitialLoadDone.current) return;

    // If both are empty/null, don't search (initial state)
    if (!searchQuery && selectedCategory === null) return;

    const timer = setTimeout(() => {
      searchProducts(searchQuery, selectedCategory);
    }, 300); // Reduced debounce for faster response

    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory, searchProducts]);

  // Sort Filter - Client-Side only
  useEffect(() => {
    let result = [...products];
    if (sortBy === 'reviews' || sortBy === 'comments') {
      result.sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
    } else if (sortBy === 'popular') {
      result.sort((a, b) => b.id - a.id);
    }
    setFilteredProducts(result);
  }, [sortBy, products]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setSearchQuery('');
    setSelectedCategory(null);
    isInitialLoadDone.current = false;
    fetchInitialData();
  }, [fetchInitialData]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategory(null);
    // Reload all products
    searchProducts('', null);
  }, [searchProducts]);

  const toggleCompareProduct = useCallback((product: Product) => {
    setCompareProducts(prev => {
      const exists = prev.find(p => p.id === product.id);
      if (exists) {
        return prev.filter(p => p.id !== product.id);
      }
      if (prev.length >= 2) {
        return prev; // max 2
      }
      return [...prev, product];
    });
  }, []);

  const handleExitCompareMode = useCallback(() => {
    setCompareMode(false);
    setCompareProducts([]);
  }, []);

  // Show full-screen loading only on initial load
  if (initialLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#000000" />
        <Text style={{ marginTop: 10, color: '#666' }}>{t('home.productsLoading')}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={filteredProducts}
        renderItem={({ item }) => {
          const isSelected = compareProducts.some(p => p.id === item.id);
          return (
            <View style={{ width: ITEM_WIDTH }}>
              <ProductCard
                product={item}
                initialInWishlist={wishlistIds.has(item.id)}
                compact={true}
                style={{ width: '100%' }}
                onPress={compareMode ? () => toggleCompareProduct(item) : undefined}
              />
              {compareMode && (
                <TouchableOpacity
                  style={[styles.compareOverlay, isSelected && styles.compareOverlaySelected]}
                  onPress={() => toggleCompareProduct(item)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.compareCheck, isSelected && styles.compareCheckSelected]}>
                    {isSelected && <FontAwesome name="check" size={12} color="#fff" />}
                  </View>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={[styles.list, compareMode && { paddingBottom: 100 }]}
        ListHeaderComponent={
          <HomeListHeader
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            popularProducts={popularProducts}
            categories={categories}
            selectedCategory={selectedCategory}
            setSelectedCategory={setSelectedCategory}
            sortBy={sortBy}
            setSortBy={setSortBy}
            clearFilters={clearFilters}
            recommendedProducts={recommendedProducts}
            router={router}
            isSearching={isSearching}
            compareMode={compareMode}
            setCompareMode={(v) => { if (!v) handleExitCompareMode(); else setCompareMode(true); }}
            compareCount={compareProducts.length}
            compareProducts={compareProducts}
            toggleCompareProduct={toggleCompareProduct}
          />
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#000']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <FontAwesome name="search" size={60} color="#ccc" />
            <Text style={styles.emptyTitle}>
              {isSearching ? t('home.searching') : t('home.noProducts')}
            </Text>
            <Text style={styles.emptyText}>
              {searchQuery
                ? `"${searchQuery}" ${t('home.noResultsFor')}`
                : t('home.noResultsCriteria')}
            </Text>
            {(searchQuery || selectedCategory !== null) && (
              <TouchableOpacity style={styles.clearButton2} onPress={clearFilters}>
                <Text style={styles.clearButton2Text}>{t('home.clearAllFilters')}</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {/* Compare Bottom Bar */}
      {compareMode && (
        <View style={styles.compareBar}>
          <View style={styles.compareBarProducts}>
            {compareProducts.map(p => (
              <View key={p.id} style={styles.compareBarItem}>
                {p.image ? (
                  <Image
                    source={{ uri: getImageUrl(p.image) || '' }}
                    style={styles.compareBarImage}
                    contentFit="contain"
                  />
                ) : (
                  <View style={[styles.compareBarImage, { backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' }]}>
                    <FontAwesome name="cube" size={14} color="#D1D5DB" />
                  </View>
                )}
                <Text style={styles.compareBarName} numberOfLines={1}>{p.name}</Text>
                <TouchableOpacity
                  style={styles.compareBarRemove}
                  onPress={() => toggleCompareProduct(p)}
                >
                  <FontAwesome name="times" size={10} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            {compareProducts.length < 2 && (
              <View style={styles.compareBarEmpty}>
                <FontAwesome name="plus" size={16} color="#9CA3AF" />
                <Text style={styles.compareBarEmptyText}>Ürün Seçin</Text>
              </View>
            )}
          </View>
          <View style={styles.compareBarActions}>
            <TouchableOpacity
              style={[styles.compareButton, compareProducts.length < 2 && styles.compareButtonDisabled]}
              onPress={() => compareProducts.length === 2 && setShowCompareModal(true)}
              disabled={compareProducts.length < 2}
            >
              <FontAwesome name="columns" size={14} color="#fff" />
              <Text style={styles.compareButtonText}>Karşılaştır</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.compareCancelButton} onPress={handleExitCompareMode}>
              <Text style={styles.compareCancelText}>İptal</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <CompareModal
        visible={showCompareModal}
        products={compareProducts}
        onClose={() => setShowCompareModal(false)}
        getImageUrl={getImageUrl}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 15,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    height: 50,
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
    width: ITEM_WIDTH,
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
    borderRadius: 100,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  categoryChipActive: {
    backgroundColor: '#111827',
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
    paddingHorizontal: 0,
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
    paddingHorizontal: 40,
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
  gridRow: {
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 12,
  },
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
  popularCompareCheck: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 2,
  },
  compareToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    marginBottom: 16,
  },
  compareToggleActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  compareToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6366F1',
  },
  compareToggleTextActive: {
    color: '#fff',
  },
  compareOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    padding: 6,
  },
  compareOverlaySelected: {
    borderColor: '#6366F1',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  compareCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#6366F1',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  compareCheckSelected: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  compareBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  compareBarProducts: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  compareBarItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 8,
    gap: 8,
  },
  compareBarImage: {
    width: 36,
    height: 36,
    borderRadius: 6,
  },
  compareBarName: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    color: '#374151',
  },
  compareBarRemove: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  compareBarEmpty: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 8,
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#D1D5DB',
  },
  compareBarEmptyText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  compareBarActions: {
    flexDirection: 'row',
    gap: 12,
  },
  compareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6366F1',
    paddingVertical: 12,
    borderRadius: 10,
  },
  compareButtonDisabled: {
    backgroundColor: '#C7D2FE',
  },
  compareButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  compareCancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  compareCancelText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default HomeScreen;
