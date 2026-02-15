import React, { useEffect, useState } from 'react';
import { Stack, useSegments, useRouter } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { isAuthenticated, getToken } from '../storage/storage.native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function RootLayout() {
  const segments = useSegments();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const ok = await isAuthenticated();
      setHasToken(ok);
      setIsReady(true);
    };
    checkAuth();
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

    if (hasToken && inAuthPage) {
      // Decide where to go based on role
      AsyncStorage.getItem('userRole').then(role => {
        if (role === 'delivery') {
          router.replace('/(delivery)');
        } else {
          router.replace('/(drawer)');
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

