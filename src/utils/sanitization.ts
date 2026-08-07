/**
 * Sanitization utilities for user inputs
 */

/**
 * Jeu de caractères conservé après filtrage.
 *
 * `\p{L}` couvre les lettres de toutes les écritures, `\p{N}` les chiffres, et
 * `\p{M}` les marques combinantes — indispensables, car une chaîne en forme
 * normale NFD porte l'accent comme point de code séparé : sans `\p{M}`,
 * « é » décomposé redeviendrait « e ». Le drapeau `u` est obligatoire pour que
 * ces classes soient reconnues.
 *
 * La ponctuation typographique est admise explicitement. L'apostrophe courbe
 * `’` est le cas qui compte le plus : c'est celle que produisent les claviers
 * iOS et Android par défaut, et la retirer soude les mots — « d’une » devenait
 * « dune ». Les guillemets français, les tirets longs et les points de
 * suspension suivent la même logique.
 */
const CARACTERES_AUTORISES = /[^\p{L}\p{N}\p{M}_\s.,;:?!'"’‘«»…\-–—\n]/gu;

/**
 * Sanitizes a user prompt to remove potentially harmful characters,
 * injection patterns, and enforces length limits.
 *
 * ATTENTION — ce filtre est sur le chemin de génération : tout ce qu'il retire
 * ne parviendra jamais au modèle. Il gardait auparavant `[A-Za-z0-9_]` seul,
 * ce qui **supprimait les accents au lieu de les translittérer**. Le dégât
 * n'était pas cosmétique : « ruines gothiques éclairées à la torche » devenait
 * « ruines gothiques claires la torche » — un autre mot, et « à » disparu. Le
 * modèle ne recevait pas une version approchée de la demande, il en recevait
 * une différente.
 *
 * Ce qui protège réellement est inchangé : retrait des crochets, accolades,
 * chevrons et accents graves ; filtrage des lignes ouvrant sur `SYSTEM:`,
 * `IGNORE` ou `OVERRIDE` ; plafond de longueur. Seule tombe une restriction
 * qui n'arrêtait aucun attaquant et mutilait chaque utilisateur francophone.
 *
 * @param input The raw user input string
 * @param maxLength Maximum allowed length (default: 1000)
 * @returns Sanitized string
 */
export const sanitizePrompt = (input: string, maxLength = 1000): string => {
    if (!input) return '';

    let sanitized = input.trim();

    // Strip bracket patterns and backticks (common injection wrappers)
    sanitized = sanitized.replace(/[\[\]{}<>`]/g, '');

    // Strip lines that look like injection markers
    sanitized = sanitized
        .split('\n')
        .filter(line => !/^\s*(#|SYSTEM\s*:|IGNORE|OVERRIDE)/i.test(line))
        .join('\n');

    // Keep only safe characters: letters (any script), numbers, punctuation
    sanitized = sanitized.replace(CARACTERES_AUTORISES, '');

    // Collapse multiple spaces (preserve single newlines)
    sanitized = sanitized.replace(/[ \t]+/g, ' ');

    // Truncate to max length
    if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
    }

    return sanitized.trim();
};
