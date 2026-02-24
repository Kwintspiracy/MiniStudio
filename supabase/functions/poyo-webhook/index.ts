import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// ============================================================================
// CONFIGURATION
// ============================================================================

// SEC-002: Environment-based CORS origins (no wildcard in production)
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);
const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS[0] : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// SEC-001: PoYo Webhook Authorization Secret
const POYO_WEBHOOK_SECRET = Deno.env.get('POYO_WEBHOOK_SECRET');

const log = {
    info: (...args: any[]) => console.log('[WEBHOOK]', ...args),
    error: (...args: any[]) => console.error('[WEBHOOK] ERROR:', ...args),
    success: (...args: any[]) => console.log('[WEBHOOK] ✓', ...args),
};

// ============================================================================
// MAIN HANDLER
// ============================================================================
Deno.serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    log.info('═══════════════════════════════════════════════════════');
    log.info('Received PoYo callback');

    // SEC-001: Verify PoYo Webhook Authorization Header
    const authHeader = req.headers.get('Authorization');
    if (POYO_WEBHOOK_SECRET) {
        if (!authHeader || authHeader !== `Bearer ${POYO_WEBHOOK_SECRET}`) {
            log.error('Unauthorized: Invalid or missing Authorization header');
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
        log.info('Authorization verified');
    } else {
        log.info('WARNING: POYO_WEBHOOK_SECRET not configured. Webhook is not secured!');
    }

    try {
        // Parse callback payload
        const payload = await req.json();
        log.info(`Payload: ${JSON.stringify(payload)}`);

        // Extract task data - PoYo wraps in {code, data: {...}}
        const taskData = payload.data || payload;
        const taskId = taskData.task_id;
        const status = taskData.status;
        const files = taskData.files || [];
        const errorMessage = taskData.error_message;

        if (!taskId) {
            log.error('No task_id in callback payload');
            return new Response(JSON.stringify({ error: 'Missing task_id' }), {
                status: 400,
                headers: corsHeaders,
            });
        }

        log.info(`Task: ${taskId} | Status: ${status}`);

        // Initialize Supabase client with service role
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Get image URL if finished
        let imageUrl: string | null = null;
        if (status === 'finished' && files.length > 0) {
            imageUrl = files[0].file_url;
            log.success(`Image URL: ${imageUrl}`);
        }

        // Call RPC to update job
        const { data, error } = await supabase.rpc('complete_poyo_job', {
            p_task_id: taskId,
            p_status: status,
            p_image_url: imageUrl,
            p_error_message: errorMessage,
        });

        if (error) {
            log.error(`RPC error: ${error.message}`);
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: corsHeaders,
            });
        }

        log.success(`Job updated: ${JSON.stringify(data)}`);

        // Return 200 to acknowledge receipt (PoYo requirement)
        return new Response(JSON.stringify({ received: true, ...data }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (err) {
        log.error(`Unhandled error: ${err}`);
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: corsHeaders,
        });
    }
});
