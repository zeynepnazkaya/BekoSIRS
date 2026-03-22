// components/ProductCard.tsx

import React, { useState, useEffect, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Image } from 'expo-image';
import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { wishlistAPI, viewHistoryAPI, getImageUrl } from '../services';

interface ProductCardProps {
  product: {
    id: number;
    name: string;
    brand: string;
    price: string;
    image_url?: string;
    image?: string;
    stock?: number;
    category_name?: string;
    review_count?: number;
    average_rating?: number;
  };
  onPress?: () => void;
  initialInWishlist?: boolean;
  compact?: boolean; // Yeni: Grid layout için kompakt mod
  style?: any; // Allow style overrides
}

export const ProductCard = memo(({
  product,
  onPress,
  initialInWishlist = false,
  compact = false,
  style
}: ProductCardProps) => {
  const router = useRouter();
  const [inWishlist, setInWishlist] = useState(initialInWishlist);
  const [loading, setLoading] = useState(false);

  const imageSource = getImageUrl(product.image_url || product.image);

  useEffect(() => {
    setInWishlist(initialInWishlist || false);
  }, [initialInWishlist]);

  const handleWishlistToggle = async () => {
    setLoading(true);
    try {
      if (inWishlist) {
        await wishlistAPI.removeItem(product.id);
        setInWishlist(false);
      } else {
        await wishlistAPI.addItem(product.id);
        setInWishlist(true);
      }
    } catch (error: any) {
      Alert.alert('Hata', error.response?.data?.error || 'İşlem başarısız');
    } finally {
      setLoading(false);
    }
  };

  const handlePress = async () => {
    try {
      await viewHistoryAPI.recordView(product.id);
    } catch (error) {
      // Ignore error
    }
    if (onPress) {
      onPress();
    } else {
      router.push(`/product/${product.id}`);
    }
  };

  const isInStock = (product.stock ?? 0) > 0;

  return (
    <View style={[compact ? styles.compactCard : styles.card, style]}>
      <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
        {imageSource && (
          <Image
            source={{ uri: imageSource }}
            style={compact ? styles.compactImage : styles.image}
            contentFit={compact ? 'contain' : 'cover'}
            transition={200}
            cachePolicy="memory-disk"
          />
        )}

        <View style={compact ? styles.compactInfoContainer : styles.infoContainer}>
          <Text style={compact ? styles.compactName : styles.name} numberOfLines={2}>{product.name}</Text>

          {compact && product.average_rating && (
            <View style={styles.ratingContainer}>
              <FontAwesome name="star" size={12} color="#FFA500" />
              <Text style={styles.ratingText}>{product.average_rating.toFixed(1)}</Text>
              {product.review_count && product.review_count > 0 && (
                <Text style={styles.reviewCount}>({product.review_count})</Text>
              )}
            </View>
          )}

          {!compact && <Text style={styles.brand}>{product.brand}</Text>}
          {!compact && product.category_name && (
            <Text style={styles.category}>{product.category_name}</Text>
          )}
          <Text style={compact ? styles.compactPrice : styles.price}>
            {parseFloat(product.price).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Wishlist Button - Moved outside main TouchableOpacity */}
      <TouchableOpacity
        style={compact ? styles.compactWishlistButton : styles.wishlistButton}
        onPress={handleWishlistToggle}
        disabled={loading}
      >
        <FontAwesome
          name={inWishlist ? "heart" : "heart-o"}
          size={compact ? 18 : 22}
          color={inWishlist ? "#f44336" : "#999"}
        />
      </TouchableOpacity>

      {/* Stock Badge - Only in full mode */}
      {!compact && product.stock !== undefined && (
        <View style={[styles.stockBadge, { backgroundColor: isInStock ? '#4CAF50' : '#f44336' }]}>
          <Text style={styles.stockText}>
            {isInStock ? `Stokta` : 'Stok Yok'}
          </Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  image: {
    width: '100%',
    height: 180,
    backgroundColor: '#f9fafb',
  },
  wishlistButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  stockBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 1,
  },
  stockText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  infoContainer: {
    padding: 16,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
    lineHeight: 22,
  },
  brand: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
    fontWeight: '500',
  },
  category: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 8,
    fontWeight: '500',
  },
  price: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'left',
  },
  // Compact Mode Styles (Grid Layout)
  compactCard: {
    backgroundColor: 'white',
    borderRadius: 8, // Slightly smaller radius for tighter look
    marginBottom: 8,
    // Removed marginHorizontal to respect grid gap
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    // Width will be controlled by parent
  },
  compactImage: {
    width: '100%',
    aspectRatio: 1, // Enforce square aspect ratio
    backgroundColor: '#f9fafb',
  },
  compactWishlistButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  compactInfoContainer: {
    padding: 6,
    // Ensure fixed height for text area alignment if needed, 
    // but flex is usually better.
  },
  compactName: {
    fontSize: 11,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 2,
    lineHeight: 14,
    height: 28, // Fix height for max 2 lines
  },
  compactPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000', // Black for clean look
    marginTop: 2,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
    gap: 2,
  },
  ratingText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#4B5563',
  },
  reviewCount: {
    fontSize: 8,
    color: '#9CA3AF',
  },
});