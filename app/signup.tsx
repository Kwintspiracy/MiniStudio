import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
  ScrollView
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '../src/context/AuthContext';
import { colors, fontFamily } from '../src/theme';
import { AppModal } from '../src/components/AppModal';
import { EyeIcon, EyeSlashIcon } from '../src/components/Icons';

// Back Icon for navigation
const BackIcon = ({ size = 24, color = colors.text.primary }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M15 18l-6-6 6-6" />
    </Svg>
);

export default function SignUpScreen() {
  const { signUpWithEmail, loading, session } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
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
      primaryAction?: { label: string; onPress: () => void }
  ) => {
      setModalConfig({ visible: true, title, message, type, primaryAction });
  };
  
  const hideModal = () => {
      setModalConfig(prev => ({ ...prev, visible: false }));
  };

  const handleSignUp = async () => {
    if (!email || !password || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }
    
    if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
    }
    
    if (password.length < 6) {
        setError('Password must be at least 6 characters');
        return;
    }

    setError(null);
    setIsSubmitting(true);
    
    try {
      await signUpWithEmail(email, password);
      // Wait a tick to see if session updates or error throws
      
       showModal(
           "Account Created", 
           "We've sent a confirmation email to " + email + ". Please verify your email to log in.",
           'default',
           { label: "Back to Login", onPress: () => {
               hideModal();
               router.back();
           }}
       );
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      
    } catch (err: any) {
      setError(err.message || 'Account creation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* Back Button Header */}
      <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <BackIcon />
              <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Main Content Area */}
          <View style={styles.mainContent}>
            {/* Header Section */}
            <View style={styles.headerSection}>
              <Text style={styles.headerTitle}>Create Account</Text>
              <Text style={styles.headerSubtitle}>Join MiniStudio to start creating.</Text>
            </View>

            {/* Form Section */}
            <View style={styles.formSection}>
              <View style={styles.formGroup}>
                  
                {/* Inputs */}
                <View style={styles.inputGroup}>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="Email"
                    placeholderTextColor={colors.text.secondary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    style={[styles.input, email.length > 0 && { color: colors.text.primary }]}
                  />
                  
                  {/* Password Field */}
                  <View style={styles.passwordContainer}>
                      <TextInput
                        value={password}
                        onChangeText={setPassword}
                        placeholder="Password"
                        placeholderTextColor={colors.text.secondary}
                        secureTextEntry={!showPassword}
                        style={[styles.input, styles.passwordInput, password.length > 0 && { color: colors.text.primary }]}
                      />
                      <TouchableOpacity 
                          onPress={() => setShowPassword(!showPassword)}
                          style={styles.eyeIcon}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                          {showPassword ? (
                             <EyeSlashIcon size={20} color={colors.text.secondary} />
                          ) : (
                             <EyeIcon size={20} color={colors.text.secondary} />
                          )}
                      </TouchableOpacity>
                  </View>
                  
                  {/* Confirm Password Field */}
                  <View style={styles.passwordContainer}>
                      <TextInput
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        placeholder="Confirm Password"
                        placeholderTextColor={colors.text.secondary}
                        secureTextEntry={!showConfirmPassword}
                        style={[styles.input, styles.passwordInput, confirmPassword.length > 0 && { color: colors.text.primary }]}
                      />
                      <TouchableOpacity 
                          onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                          style={styles.eyeIcon}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                          {showConfirmPassword ? (
                             <EyeSlashIcon size={20} color={colors.text.secondary} />
                          ) : (
                             <EyeIcon size={20} color={colors.text.secondary} />
                          )}
                      </TouchableOpacity>
                  </View>

                </View>

                {error && <Text style={styles.errorText}>{error}</Text>}

                {/* Sign Up Button */}
                <TouchableOpacity
                  onPress={handleSignUp}
                  disabled={isSubmitting}
                  style={styles.primaryButton}
                  activeOpacity={0.8}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={colors.text.primary} />
                  ) : (
                  <Text style={styles.primaryButtonText}>Sign Up</Text>
                  )}
                </TouchableOpacity>

                {/* Spacer to match Sign In screen height (Social buttons + Alt text approx height) */}
                <View style={{ height: 100 }} />
              </View>
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
        primaryAction={modalConfig.primaryAction}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  headerBar: {
      paddingHorizontal: 24,
      paddingTop: 12,
      paddingBottom: 12,
  },
  backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
  },
  backButtonText: {
      color: colors.text.primary,
      fontSize: 16,
      fontFamily: fontFamily.primary,
      fontWeight: '500', 
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  mainContent: {
    flex: 1,
    alignItems: 'center',
    gap: 32,
    paddingHorizontal: 40,
    paddingTop: 110, // Account for status bar
  },
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
    textAlign: 'left',
  },
  headerSubtitle: {
    fontFamily: fontFamily.primary,
    fontSize: 16,
    fontWeight: '400',
    color: colors.text.secondary,
    letterSpacing: -0.41,
    textAlign: 'left',
  },
  formSection: {
    width: '100%',
    alignItems: 'center',
    gap: 24,
  },
  formGroup: {
    width: '100%',
    gap: 24,
  },
  inputGroup: {
    width: '100%',
    gap: 8,
  },
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
  },
  passwordContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    paddingRight: 40,
  },
  eyeIcon: {
    position: 'absolute',
    right: 12,
  },
  errorText: {
    color: colors.accent.red,
    fontSize: 12,
    fontFamily: fontFamily.primary,
    marginTop: -8,
  },
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
});
