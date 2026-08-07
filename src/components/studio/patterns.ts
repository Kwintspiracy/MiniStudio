import { StyleSheet, Platform } from 'react-native';
import { colors } from '@/theme';

/**
 * Les motifs visuels réellement utilisés par le studio, extraits tels quels de
 * `app/(studio)/index.tsx`.
 *
 * Ils existent pour une raison précise : la première version du mode Scène a
 * inventé son propre vocabulaire — pilules de rayon 12 à 28, fonds quasi noirs,
 * barres de couleur en guise d'en-têtes, chevron tapé au clavier. Posé sur une
 * application dont TOUT est en rayon 4 sur `background.tertiary`, le résultat
 * paraissait greffé.
 *
 * Règle : un nouveau composant du studio ne définit pas de bouton, de chip ni
 * d'en-tête. Il prend ceux d'ici. Si un motif manque, on l'ajoute ici après
 * l'avoir relevé dans l'écran existant — on ne l'improvise pas sur place.
 */

const POLICE = Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto';

export const studio = StyleSheet.create({
    /** Chip / bouton d'option. Le motif le plus employé de l'écran :
     *  styleGrid, brandTabs, options de croquis en héritent tous. */
    chip: {
        flexDirection: 'row', gap: 6,
        paddingVertical: 12, paddingHorizontal: 16,
        borderRadius: 4,
        backgroundColor: colors.background.tertiary,
        justifyContent: 'center', alignItems: 'center',
    },
    /** Sélectionné : fond blanc cassé, texte sombre. Pas de bordure d'accent. */
    chipActive: { backgroundColor: colors.button.white },
    chipText: { fontFamily: POLICE, fontWeight: '500', fontSize: 14, color: colors.text.primary },
    chipTextActive: { fontFamily: POLICE, fontWeight: '500', fontSize: 14, color: colors.text.dark },

    /** Chip compacte, pour les rangées denses (suggestions). Même langage,
     *  seulement moins de rembourrage. */
    chipSmall: {
        flexDirection: 'row', gap: 4,
        paddingVertical: 8, paddingHorizontal: 12,
        borderRadius: 4,
        backgroundColor: colors.background.tertiary,
        justifyContent: 'center', alignItems: 'center',
    },
    chipSmallText: { fontFamily: POLICE, fontWeight: '500', fontSize: 13, color: colors.text.primary },

    /** Rangée d'option avec contrôle à droite (interrupteurs NMM / OSL). */
    row: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        alignSelf: 'stretch',
        paddingVertical: 12, paddingHorizontal: 12,
        borderRadius: 4,
        backgroundColor: colors.background.tertiary,
    },
    rowLabel: { fontFamily: POLICE, fontWeight: '400', fontSize: 14, color: colors.text.primary },
    rowValue: { fontFamily: POLICE, fontWeight: '500', fontSize: 14, color: colors.text.secondary },

    /** Grille de chips. */
    grid: { flexDirection: 'row', alignSelf: 'stretch', flexWrap: 'wrap', gap: 4 },

    /** Bouton principal d'une section. */
    action: {
        flexDirection: 'row', alignSelf: 'stretch',
        padding: 16, borderRadius: 4,
        backgroundColor: colors.button.white,
        alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    actionText: {
        fontFamily: POLICE, fontWeight: '600', fontSize: 16,
        color: colors.text.dark, letterSpacing: -0.408,
    },

    /** Champ de saisie multiligne. Reprend le fond des champs de l'écran. */
    field: {
        fontFamily: POLICE, fontSize: 14, lineHeight: 20,
        color: colors.text.primary,
        backgroundColor: colors.text.textfieldbg,
        borderRadius: 4,
        paddingHorizontal: 12, paddingVertical: 12,
        textAlignVertical: 'top',
    },

    /** Texte d'aide sous un groupe. */
    hint: { fontFamily: POLICE, fontSize: 12, lineHeight: 17, color: colors.text.secondary },

    /** Légende d'un champ (nom à gauche, compteur à droite). */
    caption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    captionText: { fontFamily: POLICE, fontWeight: '600', fontSize: 12, color: colors.text.secondary },
    captionCount: { fontFamily: POLICE, fontWeight: '400', fontSize: 12, color: colors.text.muted },
});

/** Espacements employés par l'écran : 4 dans les grilles, 5 entre les blocs
 *  d'une section, 12 avant un en-tête. */
export const ecart = { grille: 4, bloc: 5, section: 12 } as const;
