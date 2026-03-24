import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

const API_URL_KEY = 'api_url';
const DEFAULT_PORT = '3000';

const clean = (value) => (value || '').toString().trim().replace(/\/+$/, '');

const extractHostFromScriptURL = () => {
  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  if (!scriptURL) return null;

  try {
    const match = scriptURL.match(/^(?:https?|exp):\/\/([^/:?#]+)(?::\d+)?/i);
    return match?.[1] || null;
  } catch (err) {
    return null;
  }
};

export const getApiCandidates = async () => {
  const saved = clean(await AsyncStorage.getItem(API_URL_KEY));
  const envUrl = clean(process.env.EXPO_PUBLIC_API_URL);
  const host = extractHostFromScriptURL();
  const isWeb = Platform.OS === 'web';

  const candidates = [
    host ? `http://${host}:${DEFAULT_PORT}` : '',
    envUrl,
    saved,
    `http://192.168.137.1:${DEFAULT_PORT}`,
    Platform.OS === 'android' ? `http://10.0.2.2:${DEFAULT_PORT}` : '',
    isWeb ? `http://127.0.0.1:${DEFAULT_PORT}` : '',
    isWeb ? `http://localhost:${DEFAULT_PORT}` : '',
  ].filter(Boolean);

  return [...new Set(candidates)];
};

export const getApiBaseUrl = async () => {
  const saved = clean(await AsyncStorage.getItem(API_URL_KEY));
  if (saved) return saved;

  const envUrl = clean(process.env.EXPO_PUBLIC_API_URL);
  if (envUrl) return envUrl;

  const host = extractHostFromScriptURL();
  if (host) return `http://${host}:${DEFAULT_PORT}`;

  if (Platform.OS === 'android') return `http://10.0.2.2:${DEFAULT_PORT}`;
  return `http://localhost:${DEFAULT_PORT}`;
};

export const persistApiBaseUrl = async (url) => {
  const normalized = clean(url);
  if (!normalized) return;
  await AsyncStorage.setItem(API_URL_KEY, normalized);
};
