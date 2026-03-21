import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Image,
    StyleSheet,
    RefreshControl,
    StatusBar,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

import api from '../../services/api';
import { useAuth } from '../../hooks/useAuth';


interface Delivery {
    id: number;
    order_number: string;
    customer_name: string;
    customer_phone: string;
    customer_address: string;
    address: string;
    product_name: string;
    product_model_code: string;
    quantity: number;
    status: 'WAITING' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
    delivery_order: number;
}

interface RouteInfo {
    id: number;
    total_distance_km: number;
    total_duration_min: number;
    status: string;
    stop_count: number;
    completed_count: number;
}

export default function DeliveryDashboard() {
    const { logout } = useAuth();
    const [deliveries, setDeliveries] = useState<Delivery[]>([]);
    const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [startingRoute, setStartingRoute] = useState(false);
    const [userName, setUserName] = useState('Teslimatçı');

    const fetchDeliveries = async () => {
        try {
            const [profileRes, res] = await Promise.all([
                api.get('/api/v1/profile/'),
                api.get('/api/v1/delivery-person/my_route/')
            ]);
            setUserName(profileRes.data.first_name || profileRes.data.username || 'Teslimatçı');
            // New response format: { route: {...}, deliveries: [...] }
            if (res.data.deliveries) {
                setDeliveries(res.data.deliveries);
                setRouteInfo(res.data.route);
            } else {
                // Fallback for old format
                setDeliveries(Array.isArray(res.data) ? res.data : []);
            }
        } catch (error) {
            console.error('Failed to fetch deliveries:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleStartRoute = async () => {
        try {
            setStartingRoute(true);
            await api.post('/api/v1/delivery-person/start_route/');
            fetchDeliveries();
        } catch (error) {
            console.error('Failed to start route:', error);
        } finally {
            setStartingRoute(false);
        }
    };

    useEffect(() => {
        fetchDeliveries();
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        fetchDeliveries();
    };

    const stats = {
        total: deliveries.length,
        completed: deliveries.filter(d => d.status === 'DELIVERED').length,
        pending: deliveries.filter(d => d.status !== 'DELIVERED').length,
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'DELIVERED':
                return { bg: '#d1fae5', text: '#059669', label: 'Teslim Edildi', icon: 'checkmark-circle' };
            case 'OUT_FOR_DELIVERY':
                return { bg: '#fef3c7', text: '#d97706', label: 'Sıradaki', icon: 'time' };
            default:
                return { bg: '#f1f5f9', text: '#64748b', label: 'Beklemede', icon: 'hourglass' };
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#005696" />
                    <Text style={styles.loadingText}>Teslimatlar yükleniyor...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar barStyle="light-content" backgroundColor="#005696" />

            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerContent}>
                    <View style={styles.userInfo}>
                        <View style={styles.avatar}>
                            <Ionicons name="person" size={24} color="#fff" />
                        </View>
                        <View>
                            <Text style={styles.greeting}>Hoş geldin,</Text>
                            <Text style={styles.userName}>{userName}</Text>
                        </View>
                    </View>
                    <View style={styles.headerActions}>
                        <TouchableOpacity style={styles.headerButton} onPress={() => router.push('/(drawer)/notifications' as any)}>
                            <Ionicons name="notifications" size={24} color="#fff" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.headerButton} onPress={logout}>
                            <Ionicons name="log-out-outline" size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#005696']} />}
                showsVerticalScrollIndicator={false}
            >
                {/* Stats Cards */}
                <View style={styles.statsContainer}>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>TOPLAM</Text>
                        <Text style={[styles.statValue, { color: '#005696' }]}>{stats.total}</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>TAMAMLANAN</Text>
                        <Text style={[styles.statValue, { color: '#059669' }]}>{stats.completed}</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>BEKLEYEN</Text>
                        <Text style={[styles.statValue, { color: '#E31E24' }]}>{stats.pending}</Text>
                    </View>
                </View>

                {/* Route Summary Card */}
                {routeInfo && (
                    <View style={styles.routeSummaryCard}>
                        <View style={styles.routeSummaryHeader}>
                            <Ionicons name="navigate" size={20} color="#005696" />
                            <Text style={styles.routeSummaryTitle}>Günün Rotası</Text>
                        </View>
                        <View style={styles.routeStatsRow}>
                            <View style={styles.routeStatItem}>
                                <Text style={styles.routeStatValue}>{routeInfo.total_distance_km}</Text>
                                <Text style={styles.routeStatLabel}>km</Text>
                            </View>
                            <View style={styles.routeStatDivider} />
                            <View style={styles.routeStatItem}>
                                <Text style={styles.routeStatValue}>
                                    {Math.floor(routeInfo.total_duration_min / 60)}s {routeInfo.total_duration_min % 60}dk
                                </Text>
                                <Text style={styles.routeStatLabel}>süre</Text>
                            </View>
                            <View style={styles.routeStatDivider} />
                            <View style={styles.routeStatItem}>
                                <Text style={styles.routeStatValue}>
                                    {routeInfo.completed_count}/{routeInfo.stop_count}
                                </Text>
                                <Text style={styles.routeStatLabel}>tamamlanan</Text>
                            </View>
                        </View>
                        {routeInfo.status === 'PLANNED' && (
                            <TouchableOpacity
                                style={styles.startRouteButton}
                                onPress={handleStartRoute}
                                disabled={startingRoute}
                            >
                                {startingRoute ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <Ionicons name="play-circle" size={22} color="#fff" />
                                        <Text style={styles.startRouteText}>Rotayı Başlat</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* Map Button */}
                <TouchableOpacity
                    style={styles.mapButton}
                    onPress={() => router.push('/(delivery)/map')}
                    activeOpacity={0.9}
                >
                    <Ionicons name="map" size={24} color="#fff" />
                    <Text style={styles.mapButtonText}>Rotayı Haritada Gör</Text>
                </TouchableOpacity>

                {/* Delivery List Header */}
                <View style={styles.listHeader}>
                    <Text style={styles.listTitle}>Teslimat Listesi</Text>
                    <TouchableOpacity>
                        <Text style={styles.listAction}>Tümünü Gör</Text>
                    </TouchableOpacity>
                </View>

                {/* Delivery Cards */}
                {deliveries.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="cube-outline" size={64} color="#cbd5e1" />
                        <Text style={styles.emptyText}>Bugün için teslimat yok</Text>
                    </View>
                ) : (
                    deliveries.map((delivery, index) => {
                        const status = getStatusBadge(delivery.status);
                        const isNext = delivery.status === 'OUT_FOR_DELIVERY';
                        const isDelivered = delivery.status === 'DELIVERED';

                        return (
                            <TouchableOpacity
                                key={delivery.id}
                                style={[
                                    styles.deliveryCard,
                                    isNext && styles.deliveryCardActive,
                                    isDelivered && styles.deliveryCardDelivered,
                                ]}
                                onPress={() => router.push(`/(delivery)/detail/${delivery.id}` as any)}
                                activeOpacity={0.8}
                            >
                                <View style={styles.cardHeader}>
                                    <View style={styles.cardHeaderLeft}>
                                        <View style={[styles.orderBadge, isNext && styles.orderBadgeActive]}>
                                            <Text style={[styles.orderBadgeText, isNext && { color: '#fff' }]}>
                                                {delivery.delivery_order || index + 1}
                                            </Text>
                                        </View>
                                        <View>
                                            <Text style={styles.customerName}>{delivery.customer_name || 'Müşteri'}</Text>
                                            <Text style={styles.orderNumber}>Sipariş: #{delivery.order_number || delivery.id}</Text>
                                        </View>
                                    </View>
                                    <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                                        {isDelivered && <Ionicons name="checkmark-circle" size={12} color={status.text} />}
                                        <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
                                    </View>
                                </View>

                                <View style={styles.cardBody}>
                                    <View style={styles.infoRow}>
                                        <Ionicons name="location" size={18} color="#005696" />
                                        <Text style={styles.addressText} numberOfLines={2}>{delivery.customer_address || delivery.address}</Text>
                                    </View>
                                    <View style={styles.productRow}>
                                        <Ionicons name="cube" size={18} color="#94a3b8" />
                                        <Text style={styles.productText}>{delivery.product_name || 'Ürün bilgisi yok'}</Text>
                                        {delivery.quantity > 1 && (
                                            <Text style={styles.quantityBadge}>{delivery.quantity} Adet</Text>
                                        )}
                                    </View>
                                    {delivery.customer_phone && (
                                        <View style={styles.infoRow}>
                                            <Ionicons name="call" size={18} color="#94a3b8" />
                                            <Text style={styles.addressText}>{delivery.customer_phone}</Text>
                                        </View>
                                    )}
                                </View>

                                {!isDelivered && (
                                    <View style={styles.actionHint}>
                                        <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
                                        <Text style={styles.actionHintText}>Detaylar için dokun</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })
                )}

                <View style={{ height: 100 }} />
            </ScrollView>

        </SafeAreaView>
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
        backgroundColor: '#005696',
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 40,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
    },
    headerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    greeting: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        fontWeight: '500',
    },
    userName: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
    },
    headerActions: {
        flexDirection: 'row',
        gap: 8,
    },
    headerButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollView: {
        flex: 1,
        marginTop: -24,
    },
    scrollContent: {
        paddingHorizontal: 16,
    },
    statsContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 20,
    },
    statCard: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    statLabel: {
        fontSize: 10,
        fontWeight: '700',
        color: '#94a3b8',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    statValue: {
        fontSize: 28,
        fontWeight: '800',
    },
    mapButton: {
        backgroundColor: '#E31E24',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 56,
        borderRadius: 16,
        gap: 12,
        marginBottom: 24,
        shadowColor: '#E31E24',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    mapButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
    listHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    listTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1e293b',
    },
    listAction: {
        fontSize: 14,
        fontWeight: '700',
        color: '#005696',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 48,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 16,
        color: '#94a3b8',
    },
    deliveryCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderLeftWidth: 4,
        borderLeftColor: '#e2e8f0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    deliveryCardActive: {
        borderLeftColor: '#E31E24',
        shadowColor: '#E31E24',
        shadowOpacity: 0.1,
    },
    deliveryCardDelivered: {
        opacity: 0.7,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    cardHeaderLeft: {
        flexDirection: 'row',
        gap: 12,
    },
    orderBadge: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    orderBadgeActive: {
        backgroundColor: '#E31E24',
    },
    orderBadgeText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#64748b',
    },
    customerName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1e293b',
    },
    orderNumber: {
        fontSize: 10,
        fontWeight: '700',
        color: '#94a3b8',
        letterSpacing: 0.5,
        marginTop: 2,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    statusText: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    cardBody: {
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
        gap: 8,
    },
    infoRow: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'flex-start',
    },
    addressText: {
        flex: 1,
        fontSize: 14,
        color: '#64748b',
        lineHeight: 20,
    },
    productRow: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
        backgroundColor: '#f8fafc',
        padding: 8,
        borderRadius: 8,
    },
    productText: {
        flex: 1,
        fontSize: 14,
        fontWeight: '600',
        color: '#005696',
    },
    actionButton: {
        marginTop: 12,
        backgroundColor: '#005696',
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    actionButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    actionHint: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4,
        marginTop: 12,
    },
    actionHintText: {
        fontSize: 12,
        color: '#94a3b8',
    },
    routeSummaryCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#e0e7ff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    routeSummaryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    routeSummaryTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1e293b',
    },
    routeStatsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingVertical: 12,
        backgroundColor: '#f8fafc',
        borderRadius: 12,
    },
    routeStatItem: {
        alignItems: 'center',
    },
    routeStatValue: {
        fontSize: 18,
        fontWeight: '800',
        color: '#005696',
    },
    routeStatLabel: {
        fontSize: 10,
        fontWeight: '600',
        color: '#94a3b8',
        marginTop: 2,
    },
    routeStatDivider: {
        width: 1,
        height: 30,
        backgroundColor: '#e2e8f0',
    },
    startRouteButton: {
        marginTop: 12,
        backgroundColor: '#059669',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: 12,
    },
    startRouteText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    quantityBadge: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748b',
        backgroundColor: '#f1f5f9',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
});
