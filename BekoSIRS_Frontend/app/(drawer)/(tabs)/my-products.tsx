import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Image,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import api, { assignmentAPI } from '../../../services/api';

// Helper: Dinamik image URL oluştur (hardcoded IP kullanmadan)
const getImageUrl = (imagePath: string | null): string | null => {
  if (!imagePath) return null;
  if (imagePath.startsWith('http')) return imagePath;
  const baseUrl = (api.defaults.baseURL || '').replace(/\/$/, '');
  return `${baseUrl}${imagePath}`;
};

interface ProductItem {
  id: number;
  type: 'ownership' | 'assignment';
  product: {
    id: number;
    name: string;
    brand: string;
    price: string;
    image: string | null;
    category_name: string | null;
    warranty_duration_months: number;
  };
  // Ownership specific
  purchase_date?: string;
  serial_number?: string | null;
  warranty_end_date?: string | null;
  is_warranty_active?: boolean;
  days_until_warranty_expires?: number | null;
  active_service_requests?: number;
  // Assignment specific
  status?: string;
  status_display?: string;
  assigned_at?: string;
  delivery_info?: any;
}

export default function MyProductsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      // Parallel fetch
      const [ownershipsRes, assignmentsRes] = await Promise.all([
        api.get('/api/v1/product-ownerships/my-ownerships/').catch(e => ({ data: [] })),
        assignmentAPI.getMyAssignments().catch(e => ({ data: [] }))
      ]);

      const ownerships = Array.isArray(ownershipsRes.data) ? ownershipsRes.data : [];
      // Handle pagination for assignments if needed, usually just list for mobile
      const assignmentsData = assignmentsRes.data?.results || assignmentsRes.data || [];
      const assignments = Array.isArray(assignmentsData) ? assignmentsData : [];

      // Map to unified structure
      const mappedOwnerships: ProductItem[] = ownerships.map((o: any) => ({
        ...o,
        type: 'ownership'
      }));

      const mappedAssignments: ProductItem[] = assignments.map((a: any) => ({
        id: a.id, // Note: ID might overlap with ownership ID, but usually fine for list keys if we combine
        type: 'assignment',
        product: a.product,
        status: a.status,
        status_display: a.status_display,
        assigned_at: a.assigned_at,
        delivery_info: a.delivery_info,
        // Fill required fields with defaults
        active_service_requests: 0
      }));

      // Show assignments first (pending items typically important)
      setItems([...mappedAssignments, ...mappedOwnerships]);

    } catch (error: any) {
      console.log('Error fetching products:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const getStatusBadge = (item: ProductItem) => {
    if (item.type === 'assignment') {
      // Assignment Status
      const status = item.status || 'PLANNED';
      let color = '#3B82F6'; // Blue
      let text = item.status_display || 'Hazırlanıyor';
      let icon = 'clock-o';

      if (status === 'DELIVERED') { color = '#10B981'; icon = 'check'; }
      else if (status === 'CANCELLED') { color = '#EF4444'; icon = 'times'; }
      else if (status === 'OUT_FOR_DELIVERY') { color = '#F59E0B'; icon = 'truck'; text = 'Dağıtımda'; }
      else if (status === 'WAITING') { color = '#F59E0B'; text = 'Teslimat Bekleniyor'; }
      else if (status === 'PLANNED') { color = '#6366F1'; text = 'Sipariş Alındı'; }

      return { color, text, icon, bgColor: `${color}15` };
    } else {
      // Warranty Status
      if (!item.warranty_end_date) {
        return { color: '#9CA3AF', text: 'Garanti bilgisi yok', icon: 'question-circle', bgColor: '#F3F4F6' };
      }
      if (!item.is_warranty_active) {
        return { color: '#EF4444', text: 'Garanti süresi doldu', icon: 'times-circle', bgColor: '#FEF2F2' };
      }
      if (item.days_until_warranty_expires && item.days_until_warranty_expires <= 30) {
        return { color: '#F59E0B', text: `${item.days_until_warranty_expires} gün kaldı`, icon: 'exclamation-circle', bgColor: '#FFFBEB' };
      }
      return { color: '#10B981', text: 'Garanti aktif', icon: 'check-circle', bgColor: '#ECFDF5' };
    }
  };

  const handleProductPress = (item: ProductItem) => {
    // Only allow details for ownerships or maybe show limited details for assignments
    if (item.type === 'ownership') {
      router.push(`/product/${item.product.id}`);
    } else {
      // Maybe show alert or different screen for assignment
      // For now, allow viewing product details
      router.push(`/product/${item.product.id}`);
    }
  };

  const handleServiceRequest = (item: ProductItem) => {
    if (item.type === 'assignment') return; // Can't request service for pending item
    router.push({
      pathname: '/service-requests',
      params: { ownershipId: item.id }
    });
  };

  const renderProductCard = ({ item }: { item: ProductItem }) => {
    const status = getStatusBadge(item);
    const product = item.product;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handleProductPress(item)}
        activeOpacity={0.7}
      >
        {/* Product Image */}
        <View style={styles.imageContainer}>
          {product.image ? (
            <Image
              source={{ uri: getImageUrl(product.image) || '' }}
              style={styles.productImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <FontAwesome name="cube" size={40} color="#D1D5DB" />
            </View>
          )}

          {/* Type Badge (Assignment vs Ownership) */}
          {item.type === 'assignment' && (
            <View style={[styles.typeBadge, { backgroundColor: status.color }]}>
              <Text style={styles.typeBadgeText}>Sipariş / Teslimat</Text>
            </View>
          )}

          {/* Active Service Badge (Only Ownership) */}
          {item.active_service_requests && item.active_service_requests > 0 ? (
            <View style={styles.serviceBadge}>
              <FontAwesome name="wrench" size={10} color="#fff" />
              <Text style={styles.serviceBadgeText}>{item.active_service_requests}</Text>
            </View>
          ) : null}
        </View>

        {/* Product Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
          <Text style={styles.brand}>{product.brand}</Text>

          {product.category_name && (
            <Text style={styles.category}>{product.category_name}</Text>
          )}

          {/* Serial Number (Ownership) */}
          {item.serial_number && (
            <View style={styles.serialContainer}>
              <FontAwesome name="barcode" size={12} color="#6B7280" />
              <Text style={styles.serialText}>{item.serial_number}</Text>
            </View>
          )}

          {/* Dates */}
          <View style={styles.dateContainer}>
            <FontAwesome name="calendar" size={12} color="#6B7280" />
            <Text style={styles.dateText}>
              {item.type === 'ownership'
                ? `Alım: ${new Date(item.purchase_date!).toLocaleDateString('tr-TR')}`
                : `Tarih: ${new Date(item.assigned_at!).toLocaleDateString('tr-TR')}`
              }
            </Text>
          </View>

          {/* Status / Warranty */}
          <View style={[styles.warrantyContainer, { backgroundColor: status.bgColor }]}>
            <FontAwesome name={status.icon as any} size={14} color={status.color} />
            <Text style={[styles.warrantyText, { color: status.color }]}>
              {status.text}
            </Text>
            {item.type === 'ownership' && item.warranty_end_date && item.is_warranty_active && (
              <Text style={styles.warrantyDate}>
                (Bitiş: {new Date(item.warranty_end_date).toLocaleDateString('tr-TR')})
              </Text>
            )}
            {/* Delivery Info for Assignment */}
            {item.type === 'assignment' && item.delivery_info?.scheduled_date && (
              <Text style={styles.warrantyDate}>
                ({new Date(item.delivery_info.scheduled_date).toLocaleDateString('tr-TR')})
              </Text>
            )}
          </View>

          {/* Actions */}
          <View style={styles.actionsContainer}>
            {item.type === 'ownership' ? (
              <>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleServiceRequest(item)}
                >
                  <FontAwesome name="wrench" size={14} color="#000" />
                  <Text style={styles.actionButtonText}>Servis Talebi</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.detailButton]}
                  onPress={() => handleProductPress(item)}
                >
                  <FontAwesome name="info-circle" size={14} color="#fff" />
                  <Text style={styles.detailButtonText}>Detay</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#F3F4F6', opacity: 0.8 }]}
                disabled={true}
              >
                <Text style={styles.actionButtonText}>Teslimat Bekleniyor</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#000" />
        <Text style={styles.loadingText}>Ürünleriniz yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {items.length > 0 ? (
        <FlatList
          data={items}
          renderItem={renderProductCard}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#000']} />
          }
          ListHeaderComponent={
            <View style={styles.headerBadge}>
              <View style={styles.headerTop}>
                <FontAwesome name="cube" size={24} color="#fff" />
                <Text style={styles.badgeTitle}>Cihazlarım</Text>
              </View>
              <Text style={styles.badgeSubtitle}>
                {items.length} adet kayıt (Sipariş & Sahiplik)
              </Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>
                    {items.filter(o => o.type === 'assignment').length}
                  </Text>
                  <Text style={styles.statLabel}>Bekleyen</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>
                    {items.filter(o => o.type === 'ownership').length}
                  </Text>
                  <Text style={styles.statLabel}>Teslim Alınan</Text>
                </View>
              </View>
            </View>
          }
        />
      ) : (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <FontAwesome name="inbox" size={50} color="#D1D5DB" />
          </View>
          <Text style={styles.emptyTitle}>Henüz Kayıt Yok</Text>
          <Text style={styles.emptyDescription}>
            Size atanmış bir ürün veya sipariş bulunamadı.
          </Text>
          <TouchableOpacity
            style={styles.browseButton}
            onPress={() => router.push('/')}
          >
            <Text style={styles.browseButtonText}>Ürünlere Göz At</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  headerBadge: {
    backgroundColor: '#000',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  badgeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  badgeSubtitle: {
    fontSize: 14,
    color: '#D1D5DB',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#374151',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  imageContainer: {
    width: '100%',
    height: 160,
    backgroundColor: '#F3F4F6',
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#F59E0B',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  serviceBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  typeBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  infoContainer: {
    padding: 16,
  },
  productName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  brand: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  category: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  serialContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  serialText: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'monospace',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  dateText: {
    fontSize: 12,
    color: '#6B7280',
  },
  warrantyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  warrantyText: {
    fontSize: 13,
    fontWeight: '600',
  },
  warrantyDate: {
    fontSize: 11,
    color: '#6B7280',
    marginLeft: 'auto',
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  detailButton: {
    backgroundColor: '#000',
  },
  detailButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    backgroundColor: '#F3F4F6',
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 10,
  },
  emptyDescription: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  browseButton: {
    marginTop: 24,
    backgroundColor: '#000',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  browseButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
