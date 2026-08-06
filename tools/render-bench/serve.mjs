#!/usr/bin/env node
/**
 * MiniStudio — Banc de comparaison de rendus, interface locale.
 *
 *   node serve.mjs            puis ouvrir http://localhost:5178
 *
 * Tout s'exécute sur votre machine. Les clés restent dans l'environnement du
 * processus et ne sont jamais envoyées au navigateur.
 */

import { createServer } from "node:http";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  POYO_MODELS, GOOGLE_MODELS, CREDIT_USD,
  uploadSource, runPoyoModel, runGoogleModel, preflight,
} from "./lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Clés lues depuis `.env`, à côté de ce fichier, si présent.
 *
 * Une variable posée par `$env:POYO_API_KEY = "..."` meurt avec la fenêtre du
 * terminal ; le banc envoie alors « Bearer undefined » et PoYo répond
 * « Invalid API key », ce qui laisse croire à une clé révoquée. Le fichier, lui,
 * survit. `.env` est ignoré par git (.gitignore, ligne 33).
 *
 * Une variable déjà présente dans l'environnement l'emporte sur le fichier.
 */
try {
  process.loadEnvFile(join(HERE, ".env"));
} catch {
  /* pas de fichier .env : on se contente de l'environnement */
}

const PORT = +(process.env.PORT || 5178);
const OUT = join(HERE, "resultats");

const TYPES = { ".html": "text/html; charset=utf-8", ".png": "image/png",
                ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
                ".json": "application/json; charset=utf-8" };

const json = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
let runDir = null;

/** Lit tous les passages archivés, du plus récent au plus ancien. */
async function loadAllRuns() {
  let dirs = [];
  try { dirs = (await readdir(OUT, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name); }
  catch { return []; }
  const out = [];
  for (const d of dirs.sort().reverse()) {
    try {
      const raw = await readFile(join(OUT, d, "resultats.json"), "utf8");
      const data = JSON.parse(raw);
      data.id = data.id || d;
      // Retrouve le nom du fichier source archivé (source.jpg, source.png…)
      if (!data.sourceFile) {
        try {
          const files = await readdir(join(OUT, d));
          data.sourceFile = files.find(f => f.startsWith("source.")) || null;
        } catch {}
      }
      out.push(data);
    } catch { /* passage incomplet : ignoré */ }
  }
  return out;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  try {
    // ---- interface ----------------------------------------------------
    if (p === "/" || p === "/index.html") {
      const html = await readFile(join(HERE, "ui.html"));
      res.writeHead(200, { "Content-Type": TYPES[".html"] });
      return res.end(html);
    }

    // ---- fichiers produits --------------------------------------------
    if (p.startsWith("/resultats/")) {
      try {
        const buf = await readFile(join(OUT, p.replace("/resultats/", "")));
        res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
        return res.end(buf);
      } catch { res.writeHead(404); return res.end("introuvable"); }
    }

    // ---- configuration ------------------------------------------------
    if (p === "/api/config") {
      let defaultPrompt = "";
      try { defaultPrompt = await readFile(join(HERE, "prompt.txt"), "utf8"); } catch {}
      return json(res, 200, {
        poyo: POYO_MODELS.map(m => ({ ...m, usd: m.expected != null ? m.expected * CREDIT_USD : null })),
        // maxPrompt / size voyagent avec chaque modèle : l'interface peut prévenir avant de lancer
        google: GOOGLE_MODELS,
        hasPoyoKey: Boolean(process.env.POYO_API_KEY),
        hasGoogleKey: Boolean(process.env.GOOGLE_API_KEY),
        defaultPrompt,
        creditUsd: CREDIT_USD,
      });
    }

    // ---- téléversement de la source, une seule fois par passage --------
    if (p === "/api/upload" && req.method === "POST") {
      if (!process.env.POYO_API_KEY) return json(res, 400, { error: "POYO_API_KEY absente de l'environnement du serveur." });
      const { dataUrl, filename } = await body(req);
      runDir = join(OUT, stamp());
      await mkdir(runDir, { recursive: true });
      const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const ext = extname(filename || "") || ".png";
      await writeFile(join(runDir, "source" + ext), Buffer.from(b64, "base64"));
      const fileUrl = await uploadSource(dataUrl);
      return json(res, 200, { fileUrl, runDir: runDir.replace(OUT, "").replace(/^[\\/]/, ""), sourceFile: "source" + ext });
    }

    // ---- un modèle PoYo ------------------------------------------------
    if (p === "/api/generate" && req.method === "POST") {
      const { model, prompt, imageUrl, pollMs } = await body(req);
      const refus = preflight(model, prompt);
      if (refus) return json(res, 200, { incompatible: true, error: refus });   // rien n'est dépensé
      const r = await runPoyoModel({ model, prompt, imageUrl, pollMs: pollMs || 6000 });
      let local = null;
      if (r.fileUrl && runDir) {
        const bin = Buffer.from(await (await fetch(r.fileUrl)).arrayBuffer());
        local = `${model}.png`;
        await writeFile(join(runDir, local), bin);
      }
      const expected = POYO_MODELS.find(m => m.slug === model)?.expected ?? null;
      return json(res, 200, {
        ...r,
        expected,
        drift: r.credits != null && expected != null && Math.abs(r.credits - expected) > 0.01,
        local: local ? `${runDir.replace(OUT, "").replace(/^[\\/]/, "")}/${local}` : null,
      });
    }

    // ---- un modèle Google ---------------------------------------------
    if (p === "/api/google" && req.method === "POST") {
      if (!process.env.GOOGLE_API_KEY) return json(res, 400, { error: "GOOGLE_API_KEY absente." });
      const { model, prompt, mimeType, base64 } = await body(req);
      const r = await runGoogleModel({ model, prompt, mimeType, base64 });
      let local = null;
      if (runDir) {
        local = `google-${model}.png`;
        await writeFile(join(runDir, local), Buffer.from(r.base64, "base64"));
      }
      delete r.base64;
      return json(res, 200, {
        ...r, expected: null, drift: false,
        local: local ? `${runDir.replace(OUT, "").replace(/^[\\/]/, "")}/${local}` : null,
      });
    }

    // ---- journal du passage --------------------------------------------
    if (p === "/api/save" && req.method === "POST") {
      const data = await body(req);
      if (runDir) {
        const id = runDir.replace(OUT, "").replace(/^[\\/]/, "");
        await writeFile(join(runDir, "resultats.json"), JSON.stringify({ id, ...data }, null, 2));
        return json(res, 200, { ok: true, id });
      }
      return json(res, 200, { ok: false });
    }

    // ---- historique : liste des passages --------------------------------
    if (p === "/api/history") {
      const runs = await loadAllRuns();
      return json(res, 200, runs.map(r => ({
        id: r.id,
        generatedAt: r.generatedAt,
        source: r.source,
        sourceFile: r.sourceFile || null,
        promptLength: (r.prompt || "").length,
        models: (r.runs || []).filter(x => x.state === "ok").length,
        failed: (r.runs || []).filter(x => x.state === "fail").length,
        totalUsd: (r.runs || []).reduce((s, x) => s + (x.usd || 0), 0),
        picks: r.picks || null,
      })));
    }

    // ---- historique : un passage complet --------------------------------
    if (p === "/api/run") {
      const id = url.searchParams.get("id");
      try {
        const raw = await readFile(join(OUT, id, "resultats.json"), "utf8");
        return json(res, 200, JSON.parse(raw));
      } catch { return json(res, 404, { error: "passage introuvable" }); }
    }

    // ---- podium : enregistrer les trois meilleurs -----------------------
    if (p === "/api/verdict" && req.method === "POST") {
      const { id, picks } = await body(req);
      const file = join(OUT, id, "resultats.json");
      try {
        const data = JSON.parse(await readFile(file, "utf8"));
        data.picks = picks;          // { "1": slug, "2": slug, "3": slug }
        data.judgedAt = new Date().toISOString();
        await writeFile(file, JSON.stringify(data, null, 2));
        return json(res, 200, { ok: true });
      } catch (e) { return json(res, 404, { error: e.message }); }
    }

    // ---- classement agrégé ----------------------------------------------
    if (p === "/api/leaderboard") {
      const runs = await loadAllRuns();
      const judged = runs.filter(r => r.picks && Object.keys(r.picks).length);
      const acc = new Map();
      const bump = (slug, f) => {
        if (!acc.has(slug)) acc.set(slug, { slug, runs: 0, gold: 0, silver: 0, bronze: 0,
                                            points: 0, usdSum: 0, usdN: 0, secSum: 0, secN: 0 });
        f(acc.get(slug));
      };
      for (const r of runs) {
        for (const x of (r.runs || [])) {
          if (x.state !== "ok") continue;
          bump(x.slug || x.model, a => {
            a.runs++;
            if (x.usd != null) { a.usdSum += x.usd; a.usdN++; }
            if (x.seconds != null) { a.secSum += x.seconds; a.secN++; }
          });
        }
        if (!r.picks) continue;
        const P = { "1": 3, "2": 2, "3": 1 };
        for (const [rank, slug] of Object.entries(r.picks)) {
          if (!slug) continue;
          bump(slug, a => {
            a.points += P[rank] || 0;
            if (rank === "1") a.gold++; else if (rank === "2") a.silver++; else a.bronze++;
          });
        }
      }
      const rows = [...acc.values()].map(a => ({
        slug: a.slug, runs: a.runs, gold: a.gold, silver: a.silver, bronze: a.bronze,
        points: a.points,
        avgUsd: a.usdN ? a.usdSum / a.usdN : null,
        avgSeconds: a.secN ? a.secSum / a.secN : null,
        // Points par dollar : le rapport qualité/coût, c'est l'arbitrage réel.
        valeur: (a.points && a.usdN && a.usdSum) ? a.points / (a.usdSum / a.usdN) : null,
      })).sort((x, y) => y.points - x.points || (x.avgUsd ?? 9) - (y.avgUsd ?? 9));
      return json(res, 200, { rows, totalRuns: runs.length, judgedRuns: judged.length });
    }

    res.writeHead(404); res.end("introuvable");
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  const warn = [];
  if (!process.env.POYO_API_KEY) warn.push("POYO_API_KEY");
  if (!process.env.GOOGLE_API_KEY) warn.push("GOOGLE_API_KEY (facultative)");
  console.log(`
  Banc de comparaison — interface locale

    →  http://localhost:${PORT}

  Résultats  ${OUT}
  ${warn.length ? "⚠  Manquantes : " + warn.join(", ") : "✓  Clés détectées"}

  Ctrl+C pour arrêter.
`);
});
