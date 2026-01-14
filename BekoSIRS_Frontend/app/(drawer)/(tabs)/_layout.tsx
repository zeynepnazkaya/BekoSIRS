import { Tabs } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';

const THEME = {
    primary: '#E31E24',      // Beko kırmızısı
    black: '#000000',
    gray: '#9CA3AF',
    lightGray: '#E5E7EB',
    white: '#FFFFFF',
};

export default function TabsLayout() {
    return (
        <Tabs
            screenOptions={{
                headerShown: false, // Drawer'dan gelen header'ı kullanacağız
                tabBarActiveTintColor: THEME.primary,
                tabBarInactiveTintColor: THEME.gray,
                tabBarStyle: {
                    backgroundColor: THEME.white,
                    borderTopWidth: 1,
                    borderTopColor: THEME.lightGray,
                    height: 60,
                    paddingBottom: 8,
                    paddingTop: 8,
                    elevation: 10,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: -2 },
                    shadowOpacity: 0.1,
                    shadowRadius: 4,
                },
                tabBarLabelStyle: {
                    fontSize: 12,
                    fontWeight: '600',
                },
            }}
        >
            {/* 1. Tab - Ana Sayfa (Ürünler Listesi) */}
            <Tabs.Screen
                name="index"
                options={{
                    tabBarLabel: 'Ana Sayfa',
                    tabBarIcon: ({ color, size }) => <FontAwesome name="home" size={size} color={color} />,
                }}
            />

            {/* 2. Tab - Profil */}
            <Tabs.Screen
                name="profile"
                options={{
                    tabBarLabel: 'Hesabım',
                    tabBarIcon: ({ color, size }) => <FontAwesome name="user" size={size} color={color} />,
                }}
            />

            {/* 3. Tab - Favoriler (Yıldız) */}
            <Tabs.Screen
                name="wishlist"
                options={{
                    tabBarLabel: 'Favoriler',
                    tabBarIcon: ({ color, size }) => <FontAwesome name="star" size={size} color={color} />,
                }}
            />

            {/* 4. Tab - Ürünlerim (Satıcının atadığı ürünler) */}
            <Tabs.Screen
                name="my-products"
                options={{
                    tabBarLabel: 'Ürünlerim',
                    tabBarIcon: ({ color, size }) => <FontAwesome name="shopping-bag" size={size} color={color} />,
                }}
            />
        </Tabs>
    );
}
