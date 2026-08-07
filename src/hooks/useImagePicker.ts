import { useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { preparerImageSource } from '@/utils/sourceImage';
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

  // La préparation vit dans `@/utils/sourceImage`, partagée avec la caméra.
  // Elle plafonnait ici à 1024 px et JPEG 70 %, ce qui ne laissait au modèle Pro
  // rien de plus à exploiter qu'au modèle Standard — voir le commentaire de tête
  // de ce module.
  const resizeImage = useCallback(preparerImageSource, []);

  const convertToImageFile = useCallback(async (uri: string): Promise<ImageFile> => {
    try {
      // Web: expo-file-system's native readAsStringAsync is unavailable. The URI
      // here is a blob:/data: URL from the image manipulator, so read it via
      // fetch + FileReader, which yields a "data:<mime>;base64,..." string.
      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        const blob = await response.blob();
        const mimeType = blob.type || 'image/jpeg';
        const base64DataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        return { base64: base64DataUrl, mimeType, uri };
      }

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
        quality: 1,
        // No base64 here: the asset is downscaled by resizeImage() and the final
        // base64 is produced from the resized file in convertToImageFile().
        // Requesting base64 of the full-res original just wastes memory/CPU.
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return null;
      }

      const asset = result.assets[0];
      const resizedUri = await resizeImage(asset.uri);

      return await convertToImageFile(resizedUri);
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
        quality: 1,
        // base64 omitted on purpose — see pickImage(): resizeImage() +
        // convertToImageFile() produce the base64 from the downscaled file.
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return [];
      }

      const imageFiles: ImageFile[] = [];

      for (const asset of result.assets) {
        const resizedUri = await resizeImage(asset.uri);
        const imageFile = await convertToImageFile(resizedUri);
        imageFiles.push(imageFile);
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
      const resizedUri = await resizeImage(asset.uri);
      return await convertToImageFile(resizedUri);
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
