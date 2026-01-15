import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/theme';

interface SectionHeaderProps {
  icon?: React.ReactNode;
  title: string;
}

export const SectionHeader = ({ icon, title }: SectionHeaderProps) => (
  <View style={styles.sectionHeader}>
    {icon}
    <Text style={styles.sectionHeaderText}>{title}</Text>
  </View>
);

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionHeaderText: {
    fontFamily: 'Sarabun',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
    color: colors.text.secondary,
    letterSpacing: 1,
  },
});
