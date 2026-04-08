import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { FontAwesome } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const COL_WIDTH = (width - 48) / 2;

interface Product {
  id: number;
  name: string;
  brand: string;
  price: string;
  stock?: number;
  image?: string;
  category?: { id: number; name: string } | null;
  category_name?: string;
  model_code?: string;
  description?: string;
}

interface CompareModalProps {
  visible: boolean;
  products: Product[];
  onClose: () => void;
  getImageUrl: (path: string | null) => string | null;
}

const CompareRow = ({ label, left, right, highlight }: {
  label: string;
  left: string | React.ReactNode;
  right: string | React.ReactNode;
  highlight?: boolean;
}) => (
  <View style={[styles.row, highlight && styles.rowHighlight]}>
    <Text style={styles.rowLabel}>{label}</Text>
    <View style={styles.rowValues}>
      <View style={styles.cellLeft}>
        {typeof left === 'string' ? <Text style={styles.cellText}>{left}</Text> : left}
      </View>
      <View style={styles.divider} />
      <View style={styles.cellRight}>
        {typeof right === 'string' ? <Text style={styles.cellText}>{right}</Text> : right}
      </View>
    </View>
  </View>
);

export const CompareModal = ({ visible, products, onClose, getImageUrl }: CompareModalProps) => {
  if (products.length < 2) return null;

  const [p1, p2] = products;
  const price1 = parseFloat(p1.price);
  const price2 = parseFloat(p2.price);
  const cheaper = price1 < price2 ? 0 : price1 > price2 ? 1 : -1;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Ürün Karşılaştırma</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <FontAwesome name="times" size={20} color="#111" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Product Images */}
          <View style={styles.imagesRow}>
            {[p1, p2].map((p, i) => (
              <View key={i} style={styles.imageCol}>
                {p.image ? (
                  <Image
                    source={{ uri: getImageUrl(p.image) || '' }}
                    style={styles.productImage}
                    contentFit="contain"
                    transition={200}
                  />
                ) : (
                  <View style={[styles.productImage, styles.imagePlaceholder]}>
                    <FontAwesome name="cube" size={40} color="#D1D5DB" />
                  </View>
                )}
              </View>
            ))}
          </View>

          {/* Product Names */}
          <View style={styles.namesRow}>
            <Text style={styles.productName} numberOfLines={3}>{p1.name}</Text>
            <Text style={styles.productName} numberOfLines={3}>{p2.name}</Text>
          </View>

          {/* Comparison Rows */}
          <View style={styles.tableContainer}>
            <CompareRow
              label="Marka"
              left={p1.brand || '-'}
              right={p2.brand || '-'}
            />
            <CompareRow
              label="Fiyat"
              highlight
              left={
                <View style={styles.priceCell}>
                  <Text style={[styles.priceText, cheaper === 0 && styles.cheaperPrice]}>
                    {price1.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                  </Text>
                  {cheaper === 0 && (
                    <View style={styles.cheapBadge}>
                      <Text style={styles.cheapBadgeText}>Daha Uygun</Text>
                    </View>
                  )}
                </View>
              }
              right={
                <View style={styles.priceCell}>
                  <Text style={[styles.priceText, cheaper === 1 && styles.cheaperPrice]}>
                    {price2.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                  </Text>
                  {cheaper === 1 && (
                    <View style={styles.cheapBadge}>
                      <Text style={styles.cheapBadgeText}>Daha Uygun</Text>
                    </View>
                  )}
                </View>
              }
            />
            <CompareRow
              label="Kategori"
              left={p1.category?.name || p1.category_name || '-'}
              right={p2.category?.name || p2.category_name || '-'}
            />
            <CompareRow
              label="Stok"
              left={
                <View style={styles.stockCell}>
                  <View style={[styles.stockDot, { backgroundColor: (p1.stock ?? 0) > 0 ? '#22C55E' : '#EF4444' }]} />
                  <Text style={styles.cellText}>
                    {(p1.stock ?? 0) > 0 ? `${p1.stock} adet` : 'Stok Yok'}
                  </Text>
                </View>
              }
              right={
                <View style={styles.stockCell}>
                  <View style={[styles.stockDot, { backgroundColor: (p2.stock ?? 0) > 0 ? '#22C55E' : '#EF4444' }]} />
                  <Text style={styles.cellText}>
                    {(p2.stock ?? 0) > 0 ? `${p2.stock} adet` : 'Stok Yok'}
                  </Text>
                </View>
              }
            />
            {(p1.model_code || p2.model_code) && (
              <CompareRow
                label="Model Kodu"
                left={p1.model_code || '-'}
                right={p2.model_code || '-'}
              />
            )}

            {/* Price difference */}
            {cheaper !== -1 && (
              <View style={styles.diffRow}>
                <FontAwesome name="info-circle" size={14} color="#6366F1" />
                <Text style={styles.diffText}>
                  Fiyat farkı: {Math.abs(price1 - price2).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  imagesRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 16,
  },
  imageCol: {
    flex: 1,
    alignItems: 'center',
  },
  productImage: {
    width: COL_WIDTH - 16,
    height: 160,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  namesRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 16,
  },
  productName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 20,
  },
  tableContainer: {
    marginHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  rowHighlight: {
    backgroundColor: '#F0F9FF',
  },
  rowLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  rowValues: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cellLeft: {
    flex: 1,
    paddingRight: 8,
  },
  divider: {
    width: 1,
    height: '100%',
    minHeight: 20,
    backgroundColor: '#E5E7EB',
  },
  cellRight: {
    flex: 1,
    paddingLeft: 8,
  },
  cellText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  priceCell: {
    alignItems: 'flex-start',
  },
  priceText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  cheaperPrice: {
    color: '#16A34A',
  },
  cheapBadge: {
    marginTop: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  cheapBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#16A34A',
  },
  stockCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stockDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  diffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  diffText: {
    fontSize: 13,
    color: '#6366F1',
    fontWeight: '600',
  },
});
