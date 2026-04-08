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
    Alert,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { installmentAPI } from '../../services';

interface Installment {
    id: number;
    installment_number: number;
    amount: string;
    due_date: string;
    payment_date: string | null;
    status: string;
    status_display: string;
    is_overdue: boolean;
    days_until_due: number;
}

interface InstallmentPlan {
    id: number;
    product_name: string;
    total_amount: string;
    remaining_amount: string;
    paid_amount: string;
    progress_percentage: number;
    status: string;
    status_display: string;
    installment_count: number;
    start_date: string;
    notes?: string;
    installments?: Installment[];
}

const PaymentsScreen = () => {
    const [plans, setPlans] = useState<InstallmentPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [expandedPlanId, setExpandedPlanId] = useState<number | null>(null);
    const [installmentsLoading, setInstallmentsLoading] = useState(false);
    const [installmentsMap, setInstallmentsMap] = useState<Record<number, Installment[]>>({});

    const fetchPlans = useCallback(async () => {
        try {
            const response = await installmentAPI.getMyPlans();
            const data = response.data;
            setPlans(Array.isArray(data) ? data : (data.results || []));
        } catch (error) {
            console.error('Plans fetch error:', error);
            setPlans([]);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchPlans();
    }, [fetchPlans]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        setInstallmentsMap({}); // Clear cached installments
        fetchPlans();
    }, [fetchPlans]);

    const fetchInstallments = async (planId: number) => {
        if (installmentsMap[planId]) {
            // Already fetched, just toggle expand
            setExpandedPlanId(expandedPlanId === planId ? null : planId);
            return;
        }

        setInstallmentsLoading(true);
        try {
            const response = await installmentAPI.getPlanInstallments(planId);
            const data = response.data;
            setInstallmentsMap(prev => ({
                ...prev,
                [planId]: Array.isArray(data) ? data : (data.results || [])
            }));
            setExpandedPlanId(planId);
        } catch (error) {
            console.error('Installments fetch error:', error);
            Alert.alert('Hata', 'Taksit detayları yüklenemedi');
        } finally {
            setInstallmentsLoading(false);
        }
    };


    const formatCurrency = (amount: string) => {
        return parseFloat(amount).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺';
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'paid': return '#10B981';
            case 'pending': return '#F59E0B';
            case 'customer_confirmed': return '#8B5CF6';
            case 'overdue': return '#EF4444';
            default: return '#6B7280';
        }
    };

    const getDaysLabel = (inst: Installment): string => {
        if (inst.status === 'paid' || inst.status === 'customer_confirmed') return '';
        if (inst.is_overdue || inst.days_until_due < 0) return `Ödemeniz ${Math.abs(inst.days_until_due)} gün gecikti`;
        if (inst.days_until_due === 0) return 'Bugün son gün';
        return `${inst.days_until_due} gün kaldı`;
    };

    const renderInstallment = (inst: Installment, planId: number) => {
        const daysLabel = getDaysLabel(inst);
        return (
            <View
                key={inst.id}
                style={[
                    styles.installmentRow,
                    inst.is_overdue && styles.overdueRow,
                ]}
            >
                {inst.is_overdue && <View style={styles.overdueLeftBorder} />}

                <View style={[styles.installmentNumber, inst.is_overdue && styles.overdueNumber]}>
                    <Text style={styles.installmentNumberText}>{inst.installment_number}</Text>
                </View>

                <View style={styles.installmentInfo}>
                    <Text style={styles.installmentAmount}>{formatCurrency(inst.amount)}</Text>
                    <Text style={styles.installmentDate}>Vade: {formatDate(inst.due_date)}</Text>
                    {daysLabel !== '' && (
                        <Text style={[styles.daysLabel, inst.is_overdue && styles.daysLabelOverdue]}>
                            {daysLabel}
                        </Text>
                    )}
                </View>

                <View style={styles.installmentStatus}>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(inst.status) + '20' }]}>
                        <Text style={[styles.statusText, { color: getStatusColor(inst.status) }]}>
                            {inst.status_display}
                        </Text>
                    </View>

                </View>
            </View>
        );
    };

    const renderPlan = ({ item }: { item: InstallmentPlan }) => {
        const isExpanded = expandedPlanId === item.id;
        const installments = installmentsMap[item.id] || [];

        return (
            <View style={styles.card}>
                <TouchableOpacity
                    style={styles.cardHeader}
                    onPress={() => fetchInstallments(item.id)}
                    activeOpacity={0.7}
                >
                    <View style={styles.cardHeaderLeft}>
                        <View style={styles.productIcon}>
                            <FontAwesome name="shopping-bag" size={20} color="#000" />
                        </View>
                        <View>
                            <Text style={styles.productName} numberOfLines={2}>{item.product_name}</Text>
                            <Text style={styles.planInfo}>
                                {item.installment_count} Taksit • {formatDate(item.start_date)}
                            </Text>
                        </View>
                    </View>
                    <FontAwesome
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={16}
                        color="#6B7280"
                    />
                </TouchableOpacity>

                {/* Progress Section */}
                <View style={styles.progressSection}>
                    <View style={styles.amountRow}>
                        <View>
                            <Text style={styles.amountLabel}>Toplam</Text>
                            <Text style={styles.amountValue}>{formatCurrency(item.total_amount)}</Text>
                        </View>
                        <View style={styles.amountCenter}>
                            <Text style={styles.amountLabel}>Ödenen</Text>
                            <Text style={[styles.amountValue, { color: '#10B981' }]}>{formatCurrency(item.paid_amount)}</Text>
                        </View>
                        <View>
                            <Text style={styles.amountLabel}>Kalan</Text>
                            <Text style={[styles.amountValue, { color: '#EF4444' }]}>{formatCurrency(item.remaining_amount)}</Text>
                        </View>
                    </View>

                    <View style={styles.progressBarContainer}>
                        <View style={styles.progressBar}>
                            <View
                                style={[styles.progressFill, { width: `${item.progress_percentage}%` }]}
                            />
                        </View>
                        <Text style={styles.progressText}>{item.progress_percentage}%</Text>
                    </View>
                </View>

                {/* Plan Notu */}
                {item.notes ? (
                    <View style={styles.notesContainer}>
                        <FontAwesome name="info-circle" size={12} color="#6B7280" />
                        <Text style={styles.notesText}>{item.notes}</Text>
                    </View>
                ) : null}

                {/* Installments List (Expanded) */}
                {isExpanded && (
                    <View style={styles.installmentsList}>
                        {installmentsLoading ? (
                            <ActivityIndicator size="small" color="#000" style={{ marginVertical: 20 }} />
                        ) : installments.length > 0 ? (
                            installments.map(inst => renderInstallment(inst, item.id))
                        ) : (
                            <Text style={styles.noInstallments}>Taksit bilgisi bulunamadı</Text>
                        )}
                    </View>
                )}
            </View>
        );
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#000000" testID="loading-payments" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <FlatList
                data={plans}
                renderItem={renderPlan}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={[styles.list, { flexGrow: 1 }]}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ListHeaderComponent={
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Ödemelerim</Text>
                        <Text style={styles.subtitle}>
                            Taksit planlarınızı görüntüleyin ve ödemelerinizi takip edin
                        </Text>
                    </View>
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <FontAwesome name="credit-card" size={60} color="#ccc" />
                        <Text style={styles.emptyTitle}>Taksit Planı Yok</Text>
                        <Text style={styles.emptyText}>
                            Henüz aktif bir taksit planınız bulunmuyor
                        </Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    list: {
        paddingHorizontal: 16,
        paddingBottom: 20,
    },
    header: {
        marginBottom: 16,
        marginTop: 8,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: '#1a1a1a',
    },
    subtitle: {
        fontSize: 14,
        color: '#666',
        marginTop: 4,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 3,
        overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    cardHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    productIcon: {
        width: 44,
        height: 44,
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    productName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111',
        maxWidth: 220,
    },
    planInfo: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
    },
    progressSection: {
        padding: 16,
        backgroundColor: '#fafafa',
    },
    amountRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    amountCenter: {
        alignItems: 'center',
    },
    amountLabel: {
        fontSize: 11,
        color: '#9CA3AF',
        textTransform: 'uppercase',
        fontWeight: '600',
    },
    amountValue: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111',
        marginTop: 2,
    },
    progressBarContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    progressBar: {
        flex: 1,
        height: 8,
        backgroundColor: '#E5E7EB',
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#10B981',
        borderRadius: 4,
    },
    progressText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111',
        minWidth: 40,
        textAlign: 'right',
    },
    installmentsList: {
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    installmentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#f5f5f5',
    },
    overdueRow: {
        backgroundColor: '#FEF2F2',
    },
    overdueLeftBorder: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        backgroundColor: '#EF4444',
        borderRadius: 2,
    },
    overdueNumber: {
        backgroundColor: '#EF4444',
    },
    daysLabel: {
        fontSize: 10,
        color: '#F59E0B',
        marginTop: 2,
        fontWeight: '600',
    },
    daysLabelOverdue: {
        color: '#EF4444',
    },
    confirmButtonOverdue: {
        backgroundColor: '#EF4444',
    },
    notesContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 6,
        backgroundColor: '#FFFBEB',
        borderTopWidth: 1,
        borderTopColor: '#FDE68A',
    },
    notesText: {
        fontSize: 12,
        color: '#92400E',
        flex: 1,
        lineHeight: 18,
    },
    installmentNumber: {
        width: 28,
        height: 28,
        backgroundColor: '#111',
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    installmentNumberText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
    },
    installmentInfo: {
        flex: 1,
    },
    installmentAmount: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    installmentDate: {
        fontSize: 11,
        color: '#6B7280',
        marginTop: 2,
    },
    installmentStatus: {
        alignItems: 'flex-end',
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    statusText: {
        fontSize: 10,
        fontWeight: '600',
    },
    confirmButton: {
        marginTop: 8,
        backgroundColor: '#10B981',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    confirmButtonText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '600',
    },
    noInstallments: {
        textAlign: 'center',
        padding: 20,
        color: '#9CA3AF',
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#333',
        marginTop: 24,
    },
    emptyText: {
        fontSize: 14,
        color: '#666',
        marginTop: 8,
        textAlign: 'center',
        paddingHorizontal: 40,
    },
});

export default PaymentsScreen;
