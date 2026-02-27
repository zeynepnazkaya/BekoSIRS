// hooks/useBiometric.ts
import { useState, useEffect, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import api from '../services/api';

// Secure storage keys
const BIOMETRIC_USER_ID = 'biometric_user_id';
const BIOMETRIC_REFRESH_TOKEN = 'biometric_refresh_token';
const BIOMETRIC_DEVICE_ID = 'biometric_device_id';

// Generate a unique device ID
const generateDeviceId = (): string => {
    return `${Platform.OS}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export type BiometricType = 'face' | 'fingerprint' | 'iris' | 'none';

export const useBiometric = () => {
    const [isAvailable, setIsAvailable] = useState(false);
    const [biometricType, setBiometricType] = useState<BiometricType>('none');
    const [isEnabled, setIsEnabled] = useState(false);
    const [loading, setLoading] = useState(false);

    // Check biometric availability on mount
    useEffect(() => {
        checkBiometricAvailability();
        checkIfEnabled();
    }, []);

    // Check if device supports biometric authentication
    const checkBiometricAvailability = async (): Promise<boolean> => {
        try {
            const compatible = await LocalAuthentication.hasHardwareAsync();
            const enrolled = await LocalAuthentication.isEnrolledAsync();

            setIsAvailable(compatible && enrolled);

            if (compatible && enrolled) {
                const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

                if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
                    setBiometricType('face');
                } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
                    setBiometricType('fingerprint');
                } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
                    setBiometricType('iris');
                }
            }

            return compatible && enrolled;
        } catch (error) {
            console.error('Biometric check error:', error);
            return false;
        }
    };

    // Check if biometric is enabled for current user
    const checkIfEnabled = async (): Promise<boolean> => {
        try {
            const userId = await SecureStore.getItemAsync(BIOMETRIC_USER_ID);
            const refreshToken = await SecureStore.getItemAsync(BIOMETRIC_REFRESH_TOKEN);
            const enabled = !!(userId && refreshToken);
            setIsEnabled(enabled);
            return enabled;
        } catch (error) {
            console.error('Check enabled error:', error);
            return false;
        }
    };

    // Get display name for biometric type
    const getBiometricDisplayName = (): string => {
        switch (biometricType) {
            case 'face':
                return Platform.OS === 'ios' ? 'Face ID' : 'Yüz Tanıma';
            case 'fingerprint':
                return Platform.OS === 'ios' ? 'Touch ID' : 'Parmak İzi';
            case 'iris':
                return 'Göz Taraması';
            default:
                return 'Biyometrik';
        }
    };

    // Enable biometric authentication
    const enableBiometric = async (
        userId: number,
        refreshToken: string
    ): Promise<boolean> => {
        setLoading(true);
        try {
            // First verify biometric is available
            const available = await checkBiometricAvailability();
            if (!available) {
                Alert.alert(
                    'Kullanılamıyor',
                    `${getBiometricDisplayName()} bu cihazda kullanılamıyor veya ayarlanmamış.`
                );
                return false;
            }

            // Authenticate to confirm user wants to enable
            const authResult = await LocalAuthentication.authenticateAsync({
                promptMessage: `${getBiometricDisplayName()} ile giriş yapmayı etkinleştirin`,
                cancelLabel: 'İptal',
                disableDeviceFallback: false,
            });

            if (!authResult.success) {
                return false;
            }

            // Generate unique device ID
            let deviceId = await SecureStore.getItemAsync(BIOMETRIC_DEVICE_ID);
            if (!deviceId) {
                deviceId = generateDeviceId();
                await SecureStore.setItemAsync(BIOMETRIC_DEVICE_ID, deviceId);
            }

            // Call backend to enable biometric
            await api.post('/api/v1/biometric/enable/', {
                device_id: deviceId,
                refresh_token: refreshToken,
            });

            // Store credentials securely on device
            await SecureStore.setItemAsync(BIOMETRIC_USER_ID, userId.toString());
            await SecureStore.setItemAsync(BIOMETRIC_REFRESH_TOKEN, refreshToken);

            setIsEnabled(true);

            Alert.alert(
                'Başarılı',
                `${getBiometricDisplayName()} ile giriş etkinleştirildi.`
            );

            return true;
        } catch (error: any) {
            console.error('Enable biometric error:', error);
            Alert.alert(
                'Hata',
                error.response?.data?.error || 'Biyometrik giriş etkinleştirilemedi.'
            );
            return false;
        } finally {
            setLoading(false);
        }
    };

    // Disable biometric authentication
    const disableBiometric = async (): Promise<boolean> => {
        setLoading(true);
        try {
            // Call backend to disable
            try {
                await api.post('/api/v1/biometric/disable/');
            } catch (e) {
                // Continue even if backend call fails (user might be logged out)
            }

            // Clear local storage
            await SecureStore.deleteItemAsync(BIOMETRIC_USER_ID);
            await SecureStore.deleteItemAsync(BIOMETRIC_REFRESH_TOKEN);

            setIsEnabled(false);

            Alert.alert('Başarılı', 'Biyometrik giriş devre dışı bırakıldı.');
            return true;
        } catch (error) {
            console.error('Disable biometric error:', error);
            return false;
        } finally {
            setLoading(false);
        }
    };

    // Authenticate and get tokens for login
    const authenticateWithBiometric = async (): Promise<{
        success: boolean;
        accessToken?: string;
        refreshToken?: string;
        userId?: number;
        error?: string;
    }> => {
        setLoading(true);
        try {
            // Check if biometric is enabled
            const userId = await SecureStore.getItemAsync(BIOMETRIC_USER_ID);
            const storedRefreshToken = await SecureStore.getItemAsync(BIOMETRIC_REFRESH_TOKEN);
            const deviceId = await SecureStore.getItemAsync(BIOMETRIC_DEVICE_ID);

            if (!userId || !storedRefreshToken || !deviceId) {
                return {
                    success: false,
                    error: 'Biyometrik giriş ayarlanmamış.',
                };
            }

            // Authenticate with device biometric
            const authResult = await LocalAuthentication.authenticateAsync({
                promptMessage: `${getBiometricDisplayName()} ile giriş yapın`,
                cancelLabel: 'Şifre ile gir',
                disableDeviceFallback: false,
            });

            if (!authResult.success) {
                return {
                    success: false,
                    error: authResult.error === 'user_cancel' ? 'cancelled' : 'Kimlik doğrulama başarısız.',
                };
            }

            // Verify device with backend
            const verifyResponse = await api.post('/api/v1/biometric/verify-device/', {
                device_id: deviceId,
                user_id: parseInt(userId),
            });

            if (!verifyResponse.data.success) {
                return {
                    success: false,
                    error: verifyResponse.data.error || 'Cihaz doğrulanamadı.',
                };
            }

            // Use refresh token to get new access token
            const tokenResponse = await api.post('/api/v1/token/refresh/', {
                refresh: storedRefreshToken,
            });

            // Update stored refresh token if rotated
            if (tokenResponse.data.refresh) {
                await SecureStore.setItemAsync(BIOMETRIC_REFRESH_TOKEN, tokenResponse.data.refresh);
            }

            return {
                success: true,
                accessToken: tokenResponse.data.access,
                refreshToken: tokenResponse.data.refresh || storedRefreshToken,
                userId: parseInt(userId),
            };
        } catch (error: any) {
            console.error('Biometric auth error:', error);

            // If refresh token is expired, clear biometric data
            if (error.response?.status === 401) {
                await disableBiometric();
                return {
                    success: false,
                    error: 'Oturum süresi doldu. Lütfen şifre ile giriş yapın.',
                };
            }

            return {
                success: false,
                error: error.response?.data?.error || 'Giriş başarısız.',
            };
        } finally {
            setLoading(false);
        }
    };

    return {
        // State
        isAvailable,
        isEnabled,
        biometricType,
        loading,

        // Computed
        displayName: getBiometricDisplayName(),

        // Methods
        checkBiometricAvailability,
        checkIfEnabled,
        enableBiometric,
        disableBiometric,
        authenticateWithBiometric,
    };
};
