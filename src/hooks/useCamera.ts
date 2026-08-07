// TODO: Remove unused module — identified in audit #17
import { useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { preparerImageSource } from '@/utils/sourceImage';
import type { ImageFile } from '../types';

interface UseCameraResult {
  hasPermission: boolean | null;
  requestPermission: () => Promise<boolean>;
  takePicture: (cameraRef: React.RefObject<CameraView>) => Promise<ImageFile | null>;
  isLoading: boolean;
  error: string | null;
}

export function useCamera(): UseCameraResult {
  const [permission, requestPermissionAsync] = useCameraPermissions();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPermission = permission?.granted ?? null;

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const result = await requestPermissionAsync();
      return result.granted;
    } catch (err) {
      setError('Failed to request camera permission');
      return false;
    }
  }, [requestPermissionAsync]);

  const takePicture = useCallback(async (
    cameraRef: React.RefObject<CameraView>
  ): Promise<ImageFile | null> => {
    if (!cameraRef.current) {
      setError('Camera not ready');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        // Pas de compression ici : l'image est de toute façon ré-encodée juste
        // après. Compresser deux fois ne fait que détruire du détail.
        quality: 1,
      });

      if (!photo) {
        setError('Failed to capture photo');
        return null;
      }

      // Même préparation que le sélecteur d'images : un seul endroit décide de
      // ce que le modèle reçoit réellement.
      const resized = { uri: await preparerImageSource(photo.uri) };

      if (Platform.OS === 'web') {
        // Native readAsStringAsync is unavailable on web; read the blob:/data:
        // URL via fetch + FileReader into a data URL.
        const response = await fetch(resized.uri);
        const blob = await response.blob();
        const dataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        return { base64: dataUri, mimeType: 'image/jpeg', uri: resized.uri };
      }

      const base64Raw = await FileSystem.readAsStringAsync(resized.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      return {
        base64: `data:image/jpeg;base64,${base64Raw}`,
        mimeType: 'image/jpeg',
        uri: resized.uri,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to take picture';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    hasPermission,
    requestPermission,
    takePicture,
    isLoading,
    error,
  };
}
