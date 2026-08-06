import type { Bloc, VersionPrompt } from './api';

/**
 * Blocs réutilisables.
 *
 * Un gabarit peut référencer un fragment partagé par `{{block:slug}}`. La
 * référence est résolue à l'enregistrement, pas à la génération : ce que lit la
 * production reste du texte plein, sans indirection ni requête supplémentaire
 * sur le chemin chaud. Le gabarit non résolu est conservé dans
 * `template_source`, faute de quoi rouvrir une version en perdrait les
 * références.
 *
 * Conséquence à assumer : modifier un bloc ne met pas à jour d'office les
 * prompts qui l'emploient. `versionsAPropager` les recense, et l'atelier
 * propose de les réécrire — un geste explicite plutôt qu'un effet de bord qui
 * changerait la production sans qu'on l'ait demandé.
 */

export const MOTIF_BLOC = /\{\{block:([a-z0-9][a-z0-9_-]*)\}\}/g;

export function referencesDe(gabarit: string | null | undefined): string[] {
  if (!gabarit) return [];
  return [...new Set([...gabarit.matchAll(MOTIF_BLOC)].map((m) => m[1]))];
}

export interface Resolution {
  texte: string;
  employes: string[];
  introuvables: string[];
}

export function resoudre(gabarit: string, blocs: Bloc[]): Resolution {
  const parSlug = new Map(blocs.map((b) => [b.slug, b]));
  const employes: string[] = [];
  const introuvables: string[] = [];

  const texte = gabarit.replace(MOTIF_BLOC, (entier, slug: string) => {
    const b = parSlug.get(slug);
    if (!b) {
      // Référence laissée telle quelle : la faire disparaître silencieusement
      // enverrait un prompt amputé en production sans que rien ne le signale.
      introuvables.push(slug);
      return entier;
    }
    employes.push(slug);
    return b.body;
  });

  return { texte, employes: [...new Set(employes)], introuvables: [...new Set(introuvables)] };
}

/** Versions dont le gabarit source cite ce bloc — donc à réécrire s'il change. */
export function versionsAPropager(slug: string, versions: VersionPrompt[]): VersionPrompt[] {
  return versions.filter((v) =>
    referencesDe(v.template_source).includes(slug) ||
    referencesDe(v.template_pro_source).includes(slug));
}

/** Insère une référence à la position du curseur dans un champ de saisie. */
export function insererReference(
  champ: HTMLTextAreaElement | null, valeur: string, slug: string,
): { valeur: string; curseur: number } {
  const jeton = `{{block:${slug}}}`;
  const pos = champ?.selectionStart ?? valeur.length;
  const fin = champ?.selectionEnd ?? pos;
  return {
    valeur: valeur.slice(0, pos) + jeton + valeur.slice(fin),
    curseur: pos + jeton.length,
  };
}
