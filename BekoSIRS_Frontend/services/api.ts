import axios from 'axios';
import { getToken } from '../storage/storage.native';
import Constants from 'expo-constants';

// 🔹 Get your computer's local IP address
// Replace this with YOUR actual IP address from ipconfig/ifconfig
const COMPUTER_IP = '192.168.0.100';

// 🔹 Expo Go requires using your computer's local network IP
const API_BASE_URL = __DEV__
  ? `http://${COMPUTER_IP}:8000/`
  : 'https://your-production-api.com/';

console.log('🔗 API Base URL:', API_BASE_URL);
console.log('📱 Device:', Constants.deviceName);
console.log('🌐 Platform:', Constants.platform);

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 15000, // 15 second timeout for mobile networks
});

// Request interceptor
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        console.log('✅ Token added to request');
      }
    } catch (error) {
      console.error('❌ Error getting token:', error);
    }

    console.log('📤 Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    console.error('❌ Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor with detailed error logging
api.interceptors.response.use(
  (response) => {
    console.log('✅ Response:', response.status, response.config.url);
    return response;
  },
  (error) => {
    if (error.response) {
      // Server responded with error status
      console.error('❌ Server Error:', {
        status: error.response.status,
        data: error.response.data,
        url: error.config?.url
      });
    } else if (error.request) {
      // Request made but no response received
      console.error('❌ Network Error - No Response:', {
        message: 'Cannot connect to backend',
        url: error.config?.url,
        baseURL: API_BASE_URL
      });
      console.error('💡 Troubleshooting:');
      console.error('   1. Check if backend is running: python manage.py runserver 0.0.0.0:8000');
      console.error('   2. Verify IP address is correct:', COMPUTER_IP);
      console.error('   3. Ensure phone and computer are on same WiFi');
      console.error('   4. Check Django ALLOWED_HOSTS includes:', COMPUTER_IP);
      console.error('   5. Disable firewall temporarily to test');
    } else {
      // Error in request setup
      console.error('❌ Request Setup Error:', error.message);
    }

    // Return a more user-friendly error
    const userError = error.response?.data?.message ||
      error.response?.statusText ||
      'Network connection error. Check your connection.';

    return Promise.reject({
      ...error,
      userMessage: userError
    });
  }
);

// Test connection function
export const testBackendConnection = async () => {
  try {
    console.log('🔍 Testing backend connection...');
    const response = await axios.get(`${API_BASE_URL}admin/`, {
      timeout: 5000,
      validateStatus: () => true // Accept any status to test connectivity
    });
    console.log('✅ Backend is reachable! Status:', response.status);
    return true;
  } catch (error: any) {
    console.error('❌ Backend connection test failed:');
    if (error.code === 'ECONNABORTED') {
      console.error('   ⏱️ Connection timeout - Backend not responding');
    } else if (error.code === 'ENOTFOUND') {
      console.error('   🌐 DNS resolution failed - Check IP address');
    } else if (error.message.includes('Network Error')) {
      console.error('   📡 Network error - Check WiFi connection');
    } else {
      console.error('   ❓ Unknown error:', error.message);
    }
    return false;
  }
};

// ----------------------------------------
// 🔹 PRODUCT API
// ----------------------------------------
export const productAPI = {
  // Get popular products (most assigned)
  getPopularProducts: () => api.get('api/v1/products/popular/'),
};

// ----------------------------------------
// 🔹 WISHLIST API
// ----------------------------------------
export const wishlistAPI = {
  // İstek listesini getir
  getWishlist: () => api.get('api/v1/wishlist/'),

  // Ürün ekle
  addItem: (productId: number, note?: string) =>
    api.post('api/v1/wishlist/add-item/', {
      product_id: productId,
      note: note || '',
      notify_on_price_drop: true,
      notify_on_restock: true,
    }),

  // Ürün çıkar
  removeItem: (productId: number) =>
    api.delete(`api/v1/wishlist/remove-item/${productId}/`),

  // Ürün listede mi kontrol et
  checkItem: (productId: number) =>
    api.get(`api/v1/wishlist/check/${productId}/`),
};

// ----------------------------------------
// 🔹 VIEW HISTORY API
// ----------------------------------------
export const viewHistoryAPI = {
  // Görüntüleme geçmişini getir
  getHistory: () => api.get('api/v1/view-history/'),

  // Görüntüleme kaydet
  recordView: (productId: number) =>
    api.post('api/v1/view-history/record/', { product_id: productId }),

  // Geçmişi temizle
  clearHistory: () => api.delete('api/v1/view-history/clear/'),
};

// ----------------------------------------
// 🔹 REVIEW API
// ----------------------------------------
export const reviewAPI = {
  // Kullanıcının yorumlarını getir
  getMyReviews: () => api.get('api/v1/reviews/'),

  // Ürüne ait yorumları getir
  getProductReviews: (productId: number) =>
    api.get(`api/v1/reviews/product/${productId}/`),

  // Yorum ekle
  addReview: (productId: number, rating: number, comment?: string) =>
    api.post('api/v1/reviews/', {
      product: productId,
      rating,
      comment: comment || '',
    }),

  // Yorumu güncelle
  updateReview: (reviewId: number, rating: number, comment?: string) =>
    api.patch(`api/v1/reviews/${reviewId}/`, { rating, comment }),

  // Yorumu sil
  deleteReview: (reviewId: number) => api.delete(`api/v1/reviews/${reviewId}/`),
};

// ----------------------------------------
// 🔹 SERVICE REQUEST API
// ----------------------------------------
export const serviceRequestAPI = {
  // Servis taleplerimi getir
  getMyRequests: () => api.get('api/v1/service-requests/'),

  // Yeni talep oluştur
  createRequest: (
    productOwnershipId: number,
    requestType: 'repair' | 'maintenance' | 'warranty' | 'complaint' | 'other',
    description: string
  ) =>
    api.post('api/v1/service-requests/', {
      product_ownership: productOwnershipId,
      request_type: requestType,
      description,
    }),

  // Talep detayını getir
  getRequestDetail: (requestId: number) =>
    api.get(`api/v1/service-requests/${requestId}/`),

  // Kuyruk durumunu getir
  getQueueStatus: () => api.get('api/v1/service-requests/queue-status/'),
};

// ----------------------------------------
// 🔹 NOTIFICATION API
// ----------------------------------------
export const notificationAPI = {
  // Bildirimleri getir
  getNotifications: () => api.get('api/v1/notifications/'),

  // Okunmamış bildirim sayısı
  getUnreadCount: () => api.get('api/v1/notifications/unread-count/'),

  // Bildirimi okundu işaretle
  markAsRead: (notificationId: number) =>
    api.post(`api/v1/notifications/${notificationId}/read/`),

  // Tümünü okundu işaretle
  markAllAsRead: () => api.post('api/v1/notifications/read-all/'),

  // Bildirim ayarlarını getir
  getSettings: () => api.get('api/v1/notification-settings/'),

  // Bildirim ayarlarını güncelle
  updateSettings: (settings: {
    notify_service_updates?: boolean;
    notify_price_drops?: boolean;
    notify_restock?: boolean;
    notify_recommendations?: boolean;
    notify_warranty_expiry?: boolean;
    notify_general?: boolean;
  }) => api.patch('api/v1/notification-settings/', settings),
};

// ----------------------------------------
// 🔹 RECOMMENDATION API
// ----------------------------------------
export const recommendationAPI = {
  // Önerileri getir
  getRecommendations: () => api.get('api/v1/recommendations/'),

  // Yeni öneriler oluştur
  generateRecommendations: () => api.post('api/v1/recommendations/generate/'),

  // Öneri tıklaması kaydet
  recordClick: (recommendationId: number) =>
    api.post(`api/v1/recommendations/${recommendationId}/click/`),
};

// ----------------------------------------
// 🔹 PRODUCT OWNERSHIP API
// ----------------------------------------
export const productOwnershipAPI = {
  // Sahip olduğum ürünleri getir (basit liste - my-products sayfası için)
  getMyProducts: () => api.get('api/v1/my-products/'),

  // Sahip olduğum ürünleri garanti bilgileriyle getir (servis talepleri için)
  getMyOwnerships: () => api.get('api/v1/product-ownerships/my-ownerships/'),

  // Ürün sahipliği detayı
  getOwnershipDetail: (ownershipId: number) =>
    api.get(`api/v1/product-ownerships/${ownershipId}/`),
};

// ----------------------------------------
// 🔹 ASSIGNMENT / DELIVERY API
// ----------------------------------------
export const assignmentAPI = {
  // Atamalarımı (Sipariş/Teslimat) getir
  getMyAssignments: () => api.get('api/v1/assignments/'),
};

// ----------------------------------------
// 🔹 LOCATION API (KKTC)
// ----------------------------------------
export const locationAPI = {
  getDistricts: () => api.get('api/v1/locations/districts/'),
  getAreas: (districtId: number) => api.get(`api/v1/locations/areas/?district=${districtId}`),
};

export default api;