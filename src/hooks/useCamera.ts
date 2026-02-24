// TODO: Remove unused module — identified in audit #17
import { useState, useCallback, useRef } from 'react';
import { CameraView, useCameraPermissions } from 'expo-camera';
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

      if (!photo || !photo.base64) {
        setError('Failed to capture photo');
        return null;
      }

      return {
        base64: `data:image/jpeg;base64,${photo.base64}`,
        mimeType: 'image/jpeg',
        uri: photo.uri,
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
