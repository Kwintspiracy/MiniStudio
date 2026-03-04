import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Platform } from 'react-native';
import { MenuView } from '@react-native-menu/menu';
import { PhotoCameraIcon, PhotoLibraryIcon } from '@/components/Icons';
import { colors, fontFamily } from '@/theme';
import type { ImageFile } from '@/types';

interface SourceContainerProps {
  sourceImages: ImageFile[];
  activePreviewImage: string | null;
  onClearImage: () => void;
  onCameraPress: () => void;
  onFilesPress: () => void;
}

export const SourceContainer = ({
  sourceImages,
  activePreviewImage,
  onClearImage,
  onCameraPress,
  onFilesPress,
}: SourceContainerProps) => {
  const hasImageLoaded = sourceImages.length > 0;
  const showCompact = hasImageLoaded || !!activePreviewImage;
  const displayImage = sourceImages[0]?.base64 || activePreviewImage || '';

  return (
    <View style={[styles.inputContainer, !showCompact && styles.inputContainerEmpty]}>
      {showCompact ? (
        <MenuView
          onPressAction={() => onClearImage()}
          actions={[
            { id: 'clear', title: 'Clear Source Image', attributes: { destructive: true }, image: Platform.select({ ios: 'xmark.circle.fill', android: 'ic_menu_close_clear_cancel' }), imageColor: '#FF453A' },
          ]}
          shouldOpenOnLongPress
        >
          <View style={styles.sourceImageWrapper}>
            <Image source={{ uri: displayImage }} style={styles.sourceImage} />
            <TouchableOpacity onPress={onClearImage} style={styles.removeImageOverlay}>
              <Text style={styles.removeImageTextSmall}>×</Text>
            </TouchableOpacity>
          </View>
        </MenuView>
      ) : (
        <View style={styles.sourceInfo}>
          <Text style={styles.inputLabel}>SOURCE</Text>
          <Text style={styles.inputSubtitle}>
            Take a photo, choose an image or use images from your gallery.
          </Text>
        </View>
      )}

      <View style={styles.optionsRow}>
        <TouchableOpacity style={styles.optionButton} onPress={onCameraPress} activeOpacity={0.8}>
          <PhotoCameraIcon />
          <Text style={styles.optionButtonText}>Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.optionButton} onPress={onFilesPress} activeOpacity={0.8}>
          <PhotoLibraryIcon />
          <Text style={styles.optionButtonText}>Files</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  inputContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.background.secondary,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border.strong,
    borderStyle: 'dashed',
    paddingVertical: 8,
    paddingHorizontal: 8
  },
  inputContainerEmpty: {
    height: 300,
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 16
  },
  sourceInfo: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  inputLabel: {
    fontFamily: fontFamily.primary,
    fontWeight: '700',
    fontSize: 16,
    color: colors.text.primary,
    paddingLeft: 8
  },
  inputSubtitle: {
    fontFamily: fontFamily.primary,
    fontWeight: '400',
    fontSize: 15,
    lineHeight: 18,
    color: colors.text.secondary,
    marginTop: 5,
    paddingHorizontal: 16,
    textAlign: 'center'
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  optionButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 17,
    paddingHorizontal: 16,
    backgroundColor: colors.button.secondary,
    borderRadius: 4,
    marginLeft: 8,
    minWidth: 100
  },
  optionButtonText: {
    fontFamily: fontFamily.primary,
    fontWeight: '500',
    fontSize: 13,
    color: colors.text.primary,
    marginLeft: 8
  },
  sourceImageWrapper: {
    width: 50,
    height: 50,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.button.primary,
    overflow: 'hidden'
  },
  sourceImage: {
    width: '100%',
    height: '100%'
  },
  removeImageOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 15,
    height: 15,
    backgroundColor: colors.overlay.heavy,
    justifyContent: 'center',
    alignItems: 'center'
  },
  removeImageTextSmall: {
    color: colors.palette.white,
    fontSize: 10,
    fontWeight: 'bold'
  },
});
