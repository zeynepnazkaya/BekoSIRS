// src/pages/LoginPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import LoginPage from './LoginPage';

// LoginPage, api.post (axios) kullanıyor — fetch değil
const mockApiPost = vi.fn();
vi.mock('../services/api', () => ({
    default: { post: (...a: any[]) => mockApiPost(...a) },
}));

// Başarılı login sonrası Dashboard render edilir — Sidebar ve Dashboard'u mock'la
vi.mock('../components/Sidebar', () => ({ default: () => <div data-testid="sidebar" /> }));
vi.mock('./DashboardComponents', () => ({
    KpiCard: () => <div />,
    AlertItem: () => <div />,
    SimpleBarChart: () => <div />,
}));
const mockDashboardApiGet = vi.fn().mockResolvedValue({ data: {} });
// api.get de mock'lanmış olsun (Dashboard için)
vi.mock('../services/api', () => ({
    default: {
        post: (...a: any[]) => mockApiPost(...a),
        get: (...a: any[]) => mockDashboardApiGet(...a),
    },
}));

const renderWithRouter = (component: React.ReactNode) =>
    render(<BrowserRouter>{component}</BrowserRouter>);

describe('LoginPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('renders login form correctly', () => {
        renderWithRouter(<LoginPage />);

        expect(screen.getByPlaceholderText('Kullanıcı adınız')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
        expect(screen.getByText('Sisteme Giriş Yap')).toBeInTheDocument();
    });

    it('shows login button disabled when fields are empty', () => {
        renderWithRouter(<LoginPage />);

        const loginButton = screen.getByRole('button', { name: /sisteme giriş yap/i });
        expect(loginButton).toBeDisabled();
    });

    it('enables login button when both fields have values', async () => {
        const user = userEvent.setup();
        renderWithRouter(<LoginPage />);

        await user.type(screen.getByPlaceholderText('Kullanıcı adınız'), 'admin');
        await user.type(screen.getByPlaceholderText('••••••••'), 'password123');

        const loginButton = screen.getByRole('button', { name: /sisteme giriş yap/i });
        expect(loginButton).not.toBeDisabled();
    });

    it('shows error message on failed login', async () => {
        const axiosError = new Error('Request failed with status code 401');
        mockApiPost.mockRejectedValueOnce(axiosError);

        const user = userEvent.setup();
        renderWithRouter(<LoginPage />);

        await user.type(screen.getByPlaceholderText('Kullanıcı adınız'), 'wronguser');
        await user.type(screen.getByPlaceholderText('••••••••'), 'wrongpass');
        await user.click(screen.getByRole('button', { name: /sisteme giriş yap/i }));

        await waitFor(() => {
            expect(screen.getByText(/request failed|401/i)).toBeInTheDocument();
        });
    });

    it('stores tokens on successful login', async () => {
        mockApiPost.mockResolvedValueOnce({
            data: {
                access: 'test-access-token',
                refresh: 'test-refresh-token',
                role: 'admin',
            },
        });
        mockDashboardApiGet.mockResolvedValue({ data: {
            products: { total: 0, low_stock: 0, out_of_stock: 0 },
            categories: { total: 0 },
            customers: { total: 0 },
            orders: { total: 0 },
            service_requests: { pending: 0, in_progress: 0, completed: 0 },
            reviews: { pending_approval: 0, average_rating: 0 },
        }});

        const user = userEvent.setup();
        renderWithRouter(<LoginPage />);

        await user.type(screen.getByPlaceholderText('Kullanıcı adınız'), 'admin');
        await user.type(screen.getByPlaceholderText('••••••••'), 'password123');
        await user.click(screen.getByRole('button', { name: /sisteme giriş yap/i }));

        await waitFor(() => {
            expect(localStorage.getItem('access')).toBe('test-access-token');
            expect(localStorage.getItem('refresh')).toBe('test-refresh-token');
            expect(localStorage.getItem('user_role')).toBe('admin');
        });
    });

    it('toggles password visibility', async () => {
        const user = userEvent.setup();
        renderWithRouter(<LoginPage />);

        const passwordInput = screen.getByPlaceholderText('••••••••');
        expect(passwordInput).toHaveAttribute('type', 'password');

        const toggleButtons = screen.getAllByRole('button');
        const toggleButton = toggleButtons.find(btn =>
            btn.querySelector('svg') && !btn.textContent?.includes('Giriş')
        );

        if (toggleButton) {
            await user.click(toggleButton);
            expect(passwordInput).toHaveAttribute('type', 'text');
        }
    });

    it('clears old session data on page load', () => {
        localStorage.setItem('access', 'old-token');
        localStorage.setItem('refresh', 'old-refresh');
        localStorage.setItem('user_role', 'old-role');

        renderWithRouter(<LoginPage />);

        expect(localStorage.getItem('access')).toBeNull();
        expect(localStorage.getItem('refresh')).toBeNull();
        expect(localStorage.getItem('user_role')).toBeNull();
    });
});
