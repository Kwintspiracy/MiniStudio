import React, { useState } from 'react';
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
import { supabase } from '../src/services/supabase';
import { colors, fontFamily } from '../src/theme';
import { AppModal } from '../src/components/AppModal';

export default function UpdatePasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleUpdatePassword = async () => {
    if (!password || !confirmPassword) {
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
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;

      if (error) throw error;

      showModal(
        "Success", 
        "Your password has been updated. You can now sign in with your new password.",
        'default',
        { label: "OK", onPress: () => { hideModal(); router.replace('/(studio)'); } }
      );
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.mainContent}>
            <View style={styles.headerSection}>
              <Text style={styles.headerTitle}>Set New Password</Text>
              <Text style={styles.headerSubtitle}>Please enter your new password below</Text>
            </View>

            <View style={styles.formSection}>
              <View style={styles.formGroup}>
                <View style={styles.inputGroup}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="New Password"
                    placeholderTextColor={colors.text.secondary}
                    secureTextEntry
                    style={styles.input}
                  />
                  <TextInput
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm New Password"
                    placeholderTextColor={colors.text.secondary}
                    secureTextEntry
                    style={styles.input}
                  />
                </View>

                {error && <Text style={styles.errorText}>{error}</Text>}

                <TouchableOpacity
                  onPress={handleUpdatePassword}
                  disabled={isSubmitting}
                  style={styles.primaryButton}
                  activeOpacity={0.8}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color={colors.text.primary} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Update Password</Text>
                  )}
                </TouchableOpacity>

                 <TouchableOpacity
                  onPress={() => router.replace('/signin')}
                  style={styles.cancelButton}
                  activeOpacity={0.8}
                >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
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
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 32,
    paddingHorizontal: 40,
    paddingTop: 58,
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
  formSection: {
    width: '100%',
    alignItems: 'center',
    gap: 24,
  },
  formGroup: {
    width: '100%',
    gap: 16,
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
    fontWeight: '400',
    color: colors.text.muted,
    fontFamily: fontFamily.primary,
    lineHeight: 14,
  },
  errorText: {
    color: colors.accent.red,
    fontSize: 12,
    fontFamily: fontFamily.primary,
    marginTop: -10,
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
  cancelButton: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontFamily: fontFamily.primary,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.secondary,
  }
});
