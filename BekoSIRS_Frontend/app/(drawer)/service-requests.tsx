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
  Modal,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { serviceRequestAPI, productOwnershipAPI } from '../../services/api';
import { Picker } from '@react-native-picker/picker';

interface ServiceRequest {
  id: number;
  customer_name: string;
  product_name: string;
  request_type: string;
  status: string;
  description: string;
  created_at: string;
  queue_entry?: {
    queue_number: number;
    priority: number;
    estimated_wait_time: number;
  };
}

interface ProductOwnership {
  id: number;
  product: {
    id: number;
    name: string;
    brand: string;
  };
  purchase_date: string;
  warranty_end_date: string;
}

const StatusConfig: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: 'Beklemede', color: '#FF9800', icon: 'clock-o' },
  in_queue: { label: 'Sırada', color: '#2196F3', icon: 'list-ol' },
  in_progress: { label: 'İşlemde', color: '#9C27B0', icon: 'cog' },
  completed: { label: 'Tamamlandı', color: '#4CAF50', icon: 'check-circle' },
  cancelled: { label: 'İptal', color: '#f44336', icon: 'times-circle' },
};

const RequestTypeConfig: Record<string, string> = {
  repair: 'Tamir',
  maintenance: 'Bakım',
  warranty: 'Garanti',
  complaint: 'Şikayet',
  other: 'Diğer',
};

const ServiceRequestsScreen = () => {
  const params = useLocalSearchParams();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [products, setProducts] = useState<ProductOwnership[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [requestType, setRequestType] = useState<string>('repair');
  const [description, setDescription] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [requestsRes, productsRes] = await Promise.all([
        serviceRequestAPI.getMyRequests(),
        productOwnershipAPI.getMyOwnerships(),
      ]);
      setRequests(requestsRes.data);
      setProducts(productsRes.data);
    } catch (error) {
      console.error('Service requests fetch error:', error);
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

  // Handle params for auto-open
  useEffect(() => {
    if (params.openModal === 'true' && products.length > 0) {
      setModalVisible(true);
      if (params.productId) {
        const pId = Number(params.productId);
        const ownership = products.find(p => p.product.id === pId);
        if (ownership) {
          setSelectedProduct(ownership.id);
        }
      }
    }
  }, [params, products]);

  const handleCreateRequest = async () => {
    if (!selectedProduct) {
      Alert.alert('Hata', 'Lütfen bir ürün seçin');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Hata', 'Lütfen sorun açıklaması girin');
      return;
    }

    setSubmitting(true);
    try {
      await serviceRequestAPI.createRequest(
        selectedProduct,
        requestType as any,
        description
      );
      Alert.alert('Başarılı', 'Servis talebiniz oluşturuldu');
      setModalVisible(false);
      setSelectedProduct(null);
      setRequestType('repair');
      setDescription('');
      fetchData();
    } catch (error) {
      Alert.alert('Hata', 'Servis talebi oluşturulamadı');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const renderItem = ({ item }: { item: ServiceRequest }) => {
    const statusConfig = StatusConfig[item.status] || StatusConfig.pending;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.idContainer}>
            <Text style={styles.requestId}>SR-{item.id}</Text>
            <Text style={styles.requestType}>
              {RequestTypeConfig[item.request_type] || item.request_type}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.color }]}>
            <FontAwesome name={statusConfig.icon as any} size={12} color="#fff" />
            <Text style={styles.statusText}>{statusConfig.label}</Text>
          </View>
        </View>

        <Text style={styles.productName}>{item.product_name}</Text>
        <Text style={styles.description} numberOfLines={2}>
          {item.description}
        </Text>

        {item.queue_entry && item.status === 'in_queue' && (
          <View style={styles.queueInfo}>
            <FontAwesome name="list-ol" size={14} color="#2196F3" />
            <Text style={styles.queueText}>
              Sıra No: {item.queue_entry.queue_number} | Tahmini Bekleme: {item.queue_entry.estimated_wait_time} dk
            </Text>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.date}>{formatDate(item.created_at)}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#000000" testID="loading-sr" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={requests}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Servis Taleplerim</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setModalVisible(true)}
            >
              <FontAwesome name="plus" size={16} color="#fff" />
              <Text style={styles.addButtonText}>Yeni Talep</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <FontAwesome name="wrench" size={80} color="#ccc" />
            <Text style={styles.emptyTitle}>Servis Talebi Yok</Text>
            <Text style={styles.emptyText}>
              Henüz bir servis talebiniz bulunmuyor
            </Text>
          </View>
        }
      />

      {/* Create Request Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Yeni Servis Talebi</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <FontAwesome name="times" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.label}>Ürün Seçin</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={selectedProduct}
                  onValueChange={(value) => setSelectedProduct(value)}
                  style={styles.picker}
                >
                  <Picker.Item label="Ürün seçin..." value={null} />
                  {products.map((p: ProductOwnership) => (
                    <Picker.Item
                      key={p.id}
                      label={`${p.product.name} - ${p.product.brand}`}
                      value={p.id}
                    />
                  ))}
                </Picker>
              </View>

              <Text style={styles.label}>Talep Türü</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={requestType}
                  onValueChange={(value) => setRequestType(value)}
                  style={styles.picker}
                >
                  <Picker.Item label="Tamir" value="repair" />
                  <Picker.Item label="Bakım" value="maintenance" />
                  <Picker.Item label="Garanti" value="warranty" />
                  <Picker.Item label="Şikayet" value="complaint" />
                  <Picker.Item label="Diğer" value="other" />
                </Picker>
              </View>

              <Text style={styles.label}>Sorun Açıklaması</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={4}
                placeholder="Sorununuzu detaylı olarak açıklayın..."
                value={description}
                onChangeText={setDescription}
                textAlignVertical="top"
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.disabledButton]}
                onPress={handleCreateRequest}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Gönder</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  idContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requestId: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000000',
  },
  requestType: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  queueInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  queueText: {
    fontSize: 13,
    color: '#2196F3',
    fontWeight: '500',
  },
  footer: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  date: {
    fontSize: 12,
    color: '#999',
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalBody: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  picker: {
    height: 50,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 100,
    backgroundColor: '#f9f9f9',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#000000',
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
});

export default ServiceRequestsScreen;
