import { supabase } from './supabase';
import type { ImageFile } from '../types';

let abortController: AbortController | null = null;

export const cancelGeneration = () => {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
};

/**
 * Prepares image data for the Edge Function.
 */
const prepareImagePayload = (image: ImageFile) => {
    const base64Data = image.base64.includes(',')
        ? image.base64.split(',')[1]
        : image.base64;

    return {
        mimeType: image.mimeType,
        data: base64Data
    };
};

export async function generatePaintedMiniature(
    baseImages: ImageFile | ImageFile[] | null,
    prompt: string,
    numberOfImages: number,
    model: 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview'
): Promise<string[]> {
    const imagesToProcess = Array.isArray(baseImages) ? baseImages : (baseImages ? [baseImages] : []);
    const baseImagePayload = imagesToProcess.length > 0 ? prepareImagePayload(imagesToProcess[0]) : undefined;

    abortController = new AbortController();

    console.log("[Gemini Proxy] Sending request to Supabase Edge Function...");
    console.log(`[Gemini Proxy] Model: ${model}, Prompt Length: ${prompt.length}, Has Image: ${!!baseImagePayload}`);

    // Get current session to ensure we pass the fresh token
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
        console.warn("[Gemini Proxy] No active session token found!");
    }

    // Call Supabase Edge Function with explicit Auth header
    const { data, error } = await supabase.functions.invoke('generate-miniature', {
        body: {
            prompt,
            baseImage: baseImagePayload,
            model,
            action: 'generate'
        },
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    console.log("[Gemini Proxy] Response received:", JSON.stringify({
        hasError: !!error,
        errorMsg: error?.message,
        hasData: !!data,
        dataError: data?.error,
        hasOutput: !!data?.output,
        outputLength: data?.output?.length
    }));

    if (error) {
        console.error("Edge Function Network/Server Error:", error);
        throw new Error(error.message || "Failed to connect to the AI service. Please check your connection.");
    }

    if (data?.error) {
        console.error("Edge Function Logic Error:", data.error);
        throw new Error(data.error);
    }

    // The Edge Function returns { output: "base64..." or "text..." }
    const result = data.output;

    if (result) {
        return [result.startsWith('data:') ? result : `data:image/png;base64,${result}`];
    }

    console.warn("[Gemini Proxy] No output in response");
    return [];
}

export async function generateImageFromImage(
    baseImages: ImageFile | ImageFile[],
    prompt: string,
    model: 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview'
): Promise<string[]> {
    return generatePaintedMiniature(baseImages, prompt, 1, model);
}

export async function upscaleImage(
    baseImage: ImageFile,
    model: 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview' = 'gemini-2.5-flash-image'
): Promise<string> {
    const baseImagePayload = prepareImagePayload(baseImage);

    abortController = new AbortController();

    console.log("[Gemini Proxy] Upscale request...");

    // Get current session to ensure we pass the fresh token
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const { data, error } = await supabase.functions.invoke('generate-miniature', {
        body: {
            prompt: "Upscale this image",
            baseImage: baseImagePayload,
            model,
            action: 'upscale'
        },
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    console.log("[Gemini Proxy] Upscale response:", { hasError: !!error, hasOutput: !!data?.output });

    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);

    const result = data.output;
    if (!result) throw new Error("Upscale failed to return data.");

    return result.startsWith('data:') ? result : `data:image/png;base64,${result}`;
}
