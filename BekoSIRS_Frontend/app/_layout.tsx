import React, { useEffect, useState } from 'react';
import { Stack, useSegments, useRouter } from 'expo-router';
import { View, ActivityIndicator, Platform } from 'react-native';
import { isAuthenticated, getToken } from '../storage/storage.native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { pushTokenAPI } from '../services';

async function registerPushToken() {
  try {
    if (Platform.OS === 'web') return;
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return;
    const tokenData = await Notifications.getExpoPushTokenAsync();
    await pushTokenAPI.savePushToken(tokenData.data);
  } catch {
    // Push token kaydı başarısız olursa sessizce geç
  }
}

export default function RootLayout() {
  const segments = useSegments();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;
    const checkAuth = async () => {
      const ok = await isAuthenticated();
      if (isMounted) {
        setHasToken(ok);
        setIsReady(true);
      }
    };
    
    checkAuth();
    
    const { DeviceEventEmitter } = require('react-native');
    const subscription = DeviceEventEmitter.addListener('authStateChanged', () => {
      checkAuth();
    });

    return () => { 
      isMounted = false; 
      subscription.remove();
    };
  }, [segments]);

  useEffect(() => {
    if (!isReady) return;

    const inAuthPage = segments[0] === 'login' || segments[0] === 'register' || segments[0] === 'forgot-password';
    const inDrawer = segments[0] === '(drawer)';
    const inDelivery = segments[0] === '(delivery)';

    if (!hasToken && !inAuthPage) {
      router.replace('/login');
      return;
    }

    if (hasToken) {
      // Push token kaydet (hata olursa sessizce geç)
      registerPushToken();

      // Kullanıcı rolünü alıp o role ait sayfalarda kalmasını garantiye al
      AsyncStorage.getItem('userRole').then(role => {
        const isDeliveryRole = role === 'delivery';

        if (inAuthPage) {
          // Oturumu açıkken login/register gibi sayfalara girerse otomatik yönlendir
          router.replace((isDeliveryRole ? '/(delivery)' : '/(drawer)') as any);
        } else if (inDrawer && isDeliveryRole) {
          // KORUMA: Teslimatçı, müşteri arayüzüne (drawer) girmeye çalışırsa geri at
          router.replace('/(delivery)' as any);
        } else if (inDelivery && !isDeliveryRole) {
          // KORUMA: Müşteri, teslimat paneline girmeye çalışırsa geri at
          router.replace('/(drawer)' as any);
        }
      });
      return;
    }
  }, [hasToken, segments, isReady]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#E31E24" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
      <Stack.Screen name="(delivery)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ headerShown: false }} />
      <Stack.Screen
        name="product/[id]"
        options={{
          headerShown: true,
          headerTitle: 'Ürün Detayı',
          headerStyle: { backgroundColor: '#000000' },
          headerTintColor: '#FFFFFF',
          headerBackTitle: 'Geri',
          presentation: 'card',
        }}
      />
    </Stack>
  );
}

