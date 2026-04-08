// src/pages/NotFoundPage.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFoundPage from './NotFoundPage';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

const renderPage = () =>
    render(
        <MemoryRouter>
            <NotFoundPage />
        </MemoryRouter>
    );

describe('NotFoundPage', () => {
    it('404 başlığını gösterir', () => {
        renderPage();
        expect(screen.getByText('404')).toBeInTheDocument();
    });

    it('"Sayfa Bulunamadı" metnini gösterir', () => {
        renderPage();
        expect(screen.getByText('Sayfa Bulunamadı')).toBeInTheDocument();
    });

    it('"Geri Dön" butonunu gösterir', () => {
        renderPage();
        expect(screen.getByText(/Geri Dön/i)).toBeInTheDocument();
    });

    it('"Dashboard\'a Git" butonunu gösterir', () => {
        renderPage();
        expect(screen.getByText(/Dashboard'a Git/i)).toBeInTheDocument();
    });

    it('"Geri Dön" butonuna tıklayınca navigate(-1) çağrılır', () => {
        renderPage();
        fireEvent.click(screen.getByText(/Geri Dön/i));
        expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('"Dashboard\'a Git" butonuna tıklayınca /dashboard rotasına gider', () => {
        renderPage();
        fireEvent.click(screen.getByText(/Dashboard'a Git/i));
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
});
