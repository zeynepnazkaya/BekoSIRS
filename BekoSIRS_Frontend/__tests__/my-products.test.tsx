/**
 * @file my-products.test.tsx
 * @description Cihazlarım ekranı için birim testleri.
 * Kullanıcıya ait ürün sahiplikleri ve bekleyen siparişlerin
 * listelenmesi, detay sayfasına ve servis talebine yönlendirme
 * ile boş durum görünümlerini doğrular.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import MyProductsScreen from '../app/(drawer)/(tabs)/my-products';
// @ts-ignore
import api, { assignmentAPI } from '../services';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
    useRouter: () => ({
        push: mockPush,
    }),
}));

// Mock the APIs
jest.mock('../services', () => ({
    __esModule: true,
    default: {
        get: jest.fn(),
        defaults: { baseURL: 'http://test.com' },
    },
    assignmentAPI: {
        getMyAssignments: jest.fn(),
    },
}));

// Mock Icons
jest.mock('@expo/vector-icons', () => ({
    FontAwesome: 'FontAwesome',
}));

// Mock Image
jest.mock('expo-image', () => {
    const { View } = require('react-native');
    return { Image: (props: any) => <View {...props} testID="expo-image" /> };
});

const mockOwnerships = [
    {
        id: 1,
        product: {
            id: 101,
            name: 'Sahip Olunan Buzdolabı',
            brand: 'Beko',
            price: '15000',
            image: '/media/fridge.jpg',
            category_name: 'Beyaz Eşya',
            warranty_duration_months: 24,
        },
        purchase_date: '2023-01-01',
        serial_number: 'SN123456',
        warranty_end_date: '2025-01-01',
        is_warranty_active: true,
        days_until_warranty_expires: 300,
        active_service_requests: 1,
    },
];

const mockAssignments = [
    {
        id: 2,
        product: {
            id: 102,
            name: 'Bekleyen Çamaşır Makinesi',
            brand: 'Arçelik',
            price: '12000',
            image: null,
            category_name: 'Beyaz Eşya',
            warranty_duration_months: 36,
        },
        status: 'WAITING',
        status_display: 'Teslimat Bekleniyor',
        assigned_at: '2024-03-01',
    },
];

describe('MyProductsScreen Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        (api.get as jest.Mock).mockResolvedValue({
            data: mockOwnerships,
        });

        (assignmentAPI.getMyAssignments as jest.Mock).mockResolvedValue({
            data: { results: mockAssignments },
        });
    });

    it('renders loading state initially', () => {
        (api.get as jest.Mock).mockReturnValue(new Promise(() => { }));
        const { getByText } = render(<MyProductsScreen />);
        expect(getByText('Ürünleriniz yükleniyor...')).toBeTruthy();
    });

    it('renders both ownerships and assignments correctly', async () => {
        const { getByText, findByText, getAllByText } = render(<MyProductsScreen />);

        // Wait for the data to be fetched and rendered
        await waitFor(() => {
            // Badge texts
            expect(getByText('Cihazlarım')).toBeTruthy();
            expect(getByText('2 adet kayıt (Sipariş & Sahiplik)')).toBeTruthy();

            // Assignment rendering (Wait status)
            expect(getByText('Bekleyen Çamaşır Makinesi')).toBeTruthy();
            expect(getAllByText('Teslimat Bekleniyor').length).toBeGreaterThan(0);
            expect(getByText('Sipariş / Teslimat')).toBeTruthy(); // Assignment badge

            // Ownership rendering
            expect(getByText('Sahip Olunan Buzdolabı')).toBeTruthy();
            expect(getByText('SN123456')).toBeTruthy(); // Serial number
            expect(getByText('Garanti aktif')).toBeTruthy(); // Warranty Status
        });
    });

    it('navigates to product details when clicking detail button on ownership', async () => {
        const { getByText, findAllByText } = render(<MyProductsScreen />);

        await waitFor(() => {
            expect(getByText('Sahip Olunan Buzdolabı')).toBeTruthy();
        });

        // Press 'Detay' button for ownership item. Assignments have a disabled status button instead.
        const detailButton = await findAllByText('Detay');
        fireEvent.press(detailButton[0]);

        expect(mockPush).toHaveBeenCalledWith('/product/101');
    });

    it('navigates to service requests with correct params when service request button is clicked', async () => {
        const { getByText, findByText } = render(<MyProductsScreen />);

        await waitFor(() => {
            expect(getByText('Servis Talebi')).toBeTruthy();
        });

        const serviceButton = await findByText('Servis Talebi');
        fireEvent.press(serviceButton);

        expect(mockPush).toHaveBeenCalledWith({
            pathname: '/service-requests',
            params: { ownershipId: 1 },
        });
    });

    it('renders empty state when no products found', async () => {
        (api.get as jest.Mock).mockResolvedValue({ data: [] });
        (assignmentAPI.getMyAssignments as jest.Mock).mockResolvedValue({ data: { results: [] } });

        const { getByText } = render(<MyProductsScreen />);

        await waitFor(() => {
            expect(getByText('Henüz Kayıt Yok')).toBeTruthy();
            expect(getByText('Size atanmış bir ürün veya sipariş bulunamadı.')).toBeTruthy();
        });

        // Test Browse button
        const browseButton = getByText('Ürünlere Göz At');
        fireEvent.press(browseButton);
        expect(mockPush).toHaveBeenCalledWith('/');
    });

    it('handles API errors gracefully and displays empty state', async () => {
        (api.get as jest.Mock).mockRejectedValue(new Error('API Error'));
        (assignmentAPI.getMyAssignments as jest.Mock).mockRejectedValue(new Error('API Error'));

        const { getByText } = render(<MyProductsScreen />);

        await waitFor(() => {
            expect(getByText('Henüz Kayıt Yok')).toBeTruthy();
        });
    });
});

