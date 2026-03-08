/**
 * @file recommendations.test.tsx
 * @description Yapay Zeka Önerileri ekranı için birim testleri.
 * Görüntüleme geçmişine dayalı önerilerin listelenmesi, istek listesine
 * ekleme ve ürün detay sayfasına yönlendirme işlemlerini doğrular.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import RecommendationsScreen from '../app/(drawer)/recommendations';
import { recommendationAPI, wishlistAPI } from '../services';
import { Alert } from 'react-native';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
    useRouter: () => ({
        push: mockPush,
    }),
}));

// Mock the API
jest.mock('../services', () => ({
    recommendationAPI: {
        getRecommendations: jest.fn(),
    },
    wishlistAPI: {
        getWishlist: jest.fn(),
        addItem: jest.fn(),
    },
    viewHistoryAPI: {},
    getImageUrl: jest.fn((url) => url), // Mock getImageUrl directly
}));

// Mock Icons
jest.mock('@expo/vector-icons', () => ({
    FontAwesome: 'FontAwesome',
}));

// Spy on Alert
jest.spyOn(Alert, 'alert');

const mockRecommendationsData = {
    recommendations: [
        {
            product: {
                id: 10,
                name: 'Akıllı TV 4K',
                brand: 'Beko',
                price: '25000',
                stock: 5,
                image: '/media/tv.jpg',
            },
            score: 0.95,
            reason: 'Televizyon aramalarınıza göre',
        },
        {
            product: {
                id: 11,
                name: 'Robot Süpürge',
                brand: 'Arçelik',
                price: '12000',
                stock: 0,
                image: null,
            },
            score: 0.65,
            reason: 'Süpürge incelemelerinize göre',
        }
    ]
};

const mockWishlistData = {
    items: [
        {
            product: { id: 11 } // Robot Süpürge is already in wishlist
        }
    ]
};

describe('RecommendationsScreen Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (recommendationAPI.getRecommendations as jest.Mock).mockResolvedValue({ data: mockRecommendationsData });
        (wishlistAPI.getWishlist as jest.Mock).mockResolvedValue({ data: mockWishlistData });
        (wishlistAPI.addItem as jest.Mock).mockResolvedValue({ data: { success: true } });
    });

    it('renders loading indicator initially', () => {
        (recommendationAPI.getRecommendations as jest.Mock).mockReturnValue(new Promise(() => { }));
        const { getByTestId } = render(<RecommendationsScreen />);
        expect(getByTestId('loading-recommendations')).toBeTruthy();
    });

    it('renders recommendations correctly', async () => {
        const { getByText } = render(<RecommendationsScreen />);

        await waitFor(() => {
            // Header
            expect(getByText('Size Özel Öneriler')).toBeTruthy();
            expect(getByText('Görüntüleme geçmişinize göre seçildi')).toBeTruthy();

            // First Recommendation
            expect(getByText('Akıllı TV 4K')).toBeTruthy();
            expect(getByText('Beko')).toBeTruthy();
            expect(getByText('Televizyon aramalarınıza göre')).toBeTruthy();
            expect(getByText(/25\.000,00/)).toBeTruthy();
            expect(getByText('95%')).toBeTruthy();
            expect(getByText('Stokta')).toBeTruthy();

            // Second Recommendation
            expect(getByText('Robot Süpürge')).toBeTruthy();
            expect(getByText('65%')).toBeTruthy();
            expect(getByText('Stok Yok')).toBeTruthy();
        });
    });

    it('handles "Add to Wishlist" successfully', async () => {
        const { getByText, getAllByText } = render(<RecommendationsScreen />);

        await waitFor(() => expect(getByText('Akıllı TV 4K')).toBeTruthy());

        // Because Robot Süpürge is already in wishlist, its button text should be different (wait for wishlist to load)
        await waitFor(() => {
            expect(getByText('İstek Listesinde')).toBeTruthy(); // Robot Süpürge
            expect(getAllByText('İstek Listesine Ekle').length).toBeGreaterThan(0); // TV
        });

        const addBtns = getAllByText('İstek Listesine Ekle');
        fireEvent.press(addBtns[0]); // Press the first valid btn (Akıllı TV)

        await waitFor(() => {
            expect(wishlistAPI.addItem).toHaveBeenCalledWith(10);
            expect(Alert.alert).toHaveBeenCalledWith('Başarılı', '"Akıllı TV 4K" istek listenize eklendi!');
        });
    });

    it('navigates to product detail on card click', async () => {
        const { getByText } = render(<RecommendationsScreen />);

        await waitFor(() => expect(getByText('Akıllı TV 4K')).toBeTruthy());

        fireEvent.press(getByText('Akıllı TV 4K'));

        expect(mockPush).toHaveBeenCalledWith('/product/10');
    });

    it('renders empty state when no recommendations exist', async () => {
        (recommendationAPI.getRecommendations as jest.Mock).mockResolvedValue({ data: [] });

        const { getByText } = render(<RecommendationsScreen />);

        await waitFor(() => {
            expect(getByText('Henüz Öneri Yok')).toBeTruthy();
            expect(getByText('Ürünleri görüntüledikçe size özel öneriler burada görünecek')).toBeTruthy();
        });
    });
});

