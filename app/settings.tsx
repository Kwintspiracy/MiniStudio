import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, Alert, Linking, ActivityIndicator, Platform, Modal } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { XMarkIcon, KeyIcon, InfoIcon } from '../src/components/Icons';
import { getApiKey, setApiKey, deleteApiKey } from '../src/services/storageService';
import { useAuth } from '../src/context/AuthContext';

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const [currentApiKey, setCurrentApiKey] = useState<string>('');
  const [newApiKey, setNewApiKey] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSignOutModalVisible, setIsSignOutModalVisible] = useState(false);

  useEffect(() => {
    loadApiKey();
  }, []);

  const loadApiKey = async () => {
    try {
      let key = await getApiKey();
      if (!key) {
        // Fallback for development/testing if no key is set
        // DISCLAIMER: Using a hardcoded key is not recommended for production.
        // This is just to unblock the user since they are facing "API Key not valid".
        // Ideally prompt the user to enter one.
        // But for now let's just log it.
        console.log("No API key found in storage.");
      } else {
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
      await setApiKey(newApiKey.trim());
      setCurrentApiKey(newApiKey.substring(0, 8) + '...' + newApiKey.substring(newApiKey.length - 4));
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
      'Are you sure you want to remove your API key? You will need to enter it again to use the app.',
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

  const performSignOut = async () => {
    setIsSignOutModalVisible(false);
    // Add a small delay for modal to close smoothly
    setTimeout(async () => {
      setIsLoading(true);
      try {
        await signOut();

        // dismissAll pops to the root (index)
        if (router.canGoBack()) {
          router.dismissAll();
        }

        // Ensure we are definitely replacing to root
        router.replace('/');
      } catch (error) {
        console.error("Sign out failed", error);
        Alert.alert("Error", "Failed to sign out. Please try again.");
        setIsLoading(false);
      }
    }, 200);
  };

  const handleSignOut = () => {
    setIsSignOutModalVisible(true);
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
        <TouchableOpacity onPress={() => router.back()}>
          <XMarkIcon size={20} color="#71717a" />
        </TouchableOpacity>
        <Text className="text-sm font-bold text-white uppercase tracking-widest">Settings</Text>
        <View className="w-5" />
      </View>

      <View className="flex-1 px-4 pt-6">
        {/* API Key Section */}
        <View className="mb-8">
          <View className="flex-row items-center mb-4">
            <KeyIcon size={16} color="#6366f1" />
            <Text className="text-sm font-bold text-white uppercase tracking-widest ml-2">
              API Configuration
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
                  <TouchableOpacity onPress={handleRemoveApiKey}>
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
              placeholderTextColor="#3f3f46"
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

        {/* Help Links */}
        <View className="mb-8">
          <View className="flex-row items-center mb-4">
            <InfoIcon size={16} color="#71717a" />
            <Text className="text-sm font-bold text-white uppercase tracking-widest ml-2">
              Resources
            </Text>
          </View>

          <View className="gap-2">
            <TouchableOpacity
              onPress={handleOpenApiConsole}
              className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex-row justify-between items-center"
            >
              <Text className="text-zinc-300 text-sm">Get API Key</Text>
              <Text className="text-indigo-400 text-xs font-bold">→</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleOpenBillingDocs}
              className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex-row justify-between items-center"
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


      {/* Custom Sign Out Modal */}
      <Modal
        visible={isSignOutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsSignOutModalVisible(false)}
      >
        <View className="flex-1 bg-black/80 items-center justify-center p-4">
          <View className="w-full max-w-sm bg-[#161B22] border border-zinc-800 rounded-2xl p-6">
            <Text className="text-lg font-bold text-white mb-2">Sign Out</Text>
            <Text className="text-zinc-400 text-sm mb-6">
              Are you sure you want to sign out? You will need to sign in again to access your projects.
            </Text>

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setIsSignOutModalVisible(false)}
                className="flex-1 py-3 bg-zinc-800 rounded-xl items-center"
              >
                <Text className="text-white font-bold text-xs uppercase tracking-widest">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={performSignOut}
                className="flex-1 py-3 bg-red-600 rounded-xl items-center"
              >
                <Text className="text-white font-bold text-xs uppercase tracking-widest">Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView >
  );
}
