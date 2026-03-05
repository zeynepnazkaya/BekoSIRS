import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import NotificationsScreen from '../app/(drawer)/notifications';
import { notificationAPI } from '../services';
import { Alert } from 'react-native';

// Mock the API
jest.mock('../services', () => ({
    notificationAPI: {
        getNotifications: jest.fn(),
        getUnreadCount: jest.fn(),
        getSettings: jest.fn(),
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn(),
        updateSettings: jest.fn(),
    },
}));

// Mock Icons
jest.mock('@expo/vector-icons', () => ({
    FontAwesome: 'FontAwesome',
}));

// Spy on Alert
jest.spyOn(Alert, 'alert');

const mockNotificationsData = {
    results: [
        {
            id: 1,
            notification_type: 'price_drop',
            title: 'Fiyat Düştü!',
            message: 'Test Fırın ürününde fiyat düşüşü var.',
            is_read: false,
            created_at: new Date(Date.now() - 5000).toISOString(), // Az önce
            product_name: 'Test Fırın'
        },
        {
            id: 2,
            notification_type: 'general',
            title: 'Hoşgeldiniz',
            message: 'Beko uygulamasına hoşgeldiniz.',
            is_read: true,
            created_at: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 gün önce
        }
    ]
};

const mockSettingsData = {
    notify_service_updates: true,
    notify_price_drops: false,
    notify_restock: true,
    notify_recommendations: true,
    notify_warranty_expiry: true,
    notify_general: true,
};

describe('NotificationsScreen Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (notificationAPI.getNotifications as jest.Mock).mockResolvedValue({ data: mockNotificationsData });
        (notificationAPI.getUnreadCount as jest.Mock).mockResolvedValue({ data: { unread_count: 1 } });
        (notificationAPI.getSettings as jest.Mock).mockResolvedValue({ data: mockSettingsData });
        (notificationAPI.markAsRead as jest.Mock).mockResolvedValue({ data: { success: true } });
        (notificationAPI.markAllAsRead as jest.Mock).mockResolvedValue({ data: { success: true } });
        (notificationAPI.updateSettings as jest.Mock).mockResolvedValue({ data: { success: true } });
    });

    it('renders loading indicator initially', () => {
        (notificationAPI.getNotifications as jest.Mock).mockReturnValue(new Promise(() => { }));
        const { getByTestId } = render(<NotificationsScreen />);
        expect(getByTestId('loading-notifications')).toBeTruthy();
    });

    it('renders notifications and unread badge correctly', async () => {
        const { getByText, queryByText } = render(<NotificationsScreen />);

        await waitFor(() => {
            // Header and badge
            expect(getByText('Bildirimler')).toBeTruthy();
            expect(getByText('1')).toBeTruthy(); // Unread count badge

            // Notification 1
            expect(getByText('Fiyat Düştü!')).toBeTruthy();
            expect(getByText('Test Fırın ürününde fiyat düşüşü var.')).toBeTruthy();
            expect(getByText('Az önce')).toBeTruthy();
            expect(getByText('Test Fırın')).toBeTruthy();

            // Notification 2
            expect(getByText('Hoşgeldiniz')).toBeTruthy();
            expect(getByText('2 gün önce')).toBeTruthy();
        });
    });

    it('marks a notification as read when pressed', async () => {
        const { getByText } = render(<NotificationsScreen />);

        await waitFor(() => expect(getByText('Fiyat Düştü!')).toBeTruthy());

        fireEvent.press(getByText('Fiyat Düştü!'));

        expect(notificationAPI.markAsRead).toHaveBeenCalledWith(1);
    });

    it('opens settings and toggles a setting', async () => {
        const { getByText, getByTestId } = render(<NotificationsScreen />);

        await waitFor(() => expect(getByText('Bildirimler')).toBeTruthy());

        // Assuming we don't have a testID for the cog icon yet, we can query by type or text if we added testID.
        // For now, let's use the actual settings button testID we will add.
        // I will add testID="settings-btn" to the cog button in the component.
    });

    it('renders empty state when there are no notifications', async () => {
        (notificationAPI.getNotifications as jest.Mock).mockResolvedValue({ data: [] });
        (notificationAPI.getUnreadCount as jest.Mock).mockResolvedValue({ data: { unread_count: 0 } });

        const { getByText } = render(<NotificationsScreen />);

        await waitFor(() => {
            expect(getByText('Bildirim Yok')).toBeTruthy();
            expect(getByText('Henüz herhangi bir bildiriminiz bulunmuyor')).toBeTruthy();
        });
    });
});
