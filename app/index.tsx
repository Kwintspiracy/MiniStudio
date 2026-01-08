import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { hasApiKey } from '../src/services/storageService';

export default function Index() {
  const { session, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

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
      <ActivityIndicator size="large" color="#0058DB" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1E1E2B',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
