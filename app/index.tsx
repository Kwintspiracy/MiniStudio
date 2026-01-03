import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, Image, Linking, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SparklesIcon, ChevronRightIcon, KeyIcon } from '../src/components/Icons';
import { hasApiKey, setApiKey, isSessionActive, setSessionActive } from '../src/services/storageService';

export default function WelcomeScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const active = await isSessionActive();
      if (active) {
        const hasKey = await hasApiKey();
        if (hasKey) {
          router.replace('/(studio)');
          return;
        }
      }
    } catch (err) {
      console.error('Error checking session:', err);
    }
    setIsLoading(false);
  };

  const handleContinue = async () => {
    const hasKey = await hasApiKey();
    if (hasKey) {
      await setSessionActive(true);
      router.replace('/(studio)');
    } else {
      setShowApiKeyInput(true);
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
      await setSessionActive(true);
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

  if (isLoading) {
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

        {/* API Key Input */}
        {showApiKeyInput ? (
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

            <TouchableOpacity onPress={handleOpenBillingDocs} className="items-center">
              <Text className="text-indigo-400/60 text-[10px] font-bold uppercase tracking-wider underline">
                Billing Documentation
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="w-full max-w-sm space-y-3">
            <TouchableOpacity
              onPress={handleContinue}
              className="bg-white py-4 rounded-2xl flex-row items-center justify-center shadow-lg"
            >
              <Text className="text-black font-black uppercase text-xs tracking-widest mr-2">
                Get Started
              </Text>
              <ChevronRightIcon size={12} color="#000000" />
            </TouchableOpacity>

            <View className="items-center pt-6">
              <View className="flex-row items-center mb-4">
                <View className="w-4 h-4 rounded-full bg-zinc-800 items-center justify-center mr-1">
                  <KeyIcon size={8} color="#6366f1" />
                </View>
                <View className="w-4 h-4 rounded-full bg-zinc-800 items-center justify-center">
                  <SparklesIcon size={8} color="#3b82f6" />
                </View>
                <Text className="text-[8px] text-zinc-600 font-bold uppercase tracking-widest ml-2">
                  Secure Authentication
                </Text>
              </View>

              <Text className="text-[9px] text-zinc-700 font-bold uppercase tracking-wide text-center px-8 leading-4">
                Requires a billed Google Cloud Project with Gemini API enabled.
              </Text>
              
              <TouchableOpacity onPress={handleOpenBillingDocs} className="mt-2">
                <Text className="text-indigo-500/60 text-[9px] font-bold uppercase tracking-widest underline">
                  Billing Documentation
                </Text>
              </TouchableOpacity>
            </View>
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
