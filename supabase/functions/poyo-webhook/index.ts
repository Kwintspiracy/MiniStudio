import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// ============================================================================
// SEC-001 — AUTHENTIFICATION DU CALLBACK POYO
//
// La version déployée jusqu'ici (v6, 2026-01-30) n'avait AUCUNE authentification :
// une requête anonyme obtenait 200 et atteignait complete_poyo_job avec les
// droits service_role. Vérifié par exécution le 2026-08-05.
//
// La version précédente de ce fichier comparait un en-tête `Authorization` à un
// Bearer statique. Elle n'a jamais été déployée — et c'est une chance, car elle
// aurait rejeté 100 % des callbacks légitimes : PoYo n'émet pas cet en-tête.
//
// Mécanisme réel, d'après docs.poyo.ai/api-manual/task-management/webhooks :
//   X-Webhook-Timestamp : horodatage Unix, rejeté au-delà de 300 s
//   X-Webhook-Signature : base64(HMAC-SHA256(task_id + "." + timestamp, clé))
//   clé : GET /api/api-keys/webhook-secret   (rotation : POST .../rotate)
//
// ⚠️ AVANT DE DÉPLOYER : renseigner le secret POYO_WEBHOOK_HMAC_KEY dans les
//    secrets de la fonction. Sans lui, cette version répond 500 et bloque toutes
//    les générations. PoYo réessaie jusqu'à 5 fois avec backoff (60 s → 10 min),
//    ce qui laisse une marge de correction, mais ne dispense pas de vérifier sur
//    un callback réel juste après le déploiement.
// ============================================================================

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);
const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS[0] : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-timestamp, x-webhook-signature',
}

const POYO_WEBHOOK_HMAC_KEY = Deno.env.get('POYO_WEBHOOK_HMAC_KEY');
const TIMESTAMP_TOLERANCE_S = 300;

const log = {
    info: (...args: any[]) => console.log('[WEBHOOK]', ...args),
    error: (...args: any[]) => console.error('[WEBHOOK] ERROR:', ...args),
    success: (...args: any[]) => console.log('[WEBHOOK] ✓', ...args),
};

/** Comparaison à temps constant. Ici elle compte vraiment : l'attaquant contrôle
 *  task_id et timestamp, et peut donc sonder la signature octet par octet. */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

async function computeSignature(taskId: string, timestamp: string, key: string): Promise<string> {
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(key),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const mac = await crypto.subtle.sign(
        'HMAC',
        cryptoKey,
        new TextEncoder().encode(`${taskId}.${timestamp}`),
    );
    return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

/** SEC-002 — L'URL du résultat provient du corps de la requête. Même signée,
 *  elle doit pointer vers un hôte connu : le client la télécharge et l'affiche. */
const ALLOWED_RESULT_HOSTS = (Deno.env.get('ALLOWED_SOURCE_IMAGE_HOSTS') || 'cdn.doculator.org')
    .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);

function validateResultUrl(raw: unknown): string | null {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null;
    let parsed: URL;
    try { parsed = new URL(raw); } catch { return null; }
    if (parsed.protocol !== 'https:') return null;
    if (!ALLOWED_RESULT_HOSTS.includes(parsed.hostname.toLowerCase())) return null;
    return parsed.toString();
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    log.info('═══════════════════════════════════════════════════════');
    log.info('Received PoYo callback');

    if (!POYO_WEBHOOK_HMAC_KEY) {
        log.error('POYO_WEBHOOK_HMAC_KEY is not configured — refusing to process');
        return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    try {
        // Le corps est lu en texte : task_id entre dans la signature, mais RIEN
        // n'en est exploité tant que la signature n'est pas validée.
        const rawBody = await req.text();
        let payload: any;
        try { payload = JSON.parse(rawBody); }
        catch {
            return new Response(JSON.stringify({ error: 'Malformed JSON' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const taskData = payload.data || payload;
        const taskId = taskData?.task_id;

        if (!taskId || typeof taskId !== 'string') {
            log.error('No task_id in callback payload');
            return new Response(JSON.stringify({ error: 'Missing task_id' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // ── 1. Fraîcheur de l'horodatage (anti-rejeu) ────────────────────────
        const timestamp = req.headers.get('X-Webhook-Timestamp');
        if (!timestamp) {
            log.error('Missing X-Webhook-Timestamp');
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
        const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
        if (!Number.isFinite(age) || age > TIMESTAMP_TOLERANCE_S) {
            log.error(`Timestamp outside tolerance (${age}s)`);
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // ── 2. Signature ─────────────────────────────────────────────────────
        const provided = req.headers.get('X-Webhook-Signature');
        if (!provided) {
            log.error('Missing X-Webhook-Signature');
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
        const expected = await computeSignature(taskId, timestamp, POYO_WEBHOOK_HMAC_KEY);
        if (!timingSafeEqual(provided, expected)) {
            log.error('Signature mismatch');
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
        log.success('Signature verified');

        // ── 3. Traitement — à partir d'ici seulement, le corps fait autorité ──
        const status = taskData.status;
        const files = taskData.files || [];
        const errorMessage = taskData.error_message;

        log.info(`Task: ${taskId} | Status: ${status}`);

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        let imageUrl: string | null = null;
        if (status === 'finished' && files.length > 0) {
            imageUrl = validateResultUrl(files[0]?.file_url);
            if (!imageUrl) {
                log.error(`Rejected result URL (host not allowed): ${files[0]?.file_url}`);
                return new Response(JSON.stringify({ error: 'Invalid result URL' }), {
                    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
            log.success(`Image URL: ${imageUrl}`);
        }

        const { data, error } = await supabase.rpc('complete_poyo_job', {
            p_task_id: taskId,
            p_status: status,
            p_image_url: imageUrl,
            p_error_message: errorMessage,
        });

        if (error) {
            log.error(`RPC error: ${error.message}`);
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        log.success(`Job updated: ${JSON.stringify(data)}`);

        // 200 acquitte la réception : PoYo cesse ses reprises.
        return new Response(JSON.stringify({ received: true, ...data }), {
            status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (err) {
        log.error(`Unhandled error: ${err}`);
        return new Response(JSON.stringify({ error: 'Internal error' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
