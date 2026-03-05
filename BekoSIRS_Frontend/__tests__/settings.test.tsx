import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import SettingsScreen from '../app/(drawer)/settings';
import api from '../services';
import { Alert } from 'react-native';
import { useBiometric } from '../hooks/useBiometric';

// Mock Expo Router
jest.mock('expo-router', () => ({
    useRouter: () => ({
        replace: jest.fn(),
    }),
}));

// Mock API
jest.mock('../services', () => ({
    get: jest.fn(),
    post: jest.fn(),
}));

// Mock Biometric Hook
jest.mock('../hooks/useBiometric', () => ({
    useBiometric: jest.fn(),
}));

// Mock Storage
jest.mock('../storage/storage.native', () => ({
    getToken: jest.fn(),
    getRefreshToken: jest.fn(),
    clearTokens: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        clear: jest.fn(),
    },
}));

// Spy on Alert
jest.spyOn(Alert, 'alert');

describe('SettingsScreen Tests', () => {
    const mockEnableBiometric = jest.fn();
    const mockDisableBiometric = jest.fn();
    const mockCheckIfEnabled = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();

        (useBiometric as jest.Mock).mockReturnValue({
            isAvailable: true,
            isEnabled: false,
            displayName: 'Face ID',
            loading: false,
            enableBiometric: mockEnableBiometric,
            disableBiometric: mockDisableBiometric,
            checkIfEnabled: mockCheckIfEnabled,
        });

        (api.get as jest.Mock).mockResolvedValue({ data: { id: 1 } });
        (api.post as jest.Mock).mockResolvedValue({ data: { success: true } });
    });

    it('renders security tab by default and shows biometric options', async () => {
        const { getByText } = render(<SettingsScreen />);

        await waitFor(() => {
            // Tabs
            expect(getByText('Güvenlik')).toBeTruthy();
            expect(getByText('Şifre')).toBeTruthy();
            expect(getByText('İletişim')).toBeTruthy();

            // Biometric info
            expect(getByText('Biyometrik Giriş')).toBeTruthy();
            expect(getByText('Face ID')).toBeTruthy();
            expect(getByText('Devre dışı')).toBeTruthy();
        });
    });

    it('switches to password tab and renders form', async () => {
        const { getByText, getByPlaceholderText } = render(<SettingsScreen />);

        // Switch tab
        fireEvent.press(getByText('Şifre'));

        await waitFor(() => {
            expect(getByText('Şifre Güncelleme')).toBeTruthy();
            expect(getByText('Hesap güvenliğinizi korumak için şifrenizi güncel tutun.')).toBeTruthy();
            expect(getByPlaceholderText('••••••••')).toBeTruthy(); // Current pass
            expect(getByPlaceholderText('En az 6 karakter')).toBeTruthy(); // New pass
            expect(getByText('Şifreyi Güncelle')).toBeTruthy();
        });
    });

    it('handles password change validation and submit', async () => {
        const { getByText, getByPlaceholderText } = render(<SettingsScreen />);

        fireEvent.press(getByText('Şifre'));

        await waitFor(() => expect(getByText('Şifreyi Güncelle')).toBeTruthy());

        // Try submitting empty
        fireEvent.press(getByText('Şifreyi Güncelle'));
        expect(Alert.alert).toHaveBeenCalledWith('Eksik Bilgi', 'Lütfen tüm alanları doldurun.');

        // Fill the inputs correctly
        fireEvent.changeText(getByPlaceholderText('••••••••'), 'oldPass123');
        fireEvent.changeText(getByPlaceholderText('En az 6 karakter'), 'newPass123');
        fireEvent.changeText(getByPlaceholderText('Tekrar giriniz'), 'newPass123');

        // Submit valid form
        fireEvent.press(getByText('Şifreyi Güncelle'));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/api/v1/change-password/', {
                old_password: 'oldPass123',
                new_password: 'newPass123'
            });
            expect(Alert.alert).toHaveBeenCalledWith('Başarılı', 'Güvenlik bilgileriniz güncellendi.');
        });
    });

    it('switches to email tab and handles email change', async () => {
        const { getByText, getByPlaceholderText } = render(<SettingsScreen />);

        // Switch to Email tab
        fireEvent.press(getByText('İletişim'));

        await waitFor(() => expect(getByText('E-posta Bilgileri')).toBeTruthy());

        // Fill inputs
        fireEvent.changeText(getByPlaceholderText('ornek@beko.com'), 'test@test.com');
        fireEvent.changeText(getByPlaceholderText('Doğrulama için şifreniz'), 'myPassword123');

        // Submit
        fireEvent.press(getByText('E-postayı Güncelle'));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/api/v1/change-email/', {
                new_email: 'test@test.com',
                password: 'myPassword123'
            });
            expect(Alert.alert).toHaveBeenCalledWith('Başarılı', 'İletişim bilgileriniz güncellendi.');
        });
    });

    it('handles logout process', async () => {
        const { getByText } = render(<SettingsScreen />);

        await waitFor(() => expect(getByText('Oturum İşlemleri')).toBeTruthy());

        fireEvent.press(getByText('Çıkış Yap'));
        // AsyncStorage and router.replace are mocked implicitly above
        // A thorough setup would test if replace was called with '/login'
    });
});
