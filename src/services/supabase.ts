import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';

// Get Supabase credentials from app.json extra config
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || '';
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase configuration in app.json -> expo.extra');
}

// SSR Safe Detection
const isServer = typeof window === 'undefined';

// Conditional storage:
// On server/build: use dummy storage
// On client: use real AsyncStorage
let storage;

if (isServer) {
    storage = {
        getItem: () => Promise.resolve(null),
        setItem: () => Promise.resolve(),
        removeItem: () => Promise.resolve(),
    };
} else {
    // Dynamically require to prevent top-level import during build
    try {
        storage = require('@react-native-async-storage/async-storage').default;
    } catch (e) {
        console.error('Failed to load AsyncStorage:', e);
        storage = {
            getItem: () => Promise.resolve(null),
            setItem: () => Promise.resolve(),
            removeItem: () => Promise.resolve(),
        };
    }
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage,
        autoRefreshToken: !isServer,
        persistSession: !isServer,
        detectSessionInUrl: Platform.OS === 'web' && !isServer,
    },
});
