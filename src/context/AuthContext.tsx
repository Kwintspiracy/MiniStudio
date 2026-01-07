import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

// Ensure WebBrowser works correctly on the web
WebBrowser.maybeCompleteAuthSession();

interface AuthContextType {
    session: Session | null;
    user: User | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    signInWithEmail: (email: string, password: string) => Promise<void>;
    signUpWithEmail: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    loading: true,
    signInWithGoogle: async () => { },
    signInWithEmail: async () => { },
    signUpWithEmail: async () => { },
    signOut: async () => { },
});

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 1. Initial Session Check
        const initSession = async () => {
            try {
                // Add a timeout to prevent infinite hanging
                const sessionPromise = supabase.auth.getSession();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Session check timed out')), 5000)
                );

                const { data: { session }, error } = await Promise.race([
                    sessionPromise,
                    timeoutPromise
                ]) as any;

                if (error) throw error;

                setSession(session);
                setUser(session?.user ?? null);
            } catch (error: any) {
                console.warn("Auth check failed:", error);

                // If Refresh Token is invalid, we MUST clear the session to prevent infinite loops
                if (error?.message?.includes('Refresh Token Not Found') ||
                    error?.message?.includes('Invalid Refresh Token')) {
                    console.log("Clearing invalid session...");
                    await supabase.auth.signOut();
                    setSession(null);
                    setUser(null);
                }
            } finally {
                setLoading(false);
            }
        };

        initSession();

        // 2. Auth State Listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log("Auth State Change:", event);

            if (event === 'TOKEN_REFRESH_NOT_UPDATED') {
                console.warn("Token refresh failed, forcing sign out");
                setSession(null);
                setUser(null);
                setLoading(false);
                return;
            }

            if (event === 'SIGNED_IN' && Platform.OS === 'web') {
                // Clear the hash from the URL to prevent "stale token" errors on reload
                if (window.history && window.history.replaceState) {
                    const newUrl = window.location.href.split('#')[0];
                    window.history.replaceState({}, document.title, newUrl);
                }
            }

            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    // 3. Deep Link Handler (Critical for OAuth)
    useEffect(() => {
        const handleDeepLink = async (url: string | null) => {
            if (!url) return;

            // On Web, Supabase handles the session via detectSessionInUrl: true
            if (Platform.OS === 'web') return;

            // Allow debugging to see exactly what URL the app receives
            console.log("Deep Link Received:", url);

            try {
                // Parse tokens from URL
                // Supabase Auth usually returns: ...#access_token=...&refresh_token=...&...

                // 1. Extract the part after # or ?
                const hashIndex = url.indexOf('#');
                const queryIndex = url.indexOf('?');

                let paramsString = '';
                if (hashIndex !== -1) {
                    paramsString = url.substring(hashIndex + 1);
                } else if (queryIndex !== -1) {
                    paramsString = url.substring(queryIndex + 1);
                }

                if (!paramsString) return;

                // 2. Parse key-values manually to be safe
                const params = new URLSearchParams(paramsString);
                const accessToken = params.get('access_token');
                const refreshToken = params.get('refresh_token');
                const errorDesc = params.get('error_description');

                if (errorDesc) {
                    Alert.alert("Auth Error", errorDesc);
                    return;
                }

                if (accessToken && refreshToken) {
                    console.log("Attempting to set session from deep link...");
                    const { data, error } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken,
                    });

                    if (error) {
                        console.error("Supabase setSession Error:", error);
                        Alert.alert("Session Error", error.message);
                    } else {
                        console.log("Supabase setSession Success:", data.session?.user?.email);
                        // Success! The AuthStateListener will pick this up and redirect
                    }
                } else {
                    console.warn("Deep Link missing tokens:", { accessToken: !!accessToken, refreshToken: !!refreshToken });
                }
            } catch (e: any) {
                console.error("Deep Link Parsing Error:", e);
                Alert.alert("Link Parse Error", e.message);
            }
        };

        // Handle Cold Start (App launched from link)
        Linking.getInitialURL().then((url) => {
            if (url) handleDeepLink(url);
        });

        // Handle Warm Start (App already running)
        const sub = Linking.addEventListener('url', (event) => handleDeepLink(event.url));
        return () => sub.remove();
    }, []);

    const signInWithGoogle = async () => {
        try {
            if (Platform.OS === 'web') {
                // Web Flow: Let Supabase handle the redirect
                const { error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
                    },
                });
                if (error) throw error;
            } else {
                // Native Flow: Use Expo Web Browser
                const redirectUrl = Linking.createURL('/google-auth');

                const { data, error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: redirectUrl,
                        skipBrowserRedirect: true,
                    },
                });

                if (error) throw error;

                if (data?.url) {
                    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

                    if (result.type === 'success' && result.url) {
                        const url = result.url;
                        const hashIndex = url.indexOf('#');
                        const queryIndex = url.indexOf('?');
                        let paramsString = '';
                        if (hashIndex !== -1) paramsString = url.substring(hashIndex + 1);
                        else if (queryIndex !== -1) paramsString = url.substring(queryIndex + 1);

                        const params = new URLSearchParams(paramsString);
                        const accessToken = params.get('access_token');
                        const refreshToken = params.get('refresh_token');

                        if (accessToken && refreshToken) {
                            const { error: sessionError } = await supabase.auth.setSession({
                                access_token: accessToken,
                                refresh_token: refreshToken,
                            });
                            if (sessionError) throw sessionError;
                        }
                    }
                }
            }
        } catch (error: any) {
            Alert.alert("Sign In Error", error.message);
        }
    };

    const signInWithEmail = async (email: string, password: string) => {
        setLoading(true);
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            if (error) throw error;
        } catch (error: any) {
            Alert.alert("Sign In Error", error.message);
            throw error; // Re-throw to let caller know it failed
        } finally {
            setLoading(false);
        }
    };

    const signUpWithEmail = async (email: string, password: string) => {
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
            });
            if (error) throw error;

            if (data?.session) {
                // Session created immediately (auto-confirm disabled or not required)
                setSession(data.session);
                setUser(data.user);
            } else if (data?.user && !data.session) {
                // User created but waiting for confirmation
                Alert.alert("Check your email", "We've sent you a confirmation link to complete your registration.");
            }
        } catch (error: any) {
            Alert.alert("Sign Up Error", error.message);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const signOut = async () => {
        setLoading(true); // Start loading to prevent race conditions in UI checks
        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.error("Sign Out Error:", error.message);
                // Alert.alert("Sign Out Error", error.message);
            }
            // Explicitly clear state
            setSession(null);
            setUser(null);
        } catch (e: any) {
            console.error("Sign Out Exception:", e);
            Alert.alert("Sign Out Exception", e.message);
        } finally {
            setLoading(false);
        }
    };

    const value = {
        session,
        user,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
