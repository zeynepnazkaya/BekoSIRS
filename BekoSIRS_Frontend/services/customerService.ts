import api from './api';

// ─────────────────────────────────────────
// 🔹 WISHLIST API
// ─────────────────────────────────────────
export const wishlistAPI = {
    getWishlist: () => api.get('api/v1/wishlist/'),

    addItem: (productId: number, note?: string) =>
        api.post('api/v1/wishlist/add-item/', {
            product_id: productId,
            note: note || '',
            notify_on_price_drop: true,
            notify_on_restock: true,
        }),

    removeItem: (productId: number) =>
        api.delete(`api/v1/wishlist/remove-item/${productId}/`),

    checkItem: (productId: number) =>
        api.get(`api/v1/wishlist/check/${productId}/`),

    updateItem: (productId: number, data: { notify_on_price_drop?: boolean; notify_on_restock?: boolean; note?: string }) =>
        api.patch(`api/v1/wishlist/update-item/${productId}/`, data),
};

// ─────────────────────────────────────────
// 🔹 VIEW HISTORY API
// ─────────────────────────────────────────
export const viewHistoryAPI = {
    getHistory: () => api.get('api/v1/view-history/'),
    recordView: (productId: number) =>
        api.post('api/v1/view-history/record/', { product_id: productId }),
    clearHistory: () => api.delete('api/v1/view-history/clear/'),
};

// ─────────────────────────────────────────
// 🔹 REVIEW API
// ─────────────────────────────────────────
export const reviewAPI = {
    getMyReviews: () => api.get('api/v1/reviews/'),

    getProductReviews: (productId: number) =>
        api.get(`api/v1/reviews/product/${productId}/`),

    addReview: (productId: number, rating: number, comment?: string) =>
        api.post('api/v1/reviews/', {
            product: productId,
            rating,
            comment: comment || '',
        }),

    updateReview: (reviewId: number, rating: number, comment?: string) =>
        api.patch(`api/v1/reviews/${reviewId}/`, { rating, comment }),

    deleteReview: (reviewId: number) => api.delete(`api/v1/reviews/${reviewId}/`),
};
