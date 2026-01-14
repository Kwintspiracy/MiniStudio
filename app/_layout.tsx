import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { AuthProvider } from '../src/context/AuthContext';
import { ImageProvider } from '../src/context/ImageContext';
import { colors } from '../src/theme';
import Purchases from 'react-native-purchases';
import { REVENUECAT_KEYS } from '../src/constants';

// Polyfill/Suppression for SSR warnings
if (Platform.OS === 'web' && typeof window === 'undefined') {
  const originalConsoleError = console.error;
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing on the server')) {
      return;
    }
    originalConsoleError(...args);
  };
}

// Polyfill for RevenueCat in Expo Go (Browser Mode) which expects window.location.search
if (Constants.appOwnership === 'expo') {
    if (typeof window === 'undefined') {
        // @ts-ignore
        global.window = {};
    }
    // @ts-ignore
    if (!window.location) {
        // @ts-ignore
        window.location = { search: '' };
    }
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AuthProvider>
          <ImageProvider>
            <RootLayoutNav />
          </ImageProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  useEffect(() => {
    const initPurchases = async () => {
        if (Platform.OS !== 'web') {
            try {
                Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG); 
                
                if (Platform.OS === 'ios') {
                    await Purchases.configure({ apiKey: REVENUECAT_KEYS.apple });
                } else if (Platform.OS === 'android') {
                    await Purchases.configure({ apiKey: REVENUECAT_KEYS.google });
                }
            } catch (e) {
                console.warn("RevenueCat failed to initialize (likely running in Expo Go standard client). IAP will be disabled.");
            }
        }
    };
    initPurchases();
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background.primary },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen 
        name="(studio)" 
        options={{
            title: 'Studio',
        }}
      />
      <Stack.Screen
        name="camera"
        options={{
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          animation: 'slide_from_right',
        }}
      />
      <Stack.Screen
        name="paywall"
        options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
        }}
      />
    </Stack>
  );
}
