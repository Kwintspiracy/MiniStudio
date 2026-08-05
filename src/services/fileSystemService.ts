import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

/**
 * Delete a list of temporary file URIs (cache directory only).
 * Silently ignores files that have already been deleted.
 */
export const cleanupTempFiles = async (uris: string[]): Promise<void> => {
    await Promise.all(
        uris.map(async (uri) => {
            try {
                if (uri && uri.startsWith('file://') && uri.includes('/cache/')) {
                    const info = await FileSystem.getInfoAsync(uri);
                    if (info.exists) {
                        await FileSystem.deleteAsync(uri, { idempotent: true });
                    }
                }
            } catch (e) {
                if (__DEV__) console.warn('[FileSystem] Failed to delete temp file:', uri, e);
            }
        })
    );
};

/**
 * Save a base64 string to a local file in the document directory
 * Returns the file URI
 */
export const saveBase64ToFile = async (base64Data: string, prefix: string = 'mini_'): Promise<string> => {
    try {
        // Web: there is no native filesystem. The incoming data:/blob:/http URL
        // is already directly usable by the UI (display + history), so return it
        // as-is instead of writing to a (nonexistent) document directory.
        if (Platform.OS === 'web') {
            return base64Data;
        }

        const filename = `${prefix}${Date.now()}.png`;
        const fileUri = `${FileSystem.documentDirectory}${filename}`;

        // If input is already a local file URI, copy it to document directory
        if (base64Data.startsWith('file://')) {
            await FileSystem.copyAsync({ from: base64Data, to: fileUri });
            return fileUri;
        }

        // Strip data URI prefix if present
        // Use substring instead of split to save memory
        const prefixMatch = 'base64,';
        const splitIndex = base64Data.indexOf(prefixMatch);
        const pureBase64 = splitIndex !== -1
            ? base64Data.substring(splitIndex + prefixMatch.length)
            : base64Data;

        await FileSystem.writeAsStringAsync(fileUri, pureBase64, {
            encoding: FileSystem.EncodingType.Base64,
        });

        return fileUri;
    } catch (error) {
        console.error('Error saving base64 to file:', error);
        throw error;
    }
};

/**
 * Save a base64 image or remote URL to the device gallery
 */
export const saveImageToGallery = async (uri: string): Promise<boolean> => {
    try {
        // Web: no media library — trigger a browser download instead.
        if (Platform.OS === 'web') {
            const link = document.createElement('a');
            link.href = uri;
            link.download = `ministudio_${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return true;
        }

        const { status } = await MediaLibrary.requestPermissionsAsync();

        if (status !== 'granted') {
            throw new Error('Permission to access media library was denied');
        }

        let fileUri = uri;

        // If it's a base64 data URI, we need to save it to a temporary file first
        if (uri.startsWith('data:')) {
            const base64Code = uri.includes('base64,') ? uri.split('base64,')[1] : uri;
            const filename = FileSystem.cacheDirectory + `ministudio_${Date.now()}.png`;
            await FileSystem.writeAsStringAsync(filename, base64Code, {
                encoding: FileSystem.EncodingType.Base64,
            });
            fileUri = filename;
        }

        const asset = await MediaLibrary.createAssetAsync(fileUri);
        // Only try to create/add to album if on iOS or if needed on Android
        // createAlbumAsync behaves differently across platforms
        try {
            await MediaLibrary.createAlbumAsync('MiniStudio', asset, false);
        } catch (albumError) {
            console.warn('Could not create or add to MiniStudio album:', albumError);
        }
        return true;
    } catch (error) {
        console.error('Error saving image:', error);
        return false;
    }
};
