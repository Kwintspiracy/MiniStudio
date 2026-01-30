import { supabase } from './supabase';
import Constants from 'expo-constants';
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
    
    if (baseImagePayload && baseImagePayload.data) {
        const payloadSizeMB = baseImagePayload.data.length / 1024 / 1024;
        console.log(`[Gemini Proxy] Image Payload Size: ${payloadSizeMB.toFixed(2)} MB`);
        if (payloadSizeMB > 6) {
             console.warn("[Gemini Proxy] WARNING: Image payload > 6MB. May cause network failure.");
        }
    }

    // Get current session to ensure we pass the fresh token
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
        console.warn("[Gemini Proxy] No active session token found!");
    }

    // Call Supabase Edge Function with explicit Auth header
    console.log(`[Gemini Proxy] Signal State before invoke: aborted=${abortController.signal.aborted}`);
    
    // Explicitly check if we are already aborted
    if (abortController.signal.aborted) {
        throw new Error("Request was aborted before it could start.");
    }
    
    // Construct URL for Edge Function
    // Fallback to project ID based URL if custom domain not set, but typical usage is via Supabase client URL
    // Actually, we can retrieve the functions URL from the supabase client internal config, but let's use the explicit one from constants
    // A safer way consistent with supabase-js is:
    const functionUrl = `${Constants.expoConfig?.extra?.supabaseUrl}/functions/v1/generate-miniature`;

    try {
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt,
                baseImage: baseImagePayload,
                model,
                action: 'generate'
            }),
            signal: abortController.signal
        });

        if (!response.ok) {
           const text = await response.text();
           let errorJson;
           try { errorJson = JSON.parse(text); } catch (e) {}
           
           // Check for Overloaded Error from Edge Function
           if (errorJson?.code === 'OVERLOADED' || response.status === 503) {
               throw new Error("Google Servers Overloaded");
           }
           
           let errorMsg = errorJson?.error || errorJson?.message || `Server error: ${response.status}`;
           
           // Client-side cleanup of the specific "undefined/undefined" error if backend isn't fixed yet
           if (typeof errorMsg === 'string' && errorMsg.includes("undefined/undefined")) {
               console.warn("[Gemini Proxy] Detected malformed limit error from backend.");
               errorMsg = "Limit Reached. You have exhausted your daily or monthly quota.";
           }

           throw new Error(errorMsg);
        }

        const data = await response.json();
        
        // Post-request cancellation check (just in case race condition)
        if (abortController.signal.aborted) {
             throw new Error("Request cancelled by user.");
        }

        console.log("[Gemini Proxy] Response received");

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

    } catch (error: any) {
        if (error.name === 'AbortError' || error.message === 'Aborted' || error.message.includes('cancelled')) {
             console.log("[Gemini Proxy] Request successfully aborted.");
             throw new Error("Request cancelled by user.");
        }
        
        if (!error.message?.includes("Limit Reached")) {
             console.error("Gemini Proxy Error:", error);
        } else {
             console.log("Gemini Proxy Info: Limit Reached (handled by UI)");
        }
        let errorMessage = error.message || "Failed to connect to the AI service.";
        
        if (errorMessage.includes("Network request failed") || errorMessage.includes("fetch")) {
             if (baseImagePayload && baseImagePayload.data.length > 5 * 1024 * 1024) {
                 errorMessage += " The source image might be too large.";
             } else {
                 errorMessage += " Please check your internet connection.";
             }
        }
        throw new Error(errorMessage);
    }
}

export async function generateImageFromImage(
    baseImages: ImageFile | ImageFile[],
    prompt: string,
    model: 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview'
): Promise<string[]> {
    return generatePaintedMiniature(baseImages, prompt, 1, model);
}


