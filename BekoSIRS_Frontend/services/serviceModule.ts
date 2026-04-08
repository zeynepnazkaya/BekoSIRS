import api from './api';

// ─────────────────────────────────────────
// 🔹 SERVICE REQUEST API
// ─────────────────────────────────────────
export const serviceRequestAPI = {
    getMyRequests: () => api.get('api/v1/service-requests/'),

    createRequest: (
        productId: number,
        requestType: 'repair' | 'maintenance' | 'warranty' | 'complaint' | 'other',
        description: string,
        sourceType: 'ownership' | 'assignment' = 'ownership'
    ) =>
        api.post('api/v1/service-requests/', {
            ...(sourceType === 'ownership'
                ? { product_ownership: productId }
                : { product_assignment: productId }),
            request_type: requestType,
            description,
        }),

    getRequestDetail: (requestId: number) =>
        api.get(`api/v1/service-requests/${requestId}/`),

    getQueueStatus: () => api.get('api/v1/service-requests/queue-status/'),
};

// ─────────────────────────────────────────
// 🔹 NOTIFICATION API
// ─────────────────────────────────────────
export const notificationAPI = {
    getNotifications: () => api.get('api/v1/notifications/'),
    getUnreadCount: () => api.get('api/v1/notifications/unread-count/'),

    markAsRead: (notificationId: number) =>
        api.post(`api/v1/notifications/${notificationId}/read/`),

    markAllAsRead: () => api.post('api/v1/notifications/read-all/'),

    getSettings: () => api.get('api/v1/notification-settings/'),

    updateSettings: (settings: {
        notify_service_updates?: boolean;
        notify_price_drops?: boolean;
        notify_restock?: boolean;
        notify_recommendations?: boolean;
        notify_warranty_expiry?: boolean;
        notify_general?: boolean;
    }) => api.patch('api/v1/notification-settings/', settings),
};

// ─────────────────────────────────────────
// 🔹 RECOMMENDATION API
// ─────────────────────────────────────────
export const recommendationAPI = {
    getRecommendations: (refresh: boolean = false) => 
        api.get(`api/v1/recommendations/${refresh ? '?refresh=true' : ''}`),
    generateRecommendations: () => api.post('api/v1/recommendations/generate/'),
    recordClick: (recommendationId: number) =>
        api.post(`api/v1/recommendations/${recommendationId}/click/`),
    dismissRecommendation: (recommendationId: number) =>
        api.post(`api/v1/recommendations/${recommendationId}/dismiss/`),
};

// ─────────────────────────────────────────
// 🔹 PRODUCT OWNERSHIP API
// ─────────────────────────────────────────
export const productOwnershipAPI = {
    getMyProducts: () => api.get('api/v1/my-products/'),
    getMyOwnerships: () => api.get('api/v1/product-ownerships/my-ownerships/'),
    getOwnershipDetail: (ownershipId: number) =>
        api.get(`api/v1/product-ownerships/${ownershipId}/`),
};

// ─────────────────────────────────────────
// 🔹 ASSIGNMENT / DELIVERY API
// ─────────────────────────────────────────
export const assignmentAPI = {
    getMyAssignments: () => api.get('api/v1/assignments/'),
};

// ─────────────────────────────────────────
// 🔹 LOCATION API (KKTC)
// ─────────────────────────────────────────
export const locationAPI = {
    getDistricts: () => api.get('api/v1/locations/districts/'),
    getAreas: (districtId: number) => api.get(`api/v1/locations/areas/?district=${districtId}`),
};

// ─────────────────────────────────────────
// 🔹 INSTALLMENT / PAYMENT API
// ─────────────────────────────────────────
export const installmentAPI = {
    getMyPlans: () => api.get('api/v1/installment-plans/my-plans/'),
    getPlanInstallments: (planId: number) => api.get(`api/v1/installment-plans/${planId}/installments/`),
    confirmPayment: (installmentId: number) => api.post(`api/v1/installments/${installmentId}/customer-confirm/`),
};

// ─────────────────────────────────────────
// 🔹 PUSH NOTIFICATION TOKEN
// ─────────────────────────────────────────
export const pushTokenAPI = {
    savePushToken: (token: string) => api.patch('api/v1/users/push-token/', { push_token: token }),
};
