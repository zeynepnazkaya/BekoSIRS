/**
 * @file service-requests.test.tsx
 * @description Servis Talepleri ekranı için birim testleri.
 * Servis taleplerinin listelenmesi, sıra bilgisi gösterimi,
 * yeni talep modalı açma ve boş durum görünümünü doğrular.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ServiceRequestsScreen from '../app/(drawer)/service-requests';
import { serviceRequestAPI, productOwnershipAPI } from '../services';
import { Alert } from 'react-native';

// Mock expo-router
jest.mock('expo-router', () => ({
    useLocalSearchParams: () => ({}),
}));

// Mock Picker since it's a native component with its own complexity
jest.mock('@react-native-picker/picker', () => {
    const React = require('react');
    const Picker = (props: any) => {
        return <>{props.children}</>;
    };
    Picker.Item = (props: any) => {
        const { Text } = require('react-native');
        return <Text>{props.label}</Text>;
    };
    return { Picker };
});

// Mock the API
jest.mock('../services', () => ({
    serviceRequestAPI: {
        getMyRequests: jest.fn(),
        createRequest: jest.fn(),
    },
    productOwnershipAPI: {
        getMyOwnerships: jest.fn(),
    },
}));

// Mock Icons
jest.mock('@expo/vector-icons', () => ({
    FontAwesome: 'FontAwesome',
}));

// Spy on Alert
jest.spyOn(Alert, 'alert');

const mockRequestsData = [
    {
        id: 1,
        customer_name: 'Ahmet Yılmaz',
        product_name: 'Buzdolabı',
        request_type: 'repair',
        status: 'pending',
        description: 'Buzdolabı soğutmuyor',
        created_at: '2023-11-20T10:00:00Z',
    },
    {
        id: 2,
        customer_name: 'Ahmet Yılmaz',
        product_name: 'Çamaşır Makinesi',
        request_type: 'maintenance',
        status: 'completed',
        description: 'Yıllık bakım',
        created_at: '2023-10-15T10:00:00Z',
    },
    {
        id: 3,
        customer_name: 'Ahmet Yılmaz',
        product_name: 'Kombi',
        request_type: 'repair',
        status: 'in_queue',
        description: 'Sıcak su vermiyor',
        created_at: '2023-11-22T10:00:00Z',
        queue_entry: {
            queue_number: 42,
            priority: 1,
            estimated_wait_time: 15
        }
    }
];

const mockProductsData = [
    {
        id: 101,
        product: {
            id: 10,
            name: 'Buzdolabı',
            brand: 'Beko',
        },
        purchase_date: '2022-01-01',
        warranty_end_date: '2025-01-01',
    }
];

describe('ServiceRequestsScreen Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (serviceRequestAPI.getMyRequests as jest.Mock).mockResolvedValue({ data: mockRequestsData });
        (productOwnershipAPI.getMyOwnerships as jest.Mock).mockResolvedValue({ data: mockProductsData });
        (serviceRequestAPI.createRequest as jest.Mock).mockResolvedValue({ data: { success: true } });
    });

    it('renders loading indicator initially', () => {
        (serviceRequestAPI.getMyRequests as jest.Mock).mockReturnValue(new Promise(() => { }));
        const { getByTestId } = render(<ServiceRequestsScreen />);
        expect(getByTestId('loading-sr')).toBeTruthy();
    });

    it('renders service requests list correctly', async () => {
        const { getByText, getAllByText } = render(<ServiceRequestsScreen />);

        await waitFor(() => {
            expect(getByText('Servis Taleplerim')).toBeTruthy();

            // Request 1
            expect(getByText('SR-1')).toBeTruthy();
            expect(getAllByText('Tamir').length).toBeGreaterThan(0);
            expect(getByText('Buzdolabı')).toBeTruthy();
            expect(getByText('Buzdolabı soğutmuyor')).toBeTruthy();
            expect(getByText('Beklemede')).toBeTruthy();

            // Request 2
            expect(getByText('SR-2')).toBeTruthy();
            expect(getByText('Bakım')).toBeTruthy();
            expect(getByText('Çamaşır Makinesi')).toBeTruthy();
            expect(getByText('Tamamlandı')).toBeTruthy();

            // Request 3 (Queue info)
            expect(getByText('SR-3')).toBeTruthy();
            expect(getByText('Sırada')).toBeTruthy();
            expect(getByText('Kombi')).toBeTruthy();
            expect(getByText('Sıcak su vermiyor')).toBeTruthy();
            expect(getByText('Sıra No: 42 | Tahmini Bekleme: 15 dk')).toBeTruthy();
        });
    });

    it('opens new request modal when "Yeni Talep" is clicked', async () => {
        const { getByText } = render(<ServiceRequestsScreen />);

        // Wait for the button
        await waitFor(() => expect(getByText('Yeni Talep')).toBeTruthy());

        fireEvent.press(getByText('Yeni Talep'));

        await waitFor(() => {
            expect(getByText('Yeni Servis Talebi')).toBeTruthy();
            expect(getByText('Sorun Açıklaması')).toBeTruthy();
            expect(getByText('Buzdolabı - Beko')).toBeTruthy(); // Checks if picker items loaded
        });
    });

    it('handles empty states correctly', async () => {
        (serviceRequestAPI.getMyRequests as jest.Mock).mockResolvedValue({ data: [] });

        const { getByText } = render(<ServiceRequestsScreen />);

        await waitFor(() => {
            expect(getByText('Servis Talebi Yok')).toBeTruthy();
            expect(getByText('Henüz bir servis talebiniz bulunmuyor')).toBeTruthy();
        });
    });
});

