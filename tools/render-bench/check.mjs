/**
 * Diagnostic de clé PoYo — ne consomme aucun crédit.
 *
 *   $env:POYO_API_KEY = "..."
 *   node check.mjs
 *
 * Interroge deux points d'entrée distincts, parce que PoYo sépare
 * l'authentification de génération de celle de gestion de compte : une clé peut
 * répondre 200 sur l'une et 401 sur l'autre. Seul /upload/base64 compte pour le banc.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), '.env'));
} catch { /* pas de fichier .env */ }

const KEY = process.env.POYO_API_KEY;

const mask = (k) =>
  k.length <= 12 ? '(trop courte)' : `${k.slice(0, 6)}…${k.slice(-4)}  (${k.length} caractères)`;

if (!KEY) {
  console.log('\n  ✗ POYO_API_KEY absente de cet environnement.\n');
  console.log('    PowerShell :  $env:POYO_API_KEY = "sk-..."');
  console.log('    La variable ne vit que dans la fenêtre où vous la posez.\n');
  process.exit(1);
}

console.log(`\n  Clé lue : ${mask(KEY)}`);

// Causes de rejet les plus fréquentes, invisibles à l'œil nu.
const defauts = [];
if (/^["']|["']$/.test(KEY)) defauts.push('guillemets conservés dans la valeur');
if (KEY !== KEY.trim()) defauts.push('espace ou saut de ligne en début/fin');
if (/\s/.test(KEY.trim())) defauts.push('espace au milieu (copie tronquée ?)');
if (!KEY.trim().startsWith('sk-')) defauts.push('ne commence pas par « sk- »');

if (defauts.length) {
  console.log('\n  ⚠  Anomalies détectées dans la valeur :');
  defauts.forEach((d) => console.log(`     · ${d}`));
}

const essai = async (nom, url) => {
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${KEY.trim()}` } });
    const corps = await r.text();
    const ok = r.status === 200;
    console.log(`\n  ${ok ? '✓' : '✗'} ${nom}`);
    console.log(`     ${r.status} ${corps.slice(0, 160)}`);
    return ok;
  } catch (e) {
    console.log(`\n  ✗ ${nom}\n     réseau : ${e.message}`);
    return false;
  }
};

// GET de consultation : gratuit. La tâche citée est une génération réelle déjà terminée.
const gen = await essai(
  'Authentification de génération  (/api/generate/status)',
  'https://api.poyo.ai/api/generate/status/M34GCSJBAMCLY1EE',
);

// Le point d'entrée qui échoue dans le banc. Corps volontairement invalide :
// 401 = clé refusée ; 4xx autre = clé acceptée, seul le corps est rejeté.
let upl = false;
try {
  const r = await fetch('https://api.poyo.ai/api/common/upload/base64', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const corps = await r.text();
  upl = r.status !== 401;
  console.log(`\n  ${upl ? '✓' : '✗'} Téléversement  (/api/common/upload/base64)`);
  console.log(`     ${r.status} ${corps.slice(0, 160)}`);
  if (upl && r.status !== 200) {
    console.log('     → la clé est acceptée ; ce code d’erreur ne vient que du corps vide envoyé ici.');
  }
} catch (e) {
  console.log(`\n  ✗ Téléversement\n     réseau : ${e.message}`);
}

console.log('\n  ─────────────────────────────────────────────');
if (upl) {
  console.log('  Cette clé convient au banc. Relancez  node serve.mjs');
} else if (gen) {
  console.log('  Clé valide pour générer, refusée au téléversement.');
  console.log('  Ses droits sont restreints : prenez-en une autre dans la console PoYo,');
  console.log('  ou élargissez ses permissions.');
} else {
  console.log('  Clé refusée partout : révoquée, expirée, ou copiée incomplètement.');
  console.log('  Régénérez-en une sur https://poyo.ai — console, section API keys.');
}
console.log('');
