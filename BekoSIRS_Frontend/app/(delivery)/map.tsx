import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Linking,
    Platform,
    StatusBar,
    ScrollView,
    Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services';

interface Delivery {
    id: number;
    customer_name: string;
    address: string;
    address_lat: number | null;
    address_lng: number | null;
    status: string;
    delivery_order: number;
    customer_address?: string;
}

export default function DeliveryMap() {
    const insets = useSafeAreaInsets();
    const [deliveries, setDeliveries] = useState<Delivery[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchRoute = async () => {
            try {
                const res = await api.get('/api/v1/delivery-person/my_route/');
                const data = res.data;
                setDeliveries(Array.isArray(data) ? data : (Array.isArray(data?.deliveries) ? data.deliveries : []));
            } catch (error) {
                console.error('Failed to fetch route:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchRoute();
    }, []);

    const openInMaps = (lat: number | null, lng: number | null, label: string) => {
        if (!lat || !lng) {
            Alert.alert('Bilgi', 'Konum bilgisi mevcut değil');
            return;
        }
        
        Alert.alert(
            'Navigasyon',
            'Hangi uygulama ile gitmek istersiniz?',
            [
                {
                    text: 'Google Haritalar',
                    onPress: () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`)
                },
                {
                    text: 'Yandex Navigasyon',
                    onPress: () => {
                        Linking.openURL(`yandexnavi://build_route_on_map?lat_to=${lat}&lon_to=${lng}`).catch(() => {
                            Alert.alert('Bilgi', 'Yandex Navigasyon bulunamadı, Google açılıyor...');
                            Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
                        });
                    }
                },
                { text: 'İptal', style: 'cancel' }
            ]
        );
    };

    const openAllInMaps = () => {
        const validDeliveries = deliveries.filter(d => d.address_lat && d.address_lng);
        if (validDeliveries.length === 0) {
            Alert.alert('Bilgi', 'Konum bilgisi olan teslimat yok');
            return;
        }
        // Open first delivery in maps
        const first = validDeliveries[0];
        openInMaps(first.address_lat, first.address_lng, first.customer_name || 'Teslimat');
    };

    const getStatusStyle = (status: string) => {
        return status === 'DELIVERED'
            ? { bg: '#dcfce7', text: '#16a34a', label: 'Teslim Edildi' }
            : status === 'OUT_FOR_DELIVERY'
                ? { bg: '#fef3c7', text: '#d97706', label: 'Sıradaki' }
                : { bg: '#f1f5f9', text: '#64748b', label: 'Beklemede' };
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#005696" />
                    <Text style={styles.loadingText}>Rota yükleniyor...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <Ionicons name="arrow-back" size={24} color="#1e293b" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Teslimat Rotası</Text>
                <TouchableOpacity style={styles.mapButton} onPress={openAllInMaps}>
                    <Ionicons name="navigate" size={20} color="#005696" />
                </TouchableOpacity>
            </View>

            {/* Stats Summary */}
            <View style={styles.statsSummary}>
                <View style={styles.statItem}>
                    <Ionicons name="location" size={20} color="#005696" />
                    <Text style={styles.statValue}>{deliveries.length}</Text>
                    <Text style={styles.statLabel}>Durak</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                    <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                    <Text style={styles.statValue}>{deliveries.filter(d => d.status === 'DELIVERED').length}</Text>
                    <Text style={styles.statLabel}>Tamamlandı</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                    <Ionicons name="time" size={20} color="#d97706" />
                    <Text style={styles.statValue}>{deliveries.filter(d => d.status !== 'DELIVERED').length}</Text>
                    <Text style={styles.statLabel}>Bekleyen</Text>
                </View>
            </View>

            {/* Route List */}
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                <Text style={styles.sectionTitle}>Teslimat Sırası</Text>

                {deliveries.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="map-outline" size={64} color="#cbd5e1" />
                        <Text style={styles.emptyText}>Bugün için rota yok</Text>
                    </View>
                ) : (
                    deliveries.map((delivery, index) => {
                        const statusStyle = getStatusStyle(delivery.status);
                        const isLast = index === deliveries.length - 1;

                        return (
                            <View key={delivery.id} style={styles.routeItem}>
                                {/* Timeline */}
                                <View style={styles.timeline}>
                                    <View style={[styles.timelineDot, { backgroundColor: statusStyle.text }]}>
                                        <Text style={styles.timelineDotText}>{delivery.delivery_order || index + 1}</Text>
                                    </View>
                                    {!isLast && <View style={styles.timelineLine} />}
                                </View>

                                {/* Card */}
                                <View style={styles.routeCard}>
                                    <View style={styles.routeCardHeader}>
                                        <Text style={styles.customerName}>{delivery.customer_name || 'Müşteri'}</Text>
                                        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                                            <Text style={[styles.statusText, { color: statusStyle.text }]}>
                                                {statusStyle.label}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={styles.addressRow}>
                                        <Ionicons name="location-outline" size={16} color="#64748b" />
                                        <Text style={styles.addressText} numberOfLines={2}>{delivery.address || delivery.customer_address || 'Adres belirtilmemiş'}</Text>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.navigateButton}
                                        onPress={() => openInMaps(delivery.address_lat, delivery.address_lng, delivery.customer_name || 'Teslimat')}
                                    >
                                        <Ionicons name="navigate" size={16} color="#fff" />
                                        <Text style={styles.navigateButtonText}>Yol Tarifi</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        );
                    })
                )}

                <View style={{ height: 100 }} />
            </ScrollView>

        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F5F5F5',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: '#64748b',
        fontSize: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1e293b',
    },
    mapButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0, 86, 150, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    statsSummary: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
        gap: 4,
    },
    statValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#1e293b',
    },
    statLabel: {
        fontSize: 12,
        color: '#64748b',
    },
    statDivider: {
        width: 1,
        backgroundColor: '#e2e8f0',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        flexGrow: 1,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1e293b',
        marginBottom: 16,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 16,
        color: '#94a3b8',
    },
    routeItem: {
        flexDirection: 'row',
        marginBottom: 0,
    },
    timeline: {
        alignItems: 'center',
        width: 48,
    },
    timelineDot: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    timelineDotText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
    timelineLine: {
        width: 2,
        flex: 1,
        backgroundColor: '#e2e8f0',
        marginVertical: 4,
    },
    routeCard: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
    },
    routeCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    customerName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1e293b',
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    statusText: {
        fontSize: 10,
        fontWeight: '700',
    },
    addressRow: {
        flexDirection: 'row',
        gap: 6,
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    addressText: {
        flex: 1,
        fontSize: 13,
        color: '#64748b',
        lineHeight: 18,
    },
    navigateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: '#005696',
        paddingVertical: 10,
        borderRadius: 8,
    },
    navigateButtonText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },
});
