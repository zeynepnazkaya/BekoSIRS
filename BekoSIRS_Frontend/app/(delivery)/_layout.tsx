import { Stack } from 'expo-router';

export default function DeliveryLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen
                name="map"
                options={{
                    headerShown: false,
                    presentation: 'fullScreenModal',
                }}
            />
            <Stack.Screen
                name="detail/[id]"
                options={{
                    headerShown: false,
                    presentation: 'card',
                }}
            />
            <Stack.Screen
                name="profile"
                options={{
                    headerShown: false,
                }}
            />
        </Stack>
    );
}
