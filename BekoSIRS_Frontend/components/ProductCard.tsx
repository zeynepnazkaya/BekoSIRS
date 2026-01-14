// components/ProductCard.tsx

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert } from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { wishlistAPI, viewHistoryAPI } from '../services/api';

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
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onPress,
  initialInWishlist = false,
  compact = false
}) => {
  const router = useRouter();
  const [inWishlist, setInWishlist] = useState(initialInWishlist);
  const [loading, setLoading] = useState(false);

  const imageSource = product.image_url || product.image;

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
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
      <View style={compact ? styles.compactCard : styles.card}>
        {imageSource && <Image source={{ uri: imageSource }} style={compact ? styles.compactImage : styles.image} />}

        {/* Wishlist Button */}
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

        <View style={compact ? styles.compactInfoContainer : styles.infoContainer}>
          <Text style={compact ? styles.compactName : styles.name} numberOfLines={2}>{product.name}</Text>

          {/* Rating - Compact mode only */}
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
      </View>
    </TouchableOpacity>
  );
};

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
    borderRadius: 12,
    marginBottom: 8,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#f3f4f6',
    width: '100%',
  },
  compactImage: {
    width: '100%',
    height: 130,
    backgroundColor: '#f9fafb',
  },
  compactWishlistButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(255,255,255,0.95)',
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  compactInfoContainer: {
    padding: 8,
  },
  compactName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 3,
    lineHeight: 16,
  },
  compactPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E31E24',
    marginTop: 3,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
    gap: 3,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#111827',
  },
  reviewCount: {
    fontSize: 9,
    color: '#6B7280',
  },
});