import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import PaymentsScreen from '../app/(drawer)/payments';
import { installmentAPI } from '../services';
import { Alert } from 'react-native';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
    useRouter: () => ({
        push: mockPush,
    }),
}));

// Mock the API
jest.mock('../services', () => ({
    installmentAPI: {
        getMyPlans: jest.fn(),
        getPlanInstallments: jest.fn(),
        confirmPayment: jest.fn(),
    },
}));

// Mock Icons
jest.mock('@expo/vector-icons', () => ({
    FontAwesome: 'FontAwesome',
}));

// Spy on Alert
jest.spyOn(Alert, 'alert');

const mockPlansData = {
    results: [
        {
            id: 1,
            product_name: 'Buzdolabı',
            total_amount: '30000',
            remaining_amount: '20000',
            paid_amount: '10000',
            progress_percentage: 33,
            status: 'active',
            status_display: 'Aktif',
            installment_count: 6,
            start_date: '2023-01-01T10:00:00Z',
        },
        {
            id: 2,
            product_name: 'Çamaşır Makinesi',
            total_amount: '15000',
            remaining_amount: '0',
            paid_amount: '15000',
            progress_percentage: 100,
            status: 'completed',
            status_display: 'Tamamlandı',
            installment_count: 3,
            start_date: '2022-05-01T10:00:00Z',
        }
    ]
};

const mockInstallmentsData = {
    results: [
        {
            id: 101,
            installment_number: 1,
            amount: '5000',
            due_date: '2023-02-01T10:00:00Z',
            payment_date: '2023-01-25T10:00:00Z',
            status: 'paid',
            status_display: 'Ödendi',
            is_overdue: false,
            days_until_due: -5,
        },
        {
            id: 102,
            installment_number: 2,
            amount: '5000',
            due_date: '2023-03-01T10:00:00Z',
            payment_date: null,
            status: 'pending',
            status_display: 'Bekliyor',
            is_overdue: false,
            days_until_due: 15,
        }
    ]
};

describe('PaymentsScreen Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (installmentAPI.getMyPlans as jest.Mock).mockResolvedValue({ data: mockPlansData });
        (installmentAPI.getPlanInstallments as jest.Mock).mockResolvedValue({ data: mockInstallmentsData });
        (installmentAPI.confirmPayment as jest.Mock).mockResolvedValue({ data: { success: true } });
    });

    it('renders loading indicator initially', () => {
        (installmentAPI.getMyPlans as jest.Mock).mockReturnValue(new Promise(() => { }));
        const { getByTestId } = render(<PaymentsScreen />);
        expect(getByTestId('loading-payments')).toBeTruthy();
    });

    it('renders payment plans correctly', async () => {
        const { getByText } = render(<PaymentsScreen />);

        await waitFor(() => {
            // Header
            expect(getByText('Ödemelerim')).toBeTruthy();

            // First Plan
            expect(getByText('Buzdolabı')).toBeTruthy();
            expect(getByText('30.000,00 ₺')).toBeTruthy(); // Total amount
            expect(getByText('10.000,00 ₺')).toBeTruthy(); // Paid amount
            expect(getByText('20.000,00 ₺')).toBeTruthy(); // Remaining amount
            expect(getByText('33%')).toBeTruthy();

            // Second Plan
            expect(getByText('Çamaşır Makinesi')).toBeTruthy();
            expect(getByText('100%')).toBeTruthy();
        });
    });

    it('fetches and displays installments when a plan is clicked', async () => {
        const { getByText, queryByText, getAllByText } = render(<PaymentsScreen />);

        await waitFor(() => expect(getByText('Buzdolabı')).toBeTruthy());

        // Initially installments shouldn't be visible
        expect(queryByText('Bekliyor')).toBeNull();

        // Click on the first plan
        fireEvent.press(getByText('Buzdolabı'));

        // Wait for installments to appear
        await waitFor(() => {
            expect(installmentAPI.getPlanInstallments).toHaveBeenCalledWith(1);
            expect(getByText('Ödendi')).toBeTruthy();
            expect(getByText('Bekliyor')).toBeTruthy();
        });
        // Installment amounts
        expect(getAllByText('5.000,00 ₺').length).toBe(2);
    });

    it('handles payment confirmation correctly', async () => {
        const { getByText, getAllByText } = render(<PaymentsScreen />);

        // Load plans
        await waitFor(() => expect(getByText('Buzdolabı')).toBeTruthy());

        // Click to load installments
        fireEvent.press(getByText('Buzdolabı'));

        await waitFor(() => expect(getByText('Ödedim')).toBeTruthy());

        // Click confirm button
        fireEvent.press(getByText('Ödedim'));

        await waitFor(() => {
            expect(installmentAPI.confirmPayment).toHaveBeenCalledWith(102); // The pending installment ID should be matched
            expect(Alert.alert).toHaveBeenCalledWith('Başarılı', 'Ödeme onayı gönderildi. Mağaza onayını bekleyin.');
        });
    });

    it('renders empty state when no plans exist', async () => {
        (installmentAPI.getMyPlans as jest.Mock).mockResolvedValue({ data: [] });

        const { getByText } = render(<PaymentsScreen />);

        await waitFor(() => {
            expect(getByText('Taksit Planı Yok')).toBeTruthy();
            expect(getByText('Henüz aktif bir taksit planınız bulunmuyor')).toBeTruthy();
        });
    });
});
