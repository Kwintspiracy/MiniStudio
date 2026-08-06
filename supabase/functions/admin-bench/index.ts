import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// ============================================================================
// BANC D'ESSAIS MULTI-MODÈLES — côté serveur
//
// Reprend le moteur de tools/render-bench/lib.mjs, qui tournait sur une seule
// machine avec la clé PoYo en clair dans un fichier .env. Ici la clé reste dans
// la base, obtenue par get_available_poyo_key — la même rotation que la
// génération de production, qui répartit la charge sur les cinq clés et tient
// la limite de cinq requêtes par minute.
//
// Découpage en deux temps plutôt qu'un appel bloquant : une génération prend
// 60 s en moyenne et jusqu'à 394 s au pire relevé, largement au-delà de ce
// qu'une fonction edge peut tenir. `start` soumet et rend la main ; `poll`
// relève l'avancement. Le client rythme les relances.
// ============================================================================

const POYO_BASE = 'https://api.poyo.ai';
const CREDIT_USD = 0.005;

/** Contraintes par modèle, transposées du banc local. */
const MODELES: Record<string, { maxPrompt?: number; size?: string }> = {
    'z-image': { maxPrompt: 1000 },
    'wan-2.7-image': { size: '1024x1024' },
    'nano-banana-edit': {},
    'nano-banana-2-edit': {},
    'nano-banana-pro-edit': {},
    'seedream-4-edit': {},
    'seedream-4.5-edit': {},
    'flux-kontext-pro-edit': {},
    'flux-kontext-max-edit': {},
    'gpt-image-2-edit': {},
};

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (corps: unknown, statut = 200) =>
    new Response(JSON.stringify(corps), {
        status: statut,
        headers: { ...cors, 'Content-Type': 'application/json' },
    });

const log = {
    info: (...a: unknown[]) => console.log('[BENCH]', ...a),
    error: (...a: unknown[]) => console.error('[BENCH] ERREUR:', ...a),
};

/**
 * Contrôle préalable : évite de soumettre — donc de payer — une requête vouée
 * à un refus. Retourne le motif, ou null si tout va bien.
 */
function refusPrealable(modele: string, prompt: string): string | null {
    const cfg = MODELES[modele];
    if (!cfg) return `modèle inconnu : ${modele}`;
    if (cfg.maxPrompt && prompt.length > cfg.maxPrompt) {
        return `prompt de ${prompt.length} caractères, maximum ${cfg.maxPrompt} pour ce modèle`;
    }
    return null;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

    try {
        const entete = req.headers.get('Authorization');
        if (!entete) return json({ error: 'unauthorized' }, 401);

        // Client au nom de l'appelant : c'est lui qui doit être administrateur,
        // pas la fonction.
        const commeUtilisateur = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
            { global: { headers: { Authorization: entete } } },
        );

        const { data: estAdmin, error: errAdmin } = await commeUtilisateur.rpc('is_admin');
        if (errAdmin || estAdmin !== true) {
            log.error('accès refusé', errAdmin?.message);
            return json({ error: 'forbidden' }, 403);
        }

        const { data: { user } } = await commeUtilisateur.auth.getUser();

        // Client privilégié pour écrire les résultats et déposer les images :
        // les politiques du compartiment exigent is_admin(), que le service role
        // satisfait, et cela évite de faire transiter les octets par le client.
        const admin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        /** Une clé fraîche par appel : c'est le rôle de la rotation. */
        async function cle(): Promise<string> {
            const { data, error } = await admin.rpc('get_available_poyo_key');
            if (error || !data?.success) {
                throw new Error(`aucune clé PoYo disponible : ${error?.message ?? data?.error}`);
            }
            return data.api_key as string;
        }

        async function poyo(chemin: string, init: RequestInit = {}): Promise<any> {
            const res = await fetch(POYO_BASE + chemin, {
                ...init,
                headers: {
                    Authorization: `Bearer ${await cle()}`,
                    'Content-Type': 'application/json',
                    ...(init.headers ?? {}),
                },
            });
            const texte = await res.text();
            let corps: any;
            try { corps = JSON.parse(texte); }
            catch { throw new Error(`${chemin} → ${res.status} : ${texte.slice(0, 180)}`); }
            if (!res.ok) throw new Error(`${chemin} → ${res.status} : ${JSON.stringify(corps).slice(0, 180)}`);
            return corps;
        }

        const corps = await req.json().catch(() => null);
        if (!corps?.action) return json({ error: 'action manquante' }, 400);

        /* ================================================================== */
        /* start — téléverse la source, soumet chaque modèle                  */
        /* ================================================================== */
        if (corps.action === 'start') {
            const { image, models, note } = corps;

            // Une variante unique reste acceptée sous sa forme ancienne : la
            // liste est le cas particulier de la matrice, pas un autre mode.
            const variantes: { label: string; prompt: string; negative?: string;
                               prompt_key?: string; prompt_version?: string }[] =
                Array.isArray(corps.variants) && corps.variants.length
                    ? corps.variants
                    : [{
                        label: 'unique',
                        prompt: corps.prompt,
                        prompt_key: corps.prompt_key,
                        prompt_version: corps.prompt_version,
                    }];

            if (variantes.length > 4) return json({ error: 'quatre variantes au maximum' }, 400);
            for (const v of variantes) {
                if (typeof v.prompt !== 'string' || v.prompt.length < 10) {
                    return json({ error: `variante « ${v.label} » : prompt absent ou trop court` }, 400);
                }
                if (typeof v.label !== 'string' || !v.label.trim()) {
                    return json({ error: 'chaque variante doit porter un nom' }, 400);
                }
            }
            if (!Array.isArray(models) || models.length === 0) {
                return json({ error: 'aucun modèle demandé' }, 400);
            }
            if (models.length > 10) return json({ error: 'dix modèles au maximum' }, 400);
            if (variantes.length * models.length > 24) {
                return json({ error: 'vingt-quatre générations au maximum par passage' }, 400);
            }
            if (!image?.data || !image?.mimeType) {
                return json({ error: 'image source absente' }, 400);
            }

            /** Le négatif est fondu en bloc [AVOID] final, comme le fait la production. */
            const assembler = (v: { prompt: string; negative?: string }) =>
                v.negative?.trim()
                    ? `${v.prompt}\n\n[AVOID]\n${v.negative.trim()}`
                    : v.prompt;

            const dataUrl = String(image.data).startsWith('data:')
                ? String(image.data)
                : `data:${image.mimeType};base64,${image.data}`;

            log.info(`démarrage — ${variantes.length} variante(s) × ${models.length} modèle(s)`);

            const televerse = await poyo('/api/common/upload/base64', {
                method: 'POST',
                body: JSON.stringify({ base64_data: dataUrl }),
            });
            const urlSource = televerse?.data?.file_url;
            if (!urlSource) throw new Error('téléversement : aucun file_url');

            // La source est aussi conservée chez nous : l'historique doit rester
            // lisible même si le CDN du fournisseur purge ses fichiers.
            const runId = crypto.randomUUID();
            const cheminSource = `${runId}/source.${(image.mimeType.split('/')[1] ?? 'jpg').replace(/[^a-z0-9]/gi, '')}`;
            const octets = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
            await admin.storage.from('bench').upload(cheminSource, octets, {
                contentType: image.mimeType, upsert: true,
            });

            const { error: errRun } = await admin.from('bench_runs').insert({
                id: runId,
                created_by: user?.id ?? null,
                // Le prompt de la première variante reste sur le passage : il
                // sert d'aperçu dans l'historique, sans avoir à joindre.
                prompt: assembler(variantes[0]),
                prompt_key: variantes[0].prompt_key ?? null,
                prompt_version: variantes[0].prompt_version ?? null,
                source_path: cheminSource,
                variant_count: variantes.length,
                note: note ?? null,
            });
            if (errRun) throw new Error(`création du passage : ${errRun.message}`);

            const { data: variantesCreees, error: errVar } = await admin
                .from('bench_variants')
                .insert(variantes.map((v, i) => ({
                    run_id: runId,
                    label: v.label.trim(),
                    prompt: v.prompt,
                    negative: v.negative?.trim() || null,
                    prompt_key: v.prompt_key ?? null,
                    prompt_version: v.prompt_version ?? null,
                    position: i,
                })))
                .select();
            if (errVar) throw new Error(`création des variantes : ${errVar.message}`);

            // Produit croisé variantes × modèles. Les soumissions partent en
            // parallèle : chacune obtient sa propre clé par rotation, ce qui
            // répartit la charge au lieu de saturer la première.
            const paires = (variantesCreees ?? []).flatMap((v: any) =>
                models.map((modele: string) => ({ v, modele })));

            const lignes = await Promise.all(paires.map(async ({ v, modele }: any) => {
                const texte = assembler({ prompt: v.prompt, negative: v.negative ?? undefined });
                const base = { run_id: runId, model: modele, variant_id: v.id };

                const refus = refusPrealable(modele, texte);
                if (refus) return { ...base, status: 'skipped', error: refus };

                try {
                    const cfg = MODELES[modele] ?? {};
                    const r = await poyo('/api/generate/submit', {
                        method: 'POST',
                        body: JSON.stringify({
                            model: modele,
                            input: { prompt: texte, size: cfg.size ?? '1:1', image_urls: [urlSource] },
                        }),
                    });
                    const taskId = r?.data?.task_id ?? r?.task_id;
                    if (!taskId) throw new Error('aucun task_id renvoyé');
                    return { ...base, task_id: taskId, status: 'running' };
                } catch (e) {
                    return { ...base, status: 'failed', error: String((e as Error).message).slice(0, 400) };
                }
            }));

            const { error: errLignes } = await admin.from('bench_results').insert(lignes);
            if (errLignes) throw new Error(`enregistrement des résultats : ${errLignes.message}`);

            const soumis = lignes.filter((l) => l.status === 'running').length;
            log.info(`passage ${runId} — ${soumis} soumission(s) sur ${paires.length}`);

            return json({
                success: true, run_id: runId,
                submitted: soumis, total: paires.length,
                variants: variantesCreees,
            });
        }

        /* ================================================================== */
        /* poll — relève l'avancement, rapatrie les images terminées          */
        /* ================================================================== */
        if (corps.action === 'poll') {
            const runId = corps.run_id;
            if (!runId) return json({ error: 'run_id manquant' }, 400);

            const { data: enCours, error } = await admin
                .from('bench_results').select('*')
                .eq('run_id', runId).in('status', ['pending', 'running']);
            if (error) throw new Error(error.message);

            await Promise.all((enCours ?? []).map(async (ligne: any) => {
                if (!ligne.task_id) return;
                try {
                    const r = await poyo(`/api/generate/status/${encodeURIComponent(ligne.task_id)}`);
                    const d = r?.data ?? r;
                    const statut = d?.status;

                    if (statut === 'finished' || statut === 'completed') {
                        const urlFichier = d?.files?.[0]?.file_url;
                        let chemin: string | null = null;

                        if (urlFichier) {
                            // Copie chez nous : la comparaison doit survivre à
                            // la politique de purge du fournisseur.
                            const img = await fetch(urlFichier);
                            const blob = new Uint8Array(await img.arrayBuffer());
                            // La variante entre dans le chemin : sans elle, deux
                            // versions du même modèle s'écraseraient l'une l'autre.
                            const dossier = ligne.variant_id ? `${runId}/${ligne.variant_id}` : runId;
                            chemin = `${dossier}/${ligne.model}.png`;
                            await admin.storage.from('bench').upload(chemin, blob, {
                                contentType: img.headers.get('content-type') ?? 'image/png',
                                upsert: true,
                            });
                        }

                        const credits = typeof d.credits_amount === 'number' ? d.credits_amount : null;
                        const secondes = (Date.now() - new Date(ligne.created_at).getTime()) / 1000;

                        await admin.from('bench_results').update({
                            status: 'done',
                            image_path: chemin,
                            credits,
                            cost_usd: credits != null ? credits * CREDIT_USD : null,
                            seconds: Math.round(secondes * 10) / 10,
                            updated_at: new Date().toISOString(),
                        }).eq('id', ligne.id);

                    } else if (statut === 'failed' || statut === 'error') {
                        await admin.from('bench_results').update({
                            status: 'failed',
                            error: String(d?.error_message ?? 'tâche en échec').slice(0, 400),
                            updated_at: new Date().toISOString(),
                        }).eq('id', ligne.id);
                    }
                } catch (e) {
                    log.error(`${ligne.model} : ${(e as Error).message}`);
                    // Pas de bascule en échec sur une erreur réseau : la tâche
                    // tourne peut-être encore, la relance suivante retentera.
                }
            }));

            const [{ data: etat }, { data: variantes }] = await Promise.all([
                admin.from('bench_results').select('*').eq('run_id', runId).order('model'),
                admin.from('bench_variants').select('*').eq('run_id', runId).order('position'),
            ]);

            const reste = (etat ?? []).filter((l: any) => l.status === 'pending' || l.status === 'running').length;
            return json({ success: true, results: etat ?? [], variants: variantes ?? [], pending: reste });
        }

        return json({ error: `action inconnue : ${corps.action}` }, 400);

    } catch (e) {
        log.error((e as Error).message);
        return json({ error: (e as Error).message }, 500);
    }
});
