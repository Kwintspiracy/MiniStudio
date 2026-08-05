#!/usr/bin/env node
/**
 * MiniStudio — Banc de comparaison de rendus
 *
 * Soumet UNE image source et UN prompt à N modèles, en parallèle, puis produit
 * une page de comparaison côte à côte.
 *
 * Mesure au passage le COÛT RÉEL de chaque modèle : la réponse de
 * GET /api/generate/status/{task_id} contient `credits_amount`. C'est la seule
 * source fiable pour les variantes `-edit`, que la grille publique ne détaille pas.
 *
 * Usage :
 *   node bench.mjs --image ./figurine.jpg --prompt "..." --yes
 *   node bench.mjs --image ./figurine.jpg --prompt-file ./prompt.txt --models nano-banana-2-edit,seedream-4-edit --yes
 *   node bench.mjs --image ./figurine.jpg --prompt "..." --dry-run
 *
 * Variables d'environnement :
 *   POYO_API_KEY     obligatoire
 *   GOOGLE_API_KEY   facultatif — ajoute une comparaison Gemini en direct
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

// ---------------------------------------------------------------------------
// Catalogue. `credits` = valeur ATTENDUE d'après la grille publique poyo.ai.
// Le banc relève la valeur RÉELLE et signale tout écart — c'est tout l'intérêt.
// ---------------------------------------------------------------------------
const CREDIT_USD = 0.005;

const POYO_MODELS = [
  { slug: "z-image",              expected: 2 },
  { slug: "wan-2.7-image",        expected: 4.2 },
  { slug: "nano-banana-edit",     expected: 5 },
  { slug: "nano-banana-2-edit",   expected: 5 },
  { slug: "seedream-4-edit",      expected: 5 },
  { slug: "seedream-4.5-edit",    expected: 5 },
  { slug: "flux-kontext-pro-edit",expected: 8 },
  { slug: "flux-kontext-max-edit",expected: 16 },
  { slug: "nano-banana-pro-edit", expected: 18 },   // relevé console 2026-08-05
  { slug: "gpt-image-2-edit",     expected: null }, // dépend de la qualité
];

const GOOGLE_MODELS = ["gemini-3.1-flash-image-preview"];

const POYO_BASE = "https://api.poyo.ai";
const POLL_TIMEOUT_MS = 300000;

// Prudence sur le débit. PoYo plafonne à 5 requêtes/minute par clé ; on ignore si
// ce plafond couvre aussi /status. Réglages conservateurs par défaut, ajustables :
//   --concurrency N     tâches menées de front   (défaut 3)
//   --poll-interval S   secondes entre 2 sondages (défaut 6)
// En cas de 429, baissez la concurrence et montez l'intervalle.
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_POLL_S = 6;
const SUBMIT_SPACING_MS = 1500;

// ---------------------------------------------------------------------------
const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const out = { models: null, dryRun: false, yes: false, out: "./resultats",
                concurrency: DEFAULT_CONCURRENCY, pollS: DEFAULT_POLL_S };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--image") out.image = argv[++i];
    else if (a === "--prompt") out.prompt = argv[++i];
    else if (a === "--prompt-file") out.promptFile = argv[++i];
    else if (a === "--models") out.models = argv[++i].split(",").map(s => s.trim()).filter(Boolean);
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--concurrency") out.concurrency = Math.max(1, +argv[++i] || DEFAULT_CONCURRENCY);
    else if (a === "--poll-interval") out.pollS = Math.max(1, +argv[++i] || DEFAULT_POLL_S);
    else if (a === "--yes" || a === "-y") out.yes = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function die(msg) { console.error("\n  ✗ " + msg + "\n"); process.exit(1); }

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

// ---------------------------------------------------------------------------
// API PoYo
// ---------------------------------------------------------------------------
async function poyo(path, init = {}) {
  const res = await fetch(POYO_BASE + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.POYO_API_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (res.status === 429) { await sleep(15000); return poyo(path, init); }   // débit dépassé : on patiente
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`${path} → ${res.status} : ${text.slice(0, 200)}`); }
  if (!res.ok) throw new Error(`${path} → ${res.status} : ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

async function uploadSource(dataUrl) {
  const r = await poyo("/api/common/upload/base64", {
    method: "POST",
    body: JSON.stringify({ base64_data: dataUrl }),
  });
  const url = r?.data?.file_url;
  if (!url) throw new Error("upload : aucun file_url dans la réponse — " + JSON.stringify(r).slice(0, 200));
  return url;
}

async function submit(model, prompt, imageUrl) {
  const r = await poyo("/api/generate/submit", {
    method: "POST",
    body: JSON.stringify({ model, input: { prompt, size: "1:1", image_urls: [imageUrl] } }),
  });
  const id = r?.data?.task_id || r?.task_id;
  if (!id) throw new Error("submit : aucun task_id — " + JSON.stringify(r).slice(0, 200));
  return id;
}

async function pollUntilDone(taskId) {
  const started = Date.now();
  for (;;) {
    if (Date.now() - started > POLL_TIMEOUT_MS) throw new Error("délai dépassé (5 min)");
    const r = await poyo(`/api/generate/status/${encodeURIComponent(taskId)}`);
    const d = r?.data ?? r;
    const status = d?.status;
    if (status === "finished" || status === "completed") return d;
    if (status === "failed" || status === "error") {
      throw new Error(d?.error_message || "tâche en échec");
    }
    await sleep(args.pollS * 1000);
  }
}

// ---------------------------------------------------------------------------
// Gemini en direct — REST, sans SDK
// ---------------------------------------------------------------------------
async function googleGenerate(model, prompt, mimeType, base64) {
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
  const parts = json?.candidates?.[0]?.content?.parts || [];
  for (const p of parts) {
    const inline = p.inline_data || p.inlineData;
    if (inline?.data) {
      return {
        base64: inline.data,
        inputTokens: json?.usageMetadata?.promptTokenCount,
        outputTokens: json?.usageMetadata?.candidatesTokenCount,
      };
    }
  }
  throw new Error("aucune image dans la réponse Gemini");
}

// ---------------------------------------------------------------------------
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

// ---------------------------------------------------------------------------
async function main() {
  if (args.help || !args.image) {
    console.log(`
  MiniStudio — banc de comparaison de rendus

    node bench.mjs --image <fichier> [--prompt "..." | --prompt-file <f>] [options]

  Options
    --models a,b,c   restreint la liste (défaut : les 10 modèles image-to-image)
    --out <dir>      dossier de sortie (défaut : ./resultats)
    --concurrency N  tâches de front (défaut 3 ; baissez si vous voyez des 429)
    --poll-interval S secondes entre 2 sondages (défaut 6)
    --dry-run        n'appelle rien, affiche le plan et le coût estimé
    --yes, -y        lance sans confirmation

  Environnement
    POYO_API_KEY     obligatoire
    GOOGLE_API_KEY   facultatif — ajoute Gemini en direct à la comparaison
`);
    process.exit(args.image ? 0 : 1);
  }

  let prompt = args.prompt;
  if (args.promptFile) prompt = await readFile(resolve(args.promptFile), "utf8");
  if (!prompt) die("Aucun prompt. Utilisez --prompt ou --prompt-file.");

  const chosen = args.models
    ? POYO_MODELS.filter(m => args.models.includes(m.slug))
    : POYO_MODELS;
  if (!chosen.length) die("Aucun modèle ne correspond à --models.");

  const withGoogle = Boolean(process.env.GOOGLE_API_KEY);
  const estimate = chosen.reduce((s, m) => s + (m.expected ?? 10) * CREDIT_USD, 0);

  console.log("\n  Banc de comparaison");
  console.log("  ───────────────────");
  console.log(`  Source        ${args.image}`);
  console.log(`  Prompt        ${prompt.length} caractères`);
  console.log(`  Modèles PoYo  ${chosen.length} → ${chosen.map(m => m.slug).join(", ")}`);
  console.log(`  Gemini direct ${withGoogle ? GOOGLE_MODELS.join(", ") : "désactivé (GOOGLE_API_KEY absent)"}`);
  console.log(`  Débit         ${args.concurrency} de front, sondage toutes les ${args.pollS}s`);
  console.log(`  Coût estimé   ~$${estimate.toFixed(3)}  (estimation ; le coût réel est relevé par le banc)`);

  if (args.dryRun) { console.log("\n  --dry-run : rien n'a été appelé.\n"); return; }
  if (!args.yes) die("Ajoutez --yes pour lancer. Ce banc dépense de l'argent réel.");
  if (!process.env.POYO_API_KEY) die("POYO_API_KEY manquante.");

  const runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = join(resolve(args.out), runId);
  await mkdir(outDir, { recursive: true });

  const ext = extname(args.image).toLowerCase();
  const mimeType = MIME[ext] || "image/png";
  const buf = await readFile(resolve(args.image));
  const b64 = buf.toString("base64");
  const dataUrl = `data:${mimeType};base64,${b64}`;

  await writeFile(join(outDir, "source" + ext), buf);

  console.log("\n  Téléversement de la source…");
  const sourceUrl = await uploadSource(dataUrl);
  console.log(`  ✓ ${sourceUrl}`);

  console.log("\n  Soumission et attente…\n");
  const runs = await pool(chosen, args.concurrency, async (m, i) => {
    const t0 = Date.now();
    try {
      await sleep(i * 0);                       // l'espacement est porté par le pool
      const taskId = await submit(m.slug, prompt, sourceUrl);
      await sleep(SUBMIT_SPACING_MS);
      const done = await pollUntilDone(taskId);
      const seconds = ((Date.now() - t0) / 1000).toFixed(1);
      const credits = typeof done.credits_amount === "number" ? done.credits_amount : null;
      const fileUrl = done?.files?.[0]?.file_url || null;

      let localFile = null;
      if (fileUrl) {
        const res = await fetch(fileUrl);
        const bytes = Buffer.from(await res.arrayBuffer());
        localFile = `${m.slug}.png`;
        await writeFile(join(outDir, localFile), bytes);
      }

      const drift = (credits != null && m.expected != null && Math.abs(credits - m.expected) > 0.01);
      console.log(`  ✓ ${m.slug.padEnd(24)} ${seconds.padStart(6)}s  ` +
        (credits != null ? `${String(credits).padStart(5)} cr  $${(credits*CREDIT_USD).toFixed(3)}` : "  coût non communiqué") +
        (drift ? `   ⚠ attendu ${m.expected} cr` : ""));

      return { provider: "poyo", slug: m.slug, model: m.slug, state: "ok", ok: true,
               seconds: +seconds, credits, usd: credits != null ? credits * CREDIT_USD : null,
               expected: m.expected, drift, file: localFile,
               local: localFile ? `${runId}/${localFile}` : null, taskId };
    } catch (e) {
      const seconds = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  ✗ ${m.slug.padEnd(24)} ${seconds.padStart(6)}s  ${e.message}`);
      return { provider: "poyo", slug: m.slug, model: m.slug, state: "fail", ok: false,
               seconds: +seconds, error: e.message };
    }
  });

  if (withGoogle) {
    for (const gm of GOOGLE_MODELS) {
      const t0 = Date.now();
      try {
        const r = await googleGenerate(gm, prompt, mimeType, b64);
        const seconds = ((Date.now() - t0) / 1000).toFixed(1);
        const file = `google-${gm}.png`;
        await writeFile(join(outDir, file), Buffer.from(r.base64, "base64"));
        // 60 $/1M tokens de sortie — constante reprise de app/admin/index.tsx:1403
        const usd = r.outputTokens != null ? (r.outputTokens / 1e6) * 60 : null;
        console.log(`  ✓ ${("google:" + gm).padEnd(24)} ${seconds.padStart(6)}s  ` +
          (usd != null ? `$${usd.toFixed(3)}  (${r.outputTokens} tok sortie)` : "coût inconnu"));
        runs.push({ provider: "google", slug: gm, model: gm, state: "ok", ok: true,
                    seconds: +seconds, credits: null, usd, outputTokens: r.outputTokens,
                    file, local: `${runId}/${file}` });
      } catch (e) {
        console.log(`  ✗ google:${gm}  ${e.message}`);
        runs.push({ provider: "google", slug: gm, model: gm, state: "fail", ok: false, error: e.message });
      }
    }
  }

  await writeFile(join(outDir, "resultats.json"),
    JSON.stringify({ id: runId, generatedAt: new Date().toISOString(), prompt,
                     source: basename(args.image), sourceFile: "source" + ext, runs }, null, 2));

  const html = renderHtml({ prompt, sourceFile: "source" + ext, runs });
  await writeFile(join(outDir, "comparaison.html"), html);

  const drifts = runs.filter(r => r.drift);
  console.log(`\n  → ${join(outDir, "comparaison.html")}`);
  if (drifts.length) {
    console.log("\n  ⚠ Écarts entre coût relevé et grille publique :");
    for (const d of drifts) console.log(`     ${d.model} : ${d.credits} crédits relevés, ${d.expected} attendus`);
  }
  console.log("");
}

// ---------------------------------------------------------------------------
function renderHtml({ prompt, sourceFile, runs }) {
  const ok = runs.filter(r => r.state === "ok");
  const ko = runs.filter(r => r.state !== "ok");
  const byCost = [...ok].sort((a, b) => (a.usd ?? 1e9) - (b.usd ?? 1e9));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const cards = byCost.map(r => `
    <figure class="card">
      <a href="${esc(r.file)}" target="_blank" rel="noopener"><img src="${esc(r.file)}" alt="Rendu ${esc(r.model)}" loading="lazy"></a>
      <figcaption>
        <div class="mname">${esc(r.slug || r.model)}${r.provider === "google" ? ' <span class="prov">Gemini direct</span>' : ""}</div>
        <div class="mmeta">
          <span class="cost">${r.usd != null ? "$" + r.usd.toFixed(3) : "—"}</span>
          ${r.credits != null ? `<span>${r.credits} cr</span>` : ""}
          <span>${r.seconds}s</span>
          ${r.drift ? `<span class="drift">≠ grille (${r.expected} cr)</span>` : ""}
        </div>
      </figcaption>
    </figure>`).join("");

  const rows = byCost.map(r => `<tr>
      <td>${esc(r.slug || r.model)}</td>
      <td class="n">${r.credits ?? "—"}</td>
      <td class="n">${r.usd != null ? "$" + r.usd.toFixed(3) : "—"}</td>
      <td class="n">${r.expected ?? "—"}</td>
      <td class="n">${r.seconds}s</td>
      <td>${r.drift ? '<span class="drift">écart</span>' : ""}</td>
    </tr>`).join("");

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Comparaison de rendus — MiniStudio</title>
<style>
:root{--bg:#EFEDE9;--surf:#fff;--ink:#231F20;--soft:#5F5A5B;--rule:#DBD6D0;--accent:#A86E00;--warn:#8E1014}
@media(prefers-color-scheme:dark){:root{--bg:#171514;--surf:#211E1D;--ink:#EDEAE4;--soft:#A7A09B;--rule:#363130;--accent:#FFB000;--warn:#EC6A6D}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1200px;margin:0 auto;padding:40px 24px 80px}
h1{font-size:28px;letter-spacing:-.02em;margin:0 0 6px}
h2{font-size:19px;letter-spacing:-.01em;margin:36px 0 12px}
.sub{color:var(--soft);margin:0 0 28px}
.n,.cost{font-family:ui-monospace,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.src{display:flex;gap:20px;align-items:flex-start;background:var(--surf);border:1px solid var(--rule);border-radius:10px;padding:16px;margin-bottom:8px}
.src img{width:180px;height:180px;object-fit:cover;border-radius:7px;border:1px solid var(--rule)}
.src pre{margin:0;white-space:pre-wrap;font-size:12.5px;color:var(--soft);max-height:180px;overflow:auto;flex:1}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.card{margin:0;background:var(--surf);border:1px solid var(--rule);border-radius:10px;overflow:hidden}
.card img{width:100%;aspect-ratio:1;object-fit:cover;display:block;background:var(--bg)}
figcaption{padding:11px 13px}
.mname{font-size:13.5px;font-weight:640;margin-bottom:5px;word-break:break-all}
.prov{font-size:10.5px;font-weight:700;letter-spacing:.06em;color:var(--accent)}
.mmeta{display:flex;flex-wrap:wrap;gap:9px;font-size:12px;color:var(--soft)}
.cost{color:var(--accent);font-weight:660}
.drift{color:var(--warn);font-weight:660}
table{border-collapse:collapse;width:100%;font-size:14px;background:var(--surf);border:1px solid var(--rule);border-radius:10px;overflow:hidden}
th,td{padding:8px 13px;text-align:left;border-bottom:1px solid var(--rule)}
th{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--soft)}
td.n,th.n{text-align:right}
tr:last-child td{border-bottom:0}
.fail{color:var(--warn);font-size:13.5px}
</style></head><body><div class="wrap">
<h1>Comparaison de rendus</h1>
<p class="sub">${ok.length} rendus obtenus${ko.length ? ` · ${ko.length} en échec` : ""} · classés du moins cher au plus cher · ${esc(new Date().toLocaleString("fr-FR"))}</p>

<div class="src">
  <img src="${esc(sourceFile)}" alt="Image source">
  <pre>${esc(prompt)}</pre>
</div>

<h2>Rendus</h2>
<div class="grid">${cards}</div>

<h2>Coût relevé</h2>
<table><thead><tr><th>Modèle</th><th class="n">Crédits</th><th class="n">USD</th><th class="n">Attendu</th><th class="n">Durée</th><th></th></tr></thead>
<tbody>${rows}</tbody></table>
${ko.length ? `<h2>Échecs</h2>${ko.map(r => `<p class="fail">${esc(r.slug || r.model)} — ${esc(r.error)}</p>`).join("")}` : ""}
</div></body></html>`;
}

main().catch(e => die(e.stack || e.message));
