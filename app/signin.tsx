import React, { useState, useEffect } from 'react';
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
  Dimensions,
  Image
} from 'react-native';
import { router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '../src/context/AuthContext';
import { hasApiKey } from '../src/services/storageService';

// Get screen dimensions
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Design System Colors from Figma
const colors = {
  background: {
    primary: '#1E1E2B',
    secondary: '#12121F',
    tertiary: 'rgba(255, 255, 255, 0.05)',
  },
  text: {
    primary: '#F4F4F4',
    secondary: 'rgba(244, 244, 244, 0.4)',
    dark: '#1D1D1D',
  },
  button: {
    primary: '#0058DB',
    danger: '#FA0439',
    secondary: 'rgba(255, 255, 255, 0.05)',
    dark: 'rgba(0, 0, 0, 0.3)',
    white: '#F4F4F4',
  },
  accent: {
    blue: '#518CFF',
    red: '#FA0439',
  },
  border: {
    subtle: 'rgba(255, 255, 255, 0.05)',
  },
};

/**
 * IMAGE PLACEHOLDERS
 * 
 * Download these images and place them in assets/icons/:
 * 
 * 1. Google Icon (15x16px):
 *    https://www.figma.com/file/wovATQaYDmNY2GZ84UKi4e/minipainter?node-id=26:6247
 *    Save as: assets/icons/google-icon.png
 * 
 * 2. Apple Icon (13x16px):
 *    https://www.figma.com/file/wovATQaYDmNY2GZ84UKi4e/minipainter?node-id=26:6301
 *    Save as: assets/icons/apple-icon.png
 */

// Google Icon Component (SVG fallback)
const GoogleIcon = ({ size = 15 }: { size?: number }) => (
  <Svg width={size} height={size + 1} viewBox="0 0 24 24">
    <Path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <Path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <Path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <Path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </Svg>
);

// Apple Icon Component (SVG fallback)
const AppleIcon = ({ size = 16, color = '#F4F4F4' }: { size?: number; color?: string }) => (
  <Svg width={(size * 13.02) / 16} height={size} viewBox="0 0 14 17">
    <Path
      d="M13.0217 13.0312C12.7867 13.6006 12.4983 14.1233 12.1571 14.6001C11.6845 15.2595 11.2927 15.7163 10.984 15.9702C10.5058 16.3949 9.99463 16.6127 9.44912 16.6257C9.05577 16.6257 8.57824 16.5104 8.01967 16.2768C7.45949 16.0441 6.94343 15.9287 6.46996 15.9287C5.97365 15.9287 5.44285 16.0441 4.87652 16.2768C4.30946 16.5104 3.85466 16.6322 3.50964 16.6449C2.98644 16.6693 2.46293 16.4451 1.93869 15.9702C1.60561 15.6944 1.19643 15.2215 0.711841 14.5515C0.191772 13.8351 -0.238879 13.0054 -0.580148 12.0617C-0.945361 11.0412 -1.12836 10.0528 -1.12836 9.09613C-1.12836 7.99992 -0.890548 7.05212 -0.414282 6.25465C0.00919588 5.53911 0.565239 4.97586 1.25627 4.5638C1.94729 4.15173 2.69452 3.94188 3.49991 3.92896C3.91817 3.92896 4.46368 4.06149 5.13892 4.32291C5.81247 4.58502 6.24453 4.71755 6.43338 4.71755C6.57302 4.71755 7.05363 4.56312 7.87337 4.25502C8.64823 3.97016 9.29897 3.85112 9.82788 3.89499C11.2171 4.00771 12.2574 4.55826 12.9447 5.55013C11.7059 6.31172 11.0931 7.38117 11.1059 8.7543C11.1179 9.83398 11.5101 10.7398 12.28 11.4679C12.6192 11.7902 12.9992 12.042 13.4234 12.2241C13.2979 12.5138 13.1656 12.7911 13.0217 13.0312ZM9.92146 0.340287C9.92146 1.18591 9.61256 1.97636 8.99656 2.70845C8.25375 3.57972 7.35301 4.08318 6.37593 4.00328C6.36289 3.90411 6.35539 3.79987 6.35539 3.69038C6.35539 2.87913 6.70967 2.01201 7.33824 1.29961C7.65199 0.938994 8.05365 0.641058 8.54289 0.405807C9.03106 0.173963 9.49428 0.0455933 9.93164 0.0215454C9.9447 0.128123 9.92146 0.234678 9.92146 0.340287Z"
      fill={color}
      transform="translate(1.12836, 0)"
    />
  </Svg>
);

export default function SignInScreen() {
  const { session, loading, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Monitor Session and Key Status
  useEffect(() => {
    if (!loading && session) {
      checkApiKeyAndNavigate();
    }
  }, [session, loading]);

  const checkApiKeyAndNavigate = async () => {
    try {
      const hasKey = await hasApiKey();
      if (hasKey) {
        router.replace('/(studio)');
      } else {
        router.replace('/');
      }
    } catch (err) {
      console.error('Error checking API key:', err);
    }
  };

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

  const handleCreateAccount = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await signUpWithEmail(email, password);
    } catch (err: any) {
      setError(err.message || 'Account creation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = () => {
    Linking.openURL('mailto:support@ministudio.app?subject=Password%20Reset');
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
      <View style={[styles.container, styles.centered]}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <ActivityIndicator size="large" color={colors.button.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* Header Title - Position: y=182 */}
      <Text style={styles.headerTitle}>Sign in</Text>
      
      {/* Subtitle - Position: y=212 */}
      <Text style={styles.headerSubtitle}>
        Enter your credentials or create an account
      </Text>

      {/* Form Background Card - Position: x=30, y=242, size: 336x204 */}
      <View style={styles.formCard}>
        {/* Email Input - Relative position within card */}
        <View style={styles.inputWrapper}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.text.secondary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            style={styles.input}
          />
        </View>

        {/* Password Input */}
        <View style={styles.inputWrapper}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={colors.text.secondary}
            secureTextEntry
            style={styles.input}
          />
        </View>

        {/* Error Message */}
        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        {/* Sign In Button - Position: y=382 (relative to screen) */}
        <TouchableOpacity
          onPress={handleSignIn}
          disabled={isSubmitting}
          style={styles.signInButton}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.text.primary} />
          ) : (
            <Text style={styles.signInButtonText}>SIGN IN</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Gallery and Create Buttons - Position: y=398 */}
      <View style={styles.actionButtonsRow}>
        <TouchableOpacity 
          style={styles.galleryButton}
          activeOpacity={0.7}
          onPress={() => router.push('/(studio)')}
        >
          <Text style={styles.galleryButtonText}>Open Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.createButton}
          activeOpacity={0.7}
        >
          <Text style={styles.createButtonText}>Create</Text>
        </TouchableOpacity>
      </View>

      {/* Alternatively Text - Position: y=462 */}
      <Text style={styles.alternativelyText}>Alternatively</Text>

      {/* Google Sign In Button - Position: y=508 */}
      <TouchableOpacity
        onPress={handleGoogleSignIn}
        style={styles.googleButton}
        activeOpacity={0.9}
      >
        <View style={styles.socialButtonContent}>
          <GoogleIcon size={15} />
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </View>
      </TouchableOpacity>

      {/* Apple Sign In Button - Position: y=564 */}
      <TouchableOpacity
        onPress={handleAppleSignIn}
        style={styles.appleButton}
        activeOpacity={0.9}
      >
        <View style={styles.socialButtonContent}>
          <AppleIcon size={16} color={colors.text.primary} />
          <Text style={styles.appleButtonText}>Continue with Apple</Text>
        </View>
      </TouchableOpacity>

      {/* Bottom Background - Position: y=692, height=160 */}
      <View style={styles.bottomSection}>
        {/* Create Account Button - Position: y=716 (24px from bottom section top) */}
        <TouchableOpacity
          onPress={handleCreateAccount}
          disabled={isSubmitting}
          style={styles.createAccountButton}
          activeOpacity={0.8}
        >
          <Text style={styles.createAccountButtonText}>CREATE AN ACCOUNT</Text>
        </TouchableOpacity>

        {/* Forgot Password Button - Position: y=780 */}
        <TouchableOpacity
          onPress={handleForgotPassword}
          style={styles.forgotPasswordButton}
          activeOpacity={0.7}
        >
          <Text style={styles.forgotPasswordText}>Forgot your password?</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: colors.background.primary,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Header Title - Figma: y=182, x=49
  headerTitle: {
    position: 'absolute',
    top: 182,
    left: 49,
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
    fontSize: 32,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.41,
  },
  // Subtitle - Figma: y=212, x=49
  headerSubtitle: {
    position: 'absolute',
    top: 212,
    left: 49,
    width: 266,
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
    fontSize: 16,
    fontWeight: '400',
    color: colors.text.secondary,
    letterSpacing: -0.41,
    lineHeight: 14,
  },
  // Form Card - Figma: x=30, y=242, w=336, h=204
  formCard: {
    position: 'absolute',
    top: 242,
    left: 30,
    width: 336,
    height: 204,
    backgroundColor: colors.background.secondary,
    borderRadius: 8,
    paddingTop: 20,
    paddingHorizontal: 18,
  },
  inputWrapper: {
    marginBottom: 8,
  },
  // Input - Figma: w=297, h=48
  input: {
    width: 297,
    height: 48,
    backgroundColor: 'transparent',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 16,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(244, 244, 244, 0.4)',
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
    letterSpacing: -0.41,
    lineHeight: 14,
  },
  errorText: {
    color: colors.accent.red,
    fontSize: 12,
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
  },
  // Sign In Button - Figma: w=297, h=48 (inside form card)
  signInButton: {
    width: 297,
    height: 48,
    backgroundColor: colors.button.primary,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  signInButtonText: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    letterSpacing: -0.41,
  },
  // Action Buttons Row - Figma: y=398, center aligned
  actionButtonsRow: {
    position: 'absolute',
    top: 398,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  // Gallery Button - Figma: flex fill, h=40
  galleryButton: {
    flex: 1,
    maxWidth: 114,
    height: 40,
    backgroundColor: colors.button.secondary,
    borderRadius: 32,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryButtonText: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.41,
  },
  // Create Button - Figma: w=153, h=40
  createButton: {
    width: 153,
    height: 40,
    backgroundColor: colors.button.danger,
    borderRadius: 32,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonText: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.41,
  },
  // Alternatively Text - Figma: y=462, center x=155
  alternativelyText: {
    position: 'absolute',
    top: 462,
    left: 155,
    width: 83,
    fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System',
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
    letterSpacing: -0.41,
  },
  // Google Button - Figma: x=48, y=508, w=297, h=48
  googleButton: {
    position: 'absolute',
    top: 508,
    left: 48,
    width: 297,
    height: 48,
    backgroundColor: colors.button.white,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  googleButtonText: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.dark,
    letterSpacing: -0.41,
  },
  // Apple Button - Figma: x=48, y=564, w=297, h=48
  appleButton: {
    position: 'absolute',
    top: 564,
    left: 48,
    width: 297,
    height: 48,
    backgroundColor: colors.button.dark,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleButtonText: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    letterSpacing: -0.41,
  },
  // Bottom Section - Figma: y=692, w=393, h=160
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 160,
    backgroundColor: colors.background.tertiary,
    paddingTop: 24,
    alignItems: 'center',
  },
  // Create Account Button - Figma: x=48, y=716 (24px from bottom top), w=297, h=48
  createAccountButton: {
    width: 297,
    height: 48,
    backgroundColor: colors.button.dark,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  createAccountButtonText: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System',
    fontSize: 14,
    fontWeight: '500',
    color: colors.accent.blue,
    letterSpacing: -0.41,
  },
  // Forgot Password Button - Figma: y=780, centered
  forgotPasswordButton: {
    backgroundColor: colors.button.secondary,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotPasswordText: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System',
    fontSize: 13,
    fontWeight: '300',
    color: colors.text.primary,
    letterSpacing: -0.41,
  },
});
