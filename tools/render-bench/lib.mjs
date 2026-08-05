/**
 * Bibliothèque partagée par bench.mjs (ligne de commande) et serve.mjs (interface).
 * Toute la logique d'appel aux fournisseurs vit ici, et nulle part ailleurs.
 */

export const CREDIT_USD = 0.005;
export const POYO_BASE = "https://api.poyo.ai";
export const POLL_TIMEOUT_MS = 300000;

/**
 * `expected` = coût attendu d'après la grille publique poyo.ai.
 * Le banc relève le coût RÉEL (`credits_amount` dans la réponse de /status) et
 * signale tout écart — c'est ainsi qu'on a établi que nano-banana-pro-edit
 * coûte 18 crédits là où la grille en annonce 8 pour la variante texte.
 */
/**
 * Contraintes relevées sur l'API, modèle par modèle :
 *   maxPrompt  longueur maximale du prompt, en caractères (null = pas de limite connue)
 *   size       valeur acceptée par le champ input.size ("1:1" par défaut)
 *
 * Elles proviennent des erreurs 400 réellement renvoyées par PoYo — la
 * documentation ne les liste pas. Complétez au fil des passages.
 */
export const POYO_MODELS = [
  { slug: "z-image",               expected: 2,    note: "prompt ≤ 1000",  maxPrompt: 1000 },
  { slug: "wan-2.7-image",         expected: 4.2,  note: "taille en px",   size: "1024x1024" },
  { slug: "nano-banana-edit",      expected: 5,    note: "Gemini 2.5 Flash" },
  { slug: "nano-banana-2-edit",    expected: 5,    note: "candidat n°1" },
  { slug: "seedream-4-edit",       expected: 5,    note: "" },
  { slug: "seedream-4.5-edit",     expected: 5,    note: "" },
  { slug: "flux-kontext-pro-edit", expected: 8,    note: "" },
  { slug: "flux-kontext-max-edit", expected: 16,   note: "marge négative" },
  { slug: "nano-banana-pro-edit",  expected: 18,   note: "votre production" },
  { slug: "gpt-image-2-edit",      expected: null, note: "coût variable" },
];

export const modelConfig = slug => POYO_MODELS.find(m => m.slug === slug) || {};

/**
 * Contrôle préalable : vérifie qu'un modèle peut accepter ce prompt.
 * Évite de soumettre — donc de payer — une requête vouée à un 400.
 * Retourne null si tout va bien, ou le motif du refus.
 */
export function preflight(slug, prompt) {
  const cfg = modelConfig(slug);
  if (cfg.maxPrompt && prompt.length > cfg.maxPrompt) {
    return `prompt trop long : ${prompt.length} caractères, maximum ${cfg.maxPrompt} pour ce modèle`;
  }
  return null;
}

export const GOOGLE_MODELS = [
  { slug: "gemini-3.1-flash-image-preview", note: "Gemini en direct" },
];

export const MIME = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".webp": "image/webp",
};

export const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
async function poyo(path, init = {}, apiKey = process.env.POYO_API_KEY) {
  const res = await fetch(POYO_BASE + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (res.status === 429) { await sleep(15000); return poyo(path, init, apiKey); }
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error(`${path} → ${res.status} : ${text.slice(0, 200)}`); }
  if (!res.ok) throw new Error(`${path} → ${res.status} : ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

export async function uploadSource(dataUrl) {
  const r = await poyo("/api/common/upload/base64", {
    method: "POST",
    body: JSON.stringify({ base64_data: dataUrl }),
  });
  const url = r?.data?.file_url;
  if (!url) throw new Error("téléversement : aucun file_url — " + JSON.stringify(r).slice(0, 200));
  return url;
}

export async function submit(model, prompt, imageUrl) {
  const size = modelConfig(model).size || "1:1";   // certains modèles exigent des pixels
  const r = await poyo("/api/generate/submit", {
    method: "POST",
    body: JSON.stringify({ model, input: { prompt, size, image_urls: [imageUrl] } }),
  });
  const id = r?.data?.task_id || r?.task_id;
  if (!id) throw new Error("soumission : aucun task_id — " + JSON.stringify(r).slice(0, 200));
  return id;
}

export async function pollUntilDone(taskId, pollMs = 6000, onTick) {
  const started = Date.now();
  for (;;) {
    if (Date.now() - started > POLL_TIMEOUT_MS) throw new Error("délai dépassé (5 min)");
    const r = await poyo(`/api/generate/status/${encodeURIComponent(taskId)}`);
    const d = r?.data ?? r;
    if (onTick) onTick(d);
    const s = d?.status;
    if (s === "finished" || s === "completed") return d;
    if (s === "failed" || s === "error") throw new Error(d?.error_message || "tâche en échec");
    await sleep(pollMs);
  }
}

/** Chaîne complète pour un modèle PoYo : soumission → attente → résultat. */
export async function runPoyoModel({ model, prompt, imageUrl, pollMs = 6000 }) {
  const refus = preflight(model, prompt);
  if (refus) { const e = new Error(refus); e.incompatible = true; throw e; }
  const t0 = Date.now();
  const taskId = await submit(model, prompt, imageUrl);
  const done = await pollUntilDone(taskId, pollMs);
  const credits = typeof done.credits_amount === "number" ? done.credits_amount : null;
  return {
    provider: "poyo",
    model,
    taskId,
    seconds: +((Date.now() - t0) / 1000).toFixed(1),
    credits,
    usd: credits != null ? credits * CREDIT_USD : null,
    fileUrl: done?.files?.[0]?.file_url || null,
  };
}

// ---------------------------------------------------------------------------
/** Gemini en direct — REST, sans SDK. Même modèle pour texte→image et image→image. */
export async function runGoogleModel({ model, prompt, mimeType, base64 }) {
  const t0 = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GOOGLE_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: prompt + "\n\nIMPORTANT: Return ONLY the generated image." },
      ]}],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${res.status} : ${JSON.stringify(json).slice(0, 200)}`);
  for (const p of (json?.candidates?.[0]?.content?.parts || [])) {
    const inline = p.inline_data || p.inlineData;
    if (inline?.data) {
      const outputTokens = json?.usageMetadata?.candidatesTokenCount;
      return {
        provider: "google",
        model,
        seconds: +((Date.now() - t0) / 1000).toFixed(1),
        credits: null,
        // 60 $/1M tokens de sortie — constante reprise de app/admin/index.tsx:1403
        usd: outputTokens != null ? (outputTokens / 1e6) * 60 : null,
        outputTokens,
        base64: inline.data,
      };
    }
  }
  throw new Error("aucune image dans la réponse Gemini");
}
