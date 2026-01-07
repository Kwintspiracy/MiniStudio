import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import 'react-native-url-polyfill/auto';

// Parse the URL to get the project ID subdomain if needed, or just use the full URL
const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 'https://gmbhkvpcebnwnzygcedi.supabase.co';
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtYmhrdnBjZWJud256eWdjZWRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzNzE1NjksImV4cCI6MjA4MTk0NzU2OX0.vIokR84ICXfhCY40Hd0OLq4IsTr7HnGZ0ZJnGQjEH08';

import { Platform } from 'react-native';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: {
            getItem: (key) => {
                if (typeof localStorage !== 'undefined') {
                    return localStorage.getItem(key);
                }
                return null;
            },
            setItem: (key, value) => {
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(key, value);
                }
            },
            removeItem: (key) => {
                if (typeof localStorage !== 'undefined') {
                    localStorage.removeItem(key);
                }
            },
        },
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web', // Enable only on Web
    },
});
