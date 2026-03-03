import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ProfileScreen from '../app/(drawer)/(tabs)/profile';
// @ts-ignore
import api, { locationAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { Alert } from 'react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
    useRouter: () => ({
        push: mockPush,
        replace: mockReplace,
    }),
}));

const mockLogout = jest.fn();
jest.mock('../hooks/useAuth', () => ({
    useAuth: jest.fn(),
}));

jest.mock('../services/api', () => ({
    __esModule: true,
    default: {
        get: jest.fn(),
        patch: jest.fn(),
        defaults: { baseURL: 'http://test.com' },
    },
    locationAPI: {
        getDistricts: jest.fn(),
        getAreas: jest.fn(),
    },
}));

// Mock Icons
jest.mock('@expo/vector-icons', () => ({
    FontAwesome: 'FontAwesome',
}));

// Mock MapView to avoid native module crashing
jest.mock('react-native-maps', () => {
    const { View } = require('react-native');
    const MockMapView = (props: any) => <View {...props} testID="map-view" />;
    MockMapView.Marker = (props: any) => <View {...props} testID="map-marker" />;
    return {
        __esModule: true,
        default: MockMapView,
        Marker: MockMapView.Marker,
        PROVIDER_GOOGLE: 'google',
    };
});

// Spy on Alert
jest.spyOn(Alert, 'alert');

const mockProfileData = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    first_name: 'Ahmet',
    last_name: 'Yılmaz',
    phone_number: '5551234567',
    role: 'customer',
    date_joined: '2023-05-15T10:00:00Z',
    address: 'Test Adres',
    address_city: 'Lefkoşa',
    district: 1,
    area: 2,
    address_lat: '35.1856',
    address_lng: '33.3823',
    district_name: 'Merkez',
    area_name: 'Gönyeli',
    open_address: '123 Test Sokak',
};

const mockDistricts = [{ id: 1, name: 'Merkez' }, { id: 2, name: 'Lefke' }];
const mockAreas = [{ id: 2, name: 'Gönyeli' }];

describe('ProfileScreen Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        (useAuth as jest.Mock).mockReturnValue({
            authToken: 'fake-token',
            logout: mockLogout,
            isCheckingAuth: false,
        });

        (api.get as jest.Mock).mockResolvedValue({ data: mockProfileData });
        (api.patch as jest.Mock).mockResolvedValue({ data: { success: true } });
        (locationAPI.getDistricts as jest.Mock).mockResolvedValue({ data: mockDistricts });
        (locationAPI.getAreas as jest.Mock).mockResolvedValue({ data: mockAreas });
    });

    it('renders loading indicator initially', () => {
        (api.get as jest.Mock).mockReturnValue(new Promise(() => { }));
        const { getByTestId } = render(<ProfileScreen />);
        expect(getByTestId('loading-profile')).toBeTruthy();
    });

    it('redirects to login if not authenticated', () => {
        (useAuth as jest.Mock).mockReturnValue({
            authToken: null,
            logout: mockLogout,
            isCheckingAuth: false,
        });
        render(<ProfileScreen />);
        expect(mockReplace).toHaveBeenCalledWith('/login');
    });

    it('renders user profile information correctly', async () => {
        const { getByText } = render(<ProfileScreen />);

        await waitFor(() => {
            // Header
            expect(getByText('@testuser')).toBeTruthy();
            expect(getByText('Müşteri')).toBeTruthy();

            // Form fields view mode
            expect(getByText('Ahmet')).toBeTruthy();
            expect(getByText('Yılmaz')).toBeTruthy();
            expect(getByText('test@example.com')).toBeTruthy();
            expect(getByText('5551234567')).toBeTruthy();

            // Address view mode
            expect(getByText('Merkez, Gönyeli, 123 Test Sokak')).toBeTruthy();
            expect(getByText('Konum Kayıtlı')).toBeTruthy();
        });
    });

    it('toggles edit mode and saves profile changes', async () => {
        const { getByText, getByPlaceholderText, queryByText } = render(<ProfileScreen />);

        // Wait for initial load
        await waitFor(() => {
            expect(getByText('Düzenle')).toBeTruthy();
        });

        // Enter edit mode
        fireEvent.press(getByText('Düzenle'));

        expect(getByText('İptal')).toBeTruthy();
        expect(getByText('Kaydet')).toBeTruthy();

        const nameInput = getByPlaceholderText('Adınız');
        fireEvent.changeText(nameInput, 'Mehmet');

        // Save
        fireEvent.press(getByText('Kaydet'));

        await waitFor(() => {
            expect(api.patch).toHaveBeenCalledWith('api/v1/profile/', expect.objectContaining({
                first_name: 'Mehmet',
            }));
            expect(Alert.alert).toHaveBeenCalledWith('Başarılı', 'Profil bilgileriniz güncellendi');
            // Should exit edit mode
            expect(queryByText('Kaydet')).toBeNull();
        });
    });

    it('validates new passwords correctly when changing password', async () => {
        const { getByText, getByPlaceholderText } = render(<ProfileScreen />);

        await waitFor(() => expect(getByText('Düzenle')).toBeTruthy());
        fireEvent.press(getByText('Düzenle'));

        fireEvent.press(getByText('Şifre değiştir'));

        const currentPwInput = getByPlaceholderText('Mevcut şifreniz');
        const newPwInput = getByPlaceholderText('Yeni şifreniz');
        const confirmPwInput = getByPlaceholderText('Yeni şifrenizi tekrar girin');

        fireEvent.changeText(currentPwInput, 'oldpass');
        fireEvent.changeText(newPwInput, 'newpass');
        fireEvent.changeText(confirmPwInput, 'mismatch_pass');

        fireEvent.press(getByText('Kaydet'));

        await waitFor(() => {
            expect(Alert.alert).toHaveBeenCalledWith('Hata', 'Yeni şifreler eşleşmiyor');
            expect(api.patch).not.toHaveBeenCalled();
        });

        // Fix password mismatch but make very short
        fireEvent.changeText(confirmPwInput, 'newpass');
        fireEvent.changeText(newPwInput, '123');
        fireEvent.changeText(confirmPwInput, '123');

        fireEvent.press(getByText('Kaydet'));
        await waitFor(() => {
            expect(Alert.alert).toHaveBeenCalledWith('Hata', 'Şifre en az 6 karakter olmalıdır');
            expect(api.patch).not.toHaveBeenCalled();
        });
    });

    it('triggers logout with confirmation', async () => {
        const { getByText } = render(<ProfileScreen />);

        await waitFor(() => expect(getByText('Çıkış Yap')).toBeTruthy());

        fireEvent.press(getByText('Çıkış Yap'));

        expect(Alert.alert).toHaveBeenCalledWith(
            'Çıkış Yap',
            'Hesabınızdan çıkış yapmak istediğinize emin misiniz?',
            expect.any(Array)
        );

        // Simulate pressing the second button ('Çıkış Yap' in the alert)
        const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
        alertButtons[1].onPress();

        expect(mockLogout).toHaveBeenCalled();
    });
});
