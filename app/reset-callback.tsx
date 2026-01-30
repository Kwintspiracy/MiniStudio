import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fontFamily } from '../src/theme';

export default function ResetCallback() {
  const router = useRouter();

  useEffect(() => {
    // Similar to auth-callback, this handling allows Supabase/AuthContext 
    // to process the deep link parameters (access_token/refresh_token/type=recovery)
    // before we navigate away. 
    // The AuthContext listener for onAuthStateChange('PASSWORD_RECOVERY') 
    // will likely trigger a redirect to /update-password.
    // This fallback redirect ensures we don't get stuck here if that event 
    // has already fired or fires quickly.
    const timer = setTimeout(() => {
      // Navigate to update-password if we are indeed in recovery mode,
      // or root if it was just a generic link.
      // Usually AuthContext handles the routing for recovery.
      router.replace('/');
    }, 1500);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.button.primary} />
      <Text style={styles.text}>Verifying request...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  text: {
    color: colors.text.primary,
    fontSize: 16,
    fontFamily: fontFamily.primary,
    fontWeight: '500', 
  }
});
