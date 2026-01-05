import * as FileSystem from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';

const GALLERY_DIRECTORY = (FileSystem.documentDirectory || '') + 'gallery/';

/**
 * Ensures the gallery directory exists.
 */
const ensureDirectoryExists = async () => {
    if (Platform.OS === 'web') return;

    const dirInfo = await FileSystem.getInfoAsync(GALLERY_DIRECTORY);
    if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(GALLERY_DIRECTORY, { intermediates: true });
    }
};

/**
 * Saves a base64 encoded image to the local filesystem.
 * @param base64Data The raw base64 string (with or without prefix).
 * @returns The file URI of the saved image.
 */
export const saveImageToGallery = async (base64Data: string): Promise<string> => {
    if (Platform.OS === 'web') {
        // on Web, we can't save to file system easily. 
        // We return the base64 string so it can be displayed directly.
        return base64Data;
    }

    await ensureDirectoryExists();

    // Strip data:image/png;base64, prefix if present
    const base64 = base64Data.replace(/^data:image\/\w+;base64,/, "");

    const filename = `ministudio_${randomUUID()}.png`;
    const fileUri = GALLERY_DIRECTORY + filename;

    await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
    });

    return fileUri;
};

/**
 * Deletes an image from the local filesystem.
 * @param fileUri The URI of the file to delete.
 */
export const deleteImageFromGallery = async (fileUri: string): Promise<void> => {
    if (Platform.OS === 'web') return;

    try {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
    } catch (error) {
        console.error("Error deleting image:", error);
    }
};
