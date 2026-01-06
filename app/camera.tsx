import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { XMarkIcon, CameraIcon, RefreshIcon } from '../src/components/Icons';
import type { ImageFile } from '../src/types';
import { useImageContext } from '../src/context/ImageContext';

import { useHaptics } from '../src/hooks/useHaptics';
import * as Haptics from 'expo-haptics';

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [isCapturing, setIsCapturing] = useState(false);
  const { setCapturedImage } = useImageContext();
  const cameraRef = useRef<CameraView>(null);
  const { triggerImpact } = useHaptics();

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;

    triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.8,
      });

      if (photo && photo.base64) {
        const imageFile: ImageFile = {
          base64: `data:image/jpeg;base64,${photo.base64}`,
          mimeType: 'image/jpeg',
          uri: photo.uri,
        };

        setCapturedImage(imageFile);
        router.back();
      }
    } catch (error) {
      console.error('Failed to capture photo:', error);
    } finally {
      setIsCapturing(false);
    }
  };

  const toggleFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  if (!permission) {
    return (
      <View className="flex-1 bg-[#0D1117] items-center justify-center">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 bg-[#0D1117]">
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-white text-lg font-bold text-center mb-4">
            Camera Access Required
          </Text>
          <Text className="text-zinc-400 text-sm text-center mb-6">
            MiniStudio needs camera access to capture photos of your miniatures.
          </Text>
          <TouchableOpacity
            onPress={requestPermission}
            className="bg-indigo-600 px-6 py-3 rounded-xl"
          >
            <Text className="text-white font-bold uppercase text-sm tracking-widest">
              Grant Permission
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.back()}
            className="mt-4"
          >
            <Text className="text-zinc-500 font-bold uppercase text-xs tracking-widest">
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing={facing}
      >
        <SafeAreaView className="flex-1">
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 py-2">
            <TouchableOpacity
              onPress={() => router.back()}
              className="w-10 h-10 bg-black/50 rounded-full items-center justify-center"
              accessibilityLabel="Close camera"
              accessibilityRole="button"
            >
              <XMarkIcon size={20} color="#ffffff" />
            </TouchableOpacity>

            <Text className="text-white text-xs font-bold uppercase tracking-widest">
              Capture Miniature
            </Text>

            <TouchableOpacity
              onPress={toggleFacing}
              className="w-10 h-10 bg-black/50 rounded-full items-center justify-center"
              accessibilityLabel="Flip camera"
              accessibilityRole="button"
            >
              <RefreshIcon size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Spacer */}
          <View className="flex-1" />

          {/* Capture Controls */}
          <View className="items-center pb-8">
            <TouchableOpacity
              onPress={handleCapture}
              disabled={isCapturing}
              className="w-20 h-20 rounded-full border-4 border-white items-center justify-center"
              accessibilityLabel="Take picture"
              accessibilityRole="button"
              accessibilityState={{ disabled: isCapturing, busy: isCapturing }}
            >
              {isCapturing ? (
                <ActivityIndicator size="large" color="#ffffff" />
              ) : (
                <View className="w-16 h-16 bg-white rounded-full" />
              )}
            </TouchableOpacity>

            <Text className="text-white/60 text-[10px] font-bold uppercase tracking-widest mt-4">
              Tap to capture
            </Text>
          </View>
        </SafeAreaView>
      </CameraView>
    </View>
  );
}
