import React, { useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, fontFamily } from '@/theme';
import { GradientBackground } from '@/components/GradientBackground';
import { CheckIcon } from '@/components/Icons';
import { studio, ecart } from './patterns';
import {
  SCENE_PRESETS, SCENE_FIELDS, SCENE_LIMITS,
  type SceneState, type SceneFields,
  type LightMode, type GroundMode, type DofMode,
} from '@/constants/scenes';

/**
 * Le mode Scène — décor et peinture dans une seule génération.
 *
 * Ce composant ne déclenche jamais de génération : il renseigne l'état de la
 * scène, que `handleGenerate` joint au prompt de peinture. C'est tout l'enjeu —
 * obliger à peindre puis à décorer ferait payer deux fois ce qu'un seul appel
 * produit, six tokens en Pro au lieu de trois.
 *
 * Tout ce qui s'affiche ici vient de `patterns.ts`, donc de l'écran existant :
 * les préréglages, les suggestions et les trois réglages de rendu sont la même
 * chip que les styles de peinture et les onglets de marque. La version
 * précédente inventait des pilules arrondies et des bordures d'accent qui
 * n'existaient nulle part ailleurs.
 */

interface Props {
  scene: SceneState;
  onChange: (patch: Partial<SceneState>) => void;
}

const SEGMENTS: {
  key: 'light' | 'ground' | 'dof';
  title: string;
  options: { value: string; label: string }[];
}[] = [
  { key: 'light', title: 'Subject lighting', options: [
    { value: 'keep', label: 'Keep' }, { value: 'adapt', label: 'Adapt' }] },
  { key: 'ground', title: 'Ground contact', options: [
    { value: 'rest', label: 'Resting' }, { value: 'blend', label: 'Blended' }] },
  { key: 'dof', title: 'Depth of field', options: [
    { value: 'none', label: 'Sharp' }, { value: 'soft', label: 'Soft' }, { value: 'strong', label: 'Strong' }] },
];

export const SceneComposer = ({ scene, onChange }: Props) => {
  const appliquerPreset = useCallback((id: string) => {
    const p = SCENE_PRESETS.find(x => x.id === id);
    if (!p) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onChange({
      presetId: p.id,
      environment: p.environment,
      lighting: p.lighting,
      atmosphere: p.atmosphere,
      setting: p.setting,
    });
  }, [onChange]);

  // Une suggestion s'ajoute au champ, elle ne l'écrase pas : elle complète une
  // description en cours d'écriture.
  const ajouterSuggestion = useCallback((key: keyof SceneFields, mot: string) => {
    const actuel = (scene[key] || '').trim().replace(/[,\s]+$/, '');
    const suivant = actuel ? `${actuel}, ${mot}` : mot;
    onChange({ [key]: suivant.slice(0, SCENE_LIMITS[key]), presetId: null } as Partial<SceneState>);
  }, [scene, onChange]);

  return (
    <>
      {/* ---- Préréglages ---- */}
      <View style={styles.groupe}>
        <View style={styles.vignettes}>
          {SCENE_PRESETS.map(p => {
            const choisi = scene.presetId === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => appliquerPreset(p.id)}
                style={styles.vignette}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Setting: ${p.name}`}
                accessibilityState={{ selected: choisi }}
              >
                <GradientBackground colors={p.swatch} style={styles.vignetteFond}>
                  {choisi && (
                    <View style={styles.coche}>
                      <CheckIcon size={13} color={colors.text.dark} />
                    </View>
                  )}
                  <View style={styles.vignetteVoile}>
                    <Text style={styles.vignetteTexte} numberOfLines={2}>{p.name}</Text>
                  </View>
                </GradientBackground>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={studio.hint}>
          A setting fills in the fields below. Everything stays editable.
        </Text>
      </View>

      {/* ---- Description ---- */}
      {SCENE_FIELDS.map(champ => {
        const valeur = scene[champ.key] || '';
        const max = SCENE_LIMITS[champ.key];
        const plein = valeur.length >= max;
        return (
          <View key={champ.key} style={styles.groupe}>
            <View style={studio.caption}>
              <Text style={studio.captionText}>{champ.label}</Text>
              <Text style={[studio.captionCount, plein && styles.compteurPlein]}>
                {valeur.length} / {max}
              </Text>
            </View>
            <TextInput
              style={[studio.field, { minHeight: 24 + champ.lines * 20 }]}
              value={valeur}
              onChangeText={(t) => onChange({
                [champ.key]: t.slice(0, max),
                presetId: null,
              } as Partial<SceneState>)}
              placeholder={champ.placeholder}
              placeholderTextColor={colors.text.muted}
              multiline={champ.lines > 1}
              maxLength={max}
              accessibilityLabel={champ.label}
            />
            <View style={studio.grid}>
              {champ.suggestions.map(s => (
                <TouchableOpacity
                  key={s}
                  onPress={() => ajouterSuggestion(champ.key, s)}
                  style={studio.chipSmall}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${s}`}
                >
                  <Text style={studio.chipSmallText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      })}

      {/* ---- Réglages de rendu ---- */}
      {SEGMENTS.map(seg => (
        <View key={seg.key} style={styles.groupe}>
          <Text style={studio.captionText}>{seg.title}</Text>
          <View style={studio.grid}>
            {seg.options.map(o => {
              const actif = scene[seg.key] === o.value;
              return (
                <TouchableOpacity
                  key={o.value}
                  onPress={() => onChange({
                    [seg.key]: o.value as LightMode & GroundMode & DofMode,
                  } as Partial<SceneState>)}
                  style={[studio.chip, styles.segment, actif && studio.chipActive]}
                  activeOpacity={0.8}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: actif }}
                  accessibilityLabel={`${seg.title}: ${o.label}`}
                >
                  <Text style={actif ? studio.chipTextActive : studio.chipText}>
                    {o.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </>
  );
};

const styles = StyleSheet.create({
  groupe: { gap: ecart.grille },

  vignettes: { flexDirection: 'row', flexWrap: 'wrap', gap: ecart.grille },
  // Quatre par rangée : (100% − 3 écarts de 4 px) / 4 ≈ 24,2 %.
  vignette: { width: '24.2%', aspectRatio: 1.3, borderRadius: 4, overflow: 'hidden' },
  vignetteFond: { flex: 1, justifyContent: 'flex-end' },
  // La sélection se marque par la même coche que le reste de l'application,
  // pas par une bordure d'accent inventée pour l'occasion.
  coche: {
    position: 'absolute', top: 4, right: 4,
    width: 18, height: 18, borderRadius: 4,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.button.white,
  },
  vignetteVoile: { backgroundColor: colors.overlay.heavy, paddingHorizontal: 4, paddingVertical: 4 },
  vignetteTexte: {
    fontFamily: fontFamily.primary, fontWeight: '500', fontSize: 9,
    lineHeight: 11, textAlign: 'center', color: colors.palette.white,
  },

  // Les options d'un réglage se partagent la largeur, comme les cartes de mode.
  segment: { flex: 1 },
  compteurPlein: { color: colors.accent.orange },
});
