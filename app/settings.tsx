import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, Linking, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { XMarkIcon, KeyIcon, InfoIcon } from '../src/components/Icons';
import { getApiKey, setApiKey, deleteApiKey } from '../src/services/storageService';
import { validateGeminiApiKey } from '../src/services/apiValidation';
import { useAuth } from '../src/context/AuthContext';

const ADMIN_EMAILS = [
  'quentinbeau@gmail.com',
  'kwintspiracy@gmail.com',
  'magneticfoundry@gmail.com'
];

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const [currentApiKey, setCurrentApiKey] = useState<string>('');
  const [newApiKey, setNewApiKey] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const canManageKeys = user?.email && ADMIN_EMAILS.includes(user.email);

  useEffect(() => {
    if (canManageKeys) {
      loadApiKey();
    } else {
      setIsLoading(false);
    }
  }, [user]);

  const loadApiKey = async () => {
    try {
      const key = await getApiKey();
      if (key) {
        // Mask the key for display
        setCurrentApiKey(key.substring(0, 8) + '...' + key.substring(key.length - 4));
      }
    } catch (error) {
      console.error('Failed to load API key:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!newApiKey.trim()) {
      Alert.alert('Error', 'Please enter an API key');
      return;
    }

    setIsSaving(true);
    try {
      // Validate key first
      const inputKey = newApiKey.trim();
      const validation = await validateGeminiApiKey(inputKey);

      if (!validation.valid) {
        Alert.alert('Error', validation.error || 'Invalid API key');
        setIsSaving(false);
        return;
      }

      await setApiKey(inputKey);
      setCurrentApiKey(inputKey.substring(0, 8) + '...' + inputKey.substring(inputKey.length - 4));
      setNewApiKey('');
      Alert.alert('Success', 'API key saved successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to save API key');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveApiKey = async () => {
    Alert.alert(
      'Remove API Key',
      'Are you sure you want to remove your API key?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteApiKey();
              setCurrentApiKey('');
              Alert.alert('Success', 'API key removed');
            } catch (error) {
              Alert.alert('Error', 'Failed to remove API key');
            }
          },
        },
      ]
    );
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            // Router redirect handled by ProtectedLayout
          },
        },
      ]
    );
  };

  const handleOpenBillingDocs = () => {
    Linking.openURL('https://ai.google.dev/gemini-api/docs/billing');
  };

  const handleOpenApiConsole = () => {
    Linking.openURL('https://aistudio.google.com/app/apikey');
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
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-zinc-800">
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" accessibilityRole="button">
          <XMarkIcon size={20} color="#71717a" />
        </TouchableOpacity>
        <Text className="text-sm font-bold text-white uppercase tracking-widest">Settings</Text>
        <View className="w-5" />
      </View>

      <View className="flex-1 px-4 pt-6">
        {/* API Key Section - RESTRICTED */}
        {canManageKeys && (
          <View className="mb-8">
            <View className="flex-row items-center mb-4">
              <KeyIcon size={16} color="#6366f1" />
              <Text className="text-sm font-bold text-white uppercase tracking-widest ml-2">
                API Configuration (Admin)
              </Text>
            </View>

            <View className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
              {currentApiKey ? (
                <View className="mb-4">
                  <Text className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
                    Current API Key
                  </Text>
                  <View className="flex-row items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2">
                    <Text className="text-zinc-400 text-sm font-mono">{currentApiKey}</Text>
                    <TouchableOpacity onPress={handleRemoveApiKey} accessibilityLabel="Remove API Key" accessibilityRole="button">
                      <Text className="text-red-400 text-[10px] font-bold uppercase">Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              <Text className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">
                {currentApiKey ? 'Update API Key' : 'Enter API Key'}
              </Text>

              <TextInput
                value={newApiKey}
                onChangeText={setNewApiKey}
                placeholder="Enter your Gemini API key..."
                placeholderTextColor="#71717a"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                className="bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm mb-3"
              />

              <TouchableOpacity
                onPress={handleSaveApiKey}
                disabled={isSaving || !newApiKey.trim()}
                className={`py-3 rounded-xl items-center ${newApiKey.trim() ? 'bg-indigo-600' : 'bg-zinc-700'
                  }`}
              >
                {isSaving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-white font-bold uppercase text-xs tracking-widest">
                    Save API Key
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* User Info */}
        <View className="mb-8">
          <Text className="text-sm font-bold text-white uppercase tracking-widest mb-2">
            Signed in as
          </Text>
          <Text className="text-zinc-400 text-sm">{user?.email}</Text>
        </View>

        {/* Resources for everyone */}
        <View className="mb-8">
          <View className="flex-row items-center mb-4">
            <InfoIcon size={16} color="#71717a" />
            <Text className="text-sm font-bold text-white uppercase tracking-widest ml-2">
              Resources
            </Text>
          </View>

          <View className="gap-2">
            <TouchableOpacity
              onPress={handleOpenBillingDocs}
              className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex-row justify-between items-center"
              accessibilityLabel="View billing documentation"
              accessibilityRole="link"
            >
              <Text className="text-zinc-300 text-sm">Billing Documentation</Text>
              <Text className="text-indigo-400 text-xs font-bold">→</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Account Section */}
        <View>
          <Text className="text-sm font-bold text-white uppercase tracking-widest mb-4">
            Account
          </Text>

          <TouchableOpacity
            onPress={handleSignOut}
            className="bg-red-900/20 border border-red-900/50 rounded-xl p-4"
            accessibilityLabel="Sign out of your account"
            accessibilityRole="button"
          >
            <Text className="text-red-400 text-sm font-bold text-center uppercase tracking-widest">
              Sign Out
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Footer */}
      <View className="px-4 pb-6 items-center">
        <Text className="text-[9px] text-zinc-700 font-bold uppercase tracking-widest">
          MiniStudio v7.0 • Expo Edition
        </Text>
      </View>
    </SafeAreaView>
  );
}
