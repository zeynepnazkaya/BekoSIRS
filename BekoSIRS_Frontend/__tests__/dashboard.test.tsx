import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import HomeScreen from '../app/(drawer)/(tabs)/index';
import api, { wishlistAPI, productAPI } from '../services';

jest.mock('expo-router', () => ({
    useRouter: () => ({
        push: jest.fn(),
    }),
}));

// Mock the APIs
jest.mock('../services', () => ({
    __esModule: true,
    default: {
        get: jest.fn(),
        defaults: { baseURL: 'http://test.com' },
    },
    wishlistAPI: {
        getWishlist: jest.fn(),
    },
    productAPI: {
        getPopularProducts: jest.fn(),
    },
}));

// Mock Storage Native Token
jest.mock('../storage/storage.native', () => ({
    getToken: jest.fn().mockResolvedValue('fake-token'),
}));

// Mock Product Card Component to avoid complex nesting issues
jest.mock('../components/ProductCard', () => {
    const { Text } = require('react-native');
    return {
        ProductCard: ({ product }: any) => <Text testID="product-card">{product.name}</Text>
    };
});

// Mock Icons
jest.mock('@expo/vector-icons', () => ({
    FontAwesome: 'FontAwesome',
}));

// Mock Image
jest.mock('expo-image', () => {
    const { View } = require('react-native');
    return { Image: (props: any) => <View {...props} testID="expo-image" /> };
});

const mockProducts = [
    { id: 1, name: 'Buzdolabı', brand: 'Beko', price: '15000', stock: 10, review_count: 5 },
    { id: 2, name: 'Çamaşır Makinesi', brand: 'Arçelik', price: '12000', stock: 5, review_count: 20 },
];

const mockCategories = [
    { id: 1, name: 'Beyaz Eşya' },
    { id: 2, name: 'Elektronik' },
];

const mockPopularProducts = [
    { id: 3, name: 'Televizyon', brand: 'Beko', price: '20000', stock: 2 },
];

describe('HomeScreen (Dashboard) Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        (api.get as jest.Mock).mockImplementation((url) => {
            if (url.includes('/categories')) {
                return Promise.resolve({ data: { results: mockCategories } });
            }
            return Promise.resolve({ data: { results: mockProducts } });
        });

        (productAPI.getPopularProducts as jest.Mock).mockResolvedValue({
            data: { results: mockPopularProducts }
        });

        (wishlistAPI.getWishlist as jest.Mock).mockResolvedValue({
            data: { items: [{ product: { id: 1 } }] }
        });
    });

    it('renders loading state initially', () => {
        // Delay API response slightly so loading indicator can render
        (api.get as jest.Mock).mockReturnValue(new Promise(() => { }));

        const { getByText } = render(<HomeScreen />);
        expect(getByText('Ürünler yükleniyor...')).toBeTruthy();
    });

    it('renders dashboard with products, categories, and popular products', async () => {
        const { getByText, findAllByTestId, getByPlaceholderText, getAllByText } = render(<HomeScreen />);

        // Wait for data load
        await waitFor(async () => {
            expect(getByPlaceholderText('Ürün veya marka ara...')).toBeTruthy();

            // Categories
            expect(getAllByText('Tümü').length).toBeGreaterThan(0);
            expect(getByText('Beyaz Eşya')).toBeTruthy();
            expect(getByText('Elektronik')).toBeTruthy();

            // Sections
            expect(getByText('Popüler Ürünler')).toBeTruthy();

            // Popular Product details
            expect(getByText('Televizyon')).toBeTruthy();
        });

        // Check main products list
        const productCards = await findAllByTestId('product-card');
        expect(productCards.length).toBe(2);
        expect(productCards[0].props.children).toBe('Buzdolabı');
        expect(productCards[1].props.children).toBe('Çamaşır Makinesi');
    });

    it('filters by category chip press', async () => {
        const { getByText } = render(<HomeScreen />);

        // API takes the category click -> api.get with '&category=1'
        await waitFor(() => {
            expect(getByText('Beyaz Eşya')).toBeTruthy();
        });

        const categoryChip = getByText('Beyaz Eşya');
        fireEvent.press(categoryChip);

        await waitFor(() => {
            expect(api.get).toHaveBeenCalledWith('/api/v1/products/?page_size=50&category=1');
            // Look for the "Active Filter" info
            expect(getByText('Kategori: Beyaz Eşya')).toBeTruthy();
        });
    });

    it('sorts the product list based on sort chips', async () => {
        const { getByText, findAllByTestId } = render(<HomeScreen />);

        await waitFor(() => {
            expect(getByText('En Çok Değerlendirilen')).toBeTruthy();
        });

        // Initial order is based on mockProducts: Buzdolabı, Çamaşır Makinesi
        let cards = await findAllByTestId('product-card');
        expect(cards[0].props.children).toBe('Buzdolabı');

        const sortReviewsChip = getByText('En Çok Değerlendirilen');
        fireEvent.press(sortReviewsChip);

        // After sorting by reviews (Çamaşır Makinesi has 20, Buzdolabı has 5)
        await waitFor(async () => {
            cards = await findAllByTestId('product-card');
            expect(cards[0].props.children).toBe('Çamaşır Makinesi');
            expect(cards[1].props.children).toBe('Buzdolabı');
        });
    });

    it('searches for a product via TextInput', async () => {
        const { getByPlaceholderText, getByText } = render(<HomeScreen />);

        await waitFor(() => {
            expect(getByPlaceholderText('Ürün veya marka ara...')).toBeTruthy();
        });

        const searchInput = getByPlaceholderText('Ürün veya marka ara...');

        // Type a query
        fireEvent.changeText(searchInput, 'Fırın');

        await waitFor(() => {
            // API call made
            expect(api.get).toHaveBeenCalledWith('/api/v1/products/?page_size=50&search=F%C4%B1r%C4%B1n');
            expect(getByText('Arama: "Fırın"')).toBeTruthy();
        });
    });

});
