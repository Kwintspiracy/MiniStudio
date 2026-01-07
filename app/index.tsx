import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, Image, Linking, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SparklesIcon, ChevronRightIcon, KeyIcon } from '../src/components/Icons';
import { hasApiKey, setApiKey } from '../src/services/storageService';
import { useAuth } from '../src/context/AuthContext';

export default function WelcomeScreen() {
  const { session, loading, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut } = useAuth();
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Email Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);

  const handleEmailAuth = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      if (isSignUpMode) {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Monitor Session and Key Status
  useEffect(() => {
    if (!loading) {
      if (session) {
        checkApiKey();
      }
    }
  }, [session, loading]);

  const checkApiKey = async () => {
    try {
      const hasKey = await hasApiKey();
      if (hasKey) {
        router.replace('/(studio)');
      } else {
        setShowApiKeyInput(true);
      }
    } catch (err) {
      console.error('Error checking API key:', err);
    }
  };

  const handleSubmitApiKey = async () => {
    if (!apiKeyInput.trim()) {
      setError('Please enter your API key');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await setApiKey(apiKeyInput.trim());
      // Session is already active via Google Auth
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

  if (loading) {
    return (
      <View className="flex-1 bg-[#0D1117] items-center justify-center">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#0D1117]">
      <View className="flex-1 items-center justify-center px-6">
        {/* Brand Identity */}
        <View className="items-center mb-8">
          <View className="w-20 h-20 bg-indigo-600 rounded-3xl items-center justify-center shadow-lg mb-4">
            <SparklesIcon size={40} color="#ffffff" />
          </View>

          <View className="items-center">
            <View className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full mb-2">
              <Text className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                v7.0 Stable
              </Text>
            </View>

            <Text className="text-4xl font-black text-white tracking-tight uppercase italic text-center">
              Studio{'\n'}
              <Text className="text-indigo-500 font-light not-italic">Artisan</Text>
            </Text>

            <Text className="text-zinc-500 text-xs text-center mt-3 px-8 leading-5">
              The premier autonomous visualization engine for miniature hobbyists and collectors.
            </Text>
          </View>
        </View>

        {/* Auth & API Key Flow */}
        {!session ? (
          <View className="w-full max-w-sm space-y-4">
            {/* Email/Password Form */}
            <View className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-3">
              <View>
                <Text className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                  Email Address
                </Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="name@example.com"
                  placeholderTextColor="#3f3f46"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  className="bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm"
                />
              </View>

              <View>
                <Text className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                  Password
                </Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor="#3f3f46"
                  secureTextEntry
                  className="bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm"
                />
              </View>

              {error && (
                <Text className="text-red-400 text-xs">{error}</Text>
              )}

              <TouchableOpacity
                onPress={handleEmailAuth}
                disabled={isSubmitting || loading}
                className="bg-indigo-600 py-3 rounded-xl items-center mt-2"
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-white font-bold uppercase text-xs tracking-widest">
                    {isSignUpMode ? 'Create Account' : 'Sign In'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setIsSignUpMode(!isSignUpMode);
                  setError(null);
                }}
                className="items-center py-2"
              >
                <Text className="text-zinc-400 text-xs">
                  {isSignUpMode ? 'Already have an account? ' : "Don't have an account? "}
                  <Text className="text-indigo-400 font-bold">
                    {isSignUpMode ? 'Sign In' : 'Sign Up'}
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>

            {/* Divider */}
            <View className="flex-row items-center justify-center space-x-4">
              <View className="h-[1px] bg-zinc-800 flex-1" />
              <Text className="text-zinc-600 text-[10px] font-bold uppercase">OR</Text>
              <View className="h-[1px] bg-zinc-800 flex-1" />
            </View>

            {/* Google Sign In */}
            <TouchableOpacity
              onPress={signInWithGoogle}
              disabled={loading}
              className="bg-white py-4 rounded-2xl flex-row items-center justify-center shadow-lg"
            >
              {/* Google G logo fallback/text */}
              <View className="mr-3">
                <Text className="text-lg">G</Text>
              </View>
              <Text className="text-black font-black uppercase text-xs tracking-widest">
                Sign in with Google
              </Text>
            </TouchableOpacity>

            <View className="items-center pt-2">
              <Text className="text-[9px] text-zinc-700 font-bold uppercase tracking-wide text-center px-8 leading-4">
                Powered by MiniPainterDB Shared Auth
              </Text>
            </View>
          </View>
        ) : showApiKeyInput ? (
          <View className="w-full max-w-sm space-y-4">
            <View className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
              <View className="flex-row items-center mb-3">
                <KeyIcon size={16} color="#6366f1" />
                <Text className="text-xs font-bold text-zinc-400 uppercase tracking-wider ml-2">
                  Gemini API Key
                </Text>
              </View>

              <TextInput
                value={apiKeyInput}
                onChangeText={setApiKeyInput}
                placeholder="Enter your API key..."
                placeholderTextColor="#3f3f46"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                className="bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm mb-3"
              />

              {error && (
                <Text className="text-red-400 text-xs mb-3">{error}</Text>
              )}

              <TouchableOpacity
                onPress={handleSubmitApiKey}
                disabled={isSubmitting}
                className="bg-indigo-600 py-4 rounded-xl items-center"
              >
                {isSubmitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-white font-bold uppercase text-xs tracking-widest">
                    Continue to Studio
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={handleOpenBillingDocs} className="items-center mb-4">
              <Text className="text-indigo-400/60 text-[10px] font-bold uppercase tracking-wider underline">
                Billing Documentation
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => signOut()}
              className="items-center"
            >
              <Text className="text-red-400/60 text-[10px] font-bold uppercase tracking-wider">
                Sign Out / Switch Account
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="items-center">
            <ActivityIndicator color="#6366f1" />
            <Text className="text-zinc-500 text-xs mt-4">Verifying access...</Text>
          </View>
        )}
      </View>

      {/* Footer */}
      <View className="pb-6 items-center">
        <Text className="text-[8px] text-zinc-800 font-bold uppercase tracking-[0.3em]">
          © 2025 Miniature Logic Systems
        </Text>
      </View>
    </SafeAreaView>
  );
}
