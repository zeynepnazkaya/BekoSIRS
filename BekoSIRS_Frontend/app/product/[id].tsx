import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import api, { wishlistAPI, viewHistoryAPI, reviewAPI, productOwnershipAPI, getImageUrl } from '../../services';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../i18n';

interface Product {
  id: number;
  name: string;
  brand: string;
  price: string;
  stock: number;
  image?: string;
  image_url?: string;
  description?: string;
  category_name?: string;
  features?: string;
  warranty_months?: number;
}

interface SimilarProduct {
  id: number;
  name: string;
  brand: string;
  price: string;
  image?: string;
  image_url?: string;
  category_name?: string;
}

interface Review {
  id: number;
  customer_name: string;
  rating: number;
  comment: string;
  created_at: string;
  is_approved: boolean;
}

const { width } = Dimensions.get('window');

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [inWishlist, setInWishlist] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [isOwned, setIsOwned] = useState(false);
  const { language } = useLanguage();

  // Review states
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [userComment, setUserComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [averageRating, setAverageRating] = useState(0);
  const [similarProducts, setSimilarProducts] = useState<SimilarProduct[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);

  useEffect(() => {
    if (id) {
      fetchProduct();
      fetchReviews();
      fetchSimilarProducts();
      checkOwnership();
      recordView();
    }
  }, [id]);

  const fetchProduct = async () => {
    try {
      const response = await api.get(`/api/v1/products/${id}/`);
      setProduct(response.data);
      checkWishlistStatus();
    } catch (error) {
      Alert.alert(t('common.error'), t('product.loadError'));
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const fetchReviews = useCallback(async () => {
    setReviewsLoading(true);
    try {
      const response = await reviewAPI.getProductReviews(Number(id));
      const reviewData = response.data.reviews || response.data || [];
      setReviews(reviewData);

      // Calculate average rating
      if (reviewData.length > 0) {
        const avg = reviewData.reduce((sum: number, r: Review) => sum + r.rating, 0) / reviewData.length;
        setAverageRating(Math.round(avg * 10) / 10);
      }
    } catch (error) {
      console.log('Reviews fetch error:', error);
    } finally {
      setReviewsLoading(false);
    }
  }, [id]);

  const fetchSimilarProducts = async () => {
    setSimilarLoading(true);
    try {
      const response = await api.get(`/api/v1/products/${id}/similar/`);
      const data = Array.isArray(response.data) ? response.data : response.data?.results || [];
      setSimilarProducts(data.filter((p: SimilarProduct) => p.id !== Number(id)));
    } catch (error) {
      console.log('Similar products fetch error:', error);
    } finally {
      setSimilarLoading(false);
    }
  };

  const recordView = async () => {
    try {
      await viewHistoryAPI.recordView(Number(id));
    } catch (error) {
      // Ignore
    }
  };

  const checkWishlistStatus = async () => {
    try {
      const response = await wishlistAPI.checkItem(Number(id));
      setInWishlist(response.data.in_wishlist);
    } catch (error) {
      // Ignore
    }
  };

  const checkOwnership = async () => {
    try {
      const [ownershipRes, assignmentRes] = await Promise.all([
        productOwnershipAPI.getMyOwnerships().catch(() => ({ data: [] })),
        api.get('api/v1/assignments/').catch(() => ({ data: [] })),
      ]);

      const ownerships = Array.isArray(ownershipRes.data) ? ownershipRes.data : [];
      const assignmentsData = assignmentRes.data?.results || assignmentRes.data || [];
      const assignments = Array.isArray(assignmentsData) ? assignmentsData : [];

      const productId = Number(id);
      const owned = ownerships.some((item: any) => item.product?.id === productId);
      const assigned = assignments.some((item: any) => item.product?.id === productId);

      setIsOwned(owned || assigned);
    } catch (error) {
      console.log('Ownership check error', error);
    }
  };

  const handleWishlistToggle = async () => {
    setWishlistLoading(true);
    try {
      if (inWishlist) {
        await wishlistAPI.removeItem(Number(id));
        setInWishlist(false);
        Alert.alert(t('common.success'), t('product.removedFromWishlist'));
      } else {
        await wishlistAPI.addItem(Number(id));
        setInWishlist(true);
        Alert.alert(t('common.success'), t('product.addedToWishlist'));
      }
    } catch (error: any) {
      Alert.alert(t('common.error'), error.response?.data?.error || t('product.actionFailed'));
    } finally {
      setWishlistLoading(false);
    }
  };

  const handleServiceRequest = () => {
    router.push({
      pathname: '/service-requests',
      params: { openModal: 'true', productId: id }
    });
  };

  const handleSubmitReview = async () => {
    if (userRating === 0) {
      Alert.alert(t('common.error'), t('product.ratingError'));
      return;
    }

    setSubmittingReview(true);
    try {
      await reviewAPI.addReview(Number(id), userRating, userComment);
      Alert.alert(
        t('common.success'),
        t('product.reviewSent')
      );
      setShowReviewModal(false);
      setUserRating(0);
      setUserComment('');
      fetchReviews();
    } catch (error: any) {
      const errorMsg = error.response?.data?.detail ||
        error.response?.data?.error ||
        t('product.alreadyReviewed');
      Alert.alert('Hata', errorMsg);
    } finally {
      setSubmittingReview(false);
    }
  };

  const renderStars = (rating: number, size: number = 16, interactive: boolean = false) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <TouchableOpacity
          key={i}
          disabled={!interactive}
          onPress={() => interactive && setUserRating(i)}
          style={{ padding: interactive ? 4 : 0 }}
        >
          <FontAwesome
            name={i <= rating ? 'star' : 'star-o'}
            size={size}
            color={i <= rating ? '#FFB800' : '#D1D5DB'}
          />
        </TouchableOpacity>
      );
    }
    return <View style={{ flexDirection: 'row', gap: 2 }}>{stars}</View>;
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#000000" />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.center}>
        <Text>{t('product.notFound')}</Text>
      </View>
    );
  }

  const imageSource = product.image_url || product.image;
  const isInStock = product.stock > 0;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen 
        options={{
          headerTitle: t('product.headerTitle'),
          headerBackTitle: t('common.back'),
        }} 
      />
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Wishlist Button Overlay on Image — hidden if already owned/assigned */}
        {!isOwned && (
          <View style={styles.wishlistOverlay}>
            <TouchableOpacity
              onPress={handleWishlistToggle}
              style={styles.wishlistHeaderButton}
              disabled={wishlistLoading}
            >
              {wishlistLoading ? (
                <ActivityIndicator size="small" color="#f44336" />
              ) : (
                <FontAwesome
                  name={inWishlist ? 'heart' : 'heart-o'}
                  size={22}
                  color={inWishlist ? '#f44336' : '#666'}
                />
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Product Image */}
        <View style={styles.imageContainer}>
          {imageSource ? (
            <Image source={{ uri: imageSource }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]}>
              <FontAwesome name="image" size={80} color="#ccc" />
            </View>
          )}
          {/* Stock Badge */}
          <View
            style={[
              styles.stockBadge,
              { backgroundColor: isInStock ? '#4CAF50' : '#f44336' },
            ]}
          >
            <Text style={styles.stockBadgeText}>
              {isInStock ? `${t('product.inStock')} (${product.stock})` : t('product.outOfStock')}
            </Text>
          </View>
        </View>

        {/* Product Info */}
        <View style={styles.infoContainer}>
          {product.category_name && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{product.category_name}</Text>
            </View>
          )}

          <Text style={styles.productName}>{product.name}</Text>
          <Text style={styles.brand}>{product.brand}</Text>

          {/* Rating Summary */}
          {reviews.length > 0 && (
            <View style={styles.ratingSummary}>
              {renderStars(Math.round(averageRating))}
              <Text style={styles.ratingText}>
                {averageRating} ({reviews.length} {t('product.reviewCount')})
              </Text>
            </View>
          )}

          <View style={styles.priceContainer}>
            <Text style={styles.price}>
              {parseFloat(product.price).toLocaleString('tr-TR', {
                style: 'currency',
                currency: 'TRY',
              })}
            </Text>
            <Text style={styles.vatText}>{t('product.vatIncluded')}</Text>
          </View>

          {/* Warranty Info */}
          {product.warranty_months && (
            <View style={styles.warrantyContainer}>
              <FontAwesome name="shield" size={18} color="#4CAF50" />
              <Text style={styles.warrantyText}>
                {product.warranty_months} {t('product.monthWarranty')}
              </Text>
            </View>
          )}

          {/* Description */}
          {product.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('product.description')}</Text>
              <Text style={styles.description}>{product.description}</Text>
            </View>
          )}

          {/* Features */}
          {product.features && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('product.features')}</Text>
              <Text style={styles.features}>{product.features}</Text>
            </View>
          )}

          {/* Reviews Section */}
          <View style={styles.section}>
            <View style={styles.reviewsHeader}>
              <Text style={styles.sectionTitle}>{t('product.reviews')}</Text>
              {isOwned && (
                <TouchableOpacity
                  style={styles.addReviewButton}
                  onPress={() => setShowReviewModal(true)}
                >
                  <FontAwesome name="plus" size={14} color="#000" />
                  <Text style={styles.addReviewText}>{t('product.addReview')}</Text>
                </TouchableOpacity>
              )}
            </View>

            {reviewsLoading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : reviews.length > 0 ? (
              <View style={styles.reviewsList}>
                {reviews.slice(0, 5).map((review) => (
                  <View key={review.id} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <View style={styles.reviewUser}>
                        <View style={styles.reviewAvatar}>
                          <Text style={styles.reviewAvatarText}>
                            {review.customer_name?.[0]?.toUpperCase() || 'U'}
                          </Text>
                        </View>
                        <Text style={styles.reviewUsername}>{review.customer_name}</Text>
                      </View>
                      {renderStars(review.rating, 14)}
                    </View>
                    {review.comment && (
                      <Text style={styles.reviewComment}>{review.comment}</Text>
                    )}
                    <Text style={styles.reviewDate}>
                      {new Date(review.created_at).toLocaleDateString(language === 'tr' ? 'tr-TR' : 'en-US')}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.noReviews}>
                <FontAwesome name="comments-o" size={40} color="#D1D5DB" />
                <Text style={styles.noReviewsText}>
                  {t('product.noReviews')}
                </Text>
              </View>
            )}
          </View>

          {/* Similar Products Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Benzer Ürünler</Text>
            {similarLoading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : similarProducts.length > 0 ? (
              <FlatList
                data={similarProducts}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={{ gap: 12 }}
                renderItem={({ item }) => {
                  const imgSrc = item.image_url || (item.image ? getImageUrl(item.image) : null);
                  return (
                    <TouchableOpacity
                      style={styles.similarCard}
                      activeOpacity={0.7}
                      onPress={() => router.push(`/product/${item.id}`)}
                    >
                      <View style={styles.similarImageContainer}>
                        {imgSrc ? (
                          <Image source={{ uri: imgSrc }} style={styles.similarImage} resizeMode="cover" />
                        ) : (
                          <View style={[styles.similarImage, styles.similarImagePlaceholder]}>
                            <FontAwesome name="image" size={28} color="#D1D5DB" />
                          </View>
                        )}
                      </View>
                      <View style={styles.similarInfo}>
                        <Text style={styles.similarName} numberOfLines={2}>{item.name}</Text>
                        <Text style={styles.similarBrand} numberOfLines={1}>{item.brand}</Text>
                        <Text style={styles.similarPrice}>
                          {parseFloat(item.price).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            ) : (
              <Text style={styles.noSimilarText}>Benzer ürün bulunamadı</Text>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Bottom Action Buttons */}
      <View style={styles.bottomActions}>
        {!isOwned && (
          <TouchableOpacity
            style={[styles.actionButton, styles.wishlistButton]}
            onPress={handleWishlistToggle}
            disabled={wishlistLoading}
          >
            <FontAwesome
              name={inWishlist ? 'heart' : 'heart-o'}
              size={20}
              color={inWishlist ? '#f44336' : '#666'}
            />
            <Text style={[styles.actionButtonText, inWishlist && { color: '#f44336' }]}>
              {inWishlist ? t('product.inList') : t('product.wishlist')}
            </Text>
          </TouchableOpacity>
        )}

        {isOwned && (
          <TouchableOpacity
            style={[styles.actionButton, styles.serviceButton]}
            onPress={handleServiceRequest}
          >
            <FontAwesome name="wrench" size={20} color="#fff" />
            <Text style={styles.serviceButtonText}>{t('product.serviceRequest')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Review Modal */}
      <Modal
        visible={showReviewModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowReviewModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('product.rateProduct')}</Text>
              <TouchableOpacity onPress={() => setShowReviewModal(false)}>
                <FontAwesome name="times" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalProductName}>{product.name}</Text>

            <View style={styles.ratingSection}>
              <Text style={styles.ratingLabel}>{t('product.yourRating')}</Text>
              <View style={styles.starsContainer}>
                {renderStars(userRating, 36, true)}
              </View>
              <Text style={styles.ratingHint}>
                {userRating === 0 ? t('product.selectRating') : `${userRating}/5`}
              </Text>
            </View>

            <View style={styles.commentSection}>
              <Text style={styles.commentLabel}>{t('product.commentLabel')}</Text>
              <TextInput
                style={styles.commentInput}
                placeholder={t('product.commentPlaceholder')}
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
                value={userComment}
                onChangeText={setUserComment}
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity
              style={[styles.submitButton, submittingReview && styles.submitButtonDisabled]}
              onPress={handleSubmitReview}
              disabled={submittingReview}
            >
              {submittingReview ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>{t('product.submitReview')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

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
  wishlistOverlay: {
    position: 'absolute',
    top: 10,
    right: 15,
    zIndex: 10,
  },
  wishlistHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageContainer: {
    width: '100%',
    height: width,
    backgroundColor: '#f5f5f5',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  stockBadge: {
    position: 'absolute',
    bottom: 15,
    left: 15,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  stockBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  infoContainer: {
    padding: 20,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 12,
  },
  categoryText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  productName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 6,
  },
  brand: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 8,
  },
  ratingSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  ratingText: {
    fontSize: 14,
    color: '#6B7280',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  price: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
  },
  vatText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginLeft: 8,
  },
  warrantyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 20,
  },
  warrantyText: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '600',
    marginLeft: 8,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },
  description: {
    fontSize: 15,
    color: '#4B5563',
    lineHeight: 24,
  },
  features: {
    fontSize: 15,
    color: '#4B5563',
    lineHeight: 24,
  },
  reviewsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  addReviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addReviewText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  reviewsList: {
    gap: 12,
  },
  reviewCard: {
    backgroundColor: '#F9FAFB',
    padding: 14,
    borderRadius: 12,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewAvatarText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  reviewUsername: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  reviewComment: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    marginBottom: 6,
  },
  reviewDate: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  noReviews: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  noReviewsText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 12,
  },
  bottomActions: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#fff',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  wishlistButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  serviceButton: {
    backgroundColor: '#000000',
  },
  serviceButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  modalProductName: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
  },
  ratingSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  starsContainer: {
    marginBottom: 8,
  },
  ratingHint: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  commentSection: {
    marginBottom: 24,
  },
  commentLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  commentInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#111827',
    minHeight: 100,
  },
  submitButton: {
    backgroundColor: '#000000',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  // Similar Products Styles
  similarCard: {
    width: 160,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  similarImageContainer: {
    width: '100%',
    height: 120,
    backgroundColor: '#F3F4F6',
  },
  similarImage: {
    width: '100%',
    height: '100%',
  },
  similarImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  similarInfo: {
    padding: 10,
  },
  similarName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 18,
    marginBottom: 4,
  },
  similarBrand: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  similarPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  noSimilarText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 20,
  },
});
