import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const API_KEY_STORAGE_KEY = 'ministudio_api_key';
const SESSION_ACTIVE_KEY = 'ministudio_session_active';
export const GALLERY_INDEX_KEY = 'ministudio_gallery_index';
export const HAS_SEEN_ONBOARDING_KEY = 'ministudio_has_seen_onboarding';
export const SUPABASE_RECOVERY_KEY = 'ministudio_supabase_recovery';

// For web platform, we'll use localStorage as fallback
const isWeb = Platform.OS === 'web';

/**
 * Store API key securely
 */
export async function setApiKey(apiKey: string): Promise<void> {
  if (isWeb) {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
  } else {
    await SecureStore.setItemAsync(API_KEY_STORAGE_KEY, apiKey);
  }
}

/**
 * Retrieve stored API key
 */
export async function getApiKey(): Promise<string | null> {
  if (isWeb) {
    return localStorage.getItem(API_KEY_STORAGE_KEY);
  }
  return await SecureStore.getItemAsync(API_KEY_STORAGE_KEY);
}

/**
 * Delete stored API key
 */
export async function deleteApiKey(): Promise<void> {
  if (isWeb) {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  } else {
    await SecureStore.deleteItemAsync(API_KEY_STORAGE_KEY);
  }
}

/**
 * Check if API key exists
 */
export async function hasApiKey(): Promise<boolean> {
  const key = await getApiKey();
  return key !== null && key.length > 0;
}

/**
 * Store session active state
 */
export async function setSessionActive(active: boolean): Promise<void> {
  if (isWeb) {
    if (active) {
      sessionStorage.setItem(SESSION_ACTIVE_KEY, 'true');
    } else {
      sessionStorage.removeItem(SESSION_ACTIVE_KEY);
    }
  } else {
    if (active) {
      await SecureStore.setItemAsync(SESSION_ACTIVE_KEY, 'true');
    } else {
      await SecureStore.deleteItemAsync(SESSION_ACTIVE_KEY);
    }
  }
}

/**
 * Check if session is active
 */
export async function isSessionActive(): Promise<boolean> {
  if (isWeb) {
    return sessionStorage.getItem(SESSION_ACTIVE_KEY) === 'true';
  }
  const value = await SecureStore.getItemAsync(SESSION_ACTIVE_KEY);
  return value === 'true';
}

/**
 * Store generic data (JSON serializable)
 */
export async function storeData<T>(key: string, data: T): Promise<void> {
  const jsonValue = JSON.stringify(data);
  if (isWeb) {
    try {
      localStorage.setItem(key, jsonValue);
    } catch (e) {
      console.warn('Storage quota exceeded, data could not be saved:', e);
      // Optional: Clear old data or handle cleanup here
    }
  } else {
    try {
      await AsyncStorage.setItem(key, jsonValue);
    } catch (e) {
      console.error('Failed to save data to AsyncStorage:', e);
    }
  }
}

/**
 * Retrieve generic data
 */
export async function getData<T>(key: string): Promise<T | null> {
  let jsonValue: string | null;
  if (isWeb) {
    jsonValue = localStorage.getItem(key);
  } else {
    try {
      jsonValue = await AsyncStorage.getItem(key);
    } catch (e) {
      console.error('Failed to fetch data from AsyncStorage:', e);
      return null;
    }
  }

  if (jsonValue === null) return null;

  try {
    return JSON.parse(jsonValue) as T;
  } catch {
    return null;
  }
}

/**
 * Delete generic data
 */
export async function deleteData(key: string): Promise<void> {
  if (isWeb) {
    localStorage.removeItem(key);
  } else {
    try {
      await AsyncStorage.removeItem(key);
    } catch (e) {
      console.error('Failed to remove data from AsyncStorage:', e);
    }
  }
}
/**
 * Store recovery token securely (Keychain/SecureStore)
 * This survives uninstalls on iOS.
 */
export async function setRecoveryToken(token: string): Promise<void> {
  if (isWeb) {
    localStorage.setItem(SUPABASE_RECOVERY_KEY, token);
  } else {
    await SecureStore.setItemAsync(SUPABASE_RECOVERY_KEY, token);
  }
}

/**
 * Retrieve recovery token
 */
export async function getRecoveryToken(): Promise<string | null> {
  if (isWeb) {
    return localStorage.getItem(SUPABASE_RECOVERY_KEY);
  }
  return await SecureStore.getItemAsync(SUPABASE_RECOVERY_KEY);
}

/**
 * Delete recovery token
 */
export async function deleteRecoveryToken(): Promise<void> {
  if (isWeb) {
    localStorage.removeItem(SUPABASE_RECOVERY_KEY);
  } else {
    await SecureStore.deleteItemAsync(SUPABASE_RECOVERY_KEY);
  }
}
