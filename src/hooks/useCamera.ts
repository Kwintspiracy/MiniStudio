// TODO: Remove unused module — identified in audit #17
import { useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
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
        quality: 0.8,
      });

      if (!photo) {
        setError('Failed to capture photo');
        return null;
      }

      const image = await ImageManipulator.manipulate(photo.uri)
        .resize({ width: 1024 })
        .renderAsync();
      const resized = await image.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });

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
