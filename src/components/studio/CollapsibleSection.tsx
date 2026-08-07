import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fontFamily } from '@/theme';
import { ChevronDownIcon } from '@/components/Icons';
import { studio, ecart } from './patterns';

/**
 * Section repliable, dans le langage visuel de l'écran.
 *
 * L'en-tête reprend exactement `SectionHeader` — icône du jeu existant à
 * gauche, titre en 13 semi-gras `text.primary` — au lieu de la barre de couleur
 * et du petit titre espacé de la première version, qui n'existaient nulle part
 * ailleurs dans l'application. Le chevron est `ChevronDownIcon`, pas un
 * caractère « ⌄ » posé dans un `Text`.
 *
 * Le corps est un simple espacement : chaque section fournit son propre contenu
 * avec les motifs de `patterns.ts`.
 */
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface Props {
  title: string;
  /** Icône du jeu existant, dimensionnée par l'appelant comme dans SectionHeader. */
  icon: React.ReactNode;
  /** Ce qui est réglé, affiché quand la section est fermée. */
  summary?: string;
  open: boolean;
  onToggle: () => void;
  /** Rendu à droite du résumé — sert à l'interrupteur du mode Scène. */
  action?: React.ReactNode;
  children: React.ReactNode;
}

export const CollapsibleSection = ({
  title, icon, summary, open, onToggle, action, children,
}: Props) => {
  const basculer = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onToggle();
  }, [onToggle]);

  return (
    <View style={styles.bloc}>
      <TouchableOpacity
        style={styles.entete}
        onPress={basculer}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        accessibilityHint={open ? 'Collapse this section' : 'Expand this section'}
      >
        <View style={styles.gauche}>
          {icon}
          <Text style={styles.titre}>{title}</Text>
        </View>
        <View style={styles.droite}>
          {!open && !!summary && (
            <Text style={studio.rowValue} numberOfLines={1}>{summary}</Text>
          )}
          {action}
          <View style={open ? styles.chevronOuvert : undefined}>
            <ChevronDownIcon size={18} color={colors.text.secondary} />
          </View>
        </View>
      </TouchableOpacity>
      {open && <View style={styles.corps}>{children}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  bloc: { gap: ecart.bloc },
  // Reprend `sectionHeader` de l'écran : même hauteur, même écart, même marge.
  entete: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, marginTop: ecart.section, gap: 10,
  },
  gauche: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  droite: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  titre: {
    fontFamily: fontFamily.primary, fontWeight: '600', fontSize: 13,
    color: colors.text.primary,
  },
  chevronOuvert: { transform: [{ rotate: '180deg' }] },
  corps: { gap: ecart.bloc },
});
