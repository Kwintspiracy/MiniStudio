/**
 * Résolveur minimal pour exécuter les modules du projet hors Metro.
 * Traduit l'alias `@/…` en chemin relatif vers `src/`, comme le fait
 * babel-plugin-module-resolver dans l'application.
 *
 * Node 22+ retire les annotations de type des .ts nativement ; aucune
 * dépendance de build n'est donc nécessaire.
 *
 *   node --experimental-strip-types --import ./tests/alias-loader.mjs --test tests/
 */
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '..');

/** Modules du runtime Expo remplacés par des doublures inertes. */
const STUBS = { 'expo-constants': 'expo-constants.mjs' };

export async function resolve(specifier, context, nextResolve) {
  if (STUBS[specifier]) {
    const stub = resolvePath(ROOT, 'tests', 'stubs', STUBS[specifier]);
    return { url: pathToFileURL(stub).href, shortCircuit: true };
  }
  if (specifier.startsWith('@/')) {
    const target = resolvePath(ROOT, 'src', specifier.slice(2));
    // L'extension n'est pas écrite dans les imports du projet.
    for (const ext of ['.ts', '.tsx', '/index.ts', '']) {
      try {
        return await nextResolve(pathToFileURL(target + ext).href, context);
      } catch { /* on essaie l'extension suivante */ }
    }
  }
  // Imports relatifs sans extension : './types' -> './types.ts'
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      try { return await nextResolve(specifier + ext, context); } catch { /* suivant */ }
    }
  }
  return nextResolve(specifier, context);
}

register(import.meta.url, pathToFileURL('./'));
