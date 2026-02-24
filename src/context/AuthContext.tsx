import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import Purchases from 'react-native-purchases';
import { AppModal } from '../components/AppModal';
import { setRecoveryToken, getRecoveryToken, deleteRecoveryToken } from '../services/storageService';

// Ensure WebBrowser works correctly on the web
WebBrowser.maybeCompleteAuthSession();

interface AuthContextType {
    session: Session | null;
    user: User | null;
    loading: boolean;
    signInWithGoogle: () => Promise<void>;
    signInWithApple: () => Promise<void>;
    signInWithEmail: (email: string, password: string) => Promise<void>;
    signUpWithEmail: (email: string, password: string) => Promise<void>;
    resendConfirmationEmail: (email: string) => Promise<void>;
    resetPasswordForEmail: (email: string) => Promise<void>;
    signOut: () => Promise<void>;
    signInAnonymously: () => Promise<void>;
    resetGuestSession: () => Promise<void>;
    isAnonymous: boolean;
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    loading: true,
    signInWithGoogle: async () => { },
    signInWithApple: async () => { },
    signInWithEmail: async () => { },
    signUpWithEmail: async () => { },
    resendConfirmationEmail: async () => { },
    resetPasswordForEmail: async () => { },
    signOut: async () => { },
    signInAnonymously: async () => { },
    resetGuestSession: async () => { },
    isAnonymous: false,
});

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const lastAuthUrlRef = useRef<string | null>(null);

    const [modalConfig, setModalConfig] = useState<{
        visible: boolean;
        title: string;
        message: string;
        type?: 'default' | 'error' | 'critical';
        primaryAction?: { label: string; onPress: () => void };
        secondaryAction?: { label: string; onPress: () => void };
    }>({ visible: false, title: '', message: '' });

    const showModal = (
        title: string, 
        message: string, 
        type: 'default' | 'error' | 'critical' = 'default',
        primaryAction?: { label: string; onPress: () => void },
        secondaryAction?: { label: string; onPress: () => void }
    ) => {
        setModalConfig({ visible: true, title, message, type, primaryAction, secondaryAction });
    };

    const hideModal = () => {
        setModalConfig(prev => ({ ...prev, visible: false }));
    };

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
                
                let currentSession = session;

                // 2. If no session, try recovery from Keychain (iOS survival)
                if (!currentSession && Platform.OS !== 'web') {
                    const recoveryToken = await getRecoveryToken();
                    if (recoveryToken) {
                        if (__DEV__) console.log("[AUTH] Attempting recovery from Keychain...");
                        const { data: recoveryData, error: recoveryError } = await supabase.auth.setSession({
                            refresh_token: recoveryToken,
                            access_token: '', // setSession handles missing access_token with refresh_token
                        });
                        
                        if (!recoveryError && recoveryData.session) {
                            currentSession = recoveryData.session;
                        } else {
                            if (__DEV__) console.log("[AUTH] Recovery failed");
                            await deleteRecoveryToken();
                        }
                    }
                }

                // 3. If STILL no session, sign in anonymously (Guest Flow)
                if (!currentSession) {
                    const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
                    if (anonError) throw anonError;
                    currentSession = anonData.session;
                    
                    // Save recovery token for future reinstalls
                    if (currentSession?.refresh_token && Platform.OS !== 'web') {
                        await setRecoveryToken(currentSession.refresh_token);
                    }
                }

                setSession(currentSession);
                setUser(currentSession?.user ?? null);
                
                // Link RevenueCat if user exists
                if (currentSession?.user?.id && Platform.OS !== 'web') {
                    try {
                        await Purchases.logIn(currentSession.user.id);
                    } catch (e) {
                         // Ignore RC errors in dev/expo-go
                         if (__DEV__) console.log("RC LogIn skipped (likely Expo Go)");
                    }
                }
            } catch (error: any) {
                if (__DEV__) console.warn("Auth check failed:", error);

                // If Refresh Token is invalid, we MUST clear the session to prevent infinite loops
                if (error?.message?.includes('Refresh Token Not Found') ||
                    error?.message?.includes('Invalid Refresh Token')) {
                    if (__DEV__) console.log("Clearing invalid session (local only)...");
                    // Use { scope: 'local' } to only clear local storage, not hit the server.
                    // This prevents "Auth session missing!" errors during subsequent signOut calls.
                    await supabase.auth.signOut({ scope: 'local' });
                    setSession(null);
                    setUser(null);
                    if (Platform.OS !== 'web') await deleteRecoveryToken();
                }
            } finally {
                setLoading(false);
            }
        };

        initSession();

        // 2. Auth State Listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === ('TOKEN_REFRESH_NOT_UPDATED' as any)) {
                if (__DEV__) console.warn("Token refresh failed, forcing sign out");
                setSession(null);
                setUser(null);
                setLoading(false);
                return;
            }

            if (event === 'PASSWORD_RECOVERY') {
                if (__DEV__) console.log("Password Recovery Event detected, redirecting...");
                // Use a timeout to ensure navigation occurs after the session is set
                setTimeout(() => {
                     // We use the imported 'router' from expo-router which acts as a global singleton
                     // This is safe to use in event callbacks
                     try {
                         const { router } = require('expo-router');
                         router.replace('/update-password');
                     } catch (e) {
                         console.error("Navigation failed", e);
                     }
                }, 500);
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

            // Update recovery token if anonymous
            const isAnon = session?.user?.is_anonymous || session?.user?.app_metadata?.provider === 'anonymous' || (session?.user && !session?.user?.email);
            
            if (isAnon && session?.refresh_token && Platform.OS !== 'web') {
                setRecoveryToken(session.refresh_token);
            } else if (session && !isAnon && Platform.OS !== 'web') {
                // If they signed in with a real account, we don't necessarily want to 
                // use the real account's refresh token as a "guest recovery" key,
                // but we might want to keep it if we want real accounts to survive uninstalls too.
                // However, the user specifically asked about the 10 credits free tier.
                // Let's keep it simple: only track anonymous sessions in the guest recovery key.
                deleteRecoveryToken();
            }

            // Handle RevenueCat Login/Logout on Auth Change
            if (Platform.OS !== 'web') {
                try {
                    if (session?.user?.id) {
                        await Purchases.logIn(session.user.id);
                    } else {
                         const customerInfo = await Purchases.getCustomerInfo();
                         if (!customerInfo.originalAppUserId.startsWith("$RCAnonymousID")) {
                             await Purchases.logOut();
                         }
                    }
                } catch (e) {
                     // Ignore RC errors
                     if (__DEV__) console.log("RC Auth Sync skipped");
                }
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    // 3. Shared Auth Result Handler
    const handleAuthResult = async (url: string | null) => {
        if (!url) return;

        // On Web, Supabase handles the session via detectSessionInUrl: true
        if (Platform.OS === 'web') return;

        if (__DEV__) console.log("[AUTH] Handling result URL:", url);

        // Deduplication Check
        if (lastAuthUrlRef.current === url) {
            return;
        }
        lastAuthUrlRef.current = url;

        try {
            // 1. Parse URL to handle both hash and query params
            const parsed = Linking.parse(url);
            const { queryParams } = parsed;

            // 2. Auth fragments often come in via the hash part (#), which Linking.parse sometimes misses 
            // depending on the platform/launcher. Handle manually as fallback.
            let params: any = queryParams || {};
            if (!params.access_token && url.includes('#')) {
                const fragment = url.split('#')[1];
                const hashParams = new URLSearchParams(fragment);
                params.access_token = hashParams.get('access_token');
                params.refresh_token = hashParams.get('refresh_token');
                params.error_description = hashParams.get('error_description');
            }

            const accessToken = params.access_token;
            const refreshToken = params.refresh_token;
            const errorDesc = params.error_description || params.error;

            if (__DEV__) {
                console.log("[AUTH] Token Extraction Details:", {
                    hasAccessToken: !!accessToken,
                    hasRefreshToken: !!refreshToken,
                    error: errorDesc
                });
            }

            if (errorDesc) {
                showModal("Auth Error", errorDesc, 'error');
                return;
            }

            if (accessToken && refreshToken) {
                if (__DEV__) console.log("[AUTH] Final Attempt: setSession...");
                const { data, error } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken,
                });

                if (error) {
                    if (__DEV__) console.error("[AUTH] setSession Failed:", error.message);
                    if (!error.message.includes('signature is invalid')) {
                        showModal("Session Error", error.message, 'error');
                    }
                }
            } else {
                if (__DEV__) console.log("[AUTH] No tokens found in this URL.");
            }
        } catch (e: any) {
            if (__DEV__) console.error("[AUTH] Extraction Exception:", e);
        }
    };

    // 4. Deep Link Listener (Critical for OAuth)
    useEffect(() => {
        // Handle Cold Start (App launched from link)
        Linking.getInitialURL().then((url) => {
            if (url) {
                handleAuthResult(url);
            }
        });

        // Handle Warm Start (App already running)
        const sub = Linking.addEventListener('url', (event) => {
            handleAuthResult(event.url);
        });
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
                // Native Flow: Use Expo Auth Session
                // Native Flow: Use Expo Auth Session to handle Expo Go vs Standalone differences
                // Native Flow: Use Explicit Scheme Redirect
                const scheme = Constants.expoConfig?.scheme;
                const redirectUrl = `${scheme}://google-auth`;

                // Dismiss any stale sessions to prevent "Another web browser is already open" errors
                try {
                    await WebBrowser.dismissAuthSession();
                } catch (e) {
                    // Ignore if no session is open
                }

                if (__DEV__) {
                    console.log("--- AUTH DEBUG START ---");
                    console.log("[AUTH] Explicit Redirect URL Generated:", redirectUrl);
                    console.log("[AUTH] Using Scheme:", scheme);
                    console.log("--- AUTH DEBUG END ---");
                }

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
                        handleAuthResult(result.url);
                    }
                }
            }
        } catch (error: any) {
            showModal("Sign In Error", error.message, 'error');
        }
    };

    const signInWithApple = async () => {
        try {
            if (Platform.OS === 'ios') {
                const credential = await AppleAuthentication.signInAsync({
                    requestedScopes: [
                        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                        AppleAuthentication.AppleAuthenticationScope.EMAIL,
                    ],
                });

                if (credential.identityToken) {
                    const { data, error } = await supabase.auth.signInWithIdToken({
                        provider: 'apple',
                        token: credential.identityToken,
                    });
                    if (error) throw error;
                    if (__DEV__) console.log("[AUTH] Apple Sign In (Native) success");
                } else {
                    throw new Error('No identity token found');
                }
            } else {
                // For Android/Web, use OAuth flow
                const scheme = Constants.expoConfig?.scheme;
                const redirectUrl = Platform.OS === 'web' 
                    ? (typeof window !== 'undefined' ? window.location.origin : undefined)
                    : `${scheme}://auth-callback`;

                const { data, error } = await supabase.auth.signInWithOAuth({
                    provider: 'apple',
                    options: {
                        redirectTo: redirectUrl,
                        skipBrowserRedirect: Platform.OS !== 'web',
                    },
                });

                if (error) throw error;

                if (data?.url && Platform.OS !== 'web') {
                    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl!);
                    if (result.type === 'success' && result.url) {
                        handleAuthResult(result.url);
                    }
                }
            }
        } catch (error: any) {
            // Only show error if the user didn't cancel the request
            if (error.code !== 'ERR_REQUEST_CANCELED' && error.code !== '1001') {
                showModal("Apple Sign In Error", error.message, 'error');
            }
        }
    };

    const signInWithEmail = async (email: string, password: string) => {
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });
            
            if (error) {
                 if (error.message.includes("Email not confirmed")) {
                     throw new Error("Please verify your email address before signing in. Check your inbox (and spam folder) for the confirmation link.");
                 }
                 throw error;
            }
        } catch (error: any) {
            // Let the caller handle the UI alert so we can position it better or style it
            throw error; 
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
                // Add redirect option to ensure deep linking works if configured
                options: {
                    emailRedirectTo: Constants.expoConfig?.scheme 
                        ? `${Constants.expoConfig.scheme}://auth-callback`
                        : undefined
                }
            });
            
            if (error) throw error;

            if (data?.session) {
                // Session created immediately (auto-confirm disabled or not required)
                setSession(data.session);
                setUser(data.user);
            } else if (data?.user && !data.session) {
                // User created but waiting for confirmation
                // We throw a specific "success" error to let the UI know it needs to show a message
                // Or we can return a specific status. For now, let's just let it resolve successfully 
                // and let the UI check for session vs no session.
                return; 
            }
        } catch (error: any) {
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const resendConfirmationEmail = async (email: string) => {
        setLoading(true);
        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: email,
                options: {
                    emailRedirectTo: Constants.expoConfig?.scheme 
                        ? `${Constants.expoConfig.scheme}://auth-callback`
                        : undefined
                }
            });
            if (error) throw error;
            showModal("Email Sent", "We sent another confirmation email to " + email, 'default');
        } catch (error: any) {
             // Rate limit errors are common here
            showModal("Request Failed", error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const resetPasswordForEmail = async (email: string) => {
        setLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: Constants.expoConfig?.scheme 
                        ? `${Constants.expoConfig.scheme}://reset-callback`
                        : undefined
            });
            
            if (error) throw error;
            
            showModal(
                "Check your email", 
                "We've sent a password reset link to " + email,
                'default'
            );
        } catch (error: any) {
            showModal("Reset Failed", error.message, 'error');
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const signOut = async () => {
        setLoading(true); // Start loading to prevent race conditions in UI checks
        try {
            // Check if we even have a session to sign out from
            const { error } = await supabase.auth.signOut();

            if (error) {
                // Ignore "Auth session missing!" as it means we are already signed out
                if (error.message.includes("Auth session missing!")) {
                    if (__DEV__) console.warn("Supabase SignOut: Session was already missing.");
                } else {
                    if (__DEV__) console.error("Sign Out Error:", error.message);
                }
            }
        } catch (e: any) {
            // Also catch unexpected exceptions
            if (e?.message?.includes("Auth session missing!")) {
                if (__DEV__) console.warn("Supabase SignOut Exception: Session was already missing.");
            } else {
                if (__DEV__) console.error("Sign Out Exception:", e);
                showModal("Sign Out Exception", e.message, 'error');
            }
        } finally {
            // Always clear local state
            setSession(null);
            setUser(null);
            if (Platform.OS !== 'web') {
                await deleteRecoveryToken();
            }

            // RE-SIGN IN ANONYMOUSLY if they sign out
            // This ensures they revert to guest state immediately
            const { data: anonData } = await supabase.auth.signInAnonymously();
            if (anonData.session) {
                setSession(anonData.session);
                setUser(anonData.user);
                if (anonData.session.refresh_token && Platform.OS !== 'web') {
                    await setRecoveryToken(anonData.session.refresh_token);
                }
            }

            setLoading(false);
            if (Platform.OS !== 'web') {
                try {
                    const customerInfo = await Purchases.getCustomerInfo();
                    // only log out if we are NOT already anonymous (meaning we were logged in)
                    if (!customerInfo.originalAppUserId.startsWith("$RCAnonymousID")) {
                         await Purchases.logOut();
                    }
                } catch (e) {
                     if (__DEV__) console.log("RC LogOut skipped");
                }
            }
        }
    };

    const signInAnonymously = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signInAnonymously();
            if (error) throw error;
            setSession(data.session);
            setUser(data.user);
            if (data.session?.refresh_token && Platform.OS !== 'web') {
                await setRecoveryToken(data.session.refresh_token);
            }
        } catch (error: any) {
            showModal("Sign In Error", error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const resetGuestSession = async () => {
        setLoading(true);
        try {
            if (__DEV__) console.log("[AUTH] Resetting guest session...");
            
            // 1. Local Sign Out (faster, no network error risk)
            await supabase.auth.signOut({ scope: 'local' });
            
            // 2. Clear local storage
            if (Platform.OS !== 'web') {
                await deleteRecoveryToken();
            }

            // 3. Clear local state
            setSession(null);
            setUser(null);

            // Small delay to let providers unmount/settle
            await new Promise(resolve => setTimeout(resolve, 500));

            // 4. Force a fresh anonymous sign in
            const { data, error } = await supabase.auth.signInAnonymously();
            if (error) throw error;
            
            if (data.session) {
                setSession(data.session);
                setUser(data.user);
                if (data.session.refresh_token && Platform.OS !== 'web') {
                    await setRecoveryToken(data.session.refresh_token);
                }
            }
            
            showModal("Session Reset", "You are now using a fresh guest account with new credits.", 'default');
        } catch (error: any) {
            console.error("[AUTH] Reset error:", error);
            showModal("Reset Failed", error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const isAnonymous = !!(user?.is_anonymous || user?.app_metadata?.provider === 'anonymous' || (user && !user.email));

    const value = {
        session,
        user,
        loading,
        signInWithGoogle,
        signInWithApple,
        signInWithEmail,
        signUpWithEmail,
        resendConfirmationEmail,
        resetPasswordForEmail,
        signOut,
        signInAnonymously,
        resetGuestSession,
        isAnonymous,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
            <AppModal
                visible={modalConfig.visible}
                onClose={hideModal}
                title={modalConfig.title}
                message={modalConfig.message}
                type={modalConfig.type}
                primaryAction={modalConfig.primaryAction ? {
                    ...modalConfig.primaryAction,
                    onPress: () => {
                        modalConfig.primaryAction?.onPress();
                        hideModal();
                    }
                } : { label: "OK", onPress: hideModal }}
                secondaryAction={modalConfig.secondaryAction ? {
                    ...modalConfig.secondaryAction,
                    onPress: () => {
                        modalConfig.secondaryAction?.onPress();
                        hideModal();
                    }
                } : undefined}
            />
        </AuthContext.Provider>
    );
}
