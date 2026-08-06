/**
 * Carte de navigation.
 *
 * Les quatre onglets de l'ancien écran — Dashboard, Prompts, Modals, Tools —
 * nommaient des composants, pas des tâches : « Modals » ne répond pas à la
 * question « qu'est-ce que je veux faire ». Les groupes ci-dessous répondent
 * à trois intentions distinctes : surveiller, écrire, régler.
 */

export type IdVue =
  | 'pilotage' | 'couts' | 'comptes'
  | 'prompts' | 'blocs'
  | 'fournisseur' | 'journal';

export interface Vue {
  id: IdVue;
  titre: string;
  icone: string;
  /** Ce que la page permet de faire — sert de sous-titre et de texte de recherche. */
  intention: string;
}

export interface GroupeVues { titre: string; vues: Vue[] }

export const NAVIGATION: GroupeVues[] = [
  {
    titre: 'Pilotage',
    vues: [
      { id: 'pilotage', titre: "Vue d'ensemble", icone: '◈',
        intention: "Usage, dépense du jour, marge et état du service en un écran." },
      { id: 'couts', titre: 'Coûts et marges', icone: '⌗',
        intention: "Dépense réelle par modèle, durée moyenne, marge par génération." },
      { id: 'comptes', titre: 'Comptes', icone: '⌸',
        intention: "Utilisateurs, soldes, générations et comptes anonymes." },
    ],
  },
  {
    titre: 'Contenu',
    vues: [
      { id: 'prompts', titre: 'Atelier de prompts', icone: '✎',
        intention: "Écrire, comparer, tester et activer les versions de prompts." },
      { id: 'blocs', titre: 'Bibliothèque de blocs', icone: '❐',
        intention: "Fragments réutilisables partagés entre plusieurs prompts." },
    ],
  },
  {
    titre: 'Système',
    vues: [
      { id: 'fournisseur', titre: 'Modèle et plafonds', icone: '⚙',
        intention: "Modèle de génération, fournisseur, plafond de dépense quotidien." },
      { id: 'journal', titre: "Journal d'audit", icone: '☰',
        intention: "Qui a changé quoi, quand, et avec quelle valeur précédente." },
    ],
  },
];

export const TOUTES_LES_VUES: Vue[] = NAVIGATION.flatMap((g) => g.vues);

export function vueParId(id: string): Vue | undefined {
  return TOUTES_LES_VUES.find((v) => v.id === id);
}

export function groupeDe(id: IdVue): string {
  return NAVIGATION.find((g) => g.vues.some((v) => v.id === id))?.titre ?? '';
}

/** Vue courante lue depuis le fragment d'URL, pour que le rechargement retombe au même endroit. */
export function vueDepuisUrl(): IdVue {
  const brut = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return (vueParId(brut)?.id ?? 'pilotage') as IdVue;
}
