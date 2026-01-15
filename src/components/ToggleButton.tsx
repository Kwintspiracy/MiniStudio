import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '@/theme';

interface ToggleButtonProps {
  value: boolean;
  onToggle: () => void;
}

export const ToggleButton = ({ value, onToggle }: ToggleButtonProps) => (
  <TouchableOpacity
    onPress={onToggle}
    style={[styles.toggleContainer, value ? styles.toggleOn : styles.toggleOff]}
    activeOpacity={0.8}
    accessibilityRole="switch"
    accessibilityState={{ checked: value }}
  >
    <View style={[styles.toggleCircle, value ? styles.toggleCircleActive : styles.toggleCircleInactive]} />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  toggleContainer: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: 'center',
  },
  toggleOn: {
    backgroundColor: colors.button.primary,
    alignItems: 'flex-end',
  },
  toggleOff: {
    backgroundColor: colors.background.tertiary,
    alignItems: 'flex-start',
  },
  toggleCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  toggleCircleActive: {
    backgroundColor: '#FFFFFF',
  },
  toggleCircleInactive: {
    backgroundColor: colors.text.secondary,
  },
});
