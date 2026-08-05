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
    // Anonymous IP rate limit: max generations per IP per hour
    ANON_IP_HOURLY_LIMIT: parseInt(Deno.env.get('ANON_IP_HOURLY_LIMIT') || '5'),
    // SSRF guard: hostnames a client-supplied baseImageUrl is allowed to point to.
    // These are the CDN hosts where our own generated results live, so a source
    // image reused from history can be passed by URL instead of base64.
    ALLOWED_SOURCE_IMAGE_HOSTS: (Deno.env.get('ALLOWED_SOURCE_IMAGE_HOSTS') || 'cdn.doculator.org')
        .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean),
};

// SEC-002: Environment-based CORS origins.
// ALLOWED_ORIGINS = production/primary origins. EXTRA_ALLOWED_ORIGINS is an
// additive list (e.g. a LAN dev origin like http://192.168.2.202:8081) kept
// separate so dev origins can be added without touching the prod allowlist.
const ALLOWED_ORIGINS = [
    ...(Deno.env.get("ALLOWED_ORIGINS") || "").split(","),
    ...(Deno.env.get("EXTRA_ALLOWED_ORIGINS") || "").split(","),
].map((o) => o.trim()).filter(Boolean);

// Build per-request CORS headers. The Access-Control-Allow-Origin header must
// match the requesting origin exactly (a list is not valid), so we reflect the
// request's origin when it is allowlisted. Falls back to the first configured
// origin, or '*' when nothing is configured.
function buildCorsHeaders(origin: string | null): Record<string, string> {
    let allowOrigin: string;
    if (ALLOWED_ORIGINS.length === 0) {
        allowOrigin = '*';
    } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
        allowOrigin = origin;
    } else {
        allowOrigin = ALLOWED_ORIGINS[0];
    }
    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Vary': 'Origin',
    };
}

// SEC-005: Strict model whitelist with token costs (prevents cost manipulation via unknown models)
const MODEL_COSTS: Record<string, number> = {
    'gemini-3.1-flash-image-preview': 1,
};
// DoS guard on total assembled prompt (system template + colors + effects + user text)
const MAX_PROMPT_LENGTH = 15000;
// Limit on user-typed free-text fields (painterPrompt / designerPrompt)
const MAX_USER_TEXT_LENGTH = 1000;

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
 * SSRF guard: only accept an https source-image URL pointing at a whitelisted
 * CDN host. Returns the normalized URL, or null if it must be rejected.
 */
function validateSourceImageUrl(rawUrl: unknown): string | null {
    if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 2048) return null;
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        return null;
    }
    if (parsed.protocol !== 'https:') return null;
    if (!CONFIG.ALLOWED_SOURCE_IMAGE_HOSTS.includes(parsed.hostname.toLowerCase())) return null;
    return parsed.toString();
}

/**
 * Fetch a (already-validated) remote image URL into a base64 ImagePayload.
 * Used for providers that require inline image data (e.g. Google/Gemini).
 */
async function fetchUrlToPayload(url: string): Promise<ImagePayload> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch source image (${response.status})`);
    }
    const mimeType = response.headers.get('content-type') || 'image/png';
    const buffer = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let i = 0; i < buffer.length; i++) {
        binary += String.fromCharCode(buffer[i]);
    }
    return { mimeType, data: btoa(binary) };
}

/**
 * Submit generation task to PoYo
 */
async function submitPoyoTask(
    apiKey: string,
    prompt: string,
    imageUrl?: string,
    callbackUrl?: string,
    model: string = 'nano-banana-2-edit'
): Promise<string> {
    // Use the exact admin-selected model slug (normal vs -edit are distinct models).
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
    baseImage?: ImagePayload,
    model?: string,
    baseImageUrl?: string
): Promise<{ taskId: string }> {
    // Get available API key with rotation
    const { data: keyData, error: keyError } = await supabaseClient.rpc('get_available_poyo_key');

    if (keyError || !keyData?.success) {
        throw new Error(`No PoYo API keys available: ${keyError?.message || keyData?.error}`);
    }

    const apiKey = keyData.api_key;
    log.info('POYO', `API KEY: Using key (${keyData.requests_used}/5 requests this minute)`);

    // Resolve the source image. A pre-hosted URL (source reused from history) is
    // passed straight to PoYo — no re-download/re-upload needed. Otherwise upload
    // the inline base64 payload.
    let imageUrl: string | undefined;
    if (baseImageUrl) {
        imageUrl = baseImageUrl;
        log.info('POYO', `SOURCE: Using pre-hosted URL directly (${baseImageUrl})`);
    } else if (baseImage) {
        imageUrl = await uploadToPoyo(apiKey, baseImage.data, baseImage.mimeType);
    }

    // Submit task WITH webhook callback URL
    log.info('POYO', `SUBMIT: Prompt length: ${prompt.length} chars | Unfiltered: ${!prompt.includes('[Flesh Tones]')}`);
    const taskId = await submitPoyoTask(apiKey, prompt, imageUrl, CONFIG.POYO_WEBHOOK_URL, model);

    // Store task_id + the actual model on the job so the webhook can log the real
    // model name (not just the 'poyo' provider) into generation_logs.
    await supabaseClient
        .from('generation_jobs')
        .update({ poyo_task_id: taskId, provider_used: 'poyo', model_used: model || 'nano-banana-2-edit' })
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
    model: string = 'gemini-3.1-flash-image-preview',
    temperature?: number
): Promise<{ imageBase64: string; inputTokens?: number; outputTokens?: number }> {
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
    const usageMeta = response.usageMetadata;
    const inputTokens = usageMeta?.promptTokenCount ?? undefined;
    const outputTokens = usageMeta?.candidatesTokenCount ?? undefined;
    const candidateParts = response.candidates?.[0]?.content?.parts;

    if (candidateParts) {
        for (const part of candidateParts) {
            if (part.inlineData?.data) {
                log.success('GOOGLE', `Image received`);
                return { imageBase64: part.inlineData.data, inputTokens, outputTokens };
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
    cost: number,
    deviceId?: string,
    metadata?: any
): Promise<{ success: boolean; jobId?: string; error?: string; balance?: number }> {
    const { data, error } = await supabaseClient.rpc('reserve_generation', {
        p_user_id: userId,
        p_cost: cost,
        p_device_id: deviceId || null,
        p_metadata: metadata || {}
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

async function countTokensForPrompt(prompt: string, model: string): Promise<number | undefined> {
    const apiKey = Deno.env.get('GOOGLE_API_KEY');
    if (!apiKey) return undefined;
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:countTokens?key=${apiKey}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
        });
        if (!resp.ok) return undefined;
        const data = await resp.json();
        return typeof data.totalTokens === 'number' ? data.totalTokens : undefined;
    } catch {
        return undefined;
    }
}

async function confirmGeneration(
    supabaseClient: any,
    jobId: string,
    provider: string,
    model: string,
    clientIp?: string,
    inputTokens?: number,
    outputTokens?: number,
    prompt?: string
): Promise<void> {
    const { data, error } = await supabaseClient.rpc('confirm_generation', {
        p_job_id: jobId,
        p_provider: provider,
        p_model: model,
        p_client_ip: clientIp || null,
        p_input_tokens: inputTokens || null,
        p_output_tokens: outputTokens || null,
        p_prompt: prompt || null,
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
// ANONYMOUS IP RATE LIMITING
// ============================================================================

/**
 * Extracts the real client IP from request headers.
 * Supabase Edge Functions receive the IP via x-forwarded-for or x-real-ip.
 */
function getClientIp(req: Request): string {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) {
        // x-forwarded-for may be a comma-separated list; take the first entry
        return forwarded.split(',')[0].trim();
    }
    return req.headers.get('x-real-ip') || 'unknown';
}

/**
 * Checks whether an anonymous user has exceeded the per-IP hourly generation limit.
 * Uses the generation_logs table to count recent anonymous generations from the same IP.
 * Returns true if the request should be blocked.
 */
async function isAnonymousIpRateLimited(
    supabaseClient: any,
    ip: string,
    userId: string,
): Promise<boolean> {
    if (ip === 'unknown') {
        // Cannot determine IP — allow through but log warning
        log.info('RATE', `Cannot determine client IP for anonymous user ${userId.substring(0, 8)}`);
        return false;
    }

    const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago

    const { count, error } = await supabaseClient
        .from('generation_logs')
        .select('*', { count: 'exact', head: true })
        .eq('client_ip', ip)
        .gte('created_at', windowStart);

    if (error) {
        log.error('RATE', `IP rate-limit check error: ${error.message}`);
        // Fail open — don't block on DB errors
        return false;
    }

    const requestCount = count ?? 0;
    log.info('RATE', `Anonymous IP ${ip}: ${requestCount}/${CONFIG.ANON_IP_HOURLY_LIMIT} requests this hour`);
    return requestCount >= CONFIG.ANON_IP_HOURLY_LIMIT;
}

// ============================================================================
// SANITIZATION HELPERS
// ============================================================================

/**
 * SEC: Server-side defense-in-depth sanitization.
 * Strips null bytes and control characters from a prompt string.
 * Preserves newlines (\n, \x0A) and tabs (\t, \x09) as legitimate whitespace.
 * The client sanitizes first; this is a second layer of protection.
 */
function sanitizeServerSide(text: string): string {
    // Strip null bytes and control characters (keep newlines \n and tabs \t)
    return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
    // Per-request CORS headers (reflects the request origin when allowlisted).
    const corsHeaders = buildCorsHeaders(req.headers.get('origin'));

    // Handle CORS preflight
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

        // Read provider config from DB (admin-switchable, falls back to env vars)
        const supabaseAdminClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        );
        let dbPrimaryProvider: string | undefined;
        let dbFallbackEnabled: boolean | undefined;
        let dbPoyoModel: string | undefined;

        // Kick off the provider-config RPC before awaiting auth below — these are two
        // independent network round-trips, so start both and only then await each in turn.
        const providerConfigPromise = supabaseAdminClient.rpc('get_provider_config');

        let isAborted = false;
        req.signal.addEventListener('abort', () => { isAborted = true; });

        const authHeader = req.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '') ?? '';

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

        try {
            const { data: provCfg } = await providerConfigPromise;
            if (provCfg) {
                dbPrimaryProvider = provCfg['primary_provider'] || undefined;
                dbPoyoModel = provCfg['poyo_model'] || undefined;
                if (provCfg['fallback_enabled'] != null) {
                    dbFallbackEnabled = provCfg['fallback_enabled'] !== 'false';
                }
            }
        } catch (_) {
            // Fall back to env vars silently
        }
        const primaryProvider = dbPrimaryProvider || CONFIG.PRIMARY_PROVIDER;
        const fallbackEnabled = dbFallbackEnabled ?? CONFIG.FALLBACK_ENABLED;
        const poyoModel = dbPoyoModel || 'nano-banana-2-edit';

        if (!user) {
            return new Response(JSON.stringify({ error: `Unauthorized: ${authError?.message}` }), {
                status: 401, headers: corsHeaders
            });
        }

        // ================================================================
        // 1b. ANONYMOUS USER CHECKS
        // Use the authoritative is_anonymous flag from the JWT/user object.
        // Falls back to email heuristic for older anonymous accounts.
        // ================================================================
        const isAnonymous = user.is_anonymous === true
            || user.email?.includes('@anon.')
            || (!user.email && !user.phone);
        const clientIp = getClientIp(req);

        if (isAnonymous) {
            // Guard: block anonymous users from spending purchased tokens.
            // Anonymous accounts cannot purchase tokens (blocked in the UI), but as a
            // server-side defence we check the balance and reject if purchased_balance > 0.
            // This prevents credit loss when the anonymous account is later linked to a
            // real account (the purchased balance would not transfer automatically).
            const { data: statusData } = await supabaseClient.rpc('get_user_status');
            if (statusData?.purchased_balance > 0) {
                log.info('RATE', `Anonymous user ${user.id.substring(0, 8)} has purchased_balance=${statusData.purchased_balance}, blocking generation until signed in`);
                return new Response(JSON.stringify({
                    error: 'Please sign in to use your purchased tokens. Your balance is safe and will be available after sign-in.',
                    reservation_error: 'anon_purchased_tokens',
                }), { status: 403, headers: corsHeaders });
            }

            // IP rate limiting: prevents bypassing device_id tracking by spoofing a new
            // device_id for every request from the same IP address.
            const rateLimited = await isAnonymousIpRateLimited(supabaseClient, clientIp, user.id);
            if (rateLimited) {
                log.info('RATE', `Anonymous IP ${clientIp} exceeded hourly limit, blocking`);
                return new Response(JSON.stringify({
                    error: 'Rate limit exceeded. Please sign in to continue generating images.',
                    reservation_error: 'anon_ip_rate_limited',
                }), { status: 429, headers: corsHeaders });
            }
        }

        // ================================================================
        // 2. PARSE REQUEST
        // ================================================================
        const { prompt, baseImage, baseImageUrl: rawBaseImageUrl, model, action, temperature, device_id, metadata, userText } = await req.json();

        log.section('POYO');
        log.info('POYO', `REQUEST START | User: ${user.id.substring(0, 8)}...`);
        log.info('POYO', `Config: PRIMARY=${CONFIG.PRIMARY_PROVIDER}, FALLBACK=${CONFIG.FALLBACK_ENABLED}, TIMEOUT=${CONFIG.POYO_TIMEOUT_MS}ms`);
        log.divider('POYO');

        if (!prompt) {
            return new Response(JSON.stringify({ error: "Missing prompt" }), {
                status: 400, headers: corsHeaders
            });
        }

        // SEC-005: Validate user-typed text length (the injection surface)
        if (userText && (typeof userText !== 'string' || userText.length > MAX_USER_TEXT_LENGTH)) {
            return new Response(JSON.stringify({ error: `User text must be at most ${MAX_USER_TEXT_LENGTH} characters` }), {
                status: 400, headers: corsHeaders
            });
        }

        // SEC-005: DoS guard on total assembled prompt
        if (typeof prompt !== 'string' || prompt.length > MAX_PROMPT_LENGTH) {
            return new Response(JSON.stringify({ error: `Prompt too long (max ${MAX_PROMPT_LENGTH} characters)` }), {
                status: 400, headers: corsHeaders
            });
        }

        // SEC: Server-side defense-in-depth sanitization
        const sanitizedPrompt = sanitizeServerSide(prompt);
        const targetModel = model || 'gemini-3.1-flash-image-preview';

        // SEC-005: Reject unknown models — only whitelisted models are allowed
        if (!(targetModel in MODEL_COSTS)) {
            return new Response(JSON.stringify({ error: `Unknown model: ${targetModel}` }), {
                status: 400, headers: corsHeaders
            });
        }

        // SEC-005: Clamp temperature to valid range 0-2
        const safeTemperature = temperature !== undefined
            ? Math.min(2, Math.max(0, Number(temperature)))
            : undefined;

        // ================================================================
        // 3. RESERVE CREDITS
        // ================================================================
        const tokenCost = MODEL_COSTS[targetModel];

        // Kick off the provider health check concurrently with credit reservation.
        // Both are independent DB round-trips gated by the same auth/rate-limit
        // checks above, so overlapping them shaves one round-trip off every
        // generation. isProviderHealthy swallows its own errors (returns a
        // boolean), so this promise never rejects even if reservation fails first.
        const primaryHealthyPromise = isProviderHealthy(supabaseAdminClient, primaryProvider);

        const reservation = await reserveCredits(supabaseClient, user.id, tokenCost, device_id, metadata);

        if (!reservation.success) {
            // Log detailed info server-side only — never expose balance or device tracking details to client
            log.error('CREDITS', `Reservation failed: ${reservation.error}, Balance: ${reservation.balance}`);

            let errorMessage = "Limit reached.";

            if (reservation.error === 'insufficient_balance') {
                errorMessage = "Insufficient tokens. Please purchase more to continue.";
            } else if (reservation.error === 'user_not_found') {
                errorMessage = "User account not found.";
            } else if (reservation.error === 'device_already_used') {
                errorMessage = "Free tokens are not available. Please sign in to continue.";
            }

            return new Response(JSON.stringify({
                error: errorMessage,
                reservation_error: reservation.error,
            }), {
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

        // A client may pass a source image by URL (a prior result reused as source)
        // instead of base64. Validate it against the CDN allowlist (SSRF guard).
        const baseImageUrl: string | undefined = (!imagePayload && rawBaseImageUrl)
            ? (validateSourceImageUrl(rawBaseImageUrl) ?? undefined)
            : undefined;
        if (rawBaseImageUrl && !imagePayload && !baseImageUrl) {
            log.error('POYO', `Rejected baseImageUrl (not an allowed source host)`);
            return new Response(JSON.stringify({ error: "Invalid source image URL" }), {
                status: 400, headers: corsHeaders
            });
        }

        // ================================================================
        // 4. DETERMINE PROVIDER FLOW
        // ================================================================
        // Use the service-role admin client: check_provider_health /
        // record_provider_failure are server-only RPCs (REVOKEd from the
        // authenticated role in migration 20260608000000).
        // Started concurrently with reserveCredits above (see primaryHealthyPromise).
        const primaryHealthy = await primaryHealthyPromise;

        // ================================================================
        // 4A. POYO ASYNC FLOW (webhook-based)
        // ================================================================
        if (primaryProvider === 'poyo' && primaryHealthy) {
            try {
                log.info('POYO', 'MODE: Async (webhook callback)');

                // Count tokens for PoYo prompt (non-blocking, fire and update job)
                countTokensForPrompt(sanitizedPrompt, targetModel).then(async (inputTokens) => {
                    if (inputTokens != null && jobId) {
                        log.info('POYO', `countTokens: ${inputTokens} input tokens`);
                        await supabaseAdminClient
                            .from('generation_jobs')
                            .update({ input_tokens: inputTokens, prompt: sanitizedPrompt })
                            .eq('id', jobId);
                    }
                }).catch(() => { /* non-critical */ });

                // Submit task with webhook - returns immediately
                const { taskId } = await submitPoyoWithWebhook(
                    supabaseAdminClient,
                    jobId!,
                    sanitizedPrompt,
                    imagePayload,
                    poyoModel,
                    baseImageUrl
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
                    // Actual failure - record for circuit breaker (admin client: server-only RPC)
                    await recordProviderFailure(supabaseAdminClient, 'poyo');
                }
                
                // Fall through to Gemini fallback if enabled
                if (!fallbackEnabled) {
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
            const finalGooglePrompt = sanitizedPrompt;
            log.info('GOOGLE', `SUBMIT: Prompt length: ${finalGooglePrompt.length} chars`);
            // Google needs inline image data. If the source was supplied as a URL,
            // fetch it server-side (no CORS on the server) into a base64 payload.
            const googleImagePayload = imagePayload
                ?? (baseImageUrl ? await fetchUrlToPayload(baseImageUrl) : undefined);
            const { imageBase64: generatedImage, inputTokens, outputTokens } = await generateWithGoogle(finalGooglePrompt, googleImagePayload, targetModel, safeTemperature);

            // Check for cancellation
            if (isAborted || req.signal.aborted) {
                await releaseCredits(supabaseClient, jobId!, 'Request cancelled');
                throw new Error("Request cancelled by user.");
            }

            // Confirm the generation (pass clientIp for IP rate-limit tracking, prompt for history)
            await confirmGeneration(supabaseClient, jobId!, 'google', targetModel, clientIp, inputTokens, outputTokens, sanitizedPrompt);

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
