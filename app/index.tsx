import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';

import { colors } from '../src/theme';

export default function Index() {
  const { session, loading } = useAuth();
  const hasNavigated = useRef(false);

  /* REMOVED: checkApiKeyAndNavigate - Legacy 'Bring Your Own Key' check */

  useEffect(() => {
    if (loading) return;
    if (hasNavigated.current) return;

    hasNavigated.current = true;

    // Proceed to Studio. AuthContext will ensure either a real or anonymous session is present.
    router.replace('/(studio)');
  }, [session, loading]);

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
