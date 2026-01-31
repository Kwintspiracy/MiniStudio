import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.21.0'

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    PRIMARY_PROVIDER: Deno.env.get('PRIMARY_PROVIDER') || 'poyo',
    FALLBACK_ENABLED: Deno.env.get('FALLBACK_ENABLED') !== 'false',
    POYO_TIMEOUT_MS: parseInt(Deno.env.get('POYO_TIMEOUT_MS') || '60000'),
    GOOGLE_TIMEOUT_MS: parseInt(Deno.env.get('GOOGLE_TIMEOUT_MS') || '30000'),
    CIRCUIT_BREAKER_THRESHOLD: parseInt(Deno.env.get('CIRCUIT_BREAKER_THRESHOLD') || '5'),
    CIRCUIT_BREAKER_COOLDOWN_MS: parseInt(Deno.env.get('CIRCUIT_BREAKER_COOLDOWN_MS') || '600000'),
    // Webhook URL for async PoYo callbacks
    POYO_WEBHOOK_URL: Deno.env.get('POYO_WEBHOOK_URL') || 
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/poyo-webhook`,
};

// SEC-002: Environment-based CORS origins
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").filter(Boolean);
const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS[0] : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============================================================================
// LOGGING HELPERS
// ============================================================================
const log = {
    section: (provider: string) => console.log(`[${provider}] ══════════════════════════════════════════════════════`),
    divider: (provider: string) => console.log(`[${provider}] ──────────────────────────────────────────────────────`),
    info: (provider: string, ...args: any[]) => console.log(`[${provider}]`, ...args),
    error: (provider: string, ...args: any[]) => console.error(`[${provider}] ERROR:`, ...args),
    success: (provider: string, ...args: any[]) => console.log(`[${provider}] ✓`, ...args),
};

// ============================================================================
// TYPES
// ============================================================================
interface ImagePayload {
    mimeType: string;
    data: string;
}

interface PoyoTaskResult {
    success: boolean;
    imageBase64?: string;
    error?: string;
}

// ============================================================================
// POYO API FUNCTIONS
// ============================================================================

/**
 * Upload base64 image to PoYo storage
 */
async function uploadToPoyo(apiKey: string, base64Data: string, mimeType: string): Promise<string> {
    log.info('POYO', `UPLOAD: Sending base64 image (${(base64Data.length / 1024 / 1024).toFixed(2)}MB)...`);
    
    const dataUrl = base64Data.startsWith('data:') 
        ? base64Data 
        : `data:${mimeType};base64,${base64Data}`;

    const response = await fetch('https://api.poyo.ai/api/common/upload/base64', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ base64_data: dataUrl }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Upload failed (${response.status}): ${text}`);
    }

    const result = await response.json();
    if (!result.success || !result.data?.file_url) {
        throw new Error(`Upload failed: ${result.msg || 'No file_url returned'}`);
    }

    log.success('POYO', `UPLOAD: Success → ${result.data.file_url}`);
    return result.data.file_url;
}

/**
 * Submit generation task to PoYo
 */
async function submitPoyoTask(
    apiKey: string, 
    prompt: string, 
    imageUrl?: string,
    callbackUrl?: string
): Promise<string> {
    const model = imageUrl ? 'nano-banana-2-edit' : 'nano-banana-2';
    log.info('POYO', `GENERATE: Submitting to PoYo (${model})...`);
    if (callbackUrl) {
        log.info('POYO', `GENERATE: Webhook callback → ${callbackUrl}`);
    }

    const payload: any = {
        model,
        input: {
            prompt,
            size: '1:1',
        },
    };

    if (imageUrl) {
        payload.input.image_urls = [imageUrl];
    }

    // Add webhook callback URL for async notifications
    if (callbackUrl) {
        payload.callback_url = callbackUrl;
    }

    const response = await fetch('https://api.poyo.ai/api/generate/submit', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Submit failed (${response.status}): ${text}`);
    }

    const result = await response.json();
    log.info('POYO', `GENERATE: Full response: ${JSON.stringify(result)}`);
    
    // PoYo API wraps response in {code, data: {...}}
    const taskId = result.data?.task_id || result.task_id;
    
    if (!taskId) {
        // Check if there's an error in the response
        const errorMsg = result.error?.message || result.error || result.message || result.msg;
        if (errorMsg) {
            throw new Error(`PoYo API error: ${errorMsg}`);
        }
        throw new Error(`No task_id in response: ${JSON.stringify(result)}`);
    }

    log.info('POYO', `GENERATE: Task created → task_id=${taskId}`);
    return taskId;
}

/**
 * Submit PoYo task with webhook callback (async flow)
 * Returns task_id immediately - result comes via webhook
 */
async function submitPoyoWithWebhook(
    supabaseClient: any,
    jobId: string,
    prompt: string,
    baseImage?: ImagePayload
): Promise<{ taskId: string }> {
    // Get available API key with rotation
    const { data: keyData, error: keyError } = await supabaseClient.rpc('get_available_poyo_key');
    
    if (keyError || !keyData?.success) {
        throw new Error(`No PoYo API keys available: ${keyError?.message || keyData?.error}`);
    }

    const apiKey = keyData.api_key;
    log.info('POYO', `API KEY: Using key (${keyData.requests_used}/5 requests this minute)`);

    // Upload image if provided
    let imageUrl: string | undefined;
    if (baseImage) {
        imageUrl = await uploadToPoyo(apiKey, baseImage.data, baseImage.mimeType);
    }

    // Submit task WITH webhook callback URL
    const taskId = await submitPoyoTask(apiKey, prompt, imageUrl, CONFIG.POYO_WEBHOOK_URL);

    // Store task_id in job for webhook to find
    await supabaseClient
        .from('generation_jobs')
        .update({ poyo_task_id: taskId, provider_used: 'poyo' })
        .eq('id', jobId);

    log.success('POYO', `ASYNC: Task submitted, webhook will handle completion`);
    return { taskId };
}


// ============================================================================
// GOOGLE GEMINI FUNCTIONS
// ============================================================================

async function generateWithGoogle(
    prompt: string,
    baseImage?: ImagePayload,
    model: string = 'gemini-2.5-flash-image',
    temperature?: number
): Promise<string> {
    log.info('GOOGLE', `GENERATE: Calling ${model} with temperature ${temperature ?? 'default'}...`);
    
    const apiKey = Deno.env.get('GOOGLE_API_KEY');
    if (!apiKey) {
        throw new Error('GOOGLE_API_KEY not configured');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const aiModel = genAI.getGenerativeModel({ model });

    const parts: any[] = [];
    if (baseImage) {
        parts.push({ inlineData: { mimeType: baseImage.mimeType, data: baseImage.data } });
    }
    parts.push({ text: prompt + "\n\nIMPORTANT: Return ONLY the generated image." });

    const result = await aiModel.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature }
    });

    const response = await result.response;
    const candidateParts = response.candidates?.[0]?.content?.parts;

    if (candidateParts) {
        for (const part of candidateParts) {
            if (part.inlineData?.data) {
                log.success('GOOGLE', `Image received`);
                return part.inlineData.data;
            }
        }
    }

    throw new Error('No image in Google response');
}

// ============================================================================
// CIRCUIT BREAKER FUNCTIONS
// ============================================================================

async function isProviderHealthy(supabaseClient: any, provider: string): Promise<boolean> {
    const { data, error } = await supabaseClient.rpc('check_provider_health', { p_provider: provider });
    
    if (error) {
        log.error('CIRCUIT', `Health check error: ${error.message}`);
        return true; // Assume healthy on error
    }

    const healthy = data?.healthy !== false;
    log.info('POYO', `CIRCUIT BREAKER: ${provider} ${healthy ? 'healthy' : 'DISABLED'} (${data?.failure_count || 0} failures)`);
    
    if (!healthy) {
        log.info('POYO', `CIRCUIT BREAKER: Disabled until ${data?.disabled_until}`);
    }

    return healthy;
}

async function recordProviderFailure(supabaseClient: any, provider: string): Promise<void> {
    const { data, error } = await supabaseClient.rpc('record_provider_failure', {
        p_provider: provider,
        p_threshold: CONFIG.CIRCUIT_BREAKER_THRESHOLD,
        p_cooldown_ms: CONFIG.CIRCUIT_BREAKER_COOLDOWN_MS,
    });

    if (error) {
        log.error('CIRCUIT', `Record failure error: ${error.message}`);
        return;
    }

    if (data?.circuit_opened) {
        log.info('POYO', `CIRCUIT BREAKER: OPENED! ${provider} disabled for ${CONFIG.CIRCUIT_BREAKER_COOLDOWN_MS / 1000}s`);
    } else {
        log.info('POYO', `CIRCUIT BREAKER: Recording failure (${data?.failure_count}/${CONFIG.CIRCUIT_BREAKER_THRESHOLD})`);
    }
}

// ============================================================================
// CREDIT MANAGEMENT FUNCTIONS
// ============================================================================

async function reserveCredits(
    supabaseClient: any, 
    userId: string, 
    cost: number
): Promise<{ success: boolean; jobId?: string; error?: string; balance?: number }> {
    const { data, error } = await supabaseClient.rpc('reserve_generation', {
        p_user_id: userId,
        p_cost: cost,
    });

    if (error) {
        return { success: false, error: error.message };
    }

    if (!data?.success) {
        return { success: false, error: data?.error, balance: data?.balance };
    }

    log.info('POYO', `CREDITS: Reserved ${cost} token(s) | Unreserved balance: ${data.remaining_balance}`);
    return { success: true, jobId: data.job_id };
}

async function confirmGeneration(
    supabaseClient: any,
    jobId: string,
    provider: string,
    model: string
): Promise<void> {
    const { data, error } = await supabaseClient.rpc('confirm_generation', {
        p_job_id: jobId,
        p_provider: provider,
        p_model: model,
    });

    if (error) {
        log.error('CREDITS', `Confirm error: ${error.message}`);
    } else {
        log.info('POYO', `CREDITS: Confirmed job ${jobId.substring(0, 8)}... | Provider: ${provider}`);
    }
}

async function releaseCredits(
    supabaseClient: any,
    jobId: string,
    errorMessage?: string
): Promise<void> {
    const { data, error } = await supabaseClient.rpc('release_generation', {
        p_job_id: jobId,
        p_error_message: errorMessage,
    });

    if (error) {
        log.error('CREDITS', `Release error: ${error.message}`);
    } else {
        log.info('POYO', `CREDITS: Released/refunded job ${jobId.substring(0, 8)}...`);
    }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const startTime = Date.now();
    let jobId: string | undefined;
    let supabaseClient: any;

    try {
        // ================================================================
        // 1. AUTHENTICATE USER
        // ================================================================
        supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        );

        let isAborted = false;
        req.signal.addEventListener('abort', () => { isAborted = true; });

        const authHeader = req.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '') ?? '';
        
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

        if (!user) {
            return new Response(JSON.stringify({ error: `Unauthorized: ${authError?.message}` }), { 
                status: 401, headers: corsHeaders 
            });
        }

        // ================================================================
        // 2. PARSE REQUEST
        // ================================================================
        const { prompt, baseImage, model, action, temperature } = await req.json();

        log.section('POYO');
        log.info('POYO', `REQUEST START | User: ${user.id.substring(0, 8)}...`);
        log.info('POYO', `Config: PRIMARY=${CONFIG.PRIMARY_PROVIDER}, FALLBACK=${CONFIG.FALLBACK_ENABLED}, TIMEOUT=${CONFIG.POYO_TIMEOUT_MS}ms`);
        log.divider('POYO');

        if (!prompt) {
            return new Response(JSON.stringify({ error: "Missing prompt" }), { 
                status: 400, headers: corsHeaders 
            });
        }

        // ================================================================
        // 3. RESERVE CREDITS
        // ================================================================
        const targetModel = model || 'gemini-2.5-flash-image';
        const isPro = targetModel.includes('pro') || targetModel.includes('preview');
        const tokenCost = isPro ? 2 : 1;

        const reservation = await reserveCredits(supabaseClient, user.id, tokenCost);
        
        if (!reservation.success) {
            log.error('CREDITS', `Reservation failed: ${reservation.error}`);
            
            let errorMessage = "Limit Reached.";
            if (reservation.error === 'insufficient_balance') {
                errorMessage = `Insufficient tokens. Balance: ${reservation.balance || 0}, Required: ${tokenCost}`;
            } else if (reservation.error === 'user_not_found') {
                errorMessage = "User account not found.";
            }
            
            return new Response(JSON.stringify({ error: errorMessage }), { 
                status: 403, headers: corsHeaders 
            });
        }

        jobId = reservation.jobId;
        log.divider('POYO');

        // Prepare image payload
        const imagePayload: ImagePayload | undefined = baseImage ? {
            mimeType: baseImage.mimeType,
            data: baseImage.data,
        } : undefined;

        // ================================================================
        // 4. DETERMINE PROVIDER FLOW
        // ================================================================
        const primaryProvider = CONFIG.PRIMARY_PROVIDER;
        const primaryHealthy = await isProviderHealthy(supabaseClient, primaryProvider);

        // ================================================================
        // 4A. POYO ASYNC FLOW (webhook-based)
        // ================================================================
        if (primaryProvider === 'poyo' && primaryHealthy) {
            try {
                log.info('POYO', 'MODE: Async (webhook callback)');
                
                // Submit task with webhook - returns immediately
                const { taskId } = await submitPoyoWithWebhook(
                    supabaseClient, 
                    jobId!, 
                    prompt, 
                    imagePayload
                );

                log.divider('POYO');
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                log.info('POYO', `REQUEST END (ASYNC) | Task: ${taskId} | Duration: ${duration}s`);
                log.section('POYO');

                // Return job_id - client will subscribe to Realtime for updates
                return new Response(JSON.stringify({ 
                    job_id: jobId,
                    status: 'processing',
                    provider: 'poyo',
                    task_id: taskId,
                    message: 'Generation started. Subscribe to job updates for completion.'
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });

            } catch (poyoError: unknown) {
                const errorMessage = poyoError instanceof Error ? poyoError.message : String(poyoError);
                log.error('POYO', `Async submission failed: ${errorMessage}`);
                
                // Only record circuit breaker failure for actual PoYo failures, not rate limits
                const isRateLimitExhausted = errorMessage.includes('no_keys_available') || 
                                              errorMessage.includes('No PoYo API keys');
                
                if (isRateLimitExhausted) {
                    log.info('POYO', 'All keys exhausted for this minute, using Gemini...');
                } else {
                    // Actual failure - record for circuit breaker
                    await recordProviderFailure(supabaseClient, 'poyo');
                }
                
                // Fall through to Gemini fallback if enabled
                if (!CONFIG.FALLBACK_ENABLED) {
                    await releaseCredits(supabaseClient, jobId!, errorMessage);
                    return new Response(JSON.stringify({ error: errorMessage }), { 
                        status: 200, headers: corsHeaders 
                    });
                }
                log.info('POYO', 'Falling back to Google (sync)...');
            }
        }

        // ================================================================
        // 4B. GOOGLE SYNC FLOW (or fallback from PoYo failure)
        // ================================================================
        log.info('GOOGLE', 'MODE: Sync (direct response)');
        
        try {
            const generatedImage = await generateWithGoogle(prompt, imagePayload, targetModel, temperature);
            
            // Check for cancellation
            if (isAborted || req.signal.aborted) {
                await releaseCredits(supabaseClient, jobId!, 'Request cancelled');
                throw new Error("Request cancelled by user.");
            }

            // Confirm the generation
            await confirmGeneration(supabaseClient, jobId!, 'google', targetModel);

            log.divider('GOOGLE');
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            log.success('GOOGLE', `SUCCESS: Image received (${(generatedImage.length / 1024).toFixed(0)}KB)`);
            log.info('GOOGLE', `REQUEST END | Duration: ${duration}s`);
            log.section('GOOGLE');

            // Return image directly (sync response)
            return new Response(JSON.stringify({ 
                output: generatedImage,
                status: 'completed',
                provider: 'google'
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });

        } catch (googleError: unknown) {
            const errorMessage = googleError instanceof Error ? googleError.message : String(googleError);
            log.error('GOOGLE', `Generation failed: ${errorMessage}`);
            
            await releaseCredits(supabaseClient, jobId!, errorMessage);
            
            return new Response(JSON.stringify({ 
                error: `Generation failed: ${errorMessage}` 
            }), { 
                status: 200, headers: corsHeaders 
            });
        }

    } catch (error: any) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        log.error('POYO', `Critical Error: ${error.message}`);
        log.info('POYO', `REQUEST END (FAILED) | Duration: ${duration}s`);
        log.section('POYO');

        // Try to release credits if we have a job
        if (jobId && supabaseClient) {
            try {
                await releaseCredits(supabaseClient, jobId, error.message);
            } catch (releaseError) {
                log.error('CREDITS', `Failed to release credits: ${releaseError}`);
            }
        }

        return new Response(JSON.stringify({ 
            error: error instanceof Error ? error.message : "Internal Server Error" 
        }), {
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
