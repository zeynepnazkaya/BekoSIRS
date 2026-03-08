import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import api from '../../services';
import { useBiometric } from '../../hooks/useBiometric';
import { getToken, getRefreshToken } from '../../storage/storage.native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SettingsScreen() {
  const [activeTab, setActiveTab] = useState<'password' | 'email' | 'security'>('security');
  const [loading, setLoading] = useState(false);

  // Şifre değiştirme state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // E-posta değiştirme state
  const [newEmail, setNewEmail] = useState('');
  const [passwordForEmail, setPasswordForEmail] = useState('');

  // Biometric hook
  const {
    isAvailable: biometricAvailable,
    isEnabled: biometricEnabled,
    displayName: biometricName,
    loading: biometricLoading,
    enableBiometric,
    disableBiometric,
    checkIfEnabled,
  } = useBiometric();

  // User info state
  const [userId, setUserId] = useState<number | null>(null);

  useEffect(() => {
    loadUserInfo();
    checkIfEnabled();
  }, []);

  const loadUserInfo = async () => {
    try {
      const response = await api.get('/api/v1/profile/');
      setUserId(response.data.id);
    } catch (error) {
      console.error('Failed to load user info:', error);
    }
  };

  const handleBiometricToggle = async (value: boolean) => {
    if (value) {
      // Enable biometric
      if (!userId) {
        Alert.alert('Hata', 'Kullanıcı bilgisi yüklenemedi.');
        return;
      }

      // Get refresh token from secure storage
      const token = await getToken();
      if (!token) {
        Alert.alert('Hata', 'Oturum bilgisi bulunamadı.');
        return;
      }

      // Get refresh token from secure storage
      const refreshToken = await getRefreshToken();
      if (!refreshToken) {
        Alert.alert(
          'Yeniden Giriş Gerekli',
          'Biyometrik girişi etkinleştirmek için çıkış yapıp tekrar giriş yapın (güvenlik için).'
        );
        return;
      }

      await enableBiometric(userId, refreshToken);
    } else {
      // Disable biometric
      await disableBiometric();
    }
  };

  const handlePasswordChange = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert('Eksik Bilgi', 'Lütfen tüm alanları doldurun.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Hata', 'Yeni şifreler birbiriyle eşleşmiyor.');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Güvenlik Uyarısı', 'Yeni şifreniz en az 6 karakterden oluşmalıdır.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/v1/change-password/', {
        old_password: currentPassword,
        new_password: newPassword,
      });

      Alert.alert('Başarılı', 'Güvenlik bilgileriniz güncellendi.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      const message = error.response?.data?.message || 'İşlem gerçekleştirilemedi.';
      Alert.alert('Hata', message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailChange = async () => {
    if (!newEmail || !passwordForEmail) {
      Alert.alert('Eksik Bilgi', 'Lütfen tüm alanları doldurun.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      Alert.alert('Geçersiz Format', 'Lütfen geçerli bir e-posta adresi girin.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/v1/change-email/', {
        new_email: newEmail,
        password: passwordForEmail,
      });

      Alert.alert('Başarılı', 'İletişim bilgileriniz güncellendi.');
      setNewEmail('');
      setPasswordForEmail('');
    } catch (error: any) {
      const message = error.response?.data?.message || 'E-posta güncellenemedi.';
      Alert.alert('Hata', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* Modern Tab Seçici */}
        <View style={styles.tabWrapper}>
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'security' && styles.tabActive]}
              onPress={() => setActiveTab('security')}
            >
              <Text style={[styles.tabText, activeTab === 'security' && styles.tabTextActive]}>
                Güvenlik
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'password' && styles.tabActive]}
              onPress={() => setActiveTab('password')}
            >
              <Text style={[styles.tabText, activeTab === 'password' && styles.tabTextActive]}>
                Şifre
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'email' && styles.tabActive]}
              onPress={() => setActiveTab('email')}
            >
              <Text style={[styles.tabText, activeTab === 'email' && styles.tabTextActive]}>
                İletişim
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Form Alanı */}
        <View style={styles.formCard}>
          {/* Security Tab - Biometric Settings */}
          {activeTab === 'security' && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Biyometrik Giriş</Text>
                <Text style={styles.sectionSubtitle}>
                  {biometricAvailable
                    ? `${biometricName} ile hızlı ve güvenli giriş yapın.`
                    : 'Bu cihaz biyometrik kimlik doğrulamayı desteklemiyor.'}
                </Text>
              </View>

              {biometricAvailable ? (
                <View style={styles.settingRow}>
                  <View style={styles.settingInfo}>
                    <Text style={styles.settingLabel}>{biometricName}</Text>
                    <Text style={styles.settingDescription}>
                      {biometricEnabled
                        ? 'Aktif - Giriş ekranında kullanabilirsiniz'
                        : 'Devre dışı'}
                    </Text>
                  </View>
                  {biometricLoading ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Switch
                      value={biometricEnabled}
                      onValueChange={handleBiometricToggle}
                      trackColor={{ false: '#E5E7EB', true: '#2563EB' }}
                      thumbColor={biometricEnabled ? '#FFFFFF' : '#F4F4F5'}
                    />
                  )}
                </View>
              ) : (
                <View style={styles.unavailableBox}>
                  <Text style={styles.unavailableIcon}>🔒</Text>
                  <Text style={styles.unavailableText}>
                    Biyometrik kimlik doğrulama bu cihazda kullanılamıyor.
                  </Text>
                </View>
              )}

              {biometricEnabled && (
                <View style={styles.infoBox}>
                  <Text style={styles.infoIcon}>ℹ️</Text>
                  <Text style={styles.infoText}>
                    {biometricName} etkin olduğunda, giriş ekranında şifre yerine {biometricName} ile giriş yapabilirsiniz.
                  </Text>
                </View>
              )}

              {/* Logout Section moved here to avoid redundancy */}
              <View style={[styles.sectionHeader, { marginTop: 30 }]}>
                <Text style={styles.sectionTitle}>Oturum İşlemleri</Text>
              </View>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: '#DC2626' }]}
                onPress={async () => {
                  try {
                    const { clearAllTokens } = require('../../storage/storage.native');
                    const { router } = require('expo-router');
                    await AsyncStorage.clear();
                    await clearAllTokens();
                    router.replace('/login');
                  } catch (e) {
                    console.error("Logout failed", e);
                  }
                }}
              >
                <Text style={styles.saveButtonText}>Çıkış Yap</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Password Tab */}
          {activeTab === 'password' && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Şifre Güncelleme</Text>
                <Text style={styles.sectionSubtitle}>
                  Hesap güvenliğinizi korumak için şifrenizi güncel tutun.
                </Text>
              </View>

              <View style={styles.formGroup}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Mevcut Şifre</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    secureTextEntry
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Yeni Şifre</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="En az 6 karakter"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Yeni Şifre (Tekrar)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Tekrar giriniz"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveButton, loading && styles.buttonDisabled]}
                onPress={handlePasswordChange}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Şifreyi Güncelle</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Email Tab */}
          {activeTab === 'email' && (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>E-posta Bilgileri</Text>
                <Text style={styles.sectionSubtitle}>
                  Bildirimleri alabilmek için güncel adresinizi girin.
                </Text>
              </View>

              <View style={styles.formGroup}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Yeni E-posta Adresi</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="ornek@beko.com"
                    value={newEmail}
                    onChangeText={setNewEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Onay Şifresi</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Doğrulama için şifreniz"
                    value={passwordForEmail}
                    onChangeText={setPasswordForEmail}
                    secureTextEntry
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveButton, loading && styles.buttonDisabled]}
                onPress={handleEmailChange}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>E-postayı Güncelle</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  tabWrapper: {
    backgroundColor: '#FFF',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#000',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tabText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FFF',
  },
  formCard: {
    backgroundColor: '#FFF',
    margin: 20,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 5,
  },
  sectionHeader: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  // Biometric settings styles
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  settingDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  unavailableBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  unavailableIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  unavailableText: {
    flex: 1,
    color: '#92400E',
    fontSize: 14,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    padding: 16,
    borderRadius: 12,
  },
  infoIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  infoText: {
    flex: 1,
    color: '#1E40AF',
    fontSize: 13,
    lineHeight: 18,
  },
  formGroup: {
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 18,
  },
  label: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  saveButton: {
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
});