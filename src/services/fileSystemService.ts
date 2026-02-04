import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Save a base64 string to a local file in the document directory
 * Returns the file URI
 */
export const saveBase64ToFile = async (base64Data: string, prefix: string = 'mini_'): Promise<string> => {
    try {
        const filename = `${prefix}${Date.now()}.png`;
        const fileUri = `${FileSystem.documentDirectory}${filename}`;
        
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
