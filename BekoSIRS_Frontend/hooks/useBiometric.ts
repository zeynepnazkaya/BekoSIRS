// hooks/useBiometric.ts
import { useState } from 'react';
import { Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../services/api';

const BIOMETRIC_REFRESH_TOKEN = 'biometric_refresh_token';

export const useBiometric = () => {
    const [loading, setLoading] = useState(false);

    // Call backend to enable biometric (Upload initial Face)
    const enableBiometric = async (imageUri: string, refreshToken?: string): Promise<boolean> => {
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('face_image', {
                uri: imageUri,
                name: 'face_register.jpg',
                type: 'image/jpeg'
            } as any);

            if (refreshToken) {
                formData.append('refresh_token', refreshToken);
            }

            await api.post('/api/v1/biometric/enable/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (refreshToken) {
                await SecureStore.setItemAsync(BIOMETRIC_REFRESH_TOKEN, refreshToken);
            }
            
            Alert.alert('Başarılı', 'Yüzünüz sisteme güvenle kaydedildi (Özellik Vektörü olarak).');
            return true;
        } catch (error: any) {
            console.error('Enable face error:', error);
            const msg = error.response?.data?.error || 'Yüz kaydedilemedi. Lütfen net bir fotoğraf çekin.';
            Alert.alert('Hata', msg);
            return false;
        } finally {
            setLoading(false);
        }
    };

    // Authenticate with Face Image
    const loginWithFace = async (username: string, imageUri: string): Promise<{
        success: boolean;
        accessToken?: string;
        refreshToken?: string;
        userId?: number;
        error?: string;
    }> => {
        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('username', username);
            formData.append('face_image', {
                uri: imageUri,
                name: 'face_login.jpg',
                type: 'image/jpeg'
            } as any);

            const verifyResponse = await api.post('/api/v1/biometric/login/', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (!verifyResponse.data.success) {
                return {
                    success: false,
                    error: verifyResponse.data.error || 'Yüz eşleşmedi.',
                };
            }

            const { access, refresh } = verifyResponse.data.tokens;
            const userId = verifyResponse.data.user_id;

            await SecureStore.setItemAsync(BIOMETRIC_REFRESH_TOKEN, refresh);

            return {
                success: true,
                accessToken: access,
                refreshToken: refresh,
                userId: userId,
            };
        } catch (error: any) {
            console.error('Face auth error:', error);
            const errorMsg = error.response?.data?.error || error.response?.data?.detail;
            return {
                success: false,
                error: errorMsg || 'Giriş işlemi başarısız oldu.',
            };
        } finally {
            setLoading(false);
        }
    };

    const disableBiometric = async (): Promise<boolean> => {
        setLoading(true);
        try {
            await api.post('/api/v1/biometric/disable/');
            await SecureStore.deleteItemAsync(BIOMETRIC_REFRESH_TOKEN);
            Alert.alert('Başarılı', 'Yüz kaydınız başarıyla silindi.');
            return true;
        } catch (error) {
            return false;
        } finally {
            setLoading(false);
        }
    };

    return {
        loading,
        enableBiometric,
        disableBiometric,
        loginWithFace,
    };
};

