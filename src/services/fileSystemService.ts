import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';

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
            const base64Code = uri.split('data:image/png;base64,')[1];
            const filename = FileSystem.documentDirectory + `ministudio_${Date.now()}.png`;
            await FileSystem.writeAsStringAsync(filename, base64Code, {
                encoding: FileSystem.EncodingType.Base64,
            });
            fileUri = filename;
        }

        const asset = await MediaLibrary.createAssetAsync(fileUri);
        await MediaLibrary.createAlbumAsync('MiniStudio', asset, false);
        return true;
    } catch (error) {
        console.error('Error saving image:', error);
        return false;
    }
};
