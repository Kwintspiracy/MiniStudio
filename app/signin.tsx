import React, { useState, useEffect, useRef } from 'react';
import { EyeIcon, EyeSlashIcon } from '../src/components/Icons';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Platform,
  Linking,
  KeyboardAvoidingView,
  ScrollView
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '../src/context/AuthContext';
import { colors, fontFamily } from '../src/theme';
import { AppModal } from '../src/components/AppModal';

// Google Icon Component
const GoogleIcon = ({ size = 15 }: { size?: number }) => (
  <Svg width={size} height={size + 1} viewBox="0 0 24 24">
    <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill={colors.social.googleBlue} />
    <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill={colors.social.googleGreen} />
    <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill={colors.social.googleYellow} />
    <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill={colors.social.googleRed} />
  </Svg>
);

// Apple Icon Component
const AppleIcon = ({ size = 16, color = colors.palette.white }: { size?: number; color?: string }) => (
  <Svg width={(size * 13.02) / 16} height={size} viewBox="0 0 14 17">
    <Path
      d="M13.0217 13.0312C12.7867 13.6006 12.4983 14.1233 12.1571 14.6001C11.6845 15.2595 11.2927 15.7163 10.984 15.9702C10.5058 16.3949 9.99463 16.6127 9.44912 16.6257C9.05577 16.6257 8.57824 16.5104 8.01967 16.2768C7.45949 16.0441 6.94343 15.9287 6.46996 15.9287C5.97365 15.9287 5.44285 16.0441 4.87652 16.2768C4.30946 16.5104 3.85466 16.6322 3.50964 16.6449C2.98644 16.6693 2.46293 16.4451 1.93869 15.9702C1.60561 15.6944 1.19643 15.2215 0.711841 14.5515C0.191772 13.8351 -0.238879 13.0054 -0.580148 12.0617C-0.945361 11.0412 -1.12836 10.0528 -1.12836 9.09613C-1.12836 7.99992 -0.890548 7.05212 -0.414282 6.25465C0.00919588 5.53911 0.565239 4.97586 1.25627 4.5638C1.94729 4.15173 2.69452 3.94188 3.49991 3.92896C3.91817 3.92896 4.46368 4.06149 5.13892 4.32291C5.81247 4.58502 6.24453 4.71755 6.43338 4.71755C6.57302 4.71755 7.05363 4.56312 7.87337 4.25502C8.64823 3.97016 9.29897 3.85112 9.82788 3.89499C11.2171 4.00771 12.2574 4.55826 12.9447 5.55013C11.7059 6.31172 11.0931 7.38117 11.1059 8.7543C11.1179 9.83398 11.5101 10.7398 12.28 11.4679C12.6192 11.7902 12.9992 12.042 13.4234 12.2241C13.2979 12.5138 13.1656 12.7911 13.0217 13.0312ZM9.92146 0.340287C9.92146 1.18591 9.61256 1.97636 8.99656 2.70845C8.25375 3.57972 7.35301 4.08318 6.37593 4.00328C6.36289 3.90411 6.35539 3.79987 6.35539 3.69038C6.35539 2.87913 6.70967 2.01201 7.33824 1.29961C7.65199 0.938994 8.05365 0.641058 8.54289 0.405807C9.03106 0.173963 9.49428 0.0455933 9.93164 0.0215454C9.9447 0.128123 9.92146 0.234678 9.92146 0.340287Z"
      fill={color}
      transform="translate(1.12836, 0)"
    />
  </Svg>
);

export default function SignInScreen() {
  const { session, loading, signInWithGoogle, signInWithEmail, signUpWithEmail, resendConfirmationEmail, resetPasswordForEmail, isAnonymous } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasNavigated = useRef(false);

  // Modal State
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

  // Monitor Session and navigate appropriately - but ONLY for authenticated users, not anonymous
  useEffect(() => {
    if (!loading && session && !isAnonymous && !hasNavigated.current) {
      hasNavigated.current = true;
      router.replace('/(studio)');
    }
  }, [session, loading, isAnonymous]);

  const handleSignIn = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await signInWithEmail(email, password);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendEmail = async () => {
     if (!email) return;
     // Don't clear error, just do action
     setIsSubmitting(true);
     await resendConfirmationEmail(email);
     setIsSubmitting(false);
  };

  const handleCreateAccount = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await signUpWithEmail(email, password);
      // If we get here without error, and no session is set (handled by useEffect), 
      // it likely means email confirmation is required.
      if (!session) {
         // Use a more visible alert for this critical step
         showModal(
           "Account Created", 
           "We've sent a confirmation email to " + email + ". (Note: If this email is already registered, you may not receive a new confirmation link).",
           'default',
           { label: "OK", onPress: hideModal }
         );
         setError(null);
      }
    } catch (err: any) {
      setError(err.message || 'Account creation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      showModal("Email Required", "Please enter your email address to reset your password.", 'error');
      return;
    }
    
    try {
        await resetPasswordForEmail(email);
    } catch (e) {
        // Error handled in context
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || 'Google sign in failed');
    }
  };

  const handleAppleSignIn = async () => {
    setError('Apple Sign In coming soon');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <ActivityIndicator size="large" color={colors.button.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* Back Button */}
      <TouchableOpacity 
        onPress={() => router.back()} 
        style={styles.backButton}
        hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
      >
        <Text style={styles.backButtonText}>‹ Back</Text>
      </TouchableOpacity>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Main Content Area - Frame 1998 */}
          <View style={styles.mainContent}>
            {/* Header Section - Frame 1993 */}
            <View style={styles.headerSection}>
              <Text style={styles.headerTitle}>Sign in</Text>
              <Text style={styles.headerSubtitle}>Enter your credentials or create an account</Text>
            </View>

            {/* Form Section - Frame 1992 */}
            <View style={styles.formSection}>
              {/* Inputs and Sign In - Frame 1999 */}
              <View style={styles.formGroup}>
                {/* Input Fields - Frame 1994 */}
                <View style={styles.inputGroup}>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Email"
                    placeholderTextColor={colors.text.secondary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    accessibilityLabel="Email address"
                    accessibilityHint="Enter your email address"
                    style={[styles.input, email.length > 0 && { color: colors.text.primary }]}
                  />
                  <View style={styles.passwordContainer}>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Password"
                      placeholderTextColor={colors.text.secondary}
                      secureTextEntry={!isPasswordVisible}
                      accessibilityLabel="Password"
                      accessibilityHint="Enter your password"
                      style={[styles.input, styles.passwordInput, password.length > 0 && { color: colors.text.primary }]}
                    />
                    <TouchableOpacity 
                      onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                      style={styles.eyeIcon}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      {isPasswordVisible ? (
                         <EyeSlashIcon size={20} color={colors.text.secondary} />
                      ) : (
                         <EyeIcon size={20} color={colors.text.secondary} />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {error && (
                    <View style={{ gap: 8 }}>
                        <Text style={styles.errorText}>{error}</Text>
                        {error.includes("verify your email") && (
                            <TouchableOpacity onPress={handleResendEmail}>
                                <Text style={[styles.errorText, { textDecorationLine: 'underline', fontWeight: '600' }]}>
                                    Resend Confirmation Email
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* Sign In Button */}
                <TouchableOpacity
                  onPress={handleSignIn}
                  disabled={isSubmitting}
                  accessibilityLabel="Sign in"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isSubmitting }}
                  accessibilityHint="Signs you in with email and password"
                  style={styles.primaryButton}
                  activeOpacity={0.8}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={colors.text.primary} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Sign In</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Alternatively Text */}
              <Text style={styles.alternativelyText}>Alternatively</Text>

              {/* Social Buttons - Frame 1995 */}
              <View style={styles.socialButtonsGroup}>
                {/* Google Sign In */}
                <TouchableOpacity
                  onPress={handleGoogleSignIn}
                  accessibilityLabel="Continue with Google"
                  accessibilityRole="button"
                  accessibilityHint="Signs you in using your Google account"
                  style={styles.googleButton}
                  activeOpacity={0.9}
                >
                  <GoogleIcon size={15} />
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </TouchableOpacity>

                {/* Apple Sign In */}
                <TouchableOpacity
                  onPress={handleAppleSignIn}
                  accessibilityLabel="Continue with Apple"
                  accessibilityRole="button"
                  accessibilityHint="Signs you in using your Apple account"
                  style={styles.appleButton}
                  activeOpacity={0.9}
                >
                  <AppleIcon size={16} color={colors.text.primary} />
                  <Text style={styles.appleButtonText}>Continue with Apple</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Bottom Section - Frame 1996 */}
          <View style={styles.bottomSection}>
            {/* Frame 1997 */}
            <View style={styles.bottomContent}>
              {/* Create Account Button */}
              <TouchableOpacity
                onPress={() => router.push('/signup')}
                accessibilityLabel="Create an account"
                accessibilityRole="button"
                accessibilityHint="Navigates to sign up screen"
                style={styles.createAccountButton}
                activeOpacity={0.8}
              >
                <Text style={styles.createAccountButtonText}>Create an Account</Text>
              </TouchableOpacity>

              {/* Forgot Password */}
              <TouchableOpacity
                onPress={handleForgotPassword}
                accessibilityLabel="Forgot password"
                accessibilityRole="link"
                accessibilityHint="Opens email to request password reset"
                style={styles.forgotPasswordButton}
                activeOpacity={0.7}
              >
                <Text style={styles.forgotPasswordText}>Forgot your password?</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 16,
    zIndex: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  backButtonText: {
    color: colors.accent.blue,
    fontSize: 17,
    fontFamily: fontFamily.primary,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },

  // Main Content - Frame 1998: column, center, gap=32px, padding=0 40px
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
    paddingHorizontal: 40,
    paddingTop: 58, // Account for status bar
  },

  // Header Section - Frame 1993: column, justifyContent=center, stretch, gap=6px
  headerSection: {
    width: '100%',
    justifyContent: 'center',
    gap: 6,
  },
  headerTitle: {
    fontFamily: fontFamily.primary,
    fontSize: 32,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.41,
    lineHeight: 38,
    textAlign: 'left',
  },
  headerSubtitle: {
    fontFamily: fontFamily.primary,
    fontSize: 16,
    fontWeight: '400',
    color: colors.text.secondary,
    letterSpacing: -0.41,
    lineHeight: 16,
    textAlign: 'left',
  },

  // Form Section - Frame 1992: column, alignItems=center, stretch, gap=24px
  formSection: {
    width: '100%',
    alignItems: 'center',
    gap: 24,
  },

  // Form Group - Frame 2010: column, gap=16px, stretch
  formGroup: {
    width: '100%',
    gap: 16,
  },

  // Input Group - Frame 2009: column, gap=8px, stretch
  inputGroup: {
    width: '100%',
    gap: 8,
  },
  // Input - padding: 16px 12px, stretch, border 2px
  input: {
    width: '100%',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border.subtle,
    backgroundColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.muted,
    fontFamily: fontFamily.primary,
    lineHeight: 16,
  },
  errorText: {
    color: colors.accent.red,
    fontSize: 12,
    fontFamily: fontFamily.primary,
    marginTop: -10,
  },

  // Primary Button (Sign In)
  primaryButton: {
    width: '100%',
    height: 48,
    backgroundColor: colors.button.primary,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: fontFamily.primary,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    letterSpacing: -0.41,
  },

  // Alternatively Text - stretch, centered
  alternativelyText: {
    width: '100%',
    fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'Roboto',
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
    letterSpacing: -0.41,
    textAlign: 'center',
  },

  // Social Buttons - Frame 2007: column, gap=8px, stretch
  socialButtonsGroup: {
    width: '100%',
    gap: 8,
  },
  googleButton: {
    width: '100%',
    backgroundColor: colors.button.white,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  googleButtonText: {
    fontFamily: fontFamily.primary,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.dark,
    letterSpacing: -0.41,
    textAlign: 'center',
  },
  appleButton: {
    width: '100%',
    backgroundColor: colors.button.dark,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  appleButtonText: {
    fontFamily: fontFamily.primary,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    letterSpacing: -0.41,
  },

  // Bottom Section - Frame 1996: column, center, gap=16px, padding=24px 40px 40px
  bottomSection: {
    paddingHorizontal: 40,
    paddingTop: 24,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 16,
  },

  // Bottom Content - Frame 1997: column, center, stretch, gap=16px
  bottomContent: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },

  // Create Account Button - stretch, h=48
  createAccountButton: {
    width: '100%',
    height: 48,
    backgroundColor: colors.button.dark,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createAccountButtonText: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'Roboto',
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
    letterSpacing: -0.41,
  },

  // Forgot Password Button - hug content
  forgotPasswordButton: {
    backgroundColor: colors.button.secondary,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotPasswordText: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'Roboto',
    fontSize: 13,
    fontWeight: '300',
    color: colors.text.primary,
    letterSpacing: -0.41,
    lineHeight: 14,
  },
  passwordContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    paddingRight: 40, // Space for the eye icon
  },
  eyeIcon: {
    position: 'absolute',
    right: 12,
  },
});
