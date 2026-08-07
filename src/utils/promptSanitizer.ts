/**
 * Ce module portait une seconde implémentation de `sanitizePrompt`, plus faible
 * que celle de `sanitization.ts` : pas de filtrage des marqueurs d'injection,
 * pas de plafond de longueur, et le même défaut d'origine — `\w` seul, donc les
 * accents supprimés.
 *
 * Il n'était importé nulle part (vérifié le 2026-08-07 : seule une ligne de
 * commentaire le mentionnait). Le laisser en place aurait garanti qu'un jour
 * quelqu'un l'importe et réintroduise le bogue. Il redirige donc vers l'unique
 * implémentation, celle qui est réellement sur le chemin de génération.
 *
 * @deprecated Importer `sanitizePrompt` depuis `@/utils/sanitization`.
 */
export { sanitizePrompt } from './sanitization';
