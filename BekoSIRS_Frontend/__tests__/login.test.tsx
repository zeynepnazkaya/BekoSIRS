import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import LoginScreen from '../app/login';

// Mock the hooks and services required by the component
jest.mock('expo-router', () => ({
    router: {
        replace: jest.fn(),
        push: jest.fn(),
    },
}));

jest.mock('../hooks/useAuth', () => ({
    useAuth: () => ({
        login: jest.fn(),
        loading: false,
    }),
}));

jest.mock('../hooks/useBiometric', () => ({
    useBiometric: () => ({
        isAvailable: true,
    }),
}));

jest.mock('../storage/storage.native', () => ({
    saveTokens: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
    setItem: jest.fn(),
}));

jest.mock('expo-camera', () => ({
    CameraView: () => null,
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));

describe('LoginScreen UI Tests', () => {
    it('renders correctly with all inputs and buttons', () => {
        const { getByPlaceholderText, getByText } = render(<LoginScreen />);

        // Check if texts and inputs exist on screen
        expect(getByText('Hoş Geldiniz')).toBeTruthy();
        expect(getByPlaceholderText('Kullanıcı adınızı girin')).toBeTruthy();
        expect(getByPlaceholderText('••••••••')).toBeTruthy();
        expect(getByText('Face ID ile Giriş')).toBeTruthy();
        expect(getByText('Yeni Hesap Oluştur')).toBeTruthy();
    });

    it('allows user to type in username and password fields', () => {
        const { getByPlaceholderText } = render(<LoginScreen />);

        const usernameInput = getByPlaceholderText('Kullanıcı adınızı girin');
        const passwordInput = getByPlaceholderText('••••••••');

        fireEvent.changeText(usernameInput, 'testuser');
        fireEvent.changeText(passwordInput, 'password123');

        expect(usernameInput.props.value).toBe('testuser');
        expect(passwordInput.props.value).toBe('password123');
    });
});
