import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import { registerForPushNotifications } from '../hooks/usePushNotifications';
import { pushApi } from '../api/client';

type Props = { navigation: NativeStackNavigationProp<any> };

export default function RegisterScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [password, setPassword] = useState('');
  const { register, isLoading } = useAuthStore();

  const handleRegister = async () => {
    if (!name.trim() || !phone.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    try {
      await register(name.trim(), phone.trim(), countryCode, password);

      // Register FCM token after successful registration
      const fcmToken = await registerForPushNotifications();
      if (fcmToken) {
        await pushApi.subscribe(fcmToken);
      }
    } catch (err: any) {
      Alert.alert(
        'Registration failed',
        err?.response?.data?.message || err?.message || 'Please try again',
      );
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join MSG today</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Your name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
          />

          <Text style={styles.label}>Country Code</Text>
          <TextInput
            style={styles.input}
            placeholder="+91"
            value={countryCode}
            onChangeText={setCountryCode}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="9000000000"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="At least 6 characters"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Register</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.link}>
            <Text style={styles.linkText}>Already have an account? <Text style={styles.linkBold}>Log In</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#fff', padding: 24 },
  header: { alignItems: 'center', marginTop: 40, marginBottom: 36 },
  title: { fontSize: 28, fontWeight: '800', color: '#075E54' },
  subtitle: { fontSize: 14, color: '#9E9E9E', marginTop: 4 },
  form: { gap: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: -4 },
  input: {
    height: 50, borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10,
    paddingHorizontal: 16, fontSize: 16, backgroundColor: '#FAFAFA',
  },
  button: {
    height: 52, backgroundColor: '#075E54', borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  link: { alignItems: 'center', marginTop: 8 },
  linkText: { color: '#9E9E9E', fontSize: 14 },
  linkBold: { color: '#075E54', fontWeight: '700' },
});
