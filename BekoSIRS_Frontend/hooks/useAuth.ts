// hooks/useAuth.ts
import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import api from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { saveTokens, clearAllTokens, isAuthenticated, getToken } from '../storage/storage.native';

export const useAuth = () => {
  const [loading, setLoading] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true); // Token kontrolü yapılıyor mu?

  // Component mount olduğunda token'ı kontrol et
  useEffect(() => {
    const checkToken = async () => {
      try {
        const token = await getToken();
        setAuthToken(token);
      } finally {
        setIsCheckingAuth(false); // Kontrol tamamlandı
      }
    };
    checkToken();
  }, []);

  // 🔹 GİRİŞ YAPMA (LOGIN)
  const login = async (username: string, password: string) => {
    if (!username || !password) {
      Alert.alert('Hata', 'Kullanıcı adı ve şifre zorunludur.');
      return;
    }

    setLoading(true);
    try {
      console.log('🔐 Giriş denemesi yapılıyor...');

      const response = await api.post('/api/v1/token/', {
        username,
        password,
        platform: 'mobile', // Backend'deki kısıtlamayı aşmak için gerekli
      });

      console.log('✅ Backend yanıtı alındı:', response.data);

      // Yanıttan verileri parçalayarak al
      const { access, refresh } = response.data;

      // 1. Token'ları güvenli depolamaya kaydet
      await saveTokens(access, refresh);
      setAuthToken(access); // State'i güncelle

      // 2. Rol bilgisini profil endpoint'inden çek
      let userRole = 'customer'; // Default fallback
      try {
        const profileResponse = await api.get('/api/v1/profile/', {
          headers: { Authorization: `Bearer ${access}` }
        });
        userRole = profileResponse.data.role || 'customer';
        console.log('👤 User role:', userRole);
      } catch (profileError) {
        console.error('❌ Profil alınamadı, varsayılan rol kullanılıyor:', profileError);
      }

      // 3. Rol bilgisini AsyncStorage'a kaydet
      await AsyncStorage.setItem('userRole', userRole);
      
      const SecureStore = require('expo-secure-store');
      await SecureStore.setItemAsync('lastLoginUsername', username);

      console.log('💾 Veriler kaydedildi. Yönlendiriliyor...');

      // 4. Role göre yönlendirme
      if (userRole === 'delivery') {
        router.replace('/(delivery)' as any);
      } else {
        router.replace('/(drawer)' as any);
      }

    } catch (error: any) {
      console.error('❌ Login error:', error);

      let errorMessage = 'Giriş başarısız.';

      if (error.response) {
        // Backend'den gelen özel kısıtlama mesajlarını yakala
        if (error.response.status === 403) {
          errorMessage = error.response.data.detail || 'Bu hesapla giriş yetkiniz bulunmuyor.';
        } else if (error.response.status === 401) {
          errorMessage = 'Kullanıcı adı veya şifre hatalı.';
        }
      } else {
        errorMessage = 'Sunucuya bağlanılamadı. Lütfen sunucu adresini (IP) kontrol edin.';
      }

      Alert.alert('Giriş Hatası', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // 🔹 KAYIT OLMA (REGISTER)
  const register = async (
    username: string,
    email: string,
    password: string,
    firstName?: string,
    lastName?: string
  ) => {
    if (!username || !email || !password) {
      Alert.alert('Hata', 'Lütfen tüm zorunlu alanları doldurun.');
      return;
    }

    setLoading(true);
    try {
      // API isteğini gönder
      await api.post('/api/v1/users/', {
        username: username,
        email: email,
        password: password,
        first_name: firstName || '',
        last_name: lastName || '',
        role: 'customer' // Mobilden kayıt olanlar varsayılan olarak müşteridir
      });

      Alert.alert('Başarılı', 'Kayıt tamamlandı! Şimdi giriş yapabilirsiniz.', [
        { text: 'Tamam', onPress: () => router.replace('/login' as any) }
      ]);
    } catch (error: any) {
      console.error('❌ Register error:', error.response?.data);

      const msg = error.response?.data?.detail || 'Bu kullanıcı adı veya e-posta zaten kullanımda.';
      Alert.alert('Kayıt Hatası', msg);
    } finally {
      setLoading(false);
    }
  };

  // 🔹 ÇIKIŞ YAPMA (LOGOUT)
  const logout = async () => {
    try {
      const { clearAllTokens } = require('../storage/storage.native');
      await clearAllTokens();
    } catch (error) {}
    
    try {
      await AsyncStorage.removeItem('userRole');
      await AsyncStorage.removeItem('user_role');
      setAuthToken(null); // State'i güncelle
      console.log('🚪 Çıkış yapıldı.');
      
      const { DeviceEventEmitter } = require('react-native');
      DeviceEventEmitter.emit('authStateChanged');
      
      setTimeout(() => {
        router.replace('/login' as any);
      }, 100);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const checkAuth = async () => {
    const isAuth = await isAuthenticated();
    return isAuth;
  };

  return {
    login,
    register,
    logout,
    checkAuth,
    loading,
    authToken,
    isCheckingAuth, // Yeni eklendi
  };
};