import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    TextInput,
    StyleSheet,
    Text,
    TouchableOpacity,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    Modal,
    Animated,
    Easing,
    Dimensions,
    Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { useBiometric } from '../hooks/useBiometric';
import { saveTokens } from '../storage/storage.native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';

const { width, height } = Dimensions.get('window');
const CIRCLE_SIZE = 280;

const LoginScreen = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const { login, loading } = useAuth();

    // Custom FaceID UI State
    const [showFaceScan, setShowFaceScan] = useState(false);
    const [scanStatus, setScanStatus] = useState('Yüz Taranıyor...');
    const [permission, requestPermission] = useCameraPermissions();
    const spinValue = useRef(new Animated.Value(0)).current;

    // Biometric hook (kept for reference or fallback logic if needed)
    const { isAvailable } = useBiometric();

    const handleLogin = async () => {
        await login(username, password);
    };

    const handleBiometricLogin = async () => {
        // Check permission first
        if (!permission?.granted) {
            const { granted } = await requestPermission();
            if (!granted) {
                Alert.alert("İzin Gerekli", "Face ID simülasyonu için kamera izni gereklidir.");
                return;
            }
        }

        setShowFaceScan(true);
        setScanStatus('Yüz Taranıyor...');
        spinValue.setValue(0);

        // Start Animation Loop
        Animated.loop(
            Animated.timing(spinValue, {
                toValue: 1,
                duration: 3000,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        ).start();

        // Mock Process
        setTimeout(() => {
            setScanStatus('Doğrulanıyor...');
        }, 7000);

        setTimeout(async () => {
            // Success
            setScanStatus('Başarılı!');
            // Wait a bit then login
            setTimeout(async () => {
                setShowFaceScan(false);
                // Simulate successful login
                await saveTokens("mock_access_token_" + Date.now(), "mock_refresh_token");
                await AsyncStorage.setItem('user_role', 'customer');
                router.replace('/' as any);
            }, 1000);
        }, 10000);
    };

    const spin = spinValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg']
    });

    const isLoading = loading;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />

            {/* FACE ID MOCK MODAL */}
            <Modal visible={showFaceScan} animationType="fade" transparent={false}>
                <View style={styles.scanContainer}>
                    <CameraView
                        style={StyleSheet.absoluteFill}
                        facing="front"
                    />

                    {/* Dark Overlay with Hole */}
                    <View style={styles.overlayContainer}>
                        <View style={styles.overlayTop}>
                            <Text style={styles.scanTitle}>Face ID</Text>
                        </View>

                        <View style={styles.overlayMiddle}>
                            <View style={styles.overlaySide} />

                            <View style={styles.scannerCircle}>
                                {/* Rotating Ring */}
                                <Animated.View
                                    style={[
                                        styles.scanRing,
                                        { transform: [{ rotate: spin }] }
                                    ]}
                                />
                            </View>

                            <View style={styles.overlaySide} />
                        </View>

                        <View style={styles.overlayBottom}>
                            <Text style={styles.scanStatus}>{scanStatus}</Text>
                            <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={() => setShowFaceScan(false)}
                            >
                                <Text style={styles.cancelText}>İptal</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header Section */}
                    <View style={styles.header}>
                        <View style={styles.logoBadge}>
                            <Text style={styles.logoText}>BEKO</Text>
                        </View>
                        <Text style={styles.title}>Hoş Geldiniz</Text>
                        <Text style={styles.subtitle}>
                            Ürün yönetim sistemine güvenli erişim sağlayın
                        </Text>
                    </View>

                    {/* Login Card */}
                    <View style={styles.card}>
                        {/* Always show FaceID button for Demo */}
                        <TouchableOpacity
                            style={styles.biometricButton}
                            onPress={handleBiometricLogin}
                            disabled={isLoading}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.biometricIcon}>👤</Text>
                            <Text style={styles.biometricButtonText}>
                                Face ID ile Giriş
                            </Text>
                        </TouchableOpacity>

                        <View style={styles.divider}>
                            <View style={styles.line} />
                            <Text style={styles.dividerText}>veya şifre ile</Text>
                            <View style={styles.line} />
                        </View>

                        <View style={styles.inputSection}>
                            <Text style={styles.label}>Kullanıcı Adı</Text>
                            <View style={styles.inputWrapper}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Kullanıcı adınızı girin"
                                    value={username}
                                    onChangeText={setUsername}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    placeholderTextColor="#9CA3AF"
                                    editable={!isLoading}
                                />
                            </View>
                        </View>

                        <View style={styles.inputSection}>
                            <Text style={styles.label}>Şifre</Text>
                            <View style={styles.inputWrapper}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="••••••••"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword}
                                    autoCapitalize="none"
                                    placeholderTextColor="#9CA3AF"
                                    editable={!isLoading}
                                />
                                <TouchableOpacity
                                    onPress={() => setShowPassword(!showPassword)}
                                    style={styles.iconButton}
                                >
                                    <Text style={styles.iconText}>
                                        {showPassword ? '👁️' : '👁️‍🗨️'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <TouchableOpacity
                            style={styles.forgotPassContainer}
                            onPress={() => router.push('/forgot-password' as any)}
                        >
                            <Text style={styles.forgotPassText}>Şifremi Unuttum</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.primaryButton, (isLoading || !username || !password) && styles.buttonDisabled]}
                            onPress={handleLogin}
                            disabled={isLoading || !username || !password}
                            activeOpacity={0.8}
                        >
                            {loading ? (
                                <ActivityIndicator color="#FFFFFF" />
                            ) : (
                                <Text style={styles.buttonText}>Giriş Yap</Text>
                            )}
                        </TouchableOpacity>

                        <View style={styles.divider}>
                            <View style={styles.line} />
                            <Text style={styles.dividerText}>veya</Text>
                            <View style={styles.line} />
                        </View>

                        <TouchableOpacity
                            style={styles.secondaryButton}
                            onPress={() => router.push('/register' as any)}
                            disabled={isLoading}
                        >
                            <Text style={styles.secondaryButtonText}>Yeni Hesap Oluştur</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Footer Info */}
                    <View style={styles.footer}>
                        <Text style={styles.footerCopyright}>
                            © 2025 Beko Global. Tüm hakları saklıdır.
                        </Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    // ... Existing Styles ...
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 30,
        paddingVertical: 40,
    },
    header: {
        alignItems: 'center',
        marginBottom: 45,
    },
    logoBadge: {
        backgroundColor: '#000000',
        paddingHorizontal: 25,
        paddingVertical: 10,
        borderRadius: 12,
        marginBottom: 20,
    },
    logoText: {
        color: '#FFFFFF',
        fontSize: 28,
        fontWeight: '900',
        letterSpacing: 2,
    },
    title: {
        fontSize: 26,
        fontWeight: 'bold',
        color: '#111827',
    },
    subtitle: {
        fontSize: 14,
        color: '#6B7280',
        marginTop: 8,
        textAlign: 'center',
    },
    card: {
        backgroundColor: '#FFFFFF',
    },
    biometricButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F3F4F6',
        height: 58,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#2563EB',
        marginBottom: 20,
    },
    biometricIcon: {
        fontSize: 24,
        marginRight: 10,
    },
    biometricButtonText: {
        color: '#2563EB',
        fontSize: 16,
        fontWeight: '700',
    },
    inputSection: {
        marginBottom: 20,
    },
    label: {
        fontSize: 13,
        fontWeight: '700',
        color: '#374151',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 14,
        paddingHorizontal: 16,
    },
    input: {
        flex: 1,
        height: 54,
        fontSize: 15,
        color: '#111827',
        fontWeight: '500',
    },
    iconButton: {
        padding: 10,
    },
    iconText: {
        fontSize: 18,
    },
    forgotPassContainer: {
        alignSelf: 'flex-end',
        marginBottom: 25,
    },
    forgotPassText: {
        fontSize: 14,
        color: '#000000',
        fontWeight: '700',
    },
    primaryButton: {
        backgroundColor: '#000000',
        height: 58,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    buttonDisabled: {
        backgroundColor: '#E5E7EB',
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '800',
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 25,
    },
    line: {
        flex: 1,
        height: 1,
        backgroundColor: '#F3F4F6',
    },
    dividerText: {
        marginHorizontal: 15,
        color: '#9CA3AF',
        fontSize: 12,
        fontWeight: '600',
    },
    secondaryButton: {
        height: 58,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: '#E5E7EB',
        justifyContent: 'center',
        alignItems: 'center',
    },
    secondaryButtonText: {
        color: '#111827',
        fontSize: 15,
        fontWeight: '700',
    },
    footer: {
        marginTop: 'auto',
        paddingTop: 40,
        alignItems: 'center',
    },
    footerCopyright: {
        fontSize: 12,
        color: '#9CA3AF',
        fontWeight: '500',
    },

    // Face ID Overlay Styles
    scanContainer: {
        flex: 1,
        backgroundColor: 'black',
    },
    overlayContainer: {
        flex: 1,
    },
    overlayTop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 50,
    },
    overlayMiddle: {
        flexDirection: 'row',
        height: CIRCLE_SIZE,
    },
    overlaySide: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
    },
    scannerCircle: {
        width: CIRCLE_SIZE,
        height: CIRCLE_SIZE,
        borderRadius: CIRCLE_SIZE / 2,
        backgroundColor: 'transparent',
        overflow: 'hidden',
        position: 'relative',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    scanRing: {
        position: 'absolute',
        top: -10,
        left: -10,
        width: CIRCLE_SIZE + 20,
        height: CIRCLE_SIZE + 20,
        borderRadius: (CIRCLE_SIZE + 20) / 2,
        borderWidth: 4,
        borderColor: 'transparent',
        borderTopColor: '#00FF00', // Yeşil
        borderRightColor: 'rgba(0, 255, 0, 0.3)',
    },
    overlayBottom: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        alignItems: 'center',
        paddingTop: 50,
    },
    scanTitle: {
        color: 'white',
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    scanStatus: {
        color: '#00FF00',
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 40,
        letterSpacing: 1,
    },
    scanHint: {
        color: '#CCCCCC',
        fontSize: 14,
    },
    cancelButton: {
        paddingVertical: 12,
        paddingHorizontal: 30,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 20,
    },
    cancelText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
});

export default LoginScreen;
