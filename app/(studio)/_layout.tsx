import { Stack, router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useAuth } from '../../src/context/AuthContext';
import { View, ActivityIndicator } from 'react-native';

export default function StudioLayout() {
  const { session, loading } = useAuth();
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (!loading && !session && !hasNavigated.current) {
      hasNavigated.current = true;
      // If we are not loading and have no session, redirect to login
      router.replace('/');
    }
  }, [session, loading]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0D1117', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0D1117' },
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
