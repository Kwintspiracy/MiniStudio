import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';

// Get Supabase credentials from app.json extra config
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || '';
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase configuration in app.json -> expo.extra');
}

// Simple, direct client creation (no proxy magic)
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
    },
});
