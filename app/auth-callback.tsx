import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, fontFamily } from '../src/theme';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    // The AuthContext listener handles the actual token exchange via Linking events.
    // This route mainly exists to prevent a 404 when the deep link opens.
    // We redirect to root (which checks session) after a brief moment to allow
    // the AuthContext listener to fire and process the URL.
    const timer = setTimeout(() => {
      // Navigate to root; the Auth wrapper will redirect to (studio) if logged in,
      // or show signin if not.
      router.replace('/');
    }, 1500);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.button.primary} />
      <Text style={styles.text}>Verifying...</Text>
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
