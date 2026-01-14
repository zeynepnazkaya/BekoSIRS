import React, { useState, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useAuth } from '../../../hooks/useAuth';
import { useRouter } from 'expo-router';
import api, { locationAPI } from '../../../services/api';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

interface UserProfile {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  role: string;
  date_joined: string;
  address?: string;
  address_city?: string;
  district?: number;
  area?: number;
  address_lat?: string;
  address_lng?: string;
  district_name?: string;
  area_name?: string;
  open_address?: string;
}

interface LocationItem {
  id: number;
  name: string;
}

const TRNC_CITIES = [
  'Lefkoşa',
  'Gazimağusa',
  'Girne',
  'Güzelyurt',
  'İskele',
  'Lefke'
];

const ProfileScreen = () => {
  const { authToken, logout, isCheckingAuth } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  // Address form state
  const [city, setCity] = useState('');
  const [districtId, setDistrictId] = useState<number | null>(null);
  const [areaId, setAreaId] = useState<number | null>(null);
  const [openAddress, setOpenAddress] = useState('');

  // Map State
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);

  // Dropdown Data
  const [districts, setDistricts] = useState<LocationItem[]>([]);
  const [areas, setAreas] = useState<LocationItem[]>([]);
  const [showCityModal, setShowCityModal] = useState(false);
  const [showDistrictModal, setShowDistrictModal] = useState(false);
  const [showAreaModal, setShowAreaModal] = useState(false);

  // Password change
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const fetchDistricts = async () => {
    try {
      const response = await locationAPI.getDistricts();
      // Handle pagination
      const data = response.data.results || response.data;
      setDistricts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log('Districts error:', error);
      setDistricts([]);
    }
  };

  const fetchAreas = async (distId: number) => {
    try {
      const response = await locationAPI.getAreas(distId);
      // Handle pagination
      const data = response.data.results || response.data;
      setAreas(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log('Areas error:', error);
      setAreas([]);
    }
  };

  const fetchProfile = useCallback(async () => {
    try {
      // Fix endpoint URL: /api/profile/ -> api/v1/profile/
      const response = await api.get('api/v1/profile/');
      const data = response.data;
      setProfile(data);
      setFirstName(data.first_name || '');
      setLastName(data.last_name || '');
      setEmail(data.email || '');
      setPhoneNumber(data.phone_number || '');

      setCity(data.address_city || '');
      setDistrictId(data.district || null);
      setAreaId(data.area || null);
      setOpenAddress(data.open_address || '');

      if (data.address_lat && data.address_lng) {
        setLat(parseFloat(data.address_lat));
        setLng(parseFloat(data.address_lng));
      } else {
        // Default to Cyprus/Lefkosa
        setLat(35.1856);
        setLng(33.3823);
      }

    } catch (error) {
      console.error('Profil yüklenemedi:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (authToken) {
      fetchProfile();
      fetchDistricts();
    } else {
      setLoading(false);
    }
  }, [authToken, fetchProfile]);

  useEffect(() => {
    if (districtId) {
      fetchAreas(districtId);
    } else {
      setAreas([]);
    }
  }, [districtId]);

  useEffect(() => {
    if (!authToken && !isCheckingAuth) {
      router.replace('/login');
    }
  }, [authToken, isCheckingAuth]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchProfile();
  }, [fetchProfile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updateData: any = {
        first_name: firstName,
        last_name: lastName,
        email: email,
        phone_number: phoneNumber,
        address_city: city,
        district: districtId,
        area: areaId,
        open_address: openAddress,
        address_lat: lat,
        address_lng: lng
      };

      // Create a formatted address string for display fallback
      let fullAddress = openAddress;
      const districtName = districts.find(d => d.id === districtId)?.name;
      const areaName = areas.find(a => a.id === areaId)?.name;

      if (areaName) fullAddress += `, ${areaName}`;
      if (districtName) fullAddress += `, ${districtName}`;
      if (city && !fullAddress.includes(city)) fullAddress += `, ${city}`;

      updateData.address = fullAddress;

      // Şifre değişikliği varsa ekle
      if (showPasswordChange && newPassword) {
        if (newPassword !== confirmPassword) {
          Alert.alert('Hata', 'Yeni şifreler eşleşmiyor');
          setSaving(false);
          return;
        }
        if (newPassword.length < 6) {
          Alert.alert('Hata', 'Şifre en az 6 karakter olmalıdır');
          setSaving(false);
          return;
        }
        updateData.current_password = currentPassword;
        updateData.new_password = newPassword;
      }

      const response = await api.patch('api/v1/profile/', updateData);

      if (response.data.success) {
        Alert.alert('Başarılı', 'Profil bilgileriniz güncellendi');
        setEditing(false);
        setShowPasswordChange(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        fetchProfile();
      }
    } catch (error: any) {
      // Improve error message handling
      let msg = 'Güncelleme başarısız';
      if (error.response?.data) {
        const data = error.response.data;
        if (data.error) msg = data.error;
        else if (typeof data === 'object') {
          // Combine field errors
          const parts = [];
          for (const k in data) {
            if (Array.isArray(data[k])) parts.push(`${k}: ${data[k].join(', ')}`);
            else parts.push(`${k}: ${data[k]}`);
          }
          if (parts.length > 0) msg = parts.join('\n');
        }
      }
      Alert.alert('Hata', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Çıkış Yap',
      'Hesabınızdan çıkış yapmak istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkış Yap',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const cancelEdit = () => {
    setEditing(false);
    setShowPasswordChange(false);
    fetchProfile();
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  // Auth kontrolü yapılırken bekle
  if (isCheckingAuth) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#000000" />
      </View>
    );
  }

  // Token yoksa login'e yönlendirilecek, boş dön
  if (!authToken) {
    return null;
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#000000" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#000']} />
        }
      >
        {/* Profile Header */}
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(profile?.first_name?.[0] || profile?.username?.[0] || 'U').toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={styles.username}>@{profile?.username}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleText}>
              {profile?.role === 'customer' ? 'Müşteri' : profile?.role === 'admin' ? 'Yönetici' : 'Satıcı'}
            </Text>
          </View>
        </View>

        {/* Profile Info Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Profil Bilgileri</Text>
            {!editing ? (
              <TouchableOpacity onPress={() => setEditing(true)} style={styles.editButton}>
                <FontAwesome name="pencil" size={16} color="#000" />
                <Text style={styles.editButtonText}>Düzenle</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={cancelEdit} style={styles.cancelButton}>
                <FontAwesome name="times" size={16} color="#666" />
                <Text style={styles.cancelButtonText}>İptal</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Form Fields */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Ad</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Adınız"
                placeholderTextColor="#9CA3AF"
              />
            ) : (
              <Text style={styles.value}>{profile?.first_name || '-'}</Text>
            )}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Soyad</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Soyadınız"
                placeholderTextColor="#9CA3AF"
              />
            ) : (
              <Text style={styles.value}>{profile?.last_name || '-'}</Text>
            )}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>E-posta</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="E-posta adresiniz"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            ) : (
              <Text style={styles.value}>{profile?.email || '-'}</Text>
            )}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Telefon</Text>
            {editing ? (
              <TextInput
                style={styles.input}
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                placeholder="Telefon numaranız"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
              />
            ) : (
              <Text style={styles.value}>{profile?.phone_number || '-'}</Text>
            )}
          </View>

          {/* New Address Section */}
          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>Adres Bilgileri</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Şehir</Text>
            {editing ? (
              <TouchableOpacity
                style={styles.input}
                onPress={() => setShowCityModal(true)}
              >
                <Text style={{ color: city ? '#000' : '#9CA3AF' }}>
                  {city || 'Şehir Seçiniz'}
                </Text>
                <FontAwesome name="chevron-down" size={12} color="#666" style={{ position: 'absolute', right: 15, top: 15 }} />
              </TouchableOpacity>
            ) : (
              <Text style={styles.value}>{profile?.address_city || '-'}</Text>
            )}
          </View>

          {editing ? (
            <>
              {/* Ilce Secimi */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>İlçe</Text>
                <TouchableOpacity
                  style={styles.input}
                  onPress={() => setShowDistrictModal(true)}
                >
                  <Text style={{ color: districtId ? '#000' : '#9CA3AF' }}>
                    {districts.find(d => d.id === districtId)?.name || 'İlçe Seçiniz'}
                  </Text>
                  <FontAwesome name="chevron-down" size={12} color="#666" style={{ position: 'absolute', right: 15, top: 15 }} />
                </TouchableOpacity>
              </View>

              {/* Mahalle/Koy Secimi */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Mahalle / Köy</Text>
                <TouchableOpacity
                  style={[styles.input, !districtId && { backgroundColor: '#f0f0f0' }]}
                  onPress={() => districtId && setShowAreaModal(true)}
                  disabled={!districtId}
                >
                  <Text style={{ color: areaId ? '#000' : '#9CA3AF' }}>
                    {areas.find(a => a.id === areaId)?.name || (districtId ? 'Mahalle Seçiniz' : 'Önce İlçe Seçiniz')}
                  </Text>
                  <FontAwesome name="chevron-down" size={12} color="#666" style={{ position: 'absolute', right: 15, top: 15 }} />
                </TouchableOpacity>
              </View>

              {/* Acik Adres */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Açık Adres / Sokak / Kapı No</Text>
                <TextInput
                  style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                  value={openAddress}
                  onChangeText={setOpenAddress}
                  placeholder="Cadde, sokak, kapı numarası ve adres tarifi"
                  placeholderTextColor="#9CA3AF"
                  multiline
                />
              </View>

              {/* Map Button */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Harita Konumu</Text>
                <TouchableOpacity
                  style={styles.mapButton}
                  onPress={() => setShowMapModal(true)}
                >
                  <FontAwesome name="map-marker" size={18} color="#fff" />
                  <Text style={styles.mapButtonText}>
                    {lat && lng ? 'Konumu Düzenle' : 'Haritadan Konum Seç'}
                  </Text>
                </TouchableOpacity>
                {lat && lng && (
                  <Text style={styles.locationText}>
                    Seçilen: {lat.toFixed(5)}, {lng.toFixed(5)}
                  </Text>
                )}
              </View>
            </>
          ) : (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Açık Adres</Text>
              <Text style={styles.value}>
                {profile?.district_name ? `${profile.district_name}, ` : ''}
                {profile?.area_name ? `${profile.area_name}, ` : ''}
                {profile?.open_address || profile?.address || '-'}
              </Text>
              {profile?.address_lat && (
                <View style={styles.savedLocationBadge}>
                  <FontAwesome name="map-marker" size={12} color="#10B981" />
                  <Text style={styles.savedLocationText}>Konum Kayıtlı</Text>
                </View>
              )}
            </View>
          )}

          {/* Password Change Section */}
          {editing && (
            <View style={styles.passwordSection}>
              <TouchableOpacity
                style={styles.passwordToggle}
                onPress={() => setShowPasswordChange(!showPasswordChange)}
              >
                <FontAwesome
                  name={showPasswordChange ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color="#666"
                />
                <Text style={styles.passwordToggleText}>
                  {showPasswordChange ? 'Şifre değişikliğini gizle' : 'Şifre değiştir'}
                </Text>
              </TouchableOpacity>

              {showPasswordChange && (
                <View style={styles.passwordFields}>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Mevcut Şifre</Text>
                    <TextInput
                      style={styles.input}
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                      placeholder="Mevcut şifreniz"
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Yeni Şifre</Text>
                    <TextInput
                      style={styles.input}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="Yeni şifreniz"
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Yeni Şifre (Tekrar)</Text>
                    <TextInput
                      style={styles.input}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Yeni şifrenizi tekrar girin"
                      placeholderTextColor="#9CA3AF"
                      secureTextEntry
                    />
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Save Button */}
          {editing && (
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <FontAwesome name="check" size={16} color="#fff" />
                  <Text style={styles.saveButtonText}>Kaydet</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Account Info Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hesap Bilgileri</Text>
          <View style={styles.infoRow}>
            <FontAwesome name="user" size={16} color="#6B7280" />
            <Text style={styles.infoLabel}>Kullanıcı Adı</Text>
            <Text style={styles.infoValue}>{profile?.username}</Text>
          </View>
          <View style={styles.infoRow}>
            <FontAwesome name="calendar" size={16} color="#6B7280" />
            <Text style={styles.infoLabel}>Kayıt Tarihi</Text>
            <Text style={styles.infoValue}>
              {profile?.date_joined
                ? new Date(profile.date_joined).toLocaleDateString('tr-TR')
                : '-'}
            </Text>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <FontAwesome name="sign-out" size={18} color="#f44336" />
          <Text style={styles.logoutButtonText}>Çıkış Yap</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* City Selection Modal */}
      <SelectionModal
        visible={showCityModal}
        title="Şehir Seçiniz"
        options={TRNC_CITIES.map(c => ({ id: c, name: c }))} // Convert to simple object
        onSelect={(val: any) => { setCity(val.name); setShowCityModal(false); }}
        onClose={() => setShowCityModal(false)}
        selectedId={city}
      />

      {/* District Selection Modal */}
      <SelectionModal
        visible={showDistrictModal}
        title="İlçe Seçiniz"
        options={districts}
        onSelect={(val: any) => {
          setDistrictId(val.id);
          setAreaId(null); // Reset area
          setShowDistrictModal(false);
        }}
        onClose={() => setShowDistrictModal(false)}
        selectedId={districtId}
      />

      {/* Area Selection Modal */}
      <SelectionModal
        visible={showAreaModal}
        title="Mahalle Seçiniz"
        options={areas}
        onSelect={(val: any) => { setAreaId(val.id); setShowAreaModal(false); }}
        onClose={() => setShowAreaModal(false)}
        selectedId={areaId}
      />

      {/* Map Selection Modal */}
      <Modal
        visible={showMapModal}
        animationType="slide"
        onRequestClose={() => setShowMapModal(false)}
        presentationStyle="fullScreen"
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowMapModal(false)} style={{ padding: 10 }}>
              <Text style={{ fontSize: 16, color: '#666' }}>İptal</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Konum Seç</Text>
            <TouchableOpacity onPress={() => setShowMapModal(false)} style={{ padding: 10 }}>
              <Text style={{ fontSize: 16, color: '#000', fontWeight: 'bold' }}>Tamam</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>
            <MapView
              provider={PROVIDER_GOOGLE}
              style={{ flex: 1 }}
              initialRegion={{
                latitude: lat || 35.1856,
                longitude: lng || 33.3823,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              onPress={(e) => {
                const coords = e.nativeEvent.coordinate;
                setLat(coords.latitude);
                setLng(coords.longitude);
              }}
            >
              {lat && lng && (
                <Marker coordinate={{ latitude: lat, longitude: lng }} />
              )}
            </MapView>
            <View style={styles.mapInstructionOverlay}>
              <Text style={styles.mapInstructionText}>
                Haritada konumunuzu işaretlemek için dokunun.
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
};

// Reusable Selection Modal Component
const SelectionModal = ({ visible, title, options, onSelect, onClose, selectedId }: any) => (
  <Modal
    visible={visible}
    transparent={true}
    animationType="slide"
    onRequestClose={onClose}
  >
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <FontAwesome name="close" size={20} color="#666" />
          </TouchableOpacity>
        </View>
        <ScrollView style={{ maxHeight: 300 }}>
          {(options || []).map((item: any) => {
            const isSelected = selectedId === item.id || selectedId === item.name;
            return (
              <TouchableOpacity
                key={item.id || item.name}
                style={styles.cityOption}
                onPress={() => onSelect(item)}
              >
                <Text style={[
                  styles.cityOptionText,
                  isSelected && { fontWeight: 'bold', color: '#000' }
                ]}>
                  {item.name}
                </Text>
                {isSelected && <FontAwesome name="check" size={16} color="#000" />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarContainer: {
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  username: {
    fontSize: 18,
    color: '#6B7280',
    marginBottom: 8,
  },
  roleBadge: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#666',
  },
  formGroup: {
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 16,
    color: '#111827',
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
    textAlignVertical: 'center',
  },
  passwordSection: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  passwordToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  passwordToggleText: {
    fontSize: 14,
    color: '#666',
  },
  passwordFields: {
    gap: 4,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#000000',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 12,
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f44336',
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f44336',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#111827',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingHorizontal: 5
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  cityOption: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  cityOptionText: {
    fontSize: 16,
    color: '#333'
  },
  mapButton: {
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8
  },
  mapButtonText: {
    color: '#fff',
    fontWeight: '600'
  },
  locationText: {
    marginTop: 8,
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center'
  },
  mapInstructionOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center'
  },
  mapInstructionText: {
    color: '#fff',
    fontSize: 14
  },
  savedLocationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4
  },
  savedLocationText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500'
  }
});

export default ProfileScreen;
