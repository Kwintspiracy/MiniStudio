import { supabase } from './supabase';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { ImageFile } from '../types';

let abortController: AbortController | null = null;

// ===================================================================
// PERSISTENT GENERATION - Job tracking across app sessions
// ===================================================================

const PENDING_JOB_KEY = 'pending_generation_job';
const JOB_TIMEOUT_MS = 300000; // 5 minutes

interface PendingJob {
    job_id: string;
    timestamp: number;
    prompt: string;
}

/**
 * Save a pending job to AsyncStorage
 */
async function savePendingJob(job_id: string, prompt: string): Promise<void> {
    const job: PendingJob = {
        job_id,
        timestamp: Date.now(),
        prompt
    };
    await AsyncStorage.setItem(PENDING_JOB_KEY, JSON.stringify(job));
    if (__DEV__) console.log('[Gemini] Saved pending job:', job_id);
}

/**
 * Load pending job from AsyncStorage (with timeout check)
 */
export async function loadPendingJob(): Promise<PendingJob | null> {
    try {
        const stored = await AsyncStorage.getItem(PENDING_JOB_KEY);
        if (!stored) return null;

        const job: PendingJob = JSON.parse(stored);
        const age = Date.now() - job.timestamp;

        // Check if job has timed out
        if (age > JOB_TIMEOUT_MS) {
            if (__DEV__) console.log('[Gemini] Pending job timed out, clearing');
            await clearPendingJob();
            return null;
        }

        if (__DEV__) console.log('[Gemini] Found pending job:', job.job_id, `(${Math.round(age / 1000)}s old)`);
        return job;
    } catch (error) {
        if (__DEV__) console.error('[Gemini] Error loading pending job:', error);
        return null;
    }
}

/**
 * Clear pending job from AsyncStorage
 */
export async function clearPendingJob(): Promise<void> {
    await AsyncStorage.removeItem(PENDING_JOB_KEY);
    if (__DEV__) console.log('[Gemini] Cleared pending job');
}

/**
 * Resume a pending generation by re-subscribing to Realtime.
 * Returns an unsubscribe function that callers must invoke on unmount/navigation.
 */
export function resumePendingGeneration(
    job_id: string,
    onComplete: (fileUri: string) => void,
    onError: (error: Error) => void
): () => void {
    if (__DEV__) console.log(`[Gemini] Resuming pending job ${job_id}`);

    let resolved = false;

    const cleanup = async (err?: Error) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        await supabase.removeChannel(subscription);
        await clearPendingJob();
        if (err) onError(err);
    };

    // Timeout: if the job doesn't complete within JOB_TIMEOUT_MS, give up
    const timeoutId = setTimeout(() => {
        cleanup(new Error('Image generation timed out. Please try again.'));
    }, JOB_TIMEOUT_MS);

    const subscription = supabase
        .channel(`job-${job_id}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'generation_jobs',
            filter: `id=eq.${job_id}`
        }, async (payload) => {
            if (__DEV__) console.log('[Gemini] Realtime update (resumed):', payload.new);

            const job = payload.new as {
                status: string;
                result_image_url?: string;
                error_message?: string;
            };

            if (job.status === 'completed' && job.result_image_url) {
                if (resolved) return;
                if (__DEV__) console.log('[Gemini] Resumed job completed!');
                // Mark resolved and clean up before the async fetch so
                // concurrent cancel/timeout calls don't double-unsubscribe
                resolved = true;
                clearTimeout(timeoutId);
                await supabase.removeChannel(subscription);
                await clearPendingJob();

                try {
                    const localUri = `${FileSystem.cacheDirectory}resumed_${Date.now()}.png`;
                    await FileSystem.downloadAsync(job.result_image_url, localUri);
                    onComplete(localUri);
                } catch (fetchError) {
                    onError(new Error('Failed to fetch generated image'));
                }
            } else if (job.status === 'failed') {
                cleanup(new Error(job.error_message || 'Image generation failed'));
            }
        })
        .subscribe((status) => {
            if (__DEV__) console.log(`[Gemini] Realtime subscription status (resumed): ${status}`);
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                cleanup(new Error(`Realtime channel ${status.toLowerCase()} for resumed job`));
            }
        });

    // Return cancel function for callers to invoke on unmount/navigation
    return () => { cleanup(new Error('Subscription cancelled')); };
}

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
    // Optimization: Avoid create split array, just slice the string
    const base64Data = image.base64.startsWith('data:') 
        ? image.base64.substring(image.base64.indexOf(',') + 1)
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
    temperature?: number,
    metadata?: any
): Promise<string[]> {
    const imagesToProcess = Array.isArray(baseImages) ? baseImages : (baseImages ? [baseImages] : []);
    const baseImagePayload = imagesToProcess.length > 0 ? prepareImagePayload(imagesToProcess[0]) : undefined;

    abortController = new AbortController();

    if (__DEV__) console.log("[AI Proxy] Sending request to Supabase Edge Function...");
    if (__DEV__) console.log(`[AI Proxy] Prompt Length: ${prompt.length}`);
    
    if (baseImagePayload && baseImagePayload.data) {
        const payloadSizeMB = baseImagePayload.data.length / 1024 / 1024;
        if (__DEV__) console.log(`[Gemini Proxy] Image Payload Size: ${payloadSizeMB.toFixed(2)} MB`);
        if (payloadSizeMB > 6) {
            if (__DEV__) console.warn("[Gemini Proxy] WARNING: Image payload > 6MB. May cause network failure.");
        }
    }

    // Get current session to ensure we pass the fresh token
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
        if (__DEV__) console.warn("[AI Proxy] No active session token found!");
    }

    // Call Supabase Edge Function with explicit Auth header
    if (__DEV__) console.log(`[AI Proxy] Signal State before invoke: aborted=${abortController.signal.aborted}`);
    
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
        // Get device ID for token tracking (iOS ID or Android ID)
        const deviceId = await Application.getIosIdForVendorAsync() || 
                         Application.getAndroidId() || 
                         'unknown';

        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt,
                baseImage: baseImagePayload,
                action: 'generate',
                temperature,
                device_id: deviceId,
                metadata: metadata
            }),
            signal: abortController.signal
        });

        if (!response.ok) {
           const text = await response.text();
           let errorJson;
           try { errorJson = JSON.parse(text); } catch (e) {}
           
           if (__DEV__) console.log('[AI Proxy] Backend Error Response:', errorJson || text);
           if (__DEV__) console.log('[AI Proxy] Response Status:', response.status);
           
           // Check for Overloaded Error from Edge Function
           if (errorJson?.code === 'OVERLOADED' || response.status === 503) {
               throw new Error("Google Servers Overloaded");
           }
           
           let errorMsg = errorJson?.error || errorJson?.message || `Server error: ${response.status}`;
           
           // Log detailed info for limit errors
           if (errorMsg && typeof errorMsg === 'string' && errorMsg.toLowerCase().includes('limit')) {
               if (__DEV__) {
                   console.log('[AI Proxy] Limit Error Details:');
                   console.log('[AI Proxy] - Full Error:', errorMsg);
                   console.log('[AI Proxy] - Backend Response:', errorJson);
                   console.log('[AI Proxy] - Status:', response.status);
               }
           }
           
           // Client-side cleanup of the specific "undefined/undefined" error if backend isn't fixed yet
           if (typeof errorMsg === 'string' && errorMsg.includes("undefined/undefined")) {
               if (__DEV__) console.warn("[AI Proxy] Detected malformed limit error from backend.");
               errorMsg = "Limit Reached. You have exhausted your daily or monthly quota.";
           }

           throw new Error(errorMsg);
        }

        const data = await response.json();
        
        // Post-request cancellation check (just in case race condition)
        if (abortController.signal.aborted) {
             throw new Error("Request cancelled by user.");
        }

        if (__DEV__) console.log("[AI Proxy] Response received:", data);

        if (data?.error) {
            if (__DEV__) console.error("AI Proxy Logic Error:", data.error);
            throw new Error(data.error);
        }

        // ================================================================
        // Handle dual response patterns
        // ================================================================
        
        // SYNC RESPONSE (Gemini): Image returned immediately
        if (data.output) {
            if (__DEV__) console.log("[AI Proxy] Sync response - image received directly");
            const result = data.output;
            const base64Data = result.startsWith('data:') ? result.split(',')[1] : result;
            const localUri = `${FileSystem.cacheDirectory}sync_${Date.now()}.png`;
            await FileSystem.writeAsStringAsync(localUri, base64Data, {
                encoding: FileSystem.EncodingType.Base64,
            });
            return [localUri];
        }
        
        // ASYNC RESPONSE (PoYo): Subscribe to Realtime for job updates
        if (data.status === 'processing' && data.job_id) {
            if (__DEV__) console.log(`[AI Proxy] Async response - subscribing to job ${data.job_id}`);
            
            // Save job for persistence across app sessions
            await savePendingJob(data.job_id, prompt);
            
            // Clean up any stale job channels from previous generations
            const existingChannels = supabase.getChannels();
            for (const ch of existingChannels) {
                if (ch.topic.startsWith('realtime:job-')) {
                    if (__DEV__) console.log(`[AI Proxy] Removing stale channel: ${ch.topic}`);
                    await supabase.removeChannel(ch);
                }
            }

            return new Promise<string[]>((resolve, reject) => {
                const TIMEOUT_MS = 300000; // 5 minute timeout for webhook
                let resolved = false;
                let pollIntervalId: ReturnType<typeof setInterval>;
                let pollDelayId: ReturnType<typeof setTimeout>;

                // Single cleanup helper — eliminates repeated unsubscribe/clearTimeout/removeEventListener
                // scattered across every code path. Safe to call via `resolved` guard.
                const cleanup = async () => {
                    clearTimeout(timeoutId);
                    clearTimeout(pollDelayId);
                    clearInterval(pollIntervalId);
                    abortController?.signal.removeEventListener('abort', handleAbort);
                    await supabase.removeChannel(subscription);
                    await clearPendingJob();
                };

                // Create the subscription FIRST so `subscription` is defined before
                // setTimeout/addEventListener can reference it (prevents TDZ errors if
                // the abort signal is already set or the timeout fires synchronously).

                const startPoll = () => {
                    if (pollIntervalId || resolved) return;
                    pollIntervalId = setInterval(async () => {
                        if (resolved) { clearInterval(pollIntervalId); return; }
                        try {
                            const { data: job } = await supabase
                                .from('generation_jobs')
                                .select('status, result_image_url, error_message')
                                .eq('id', data.job_id)
                                .single();

                            if (job?.status === 'completed' && job.result_image_url) {
                                if (!resolved) {
                                    if (__DEV__) console.log('[AI Proxy] Poll fallback: job completed');
                                    resolved = true;
                                    await cleanup();

                                    try {
                                        const localUri = `${FileSystem.cacheDirectory}poll_${Date.now()}.png`;
                                        await FileSystem.downloadAsync(job.result_image_url, localUri);
                                        resolve([localUri]);
                                    } catch (fetchError) {
                                        reject(new Error('Failed to fetch generated image'));
                                    }
                                }
                            } else if (job?.status === 'failed') {
                                if (!resolved) {
                                    resolved = true;
                                    await cleanup();
                                    reject(new Error(job.error_message || 'Image generation failed'));
                                }
                            }
                        } catch (e) {
                            if (__DEV__) console.warn('[AI Proxy] Poll check failed:', e);
                        }
                    }, 10000);
                };

                const subscription = supabase
                    .channel(`job-${data.job_id}`)
                    .on('postgres_changes', {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'generation_jobs',
                        filter: `id=eq.${data.job_id}`
                    }, async (payload) => {
                        if (__DEV__) console.log('[Gemini Proxy] Realtime update:', payload.new);

                        const job = payload.new as {
                            status: string;
                            result_image_url?: string;
                            error_message?: string;
                        };

                        if (job.status === 'completed' && job.result_image_url) {
                            if (!resolved) {
                                if (__DEV__) console.log('[AI Proxy] Job completed!');
                                resolved = true;
                                await cleanup();

                                try {
                                    const localUri = `${FileSystem.cacheDirectory}gen_${Date.now()}.png`;
                                    await FileSystem.downloadAsync(job.result_image_url, localUri);
                                    resolve([localUri]);
                                } catch (fetchError) {
                                    reject(new Error('Failed to fetch generated image'));
                                }
                            }
                        } else if (job.status === 'failed') {
                            if (!resolved) {
                                resolved = true;
                                await cleanup();
                                reject(new Error(job.error_message || 'Image generation failed'));
                            }
                        }
                    })
                    .subscribe((status) => {
                        if (__DEV__) console.log(`[Gemini Proxy] Realtime subscription status: ${status}`);
                        if (status === 'SUBSCRIBED') {
                            if (__DEV__) console.log(`[AI Proxy] Successfully subscribed to job-${data.job_id}`);
                        }
                        if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !resolved) {
                            if (__DEV__) console.warn(`[AI Proxy] Realtime ${status} for job-${data.job_id}, starting poll fallback`);
                            clearTimeout(pollDelayId);
                            startPoll();
                        }
                    });

                // Fallback: start polling after 30s delay in case Realtime misses the event
                pollDelayId = setTimeout(() => startPoll(), 30000);

                // Setup timeout — subscription is guaranteed defined here
                const timeoutId = setTimeout(async () => {
                    if (!resolved) {
                        resolved = true;
                        await cleanup();
                        reject(new Error('Image generation timed out. Please try again.'));
                    }
                }, TIMEOUT_MS);

                // Handle abort signal — subscription is guaranteed defined here
                const handleAbort = async () => {
                    if (!resolved) {
                        resolved = true;
                        await cleanup();
                        reject(new Error('Request cancelled by user.'));
                    }
                };
                abortController?.signal.addEventListener('abort', handleAbort);
            });
        }

        if (__DEV__) console.warn("[AI Proxy] No output in response");
        return [];

    } catch (error: any) {
        if (error.name === 'AbortError' || error.message === 'Aborted' || error.message.includes('cancelled')) {
             if (__DEV__) console.log("[AI Proxy] Request successfully aborted.");
             throw new Error("Request cancelled by user.");
        }

        if (!error.message?.includes("Limit Reached")) {
             if (__DEV__) console.error("AI Proxy Error:", error);
        } else {
             if (__DEV__) console.log("AI Proxy Info: Limit Reached (handled by UI)");
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
    temperature?: number
): Promise<string[]> {
    return generatePaintedMiniature(baseImages, prompt, 1, temperature);
}
