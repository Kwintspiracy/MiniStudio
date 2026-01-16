import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fontFamily } from '@/theme';
import { CloseIcon } from '@/components/Icons';

interface ModalHeaderProps {
  title: string;
  onClose: () => void;
}

export const ModalHeader = ({ title, onClose }: ModalHeaderProps) => (
  <View style={styles.modalHeader}>
    <Text style={styles.modalTitle}>{title}</Text>
    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
      <CloseIcon color={colors.text.secondary} />
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4, // Often needed for alignment
  },
  modalTitle: {
    fontFamily: fontFamily.primary,
    fontWeight: '700',
    fontSize: 18,
    color: colors.text.primary,
  },
  closeButton: {
    padding: 4,
  },
});
