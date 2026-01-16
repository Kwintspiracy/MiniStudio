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
  KeyboardAvoidingView
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/context/AuthContext';
import { setApiKey } from '../src/services/storageService';
import { KeyIcon } from '../src/components/Icons';
import { colors, fontFamily } from '../src/theme';


export default function ApiKeyScreen() {
  const { signOut } = useAuth();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmitApiKey = async () => {
    if (!apiKeyInput.trim()) {
      setError('Please enter your API key');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await setApiKey(apiKeyInput.trim());
      router.replace('/(studio)');
    } catch (err) {
      setError('Failed to save API key');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenBillingDocs = () => {
    Linking.openURL('https://ai.google.dev/gemini-api/docs/billing');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.apiKeyContent}>
          <View style={styles.apiKeyHeader}>
            <Text style={styles.headerTitleApiKey}>API Key</Text>
            <Text style={styles.headerSubtitleApiKey}>Enter your Gemini API key to continue</Text>
          </View>

          <View style={styles.apiKeyForm}>
            <View style={styles.apiKeyLabelRow}>
              <KeyIcon size={16} color={colors.accent.blue} />
              <Text style={styles.apiKeyLabel}>Gemini API Key</Text>
            </View>
            <TextInput
              value={apiKeyInput}
              onChangeText={setApiKeyInput}
              placeholder="Enter your API key..."
              placeholderTextColor={colors.text.secondary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.apiKeyInput}
            />
            {error && <Text style={styles.errorText}>{error}</Text>}
            <TouchableOpacity
              onPress={handleSubmitApiKey}
              disabled={isSubmitting}
              style={styles.apiKeyButton}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.text.primary} />
              ) : (
                <Text style={styles.apiKeyButtonText}>CONTINUE TO STUDIO</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleOpenBillingDocs} activeOpacity={0.7}>
              <Text style={styles.apiKeyLinkText}>Billing Documentation</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => signOut()} activeOpacity={0.7}>
              <Text style={[styles.apiKeyLinkText, { color: colors.accent.red }]}>
                Sign Out / Switch Account
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  apiKeyContent: {
    flex: 1,
    paddingHorizontal: 40,
    justifyContent: 'center',
    gap: 32,
  },
  apiKeyHeader: {
    gap: 6,
  },
  headerTitleApiKey: {
    fontFamily: fontFamily.primary,
    fontSize: 32,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.41,
  },
  headerSubtitleApiKey: {
    fontFamily: fontFamily.primary,
    fontSize: 16,
    fontWeight: '400',
    color: colors.text.secondary,
    letterSpacing: -0.41,
  },
  apiKeyForm: {
    gap: 24,
  },
  apiKeyLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  apiKeyLabel: {
    fontFamily: fontFamily.primary,
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
    textTransform: 'uppercase',
  },
  apiKeyInput: {
    width: '100%',
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border.subtle,
    paddingVertical: 16,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.text.primary,
    fontFamily: fontFamily.primary,
  },
  apiKeyButton: {
    width: '100%',
    height: 48,
    backgroundColor: colors.button.primary,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apiKeyButtonText: {
    fontFamily: fontFamily.primary,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    letterSpacing: -0.41,
  },
  apiKeyLinkText: {
    fontFamily: fontFamily.secondary,
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent.blue,
    textTransform: 'uppercase',
    textAlign: 'center',
    textDecorationLine: 'underline',
    marginTop: 8,
  },
  errorText: {
    color: colors.accent.red,
    fontSize: 12,
    fontFamily: fontFamily.primary,
  },
});
