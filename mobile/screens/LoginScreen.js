import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { TextInput, Button, Text, Snackbar } from 'react-native-paper';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiCandidates, persistApiBaseUrl } from '../utils/api';

export default function LoginScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canSubmit = username.trim() && password.trim();

  const handleLogin = async () => {
    if (!canSubmit) {
      setError('Please enter your username and password.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const candidates = await getApiCandidates();
      let networkFailed = true;
      let lastTried = '';

      for (const baseUrl of candidates) {
        lastTried = baseUrl;
        try {
          const response = await axios.post(
            `${baseUrl}/login`,
            { username, password },
            { timeout: 3500 }
          );

          await persistApiBaseUrl(baseUrl);
          await AsyncStorage.setItem('token', response.data.token);
          await AsyncStorage.setItem('user', JSON.stringify(response.data.user));
          navigation.replace('Dashboard');
          return;
        } catch (err) {
          // If server responded, credentials are wrong; no need to try more URLs.
          if (err.response) {
            networkFailed = false;
            setError(err.response?.data?.error || 'Login failed');
            return;
          }
        }
      }

      if (networkFailed) {
        setError(`Cannot reach server. Last tried: ${lastTried || 'none'}`);
      }
    } catch (err) {
      if (err.code === 'ERR_NETWORK') {
        setError('Cannot reach server. Check backend is running and API URL is correct.');
      } else {
        setError(err.response?.data?.error || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.loginCard}>
        <Text style={styles.kicker}>Attendance Access</Text>
        <Text style={styles.title}>DTR Student Login</Text>
        <Text style={styles.subtitle}>Use your assigned credentials to check in and view records.</Text>

        <TextInput
          label="Username"
          value={username}
          onChangeText={setUsername}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          mode="outlined"
        />
        <TextInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
          mode="outlined"
        />

        <Button
          mode="contained"
          onPress={handleLogin}
          loading={loading}
          disabled={!canSubmit || loading}
          style={styles.button}
        >
          {loading ? 'Signing In...' : 'Login'}
        </Button>

        <Text style={styles.helperText}>Tip: Make sure you are connected to the same network as the server.</Text>
      </View>

      <Snackbar visible={!!error} onDismiss={() => setError('')} duration={3200}>
        {error}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 18,
    backgroundColor: '#eff4fb',
  },
  loginCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  kicker: {
    textAlign: 'center',
    color: '#1f5e96',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 6,
    fontWeight: '700',
    color: '#1b2840',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 14,
    color: '#5f6f86',
  },
  input: { marginBottom: 10 },
  button: { marginTop: 10, borderRadius: 10 },
  helperText: {
    marginTop: 10,
    color: '#5f6f86',
    fontSize: 12,
    textAlign: 'center',
  },
});