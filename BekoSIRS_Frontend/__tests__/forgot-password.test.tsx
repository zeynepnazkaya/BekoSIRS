import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ForgotPasswordScreen from '../app/forgot-password';
import api from '../services';

// Mock Router
jest.mock('expo-router', () => ({
    useRouter: () => ({
        back: jest.fn(),
    }),
}));

// Mock API
jest.mock('../services', () => ({
    post: jest.fn(),
}));

// Mock Icons
jest.mock('@expo/vector-icons', () => ({
    FontAwesome: 'FontAwesome',
}));

// Spy on Alert
jest.spyOn(Alert, 'alert');

describe('ForgotPasswordScreen UI Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders all essential UI components', () => {
        const { getByPlaceholderText, getByText } = render(<ForgotPasswordScreen />);

        expect(getByText('Şifremi Unuttum')).toBeTruthy();
        expect(getByText('E-POSTA ADRESİ')).toBeTruthy();
        expect(getByPlaceholderText('ornek@beko.com')).toBeTruthy();
        expect(getByText('Talimatları Gönder')).toBeTruthy();
    });

    it('shows error alert if email is empty', async () => {
        const { getByText } = render(<ForgotPasswordScreen />);

        fireEvent.press(getByText('Talimatları Gönder'));

        await waitFor(() => {
            expect(Alert.alert).toHaveBeenCalledWith(
                'Eksik Bilgi',
                'Lütfen e-posta adresinizi girin.'
            );
        });
    });

    it('shows error alert if email format is invalid', async () => {
        const { getByPlaceholderText, getByText } = render(<ForgotPasswordScreen />);

        fireEvent.changeText(getByPlaceholderText('ornek@beko.com'), 'invalidemailformat');
        fireEvent.press(getByText('Talimatları Gönder'));

        await waitFor(() => {
            expect(Alert.alert).toHaveBeenCalledWith(
                'Geçersiz Format',
                'Lütfen geçerli bir e-posta adresi girin.'
            );
        });
    });

    it('calls API and shows success alert on valid email input', async () => {
        (api.post as jest.Mock).mockResolvedValueOnce({ data: { success: true } });

        const { getByPlaceholderText, getByText } = render(<ForgotPasswordScreen />);

        fireEvent.changeText(getByPlaceholderText('ornek@beko.com'), 'valid@email.com');
        fireEvent.press(getByText('Talimatları Gönder'));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/api/password-reset/', { email: 'valid@email.com' });
            expect(Alert.alert).toHaveBeenCalledWith(
                'Başarılı',
                'Şifre sıfırlama talimatları e-posta adresinize gönderildi.',
                expect.any(Array) // Contains the 'Tamam' button to route back
            );
        });
    });
});
