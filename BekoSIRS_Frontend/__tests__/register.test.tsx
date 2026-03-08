/**
 * @file register.test.tsx
 * @description Kayıt Ol ekranı için birim testleri.
 * Form alanlarının doğru render edilmesi, zorunlu alan kontrolü
 * ve başarılı kayıt işleminin API üzerinden doğru çalışmasını doğrular.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import RegisterScreen from '../app/register';
import api from '../services';

jest.mock('expo-router', () => ({
    router: {
        replace: jest.fn(),
        back: jest.fn(),
    },
}));

jest.mock('../services', () => ({
    post: jest.fn(),
}));

jest.spyOn(Alert, 'alert');

describe('RegisterScreen UI Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders all input fields correctly', () => {
        const { getByPlaceholderText, getByText } = render(<RegisterScreen />);

        expect(getByText('Yeni Hesap Oluştur')).toBeTruthy();
        expect(getByPlaceholderText('Kullanıcı Adı*')).toBeTruthy();
        expect(getByPlaceholderText('E-posta*')).toBeTruthy();
        expect(getByPlaceholderText('Şifre*')).toBeTruthy();
        expect(getByPlaceholderText('Ad')).toBeTruthy();
        expect(getByPlaceholderText('Soyad')).toBeTruthy();
        expect(getByText('Kayıt Ol')).toBeTruthy();
        expect(getByText('Giriş Ekranına Dön')).toBeTruthy();
    });

    it('shows error alert if required fields are missing', async () => {
        const { getByText } = render(<RegisterScreen />);

        // Yalnızca kullanıcı adına tıklıyoruz, diğerleri boş kalıyor
        fireEvent.press(getByText('Kayıt Ol'));

        await waitFor(() => {
            expect(Alert.alert).toHaveBeenCalledWith(
                'Hata',
                'Kullanıcı adı, e-posta ve şifre alanları zorunludur.'
            );
        });
    });

    it('calls API and shows success alert on valid input', async () => {
        // Mock başarılı api dönüşü
        (api.post as jest.Mock).mockResolvedValueOnce({ data: { id: 1 } });

        const { getByPlaceholderText, getByText } = render(<RegisterScreen />);

        fireEvent.changeText(getByPlaceholderText('Kullanıcı Adı*'), 'newuser');
        fireEvent.changeText(getByPlaceholderText('E-posta*'), 'test@test.com');
        fireEvent.changeText(getByPlaceholderText('Şifre*'), 'password123');

        fireEvent.press(getByText('Kayıt Ol'));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/api/v1/users/', {
                username: 'newuser',
                email: 'test@test.com',
                password: 'password123',
                first_name: '',
                last_name: '',
                role: 'customer'
            });

            expect(Alert.alert).toHaveBeenCalledWith(
                'Başarılı',
                'Kayıt başarılı! Web panelindeki kullanıcı listesine eklendiniz. Şimdi giriş yapabilirsiniz.',
                expect.any(Array) // Buton texti vb
            );
        });
    });
});

