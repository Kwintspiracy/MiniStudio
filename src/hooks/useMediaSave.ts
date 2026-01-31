import { useState, useCallback } from 'react';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform, Share } from 'react-native';

interface UseMediaSaveResult {
  saveImage: (base64OrUri: string) => Promise<boolean>;
  shareImage: (base64OrUri: string) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
}

export function useMediaSave(): UseMediaSaveResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveImage = useCallback(async (base64OrUri: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      // Check existing permissions first to avoid repetitive prompts
      const permission = await MediaLibrary.getPermissionsAsync(true);
      
      if (permission.status === 'granted' || permission.accessPrivileges === 'limited') {
        // We have permission (full or limited), proceed
      } else if (permission.status === 'undetermined' || permission.canAskAgain) {
         const { status } = await MediaLibrary.requestPermissionsAsync(true);
         if (status !== 'granted') {
           setError('Permission to save to media library was denied');
           return false;
         }
      } else {
         setError('Permission to save to media library was denied');
         return false;
      }

      let fileUri: string;

      // Check if it's a base64 data URL or a file URI
      if (base64OrUri.startsWith('data:')) {
        // It's a base64 data URL - need to save to file first
        const base64Data = base64OrUri.split(',')[1];
        const filename = `ministudio-${Date.now()}.png`;
        fileUri = `${FileSystem.cacheDirectory}${filename}`;

        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        // It's already a file URI
        fileUri = base64OrUri;
      }

      // Save to media library (Directly to camera roll)
      await MediaLibrary.createAssetAsync(fileUri);

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save image';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const shareImage = useCallback(async (base64OrUri: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      let fileUri: string;

      // Check if it's a base64 data URL or a file URI
      if (base64OrUri.startsWith('data:')) {
        // It's a base64 data URL - need to save to file first
        const base64Data = base64OrUri.split(',')[1];
        const filename = `ministudio-share-${Date.now()}.png`;
        fileUri = `${FileSystem.cacheDirectory}${filename}`;

        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        // It's already a file URI
        fileUri = base64OrUri;
      }

      // Share the image
      if (Platform.OS === 'web') {
        // For web, we can't share files directly
        // Instead, we could trigger a download
        const link = document.createElement('a');
        link.href = base64OrUri;
        link.download = `ministudio-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
      }

      const result = await Share.share({
        url: fileUri,
        title: 'MiniStudio Generated Image',
      });

      return result.action === Share.sharedAction;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to share image';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    saveImage,
    shareImage,
    isLoading,
    error,
  };
}
