import React, { useState } from 'react';
import { View, TextInput, Button, StyleSheet, Text, SafeAreaView, Alert, ActivityIndicator } from 'react-native';
import api from '../services';
import { router } from 'expo-router';

const RegisterScreen = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    // Validasyon
    if (!username || !password || !email) {
      Alert.alert('Hata', 'Kullanıcı adı, e-posta ve şifre alanları zorunludur.');
      return;
    }

    setLoading(true);

    try {
      /**
       * ÖNEMLİ: Backend'de 'customer' rolünü tanıtabilmek için 
       * gönderdiğimiz objeye 'role' alanını ekliyoruz.
       * Endpoint adresini backend yapınıza göre kontrol edin.
       */
      await api.post('/api/v1/users/', {
        username,
        password,
        email,
        first_name: firstName,
        last_name: lastName,
        role: 'customer', // Web panelindeki "Müşteri" rolü ile eşleşir
      });

      Alert.alert(
        'Başarılı',
        'Kayıt başarılı! Web panelindeki kullanıcı listesine eklendiniz. Şimdi giriş yapabilirsiniz.',
        [{ text: 'Tamam', onPress: () => router.replace('/login') }]
      );
    } catch (error: any) {
      console.error('Register error:', error?.response?.data || error);

      // Backend'den gelen hata mesajlarını yakalama
      const backendError = error?.response?.data;
      let errorMessage = 'Kayıt başarısız oldu.';

      if (backendError) {
        if (backendError.username) errorMessage = `Kullanıcı adı: ${backendError.username[0]}`;
        else if (backendError.email) errorMessage = `E-posta: ${backendError.email[0]}`;
        else if (backendError.detail) errorMessage = backendError.detail;
      }

      Alert.alert('Kayıt Başarısız', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Yeni Hesap Oluştur</Text>
        <Text style={styles.subtitle}>Beko Müşteri Paneli</Text>

        <TextInput
          style={styles.input}
          placeholder="Kullanıcı Adı*"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          style={styles.input}
          placeholder="E-posta*"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          style={styles.input}
          placeholder="Şifre*"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="Ad"
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
        />

        <TextInput
          style={styles.input}
          placeholder="Soyad"
          value={lastName}
          onChangeText={setLastName}
          autoCapitalize="words"
        />

        <View style={styles.buttonContainer}>
          {loading ? (
            <ActivityIndicator size="large" color="#000" />
          ) : (
            <>
              <TouchableOpacity style={styles.mainButton} onPress={handleRegister}>
                <Text style={styles.buttonText}>Kayıt Ol</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()}>
                <Text style={styles.secondaryButtonText}>Giriş Ekranına Dön</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
};

// StyleSheet'e yeni buton stilleri ekledim daha profesyonel görünmesi için
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 5,
    textAlign: 'center',
    color: '#000',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#eee',
    padding: 15,
    marginBottom: 15,
    borderRadius: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  buttonContainer: {
    marginTop: 10,
    gap: 10,
  },
  mainButton: {
    backgroundColor: '#000',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    padding: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#666',
    fontSize: 14,
  },
});

import { TouchableOpacity } from 'react-native'; // Button yerine TouchableOpacity kullanmak için ekledim
export default RegisterScreen;