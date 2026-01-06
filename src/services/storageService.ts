import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_KEY_STORAGE_KEY = 'ministudio_api_key';
const SESSION_ACTIVE_KEY = 'ministudio_session_active';

// For web platform, we'll use localStorage as fallback
const isWeb = Platform.OS === 'web';

// Simple obfuscation for web storage (not production-grade encryption)
const OBFUSCATION_KEY = 'ministudio_2026';

function obfuscate(value: string): string {
  return btoa(value.split('').map((c, i) =>
    String.fromCharCode(c.charCodeAt(0) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length))
  ).join(''));
}

function deobfuscate(value: string): string {
  try {
    const decoded = atob(value);
    return decoded.split('').map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length))
    ).join('');
  } catch (e) {
    return value; // Fallback for plain text legacy keys
  }
}

/**
 * Store API key securely
 */
export async function setApiKey(apiKey: string): Promise<void> {
  if (isWeb) {
    localStorage.setItem(API_KEY_STORAGE_KEY, obfuscate(apiKey));
  } else {
    await SecureStore.setItemAsync(API_KEY_STORAGE_KEY, apiKey);
  }
}

/**
 * Retrieve stored API key
 */
export async function getApiKey(): Promise<string | null> {
  if (isWeb) {
    const value = localStorage.getItem(API_KEY_STORAGE_KEY);
    return value ? deobfuscate(value) : null;
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
 * Usage Stats Storage
 */
const USAGE_STATS_KEY = 'ministudio_usage_stats';
export const GALLERY_INDEX_KEY = 'ministudio_gallery_index';
export const HAS_SEEN_ONBOARDING_KEY = 'ministudio_has_seen_onboarding';

export async function getUsageStats(): Promise<string | null> {
  if (isWeb) {
    return localStorage.getItem(USAGE_STATS_KEY);
  }
  return await SecureStore.getItemAsync(USAGE_STATS_KEY);
}

export async function setUsageStats(stats: string): Promise<void> {
  if (isWeb) {
    localStorage.setItem(USAGE_STATS_KEY, stats);
  } else {
    await SecureStore.setItemAsync(USAGE_STATS_KEY, stats);
  }
}

/**
 * Store generic data (JSON serializable)
 */
export async function storeData<T>(key: string, data: T): Promise<void> {
  const jsonValue = JSON.stringify(data);
  if (isWeb) {
    localStorage.setItem(key, jsonValue);
  } else {
    await SecureStore.setItemAsync(key, jsonValue);
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
    jsonValue = await SecureStore.getItemAsync(key);
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
    await SecureStore.deleteItemAsync(key);
  }
}
