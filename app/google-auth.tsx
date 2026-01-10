import { Redirect, router } from 'expo-router';
import { Platform } from 'react-native';
import { useEffect, useRef } from 'react';

export default function GoogleAuthRedirect() {
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'android' && !hasNavigated.current) {
      hasNavigated.current = true;
      if (__DEV__) console.log("[AUTH] Android: Navigating back from /google-auth");
      // Go back to dismiss this intermediate route.
      // The session state change will then trigger navigation to the studio from signin.tsx.
      router.back();
    }
  }, []);

  if (__DEV__) console.log("[AUTH] Redirection route '/google-auth' hit.");

  // On Android, useEffect handles the back navigation. Return null to prevent flash.
  if (Platform.OS === 'android') {
    return null;
  }

  // On iOS/Web, redirect to the main index for consistent behavior.
  return <Redirect href="/" />;
}
