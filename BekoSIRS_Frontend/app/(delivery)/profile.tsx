import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    StatusBar,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import api from '../../services/api';

import { useAuth } from '../../hooks/useAuth';


interface UserProfile {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
    role: string;
}

export default function DeliveryProfileScreen() {
    const { logout } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await api.get('/api/v1/profile/');
                setProfile(res.data);
            } catch (error) {
                console.error('Failed to fetch profile:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, []);

    const handleLogout = () => {
        Alert.alert(
            'Çıkış Yap',
            'Oturumu kapatmak istediğinizden emin misiniz?',
            [
                { text: 'İptal', style: 'cancel' },
                {
                    text: 'Çıkış Yap',
                    style: 'destructive',
                    onPress: async () => {
                        await logout();
                    },
                },
            ]
        );
    };

    const menuItems = [
        { icon: 'person-outline', label: 'Kişisel Bilgiler', subtitle: null },
        { icon: 'car-outline', label: 'Araç Bilgileri', subtitle: '34 ABC 123 - Ford Transit' },
        { icon: 'stats-chart-outline', label: 'Performans İstatistikleri', subtitle: null },
        { icon: 'time-outline', label: 'Çalışma Geçmişi', subtitle: null },
        { icon: 'settings-outline', label: 'Uygulama Ayarları', subtitle: null },
    ];

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#137fec" />
                    <Text style={styles.loadingText}>Yükleniyor...</Text>
                </View>
            </SafeAreaView>
        );
    }

    const fullName = profile
        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.username
        : 'Teslimatçı';

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#137fec" />

            {/* Header */}
            <View style={styles.header}>
                <SafeAreaView edges={['top']}>
                    <View style={styles.headerTop}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
                            <Ionicons name="chevron-back" size={24} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Profil</Text>
                        <TouchableOpacity style={styles.headerButton}>
                            <Ionicons name="settings-outline" size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    {/* Avatar */}
                    <View style={styles.avatarSection}>
                        <View style={styles.avatarContainer}>
                            <View style={styles.avatar}>
                                <Ionicons name="person" size={48} color="#fff" />
                            </View>
                            <View style={styles.statusDot} />
                        </View>
                        <Text style={styles.userName}>{fullName}</Text>
                        <Text style={styles.userTitle}>Kıdemli Teslimat Uzmanı</Text>
                    </View>
                </SafeAreaView>
            </View>

            {/* Menu Content */}
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                {menuItems.map((item, index) => (
                    <TouchableOpacity 
                        key={index} 
                        style={styles.menuItem} 
                        activeOpacity={0.7}
                        onPress={() => {}} // No action needed for placeholder
                    >
                        <View style={styles.menuIconContainer}>
                            <Ionicons name={item.icon as any} size={24} color="#137fec" />
                        </View>
                        <View style={styles.menuTextContainer}>
                            <Text style={styles.menuLabel}>{item.label}</Text>
                            {item.subtitle && (
                                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                            )}
                        </View>
                        <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
                    </TouchableOpacity>
                ))}

                {/* Logout Button */}
                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                    <Ionicons name="log-out-outline" size={22} color="#dc2626" />
                    <Text style={styles.logoutText}>Oturumu Kapat</Text>
                </TouchableOpacity>

                <View style={{ height: 100 }} />
            </ScrollView>

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
    header: {
        backgroundColor: '#137fec',
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        paddingBottom: 24,
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    headerButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
    avatarSection: {
        alignItems: 'center',
        paddingTop: 8,
    },
    avatarContainer: {
        position: 'relative',
    },
    avatar: {
        width: 76,
        height: 76,
        borderRadius: 38,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    statusDot: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#22c55e',
        borderWidth: 3,
        borderColor: '#137fec',
    },
    userName: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
        marginTop: 12,
    },
    userTitle: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        fontWeight: '500',
        marginTop: 4,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        gap: 8,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        paddingHorizontal: 16,
        paddingVertical: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        gap: 16,
    },
    menuIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(19, 127, 236, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuTextContainer: {
        flex: 1,
    },
    menuLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111418',
    },
    menuSubtitle: {
        fontSize: 14,
        color: '#617589',
        marginTop: 2,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.05)',
        paddingVertical: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.1)',
        gap: 8,
        marginTop: 32,
    },
    logoutText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#dc2626',
    },
});
