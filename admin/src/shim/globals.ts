/**
 * Globales de React Native attendues par le code importé depuis ../src.
 *
 * `promptGenerator.ts` appelle `if (__DEV__) console.log(...)` à neuf endroits,
 * dont un dans la branche OSL qui s'exécute même toutes options éteintes.
 * `__DEV__` est fourni par React Native et par Metro ; le navigateur l'ignore,
 * d'où un `ReferenceError` à chaque assemblage de prompt — et, faute d'être
 * rattrapé, un écran blanc.
 *
 * Le `define` de vite.config.ts couvre la compilation de production — vérifié,
 * zéro occurrence dans le bundle — mais **pas le serveur de développement**,
 * qui sert les neuf références intactes. Poser la globale ici marche dans les
 * deux cas et ne dépend d'aucun comportement du bundler.
 *
 * Ce module doit être importé en premier dans main.tsx. Les références étant
 * toutes dans des corps de fonction, il suffit qu'il s'exécute avant le premier
 * appel — ce que garantit l'ordre d'évaluation des imports ES.
 *
 * Valeur `false` : les traces du générateur porteraient sur son fonctionnement
 * interne, et l'aperçu le rappelle à chaque frappe dans l'éditeur.
 */

// Le type est déjà déclaré par les définitions React Native, atteintes via le
// mapping `@/*` du tsconfig ; on ne le redéclare donc pas, on l'affecte.
(globalThis as Record<string, unknown>).__DEV__ ??= false;

export {};
