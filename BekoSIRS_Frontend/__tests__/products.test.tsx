import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ProductsScreen from '../app/products';
import api from '../services';

// Mock API
jest.mock('../services', () => ({
    get: jest.fn(),
}));

// Mock the Product Card Component to avoid complex rendering in unit tests
jest.mock('../components/MyProductCard', () => {
    const { Text } = require('react-native');
    return ({ product }: any) => <Text testID="product-card">{product.name}</Text>;
});

jest.spyOn(Alert, 'alert');

const mockProducts = [
    { id: 1, name: 'Buzdolabı 600', brand: 'Beko', price: '15000', category: { name: 'Beyaz Eşya' } },
    { id: 2, name: 'Çamaşır Makinesi 7KG', brand: 'Arçelik', price: '12000', category: { name: 'Beyaz Eşya' } }
];

describe('ProductsScreen UI and Logic Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders loading state initially', () => {
        // API henüz dönmediği için loading state görmeliyiz
        (api.get as jest.Mock).mockReturnValue(new Promise(() => { }));

        const { getByText } = render(<ProductsScreen />);
        expect(getByText('Katalog hazırlanıyor...')).toBeTruthy();
    });

    it('renders products list after successful API call', async () => {
        (api.get as jest.Mock).mockResolvedValueOnce({ data: mockProducts });

        const { getByText, getByPlaceholderText, findAllByTestId } = render(<ProductsScreen />);

        // API çağrısının tamamlanmasını ve ürünlerin gelmesini bekliyoruz
        await waitFor(() => {
            expect(getByPlaceholderText('Model veya marka ara...')).toBeTruthy();
            expect(getByText('2 Ürün Listeleniyor')).toBeTruthy();
        });

        // Mock kartların render edildiğini doğrula
        const productCards = await findAllByTestId('product-card');
        expect(productCards.length).toBe(2);
        expect(productCards[0].props.children).toBe('Buzdolabı 600');
    });

    it('filters products based on search query', async () => {
        (api.get as jest.Mock).mockResolvedValueOnce({ data: mockProducts });

        const { getByPlaceholderText, getByText, queryByText } = render(<ProductsScreen />);

        await waitFor(() => {
            expect(getByText('2 Ürün Listeleniyor')).toBeTruthy();
        });

        const searchInput = getByPlaceholderText('Model veya marka ara...');

        // Aramaya 'Buzdolabı' yazalım
        fireEvent.changeText(searchInput, 'Buzdolabı');

        await waitFor(() => {
            expect(getByText('1 Ürün Listeleniyor')).toBeTruthy();
            expect(getByText('Buzdolabı 600')).toBeTruthy();
            // Çamaşır makinesi ekranda olmamalı
            expect(queryByText('Çamaşır Makinesi 7KG')).toBeNull();
        });
    });

    it('shows empty container if search yields no results', async () => {
        (api.get as jest.Mock).mockResolvedValueOnce({ data: mockProducts });

        const { getByPlaceholderText, getByText } = render(<ProductsScreen />);

        await waitFor(() => {
            expect(getByText('2 Ürün Listeleniyor')).toBeTruthy();
        });

        const searchInput = getByPlaceholderText('Model veya marka ara...');
        fireEvent.changeText(searchInput, 'OlmayanUrun123');

        await waitFor(() => {
            expect(getByText('Sonuç Bulunamadı')).toBeTruthy();
            expect(getByText('"OlmayanUrun123" aramanıza uygun ürün bulunamadı.')).toBeTruthy();
        });
    });

    it('shows error alert if API call fails', async () => {
        (api.get as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

        render(<ProductsScreen />);

        await waitFor(() => {
            expect(Alert.alert).toHaveBeenCalledWith(
                'Bağlantı Hatası',
                'Ürün listesi şu an yüklenemiyor. Lütfen sunucunuzun açık olduğundan emin olun.'
            );
        });
    });
});
