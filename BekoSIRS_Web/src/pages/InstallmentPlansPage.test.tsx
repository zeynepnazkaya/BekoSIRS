// src/pages/InstallmentPlansPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InstallmentPlansPage from './InstallmentPlansPage';

// ----------------------------------------
// Mock: services/api
// ----------------------------------------
const mockGetAllPlans = vi.fn();
const mockGetPlan = vi.fn();
const mockGetPlanInstallments = vi.fn();
const mockAdminApprovePayment = vi.fn();
const mockCreatePlan = vi.fn();
const mockCancelPlan = vi.fn();
const mockUpdatePlanNotes = vi.fn();
const mockCustomerGet = vi.fn();
const mockCustomerList = vi.fn();

vi.mock('../services/api', () => ({
    default: { get: vi.fn(), patch: vi.fn() },
    installmentAPI: {
        getAllPlans: (...a: any[]) => mockGetAllPlans(...a),
        getPlan: (...a: any[]) => mockGetPlan(...a),
        getPlanInstallments: (...a: any[]) => mockGetPlanInstallments(...a),
        adminApprovePayment: (...a: any[]) => mockAdminApprovePayment(...a),
        createPlan: (...a: any[]) => mockCreatePlan(...a),
        cancelPlan: (...a: any[]) => mockCancelPlan(...a),
        updatePlanNotes: (...a: any[]) => mockUpdatePlanNotes(...a),
    },
    customerAPI: {
        list: (...a: any[]) => mockCustomerList(...a),
        get: (...a: any[]) => mockCustomerGet(...a),
    },
}));

// ----------------------------------------
// Mock: Sidebar ve Toast
// ----------------------------------------
vi.mock('../components/Sidebar', () => ({ default: () => <div data-testid="sidebar" /> }));
vi.mock('../components/Toast', () => ({
    ToastContainer: ({ toasts }: any) => (
        <div data-testid="toast-container">
            {toasts.map((t: any) => <div key={t.id}>{t.message}</div>)}
        </div>
    ),
}));

// ----------------------------------------
// Test verisi
// ----------------------------------------
const mockPlan = {
    id: 1,
    customer: 42,
    customer_name: 'Ali Veli',
    product: 10,
    product_name: 'Buzdolabı Pro',
    total_amount: '30000',
    down_payment: '0',
    installment_count: 6,
    start_date: '2024-01-01',
    status: 'active',
    status_display: 'Aktif',
    remaining_amount: '20000',
    paid_amount: '10000',
    progress_percentage: 33,
    created_at: '2024-01-01T00:00:00Z',
    notes: 'Test notu',
};

const mockCustomer = {
    id: 42,
    first_name: 'Ali',
    last_name: 'Veli',
    email: 'ali@test.com',
    phone_number: '+905551234567',
};

const mockInstallments = [
    {
        id: 101,
        installment_number: 1,
        amount: '5000',
        due_date: '2024-02-01',
        payment_date: '2024-01-25',
        status: 'paid',
        status_display: 'Ödendi',
        is_overdue: false,
        days_until_due: -5,
    },
    {
        id: 102,
        installment_number: 2,
        amount: '5000',
        due_date: '2022-01-01', // geçmiş tarih
        payment_date: null,
        status: 'overdue',
        status_display: 'Gecikmiş',
        is_overdue: true,
        days_until_due: -400,
    },
    {
        id: 103,
        installment_number: 3,
        amount: '5000',
        due_date: '2099-01-01',
        payment_date: null,
        status: 'customer_confirmed',
        status_display: 'Müşteri Onayladı',
        is_overdue: false,
        days_until_due: 27000,
    },
    {
        id: 104,
        installment_number: 4,
        amount: '5000',
        due_date: '2099-06-01',
        payment_date: null,
        status: 'pending',
        status_display: 'Bekliyor',
        is_overdue: false,
        days_until_due: 999,
    },
];

// ----------------------------------------
// Render helper — detay görünümü için ?planId=1
// ----------------------------------------
const renderListView = () =>
    render(
        <MemoryRouter initialEntries={['/installments']}>
            <InstallmentPlansPage />
        </MemoryRouter>
    );

const renderDetailView = () =>
    render(
        <MemoryRouter initialEntries={['/installments?planId=1']}>
            <InstallmentPlansPage />
        </MemoryRouter>
    );

// ----------------------------------------
// Testler
// ----------------------------------------
describe('InstallmentPlansPage — Liste Görünümü', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAllPlans.mockResolvedValue({ data: { results: [mockPlan] } });
    });

    it('planları tabloda listeler', async () => {
        renderListView();
        await waitFor(() => {
            expect(screen.getByText('Ali Veli')).toBeInTheDocument();
            expect(screen.getByText('Buzdolabı Pro')).toBeInTheDocument();
            expect(screen.getByText('33%')).toBeInTheDocument();
        });
    });

    it('"Detay" butonu mevcut her plan için gösterilir', async () => {
        renderListView();
        await waitFor(() => {
            expect(screen.getByText('Detay')).toBeInTheDocument();
        });
    });
});

describe('InstallmentPlansPage — Detay Görünümü', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetAllPlans.mockResolvedValue({ data: { results: [mockPlan] } });
        mockGetPlan.mockResolvedValue({ data: mockPlan });
        mockGetPlanInstallments.mockResolvedValue({ data: installments_to_array(mockInstallments) });
        mockCustomerGet.mockResolvedValue({ data: mockCustomer });
    });

    it('müşteri telefon ve e-posta bilgisi gösterilir', async () => {
        renderDetailView();
        await waitFor(() => {
            expect(screen.getByText('+905551234567')).toBeInTheDocument();
            expect(screen.getByText('ali@test.com')).toBeInTheDocument();
        });
    });

    it('aktif planda "İptal Et" butonu görünür', async () => {
        renderDetailView();
        await waitFor(() => {
            expect(screen.getByTestId('cancel-plan-btn')).toBeInTheDocument();
        });
    });

    it('"İptal Et" butonuna basınca onay modalı açılır', async () => {
        renderDetailView();
        await waitFor(() => expect(screen.getByTestId('cancel-plan-btn')).toBeInTheDocument());

        fireEvent.click(screen.getByTestId('cancel-plan-btn'));

        expect(screen.getByText('Planı İptal Et')).toBeInTheDocument();
        expect(screen.getByTestId('confirm-cancel-btn')).toBeInTheDocument();
    });

    it('onay modalında "Evet, İptal Et"e basınca cancelPlan API çağrılır', async () => {
        mockCancelPlan.mockResolvedValue({ data: {} });
        renderDetailView();
        await waitFor(() => expect(screen.getByTestId('cancel-plan-btn')).toBeInTheDocument());

        fireEvent.click(screen.getByTestId('cancel-plan-btn'));
        fireEvent.click(screen.getByTestId('confirm-cancel-btn'));

        await waitFor(() => {
            expect(mockCancelPlan).toHaveBeenCalledWith(1);
        });
    });

    it('gecikmiş taksit satırı kırmızı border class alır', async () => {
        renderDetailView();
        await waitFor(() => expect(screen.getByText('Gecikmiş')).toBeInTheDocument());

        const overdueRow = screen.getByTestId('installment-row-102');
        expect(overdueRow.className).toContain('border-red-500');
    });

    it('gecikmiş taksitte "X gün gecikmiş" etiketi gösterilir', async () => {
        renderDetailView();
        await waitFor(() => {
            expect(screen.getByText('400 gün gecikmiş')).toBeInTheDocument();
        });
    });

    it('ileriki pending taksitte "X gün kaldı" etiketi gösterilir', async () => {
        renderDetailView();
        await waitFor(() => {
            expect(screen.getByText('999 gün kaldı')).toBeInTheDocument();
        });
    });

    it('plan notu varsa görüntülenir', async () => {
        renderDetailView();
        await waitFor(() => {
            expect(screen.getByText('Test notu')).toBeInTheDocument();
        });
    });

    it('"Düzenle" butonuna tıklayınca not textarea açılır', async () => {
        renderDetailView();
        await waitFor(() => expect(screen.getByText('Test notu')).toBeInTheDocument());

        fireEvent.click(screen.getByTestId('notes-edit-btn'));

        expect(screen.getByTestId('notes-textarea')).toBeInTheDocument();
    });

    it('"Kaydet" butonuna tıklayınca updatePlanNotes API çağrılır', async () => {
        mockUpdatePlanNotes.mockResolvedValue({ data: {} });
        renderDetailView();
        await waitFor(() => expect(screen.getByText('Test notu')).toBeInTheDocument());

        fireEvent.click(screen.getByTestId('notes-edit-btn'));
        const textarea = screen.getByTestId('notes-textarea');
        fireEvent.change(textarea, { target: { value: 'Yeni not' } });
        fireEvent.click(screen.getByTestId('save-notes-btn'));

        await waitFor(() => {
            expect(mockUpdatePlanNotes).toHaveBeenCalledWith(1, 'Yeni not');
        });
    });

    it('"customer_confirmed" taksitte "Onayla" butonu görünür', async () => {
        renderDetailView();
        await waitFor(() => {
            expect(screen.getByText('Onayla')).toBeInTheDocument();
        });
    });

    it('"Onayla" butonuna basınca adminApprovePayment çağrılır', async () => {
        mockAdminApprovePayment.mockResolvedValue({ data: {} });
        renderDetailView();
        await waitFor(() => expect(screen.getByText('Onayla')).toBeInTheDocument());

        fireEvent.click(screen.getByText('Onayla'));

        await waitFor(() => {
            expect(mockAdminApprovePayment).toHaveBeenCalledWith(103);
        });
    });
});

// ----------------------------------------
// Yardımcı: DRF pagination formatına çevir
// ----------------------------------------
function installments_to_array(data: any[]) {
    return data; // array olarak döndür, bileşen ikisini de handle ediyor
}
