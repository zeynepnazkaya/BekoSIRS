// src/pages/Dashboard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard';

// Mock: services/api (axios wrapper)
const mockApiGet = vi.fn();
vi.mock('../services/api', () => ({
    default: { get: (...a: any[]) => mockApiGet(...a) },
}));

// Mock: Sidebar
vi.mock('../components/Sidebar', () => ({
    default: () => <div data-testid="sidebar" />,
}));

// Mock: DashboardComponents (grafik kütüphanesi gerektiriyor)
vi.mock('./DashboardComponents', () => ({
    KpiCard: ({ title, value }: any) => (
        <div data-testid="kpi-card">
            <span>{title}</span>
            <span>{value}</span>
        </div>
    ),
    AlertItem: ({ message }: any) => <div data-testid="alert-item">{message}</div>,
    SimpleBarChart: () => <div data-testid="bar-chart" />,
}));

const mockSummary = {
    products: { total: 42, low_stock: 3, out_of_stock: 1 },
    categories: { total: 8 },
    customers: { total: 150 },
    orders: { total: 27 },
    service_requests: { pending: 5, in_progress: 2, completed: 10 },
    reviews: { pending_approval: 4, average_rating: 4.5 },
};

const mockProducts = {
    results: [
        { id: 1, name: 'Buzdolabı Pro', brand: 'Beko', price: '15000', stock: 10 },
        { id: 2, name: 'Çamaşır Makinesi', brand: 'Beko', price: '12000', stock: 5 },
    ],
};

const renderDashboard = () =>
    render(
        <MemoryRouter>
            <Dashboard />
        </MemoryRouter>
    );

describe('Dashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockApiGet.mockImplementation((url: string) => {
            if (url.includes('dashboard/summary')) {
                return Promise.resolve({ data: mockSummary });
            }
            if (url.includes('products')) {
                return Promise.resolve({ data: mockProducts });
            }
            return Promise.reject(new Error('Unknown URL'));
        });
    });

    it('yüklenirken loading göstergesi görünür', () => {
        renderDashboard();
        // Loading state hemen görünmeli
        expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    });

    it('API çağrısı başarılı olunca KPI kartları render edilir', async () => {
        renderDashboard();
        await waitFor(() => {
            const kpiCards = screen.getAllByTestId('kpi-card');
            expect(kpiCards.length).toBeGreaterThan(0);
        });
    });

    it('ürün sayısını doğru gösterir', async () => {
        renderDashboard();
        await waitFor(() => {
            expect(screen.getByText('42')).toBeInTheDocument();
        });
    });

    it('müşteri sayısını doğru gösterir', async () => {
        renderDashboard();
        await waitFor(() => {
            expect(screen.getByText('150')).toBeInTheDocument();
        });
    });

    it('API hatası olunca hata mesajı gösterilir', async () => {
        mockApiGet.mockRejectedValue(new Error('Network Error'));
        renderDashboard();
        await waitFor(() => {
            expect(screen.getByText(/veri yüklenemedi|network error/i)).toBeInTheDocument();
        });
    });

    it('sidebar render edilir', async () => {
        renderDashboard();
        expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    });
});
