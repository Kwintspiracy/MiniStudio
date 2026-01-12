import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import type { ImageFile } from '../types';

interface UseImagePickerResult {
  pickImage: () => Promise<ImageFile | null>;
  pickMultipleImages: () => Promise<ImageFile[]>;
  pickDocument: () => Promise<ImageFile | null>;
  isLoading: boolean;
  error: string | null;
}

export function useImagePicker(): UseImagePickerResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convertToImageFile = useCallback(async (uri: string): Promise<ImageFile> => {
    try {
      // Read the file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Determine mime type from URI extension
      const extension = uri.split('.').pop()?.toLowerCase() || 'jpg';
      let mimeType = 'image/jpeg';
      switch (extension) {
        case 'png':
          mimeType = 'image/png';
          break;
        case 'gif':
          mimeType = 'image/gif';
          break;
        case 'webp':
          mimeType = 'image/webp';
          break;
        default:
          mimeType = 'image/jpeg';
      }

      return {
        base64: `data:${mimeType};base64,${base64}`,
        mimeType,
        uri,
      };
    } catch (err) {
      console.error('Error converting image to base64:', err);
      throw new Error('Failed to process image');
    }
  }, []);

  const pickImage = useCallback(async (): Promise<ImageFile | null> => {
    setIsLoading(true);
    setError(null);

    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setError('Permission to access photo library was denied');
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];

      // If base64 is already provided, use it directly
      if (asset.base64) {
        const mimeType = asset.mimeType || 'image/jpeg';
        return {
          base64: `data:${mimeType};base64,${asset.base64}`,
          mimeType,
          uri: asset.uri,
        };
      }

      // Otherwise convert from URI
      return await convertToImageFile(asset.uri);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to pick image';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [convertToImageFile]);

  const pickMultipleImages = useCallback(async (): Promise<ImageFile[]> => {
    setIsLoading(true);
    setError(null);

    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setError('Permission to access photo library was denied');
        return [];
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.8,
        base64: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return [];
      }

      const imageFiles: ImageFile[] = [];

      for (const asset of result.assets) {
        if (asset.base64) {
          const mimeType = asset.mimeType || 'image/jpeg';
          imageFiles.push({
            base64: `data:${mimeType};base64,${asset.base64}`,
            mimeType,
            uri: asset.uri,
          });
        } else {
          const imageFile = await convertToImageFile(asset.uri);
          imageFiles.push(imageFile);
        }
      }

      return imageFiles;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to pick images';
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [convertToImageFile]);

  const pickDocument = useCallback(async (): Promise<ImageFile | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];
      return await convertToImageFile(asset.uri);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to pick document';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [convertToImageFile]);

  return {
    pickImage,
    pickMultipleImages,
    pickDocument,
    isLoading,
    error,
  };
}
