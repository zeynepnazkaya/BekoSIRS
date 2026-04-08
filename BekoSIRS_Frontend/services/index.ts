/**
 * Barrel export — tüm servis modüllerini tek noktadan export eder.
 * Mevcut import'lar (`from '../services/api'`) çalışmaya devam eder.
 */

// Axios instance ve yardımcılar
export { default, API_BASE_URL, testBackendConnection, getImageUrl } from './api';

// Modüler servisler
export { productAPI } from './productService';
export { wishlistAPI, viewHistoryAPI, reviewAPI } from './customerService';
export {
    serviceRequestAPI,
    notificationAPI,
    recommendationAPI,
    productOwnershipAPI,
    assignmentAPI,
    locationAPI,
    installmentAPI,
    pushTokenAPI,
} from './serviceModule';
