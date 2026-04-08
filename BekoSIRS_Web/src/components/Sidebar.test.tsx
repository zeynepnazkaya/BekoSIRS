// src/components/Sidebar.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';

const renderWithRouter = (component: React.ReactNode, initialRoute = '/dashboard') =>
    render(<MemoryRouter initialEntries={[initialRoute]}>{component}</MemoryRouter>);

describe('Sidebar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(window, 'confirm').mockReturnValue(false);
        localStorage.clear();
    });

    it('renders all menu items', () => {
        renderWithRouter(<Sidebar />);

        expect(screen.getByText('Dashboard')).toBeInTheDocument();
        expect(screen.getByText('Urunler')).toBeInTheDocument();
        expect(screen.getByText('Kategoriler')).toBeInTheDocument();
        expect(screen.getByText('Servis Talepleri')).toBeInTheDocument();
        expect(screen.getByText('Degerlendirmeler')).toBeInTheDocument();
        expect(screen.getByText('Gruplar')).toBeInTheDocument();
        expect(screen.getByText('Urun Atamalari')).toBeInTheDocument();
        expect(screen.getByText('Bildirimler')).toBeInTheDocument();
    });

    it('renders BEKO logo', () => {
        renderWithRouter(<Sidebar />);

        expect(screen.getByText('BEKO')).toBeInTheDocument();
        expect(screen.getByText('Admin Panel')).toBeInTheDocument();
    });

    it('has logout button', () => {
        renderWithRouter(<Sidebar />);

        expect(screen.getByText('Cikis Yap')).toBeInTheDocument();
    });

    it('shows confirmation dialog on logout click', async () => {
        const user = userEvent.setup();
        renderWithRouter(<Sidebar />);

        const logoutButton = screen.getByText('Cikis Yap');
        await user.click(logoutButton);

        expect(window.confirm).toHaveBeenCalledWith('Cikis yapmak istediginizden emin misiniz?');
    });

    it('highlights active menu item based on current route', () => {
        renderWithRouter(<Sidebar />, '/dashboard/products');

        const productsLink = screen.getByText('Urunler').closest('a');
        expect(productsLink).toHaveClass('bg-black');
    });

    it('can collapse and expand sidebar', () => {
        renderWithRouter(<Sidebar />);

        expect(screen.getByText('Dashboard')).toBeVisible();
        expect(screen.getByText('Admin Panel')).toBeVisible();
    });

    it('shows user profile section when expanded', () => {
        renderWithRouter(<Sidebar />);

        // isAdmin=false (localStorage bos), "Satici" ve "Yetkili Kullanici" gorunur
        expect(screen.getByText('Satici')).toBeInTheDocument();
        expect(screen.getByText('Yetkili Kullanici')).toBeInTheDocument();
    });

    it('has correct links for all menu items', () => {
        renderWithRouter(<Sidebar />);

        const expectedLinks = [
            { text: 'Dashboard', href: '/dashboard' },
            { text: 'Urunler', href: '/dashboard/products' },
            { text: 'Kategoriler', href: '/dashboard/categories' },
        ];

        expectedLinks.forEach(({ text, href }) => {
            const link = screen.getByText(text).closest('a');
            expect(link).toHaveAttribute('href', href);
        });
    });
});
