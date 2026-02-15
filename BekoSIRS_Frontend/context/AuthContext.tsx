import React, { createContext, useState, useEffect, ReactNode } from 'react';
import api from '../services/api';
import { router } from 'expo-router';
import { saveToken, getToken, deleteToken } from '../storage/storage.native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthContextType {
  authToken: string | null;
  userRole: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => React.useContext(AuthContext);

// Helper to parse JWT payload (without external libs for simplicity if possible, or use one)
// But simpler: just fetch profile after login or rely on decoding.
// For now, let's fetch profile or assume decode works.
// Better: Backend `token/` response could include role. 
// OR: fetch user details immediately.
import axios from 'axios';
import { API_BASE_URL } from '../services/api';

// Helper to parse JWT payload or fetch profile
const getUserRole = async (token: string): Promise<string> => {
  try {
    // Use raw axios to bypass interceptors and ensure the new token is used
    const response = await axios.get(`${API_BASE_URL}api/v1/profile/`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("Fetched role:", response.data.role); // Debug
    return response.data.role;
  } catch (e) {
    console.error("Failed to fetch role", e);
    // @ts-ignore
    alert(`Rol alınamadı: ${e.message}`); // Debugging
    return 'customer'; // Default fallback
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadToken = async () => {
      const token = await getToken();
      if (token) {
        setAuthToken(token);
        // Try to recover role from storage
        const storedRole = await AsyncStorage.getItem('userRole');
        if (storedRole) {
          setUserRole(storedRole);
        } else {
          // Fetch if missing
          const role = await getUserRole(token);
          setUserRole(role);
          await AsyncStorage.setItem('userRole', role);
        }
      }
      setIsLoading(false);
    };
    loadToken();
  }, []);

  const login = async (username: string, password: string) => {
    try {
      const response = await api.post('/api/v1/token/', { username, password });
      const { access } = response.data;
      setAuthToken(access);
      await saveToken(access);

      // Fetch user role
      const role = await getUserRole(access);
      setUserRole(role);
      await AsyncStorage.setItem('userRole', role);

      if (role === 'delivery') {
        router.replace('/(delivery)');
      } else {
        // Default customer flow
        router.replace('/(drawer)/profile'); // Or home
      }

    } catch (e) {
      console.error('Login failed', e);
      alert('Giriş başarısız. Lütfen bilgilerinizi kontrol edin.');
    }
  };

  const logout = async () => {
    setAuthToken(null);
    setUserRole(null);
    await deleteToken();
    await AsyncStorage.removeItem('userRole');
    router.replace('/login');
  };

  return (
    <AuthContext.Provider value={{ authToken, userRole, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};
