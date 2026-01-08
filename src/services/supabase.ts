import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';

// Parse the URL to get the project ID subdomain if needed, or just use the full URL
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 'https://gmbhkvpcebnwnzygcedi.supabase.co';
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtYmhrdnBjZWJud256eWdjZWRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzNzE1NjksImV4cCI6MjA4MTk0NzU2OX0.vIokR84ICXfhCY40Hd0OLq4IsTr7HnGZ0ZJnGQjEH08';

// Check if we're running on server (SSR) - window is not available during SSR
const isServer = typeof window === 'undefined';

let _supabase: SupabaseClient | null = null;

// Lazy initialization to avoid SSR issues with AsyncStorage
const getSupabaseClient = (): SupabaseClient => {
    if (_supabase) {
        return _supabase;
    }

    // Only import AsyncStorage on client-side to avoid SSR issues
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;

    _supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            storage: AsyncStorage,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: Platform.OS === 'web', // Enable only on Web
        },
    });

    return _supabase;
};

// For SSR, create a minimal client without storage
const createSSRClient = (): SupabaseClient => {
    return createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            storage: {
                getItem: () => Promise.resolve(null),
                setItem: () => Promise.resolve(),
                removeItem: () => Promise.resolve(),
            },
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
        },
    });
};

// Export a getter that handles SSR vs client-side
export const supabase: SupabaseClient = isServer
    ? createSSRClient()
    : (new Proxy({} as SupabaseClient, {
        get(_, prop) {
            const client = getSupabaseClient();
            const value = client[prop as keyof SupabaseClient];
            if (typeof value === 'function') {
                return value.bind(client);
            }
            return value;
        },
    }));
