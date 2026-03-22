import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import { registerForPushNotifications } from '../hooks/usePushNotifications';

type Props = { navigation: NativeStackNavigationProp<any> };

export default function LoginScreen({ navigation }: Props) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading } = useAuthStore();

  const handleLogin = async () => {
    if (!phone.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter phone and password');
      return;
    }
    try {
      // Get FCM token so it's refreshed on login
      const fcmToken = await registerForPushNotifications();
      await login(phone.trim(), password, fcmToken || undefined);
      // Navigation is handled by the root navigator watching auth state
    } catch (err: any) {
      Alert.alert(
        'Login failed',
        err?.response?.data?.message || err?.message || 'Invalid credentials',
      );
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>MSG</Text>
          <Text style={styles.subtitle}>Simple. Reliable. Private.</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="+91 9000000000"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoCapitalize="none"
            autoComplete="tel"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
          />

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Log In</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.link}>
            <Text style={styles.linkText}>Don't have an account? <Text style={styles.linkBold}>Register</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#fff', padding: 24 },
  header: { alignItems: 'center', marginTop: 60, marginBottom: 48 },
  logo: { fontSize: 52, fontWeight: '800', color: '#075E54' },
  subtitle: { fontSize: 14, color: '#9E9E9E', marginTop: 8 },
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
