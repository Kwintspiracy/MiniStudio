import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Platform, Dimensions } from 'react-native';
import { colors, fontFamily } from '@/theme';
import type { StudioMode } from '@/types';

// Mode card images
const ImageSketch = require('../../../assets/ImageSketch.png');
const ImageSculpt = require('../../../assets/ImageSculpt.png');
const ImagePaint = require('../../../assets/ImagePaint.png');

// Dynamic spacing based on screen width
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const cardGap = SCREEN_WIDTH > 380 ? 8 : SCREEN_WIDTH > 350 ? 4 : 2;
const iconTextGap = SCREEN_WIDTH > 380 ? -4 : SCREEN_WIDTH > 350 ? -6 : -8;
const titleFontSize = SCREEN_WIDTH > 380 ? 16 : 14;
const subtitleFontSize = SCREEN_WIDTH > 380 ? 12 : 11;

interface ModeCardSelectorProps {
  activeMode: StudioMode;
  onModeChange: (mode: StudioMode) => void;
}

// Mode Card Data
const MODE_CARDS: { id: StudioMode; title: string; subtitle: string; image: any }[] = [
  { id: 'paint', title: 'Paint', subtitle: 'Explore', image: ImagePaint },
  { id: 'sculpt', title: 'Sculpt', subtitle: 'Prototype', image: ImageSculpt },
  { id: 'sketch', title: 'Sketch', subtitle: 'Explore', image: ImageSketch },
];

export const ModeCardSelector = ({ activeMode, onModeChange }: ModeCardSelectorProps) => (
  <View style={styles.modeCardContainer}>
    {MODE_CARDS.map((card) => {
      const isActive = activeMode === card.id;
      return (
        <TouchableOpacity
          key={card.id}
          onPress={() => onModeChange(card.id)}
          style={[styles.modeCard, isActive && styles.modeCardActive]}
          activeOpacity={0.8}
          accessibilityRole="radio"
          accessibilityState={{ selected: isActive }}
          accessibilityLabel={`${card.title} Mode`}
          accessibilityHint={`Switches to ${card.title} mode: ${card.subtitle}`}
        >
          <View style={styles.modeCardContent}>
            <Image source={card.image} style={styles.modeCardImage} />
            <View style={styles.modeCardText}>
              <Text style={[styles.modeCardTitle, isActive && styles.modeCardTitleActive]}>{card.title}</Text>
              <Text style={[styles.modeCardSubtitle, isActive && styles.modeCardSubtitleActive]}>{card.subtitle}</Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  modeCardContainer: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'stretch', 
    gap: cardGap, 
    paddingHorizontal: 16, 
    paddingTop: 12, 
    paddingBottom: 16,
    backgroundColor: 'transparent' 
  },
  modeCard: { 
    flex: 1, 
    backgroundColor: colors.background.secondary, 
    borderRadius: 8, 
    padding: 12, 
    gap: 8 
  },
  modeCardActive: { 
    backgroundColor: colors.text.primary 
  },
  modeCardContent: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: iconTextGap 
  },
  modeCardImage: { 
    width: 50, 
    height: 50, 
    borderRadius: 64 
  },
  modeCardText: { 
    justifyContent: 'space-between', 
    height: 30 
  },
  modeCardTitle: { 
    fontFamily: fontFamily.primary, 
    fontWeight: '800', 
    fontSize: titleFontSize, 
    lineHeight: titleFontSize, 
    color: colors.accent.red 
  },
  modeCardTitleActive: { 
    color: colors.text.red 
  },
  modeCardSubtitle: { 
    fontFamily: fontFamily.primary, 
    fontWeight: '500', 
    fontSize: subtitleFontSize, 
    lineHeight: subtitleFontSize + 2, 
    color: colors.text.primary 
  },
  modeCardSubtitleActive: { 
    color: colors.text.dark 
  },
});
