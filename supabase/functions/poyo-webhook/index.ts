import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// ============================================================================
// SEC-001 — AUTHENTIFICATION DU CALLBACK POYO, PAR JETON DE TÂCHE
//
// La version déployée jusqu'ici (v6, 2026-01-30) n'avait AUCUNE
// authentification : une requête anonyme obtenait 200 et atteignait
// complete_poyo_job avec les droits service_role. Vérifié par exécution le
// 2026-08-05, avec témoin négatif sur revenuecat-webhook qui répondait 401.
//
// La voie documentée par PoYo — signature HMAC dont la clé s'obtient sur
// GET /api/api-keys/webhook-secret — est inaccessible : cet endpoint répond
// 401 avec une clé API pourtant valide (la même clé répond 200 sur
// /api/generate/status/). PoYo sépare l'authentification de génération de
// celle de gestion de compte.
//
// On se passe donc du fournisseur. reserve_generation génère un jeton par
// tâche, transmis dans le callback_url ; le webhook le rend obligatoire au
// retour. Non devinable, valable pour une seule tâche, et invalidé dès le
// callback traité (complete_poyo_job remet callback_token à NULL).
//
// La signature HMAC est vérifiée EN PLUS si POYO_WEBHOOK_HMAC_KEY est
// configuré : le jour où l'endpoint devient accessible, il suffit de
// renseigner le secret pour cumuler les deux protections.
// ============================================================================

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').filter(Boolean);
const corsHeaders = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS[0] : '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-timestamp, x-webhook-signature',
}

const POYO_WEBHOOK_HMAC_KEY = Deno.env.get('POYO_WEBHOOK_HMAC_KEY');   // facultatif
const TIMESTAMP_TOLERANCE_S = 300;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const log = {
    info: (...args: any[]) => console.log('[WEBHOOK]', ...args),
    error: (...args: any[]) => console.error('[WEBHOOK] ERROR:', ...args),
    success: (...args: any[]) => console.log('[WEBHOOK] ✓', ...args),
};

/** Comparaison à temps constant, pour la vérification HMAC optionnelle. */
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

async function computeSignature(taskId: string, timestamp: string, key: string): Promise<string> {
    const cryptoKey = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(key),
        { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const mac = await crypto.subtle.sign(
        'HMAC', cryptoKey, new TextEncoder().encode(`${taskId}.${timestamp}`),
    );
    return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

/** SEC-002 — l'URL du résultat vient du corps de la requête : elle doit pointer
 *  vers un hôte connu, car le client la télécharge et l'affiche. */
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

    try {
        // ── 1. Jeton de tâche — la protection principale ─────────────────────
        const token = new URL(req.url).searchParams.get('t');
        if (!token || !UUID_RE.test(token)) {
            log.error('Missing or malformed callback token');
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const payload = await req.json().catch(() => null);
        if (!payload) {
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

        // ── 2. Signature HMAC — vérifiée seulement si un secret est configuré ─
        if (POYO_WEBHOOK_HMAC_KEY) {
            const timestamp = req.headers.get('X-Webhook-Timestamp');
            const provided = req.headers.get('X-Webhook-Signature');
            if (!timestamp || !provided) {
                log.error('HMAC key configured but signature headers are missing');
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
            const expected = await computeSignature(taskId, timestamp, POYO_WEBHOOK_HMAC_KEY);
            if (!timingSafeEqual(provided, expected)) {
                log.error('Signature mismatch');
                return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                    status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
            log.success('Signature verified');
        }

        // ── 3. Traitement ────────────────────────────────────────────────────
        const status = taskData.status ?? null;
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

        // Le jeton fait partie de la clause WHERE : un task_id seul ne suffit pas.
        const { data, error } = await supabase.rpc('complete_poyo_job', {
            p_task_id: taskId,
            p_status: status,
            p_image_url: imageUrl,
            p_error_message: errorMessage ?? null,
            p_callback_token: token,
        });

        if (error) {
            log.error(`RPC error: ${error.message}`);
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        log.success(`Job updated: ${JSON.stringify(data)}`);

        // 200 acquitte la réception : PoYo cesse ses reprises (jusqu'à 5).
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
