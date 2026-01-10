import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { hasApiKey } from '../src/services/storageService';
import { colors } from '../src/theme';

export default function Index() {
  const { session, loading } = useAuth();
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (hasNavigated.current) return;

    hasNavigated.current = true;

    if (!session) {
      router.replace('/signin');
    } else {
      checkApiKeyAndNavigate();
    }
  }, [session, loading]);

  const checkApiKeyAndNavigate = async () => {
    try {
      const hasKey = await hasApiKey();
      if (hasKey) {
        router.replace('/(studio)');
      } else {
        router.replace('/api-key');
      }
    } catch (err) {
      console.error('Error checking API key:', err);
      router.replace('/api-key');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <ActivityIndicator size="large" color={colors.button.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
