import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Image,
    StyleSheet,
    Linking,
    Platform,
    Alert,
    StatusBar,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import api from '../../../services/api';

interface DeliveryDetail {
    id: number;
    order_number: string;
    customer_name: string;
    customer_phone: string;
    address: string;
    address_lat: number | null;
    address_lng: number | null;
    product_name: string;
    product_model: string;
    product_image: string | null;
    quantity: number;
    status: string;
    notes: string;
}

export default function DeliveryDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const [delivery, setDelivery] = useState<DeliveryDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [proofPhoto, setProofPhoto] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const fetchDelivery = async () => {
            try {
                const res = await api.get(`/api/v1/deliveries/${id}/`);
                setDelivery(res.data);
            } catch (error) {
                console.error('Failed to fetch delivery:', error);
                Alert.alert('Hata', 'Teslimat bilgileri yüklenemedi');
            } finally {
                setLoading(false);
            }
        };
        if (id) fetchDelivery();
    }, [id]);

    const handleCall = () => {
        if (delivery?.customer_phone) {
            Linking.openURL(`tel:${delivery.customer_phone}`);
        } else {
            Alert.alert('Bilgi', 'Telefon numarası bulunamadı');
        }
    };

    const handleNavigate = () => {
        if (delivery?.address_lat && delivery?.address_lng) {
            const scheme = Platform.select({ ios: 'maps:', android: 'geo:' });
            const url = Platform.select({
                ios: `maps:0,0?q=${delivery.address_lat},${delivery.address_lng}(${delivery.customer_name})`,
                android: `geo:0,0?q=${delivery.address_lat},${delivery.address_lng}(${delivery.customer_name})`,
            });
            Linking.openURL(url!);
        } else {
            Alert.alert('Bilgi', 'Konum bilgisi bulunamadı');
        }
    };

    const handleTakePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('İzin Gerekli', 'Fotoğraf çekmek için kamera izni gereklidir');
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
            setProofPhoto(result.assets[0].uri);
        }
    };

    const handleMarkDelivered = async () => {
        if (!proofPhoto) {
            Alert.alert('Uyarı', 'Lütfen önce teslimat kanıtı fotoğrafı çekin');
            return;
        }

        Alert.alert(
            'Teslim Onayı',
            'Bu teslimatı tamamlandı olarak işaretlemek istediğinizden emin misiniz?',
            [
                { text: 'İptal', style: 'cancel' },
                {
                    text: 'Evet, Teslim Edildi',
                    onPress: async () => {
                        setSubmitting(true);
                        try {
                            await api.post(`/api/v1/delivery-person/${id}/update_status/`, {
                                status: 'DELIVERED',
                            });
                            Alert.alert('Başarılı', 'Teslimat başarıyla tamamlandı!', [
                                { text: 'Tamam', onPress: () => router.back() },
                            ]);
                        } catch (error) {
                            Alert.alert('Hata', 'Teslimat durumu güncellenemedi');
                        } finally {
                            setSubmitting(false);
                        }
                    },
                },
            ]
        );
    };

    const handleReportIssue = () => {
        Alert.alert(
            'Sorun Bildir',
            'Ne tür bir sorun yaşıyorsunuz?',
            [
                { text: 'İptal', style: 'cancel' },
                { text: 'Müşteri Yok', onPress: () => reportIssue('customer_not_available') },
                { text: 'Yanlış Adres', onPress: () => reportIssue('wrong_address') },
                { text: 'Ürün Hasarlı', onPress: () => reportIssue('product_damaged') },
                { text: 'Diğer', onPress: () => reportIssue('other') },
            ]
        );
    };

    const reportIssue = async (issueType: string) => {
        try {
            await api.post(`/api/v1/delivery-person/${id}/update_status/`, { status: 'ISSUE', issue_type: issueType });
            Alert.alert('Bildirildi', 'Sorun başarıyla bildirildi');
        } catch (error) {
            Alert.alert('Hata', 'Sorun bildirilemedi');
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#136dec" />
                    <Text style={styles.loadingText}>Yükleniyor...</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (!delivery) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <Ionicons name="alert-circle" size={64} color="#ef4444" />
                    <Text style={styles.errorText}>Teslimat bulunamadı</Text>
                    <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
                        <Text style={styles.backLinkText}>Geri Dön</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <SafeAreaView style={styles.header} edges={['top']}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="#111418" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Sipariş No: #{delivery.order_number || delivery.id}</Text>
                <View style={{ width: 40 }} />
            </SafeAreaView>

            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                {/* Customer Card */}
                <View style={styles.card}>
                    <View style={styles.customerContent}>
                        <View style={styles.customerInfo}>
                            <Text style={styles.customerName}>{delivery.customer_name || 'Müşteri'}</Text>
                            <Text style={styles.customerLabel}>Müşteri</Text>
                            <TouchableOpacity style={styles.callButton} onPress={handleCall}>
                                <Ionicons name="call" size={18} color="#fff" />
                                <Text style={styles.callButtonText}>Ara</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.customerAvatar}>
                            <Ionicons name="person" size={40} color="#94a3b8" />
                        </View>
                    </View>
                </View>

                {/* Address Card */}
                <View style={styles.card}>
                    <View style={styles.addressHeader}>
                        <View style={styles.addressIcon}>
                            <Ionicons name="location" size={24} color="#136dec" />
                        </View>
                        <View style={styles.addressInfo}>
                            <Text style={styles.addressText}>{delivery.address}</Text>
                            <Text style={styles.addressLabel}>Teslimat Adresi</Text>
                        </View>
                    </View>

                    <View style={styles.mapPreview}>
                        <Ionicons name="map" size={48} color="#cbd5e1" />
                        <Text style={styles.mapPreviewText}>Harita Önizleme</Text>
                    </View>

                    <TouchableOpacity style={styles.navigateButton} onPress={handleNavigate}>
                        <Ionicons name="navigate" size={20} color="#fff" />
                        <Text style={styles.navigateButtonText}>Navigasyon Başlat</Text>
                    </TouchableOpacity>
                </View>

                {/* Product Section */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Ürün Detayları</Text>
                    <Text style={styles.sectionCount}>{delivery.quantity || 1} Ürün</Text>
                </View>

                <View style={styles.productCard}>
                    <View style={styles.productImageContainer}>
                        {delivery.product_image ? (
                            <Image source={{ uri: delivery.product_image }} style={styles.productImage} />
                        ) : (
                            <Ionicons name="cube" size={32} color="#94a3b8" />
                        )}
                    </View>
                    <View style={styles.productInfo}>
                        <Text style={styles.productName} numberOfLines={1}>{delivery.product_name || 'Ürün'}</Text>
                        <Text style={styles.productModel}>Model: {delivery.product_model || 'N/A'}</Text>
                    </View>
                    <View style={styles.quantityBadge}>
                        <Text style={styles.quantityText}>{delivery.quantity || 1} Adet</Text>
                    </View>
                </View>

                {/* Delivery Notes */}
                {delivery.notes && (
                    <View style={styles.notesCard}>
                        <Ionicons name="document-text" size={20} color="#136dec" />
                        <Text style={styles.notesText}>{delivery.notes}</Text>
                    </View>
                )}

                {/* Photo Proof */}
                <TouchableOpacity style={styles.photoButton} onPress={handleTakePhoto}>
                    {proofPhoto ? (
                        <Image source={{ uri: proofPhoto }} style={styles.proofImage} />
                    ) : (
                        <>
                            <Ionicons name="camera" size={40} color="#94a3b8" />
                            <Text style={styles.photoButtonTitle}>Teslimat Kanıtı Fotoğrafı</Text>
                            <Text style={styles.photoButtonSubtitle}>Fotoğraf çekmek için dokunun</Text>
                        </>
                    )}
                </TouchableOpacity>

                <View style={{ height: 120 }} />
            </ScrollView>

            {/* Footer Buttons */}
            <View style={styles.footer}>
                <TouchableOpacity style={styles.reportButton} onPress={handleReportIssue}>
                    <Ionicons name="warning" size={20} color="#111418" />
                    <Text style={styles.reportButtonText}>Sorun Bildir</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.deliveredButton, submitting && styles.buttonDisabled]}
                    onPress={handleMarkDelivered}
                    disabled={submitting}
                >
                    {submitting ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <>
                            <Ionicons name="checkmark-circle" size={20} color="#fff" />
                            <Text style={styles.deliveredButtonText}>Teslim Edildi</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f6f7f8',
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
    errorText: {
        marginTop: 16,
        color: '#ef4444',
        fontSize: 18,
        fontWeight: '600',
    },
    backLink: {
        marginTop: 16,
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: '#136dec',
        borderRadius: 8,
    },
    backLinkText: {
        color: '#fff',
        fontWeight: '600',
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
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111418',
        flex: 1,
        marginLeft: 8,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        gap: 12,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    customerContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    customerInfo: {
        flex: 1,
    },
    customerName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111418',
    },
    customerLabel: {
        fontSize: 14,
        color: '#64748b',
        marginTop: 2,
    },
    callButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#136dec',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
        marginTop: 16,
        alignSelf: 'flex-start',
    },
    callButtonText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 14,
    },
    customerAvatar: {
        width: 80,
        height: 80,
        borderRadius: 12,
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    addressHeader: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    addressIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(19, 109, 236, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    addressInfo: {
        flex: 1,
    },
    addressText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111418',
        lineHeight: 22,
    },
    addressLabel: {
        fontSize: 14,
        color: '#64748b',
        marginTop: 4,
    },
    mapPreview: {
        height: 120,
        backgroundColor: '#f1f5f9',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    mapPreviewText: {
        marginTop: 8,
        color: '#94a3b8',
        fontSize: 12,
    },
    navigateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#111418',
        paddingVertical: 14,
        borderRadius: 12,
    },
    navigateButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 8,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111418',
    },
    sectionCount: {
        fontSize: 14,
        fontWeight: '600',
        color: '#136dec',
    },
    productCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 12,
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    productImageContainer: {
        width: 64,
        height: 64,
        borderRadius: 12,
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    productImage: {
        width: 64,
        height: 64,
        borderRadius: 12,
    },
    productInfo: {
        flex: 1,
    },
    productName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111418',
    },
    productModel: {
        fontSize: 14,
        color: '#64748b',
        marginTop: 2,
    },
    quantityBadge: {
        backgroundColor: '#f6f7f8',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    quantityText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111418',
    },
    notesCard: {
        flexDirection: 'row',
        gap: 12,
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        alignItems: 'flex-start',
    },
    notesText: {
        flex: 1,
        fontSize: 14,
        color: '#64748b',
        lineHeight: 20,
    },
    photoButton: {
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: '#cbd5e1',
        borderRadius: 16,
        padding: 32,
        alignItems: 'center',
        backgroundColor: '#fff',
        marginTop: 8,
    },
    photoButtonTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#64748b',
        marginTop: 8,
    },
    photoButtonSubtitle: {
        fontSize: 12,
        color: '#94a3b8',
        marginTop: 4,
    },
    proofImage: {
        width: '100%',
        height: 200,
        borderRadius: 12,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        gap: 12,
        padding: 16,
        paddingBottom: 32,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
    },
    reportButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#e5e7eb',
        paddingVertical: 16,
        borderRadius: 12,
    },
    reportButtonText: {
        color: '#111418',
        fontSize: 14,
        fontWeight: '700',
    },
    deliveredButton: {
        flex: 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#22c55e',
        paddingVertical: 16,
        borderRadius: 12,
        shadowColor: '#22c55e',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    deliveredButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    buttonDisabled: {
        opacity: 0.7,
    },
});
