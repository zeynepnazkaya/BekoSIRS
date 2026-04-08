import axios from 'axios';
import { getToken } from '../storage/storage.native';
import Constants from 'expo-constants';

// 🔹 Get your computer's local IP address
// Replace this with YOUR actual IP address from ipconfig/ifconfig
const COMPUTER_IP = '172.20.10.3';

// 🔹 Read from .env if available, otherwise fallback to local IP
export const API_BASE_URL = __DEV__
  ? process.env.EXPO_PUBLIC_API_URL || `http://${COMPUTER_IP}:8000/`
  : process.env.EXPO_PUBLIC_PROD_API_URL || 'https://api.bekosirs.com/';

if (__DEV__) {
  console.log('🔗 API Base URL:', API_BASE_URL);
  console.log('📱 Device:', Constants.deviceName);
  console.log('🌐 Platform:', Constants.platform);
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 30000, // 30 second timeout for ML-heavy endpoints
});

// Request interceptor
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        if (__DEV__) console.log('✅ Token added to request');
      }
    } catch (error) {
      if (__DEV__) console.error('❌ Error getting token:', error);
    }

    if (__DEV__) console.log('📤 Request:', config.method?.toUpperCase(), config.url);
    return config;
  },
  (error) => {
    if (__DEV__) console.error('❌ Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor with detailed error logging
api.interceptors.response.use(
  (response) => {
    if (__DEV__) console.log('✅ Response:', response.status, response.config.url);
    return response;
  },
  (error) => {
    if (__DEV__) {
      if (error.response) {
        console.error('❌ Server Error:', {
          status: error.response.status,
          data: error.response.data,
          url: error.config?.url
        });
      } else if (error.request) {
        console.error('❌ Network Error - No Response:', {
          message: 'Cannot connect to backend',
          url: error.config?.url,
          baseURL: API_BASE_URL
        });
        console.error('💡 Troubleshooting:');
        console.error('   1. Backend çalışıyor mu: python manage.py runserver 0.0.0.0:8000');
        console.error('   2. IP adresi doğru mu:', COMPUTER_IP);
        console.error('   3. Telefon ve bilgisayar aynı WiFi\'da mı');
      } else {
        console.error('❌ Request Setup Error:', error.message);
      }
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

// Test connection function (only useful in development)
export const testBackendConnection = async () => {
  try {
    if (__DEV__) console.log('🔍 Testing backend connection...');
    const response = await axios.get(`${API_BASE_URL}admin/`, {
      timeout: 5000,
      validateStatus: () => true
    });
    if (__DEV__) console.log('✅ Backend is reachable! Status:', response.status);
    return true;
  } catch (error: any) {
    if (__DEV__) console.error('❌ Backend connection test failed:', error.message);
    return false;
  }
};

// ----------------------------------------
// API modülleri ayrı dosyalara taşındı:
// - productService.ts
// - customerService.ts
// - serviceModule.ts
// Tüm export'lar index.ts üzerinden erişilebilir.
// ----------------------------------------

// ----------------------------------------
// 🔹 IMAGE URL HELPER
// ----------------------------------------
/**
 * Get full image URL from path.
 * Handles both full URLs (http/https) and relative paths.
 */
export const getImageUrl = (imagePath: string | null | undefined): string | null => {
  if (!imagePath) return null;

  if (imagePath.startsWith('http') || imagePath.startsWith('https')) {
    return imagePath;
  }

  const baseUrl = (api.defaults.baseURL || '').replace(/\/$/, '');
  const cleanPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;

  return `${baseUrl}${cleanPath}`;
};

export default api;