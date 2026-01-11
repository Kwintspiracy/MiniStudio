import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, TextInput,
  ActivityIndicator, Alert, Modal, StyleSheet, Platform, Dimensions, StatusBar, Share, Animated, Easing
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import {
  XMarkIcon, RefreshIcon, ArrowsPointingOutIcon, DownloadIcon, CheckIcon,
  AppTitleIcon, BiSolidUserCircleIcon, BiSolidUserCircle32Icon, ColorPaletteIcon as IoMdColorPaletteIcon,
  BuildIcon, RiPaintFillIcon, AiFillFireIcon, DrawIcon, PaintIcon, MagicWandIcon, SculptIcon,
  CameraLensIcon, PhotoCameraIcon, PhotoLibraryIcon, CloseIcon, ToSourceIcon,
  FileDownloadIcon as MdFileDownloadIcon, SpinnerIcon, TbProgressCheckIcon, ShareIcon
} from '@/components/Icons';
import type { ImageFile, ToolMode, DesignerType, HistoryItem, StyleOption } from '@/types';
import { usePrompts } from '@/hooks/usePrompts';
import { generatePaintedMiniature, generateImageFromImage, upscaleImage, cancelGeneration } from '@/services/geminiService';
import { fetchAllPaints, fetchUserPaints, PaletteColor } from '@/services/paintService';
import { useImagePicker } from '@/hooks/useImagePicker';
import { useMediaSave } from '@/hooks/useMediaSave';
import { useAuth } from '@/context/AuthContext';
import { useImageContext } from '@/context/ImageContext';
import { PaintExplorerModal } from '@/components/PaintExplorerModal';
import { colors, spacing, borderRadius, fontFamily, textStyles } from '@/theme';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { shareAsync, isAvailableAsync } from 'expo-sharing';

// Get screen dimensions
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// --- Dedicated SVG Icon Components ---







// --- Figma Component: Toggle-button ---
const ToggleButton = ({ value, onToggle }: { value: boolean, onToggle: () => void }) => (
  <TouchableOpacity
    onPress={onToggle}
    style={[styles.toggleContainer, value ? styles.toggleOn : styles.toggleOff]}
    activeOpacity={0.8}
  >
    <View style={[styles.toggleCircle, value ? styles.toggleCircleActive : styles.toggleCircleInactive]} />
  </TouchableOpacity>
);

// --- Figma Components ---

const MainNavTab = ({ activeTab, onTabChange }: { activeTab: ToolMode; onTabChange: (tab: ToolMode) => void }) => (
  <View style={styles.navTabContainer}>
    <TouchableOpacity
      onPress={() => onTabChange('designer')}
      style={[styles.tabButton, activeTab === 'designer' && styles.tabButtonActive]}
      activeOpacity={0.8}
    >
      <DrawIcon color={activeTab === 'designer' ? '#FFFFFF' : colors.text.secondary} />
      <Text style={[styles.tabButtonText, activeTab === 'designer' ? styles.tabTextActive : styles.tabTextInactive]}>DESIGN</Text>
    </TouchableOpacity>

    <TouchableOpacity
      onPress={() => onTabChange('painter')}
      style={[styles.tabButton, activeTab === 'painter' && styles.tabButtonActive]}
      activeOpacity={0.8}
    >
      <RiPaintFillIcon color={activeTab === 'painter' ? '#FFFFFF' : colors.text.secondary} />
      <Text style={[styles.tabButtonText, activeTab === 'painter' ? styles.tabTextActive : styles.tabTextInactive]}>PAINT</Text>
    </TouchableOpacity>
  </View>
);

const ConceptNavTab = ({ activeType, onTypeChange }: { activeType: DesignerType; onTypeChange: (type: DesignerType) => void }) => {
  const tabs: { id: DesignerType; label: string; Icon: any }[] = [
    { id: 'sketch', label: 'Sketch', Icon: DrawIcon },
    { id: 'miniature', label: 'Sculpt', Icon: SculptIcon },
    { id: 'pro-shot', label: 'Photoshoot', Icon: CameraLensIcon }
  ];

  return (
    <View style={styles.conceptTabContainer}>
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.id}
          onPress={() => onTypeChange(tab.id)}
          style={[styles.conceptTabButton, activeType === tab.id && styles.conceptTabButtonActive]}
          activeOpacity={0.8}
        >
          <tab.Icon color={activeType === tab.id ? '#1D1D1D' : '#F4F4F4'} />
          <Text style={[styles.conceptTabText, activeType === tab.id ? styles.conceptTabTextActive : styles.conceptTabTextInactive]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const ProBadge = ({ isPro, onToggle }: { isPro: boolean; onToggle: () => void }) => (
  <TouchableOpacity
    onPress={onToggle}
    style={[styles.proBadge, isPro ? styles.proBadgeActive : styles.proBadgeInactive]}
    activeOpacity={0.7}
  >
    <TbProgressCheckIcon color="#F4F4F4" />
    <Text style={[styles.proBadgeText, styles.proTextInactive]}>Pro</Text>
  </TouchableOpacity>
);

export default function StudioScreen() {
  const { loading: authLoading } = useAuth();
  const { selectedImage, setSelectedImage } = useImageContext();
  const insets = useSafeAreaInsets();

  // Handle Camera Capture Return
  useEffect(() => {
    if (selectedImage) {
      setSourceImages([{ base64: selectedImage, mimeType: 'image/jpeg' }]);
      setSelectedImage(null); // Clear it so we don't re-trigger
    }
  }, [selectedImage]);

  const { styles: paintStylesList, templates: designerTemplates, effects: effectPrompts, shareMessage, exampleAssets, loading: promptsLoading } = usePrompts();

  const [activeTab, setActiveTab] = useState<ToolMode>('designer');
  const [designerType, setDesignerType] = useState<DesignerType>('sketch');
  const [selectedStyle, setSelectedStyle] = useState<StyleOption>(paintStylesList[0]);
  useEffect(() => {
    if (paintStylesList.length > 0 && !selectedStyle) {
      setSelectedStyle(paintStylesList[0]);
    }
  }, [paintStylesList]);
  const [isNMMEnabled, setIsNMMEnabled] = useState(false);
  const [isOSLEnabled, setIsOSLEnabled] = useState(false);
  const [isPaletteEnabled, setIsPaletteEnabled] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);

  const [designerPrompt, setDesignerPrompt] = useState('');
  const [painterPrompt, setPainterPrompt] = useState('');
  const [isPro, setIsPro] = useState(false);

  const [sourceImages, setSourceImages] = useState<ImageFile[]>([]);
  const [activePreviewImage, setActivePreviewImage] = useState<string | null>(null);
  const [previewAspectRatio, setPreviewAspectRatio] = useState(1);
  const [generationHistory, setGenerationHistory] = useState<HistoryItem[]>([]);
  const [selectedColors, setSelectedColors] = useState<{ name: string, hex: string }[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [isResultsDrawerOpen, setIsResultsDrawerOpen] = useState(false);
  const [isPaintExplorerOpen, setIsPaintExplorerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Batch Deletion State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedHistoryItems, setSelectedHistoryItems] = useState<Set<string>>(new Set());
  const [hiddenDemoAssets, setHiddenDemoAssets] = useState<string[]>([]);

  const { pickMultipleImages, pickDocument } = useImagePicker();
  const { saveImage } = useMediaSave();

  // Load hidden demo assets from storage
  useEffect(() => {
    AsyncStorage.getItem('hidden_demo_assets').then(stored => {
      if (stored) {
        setHiddenDemoAssets(JSON.parse(stored));
      }
    });
  }, []);

  // Load example assets into Gallery history when available
  useEffect(() => {
    if (exampleAssets && exampleAssets.length > 0) {
      setGenerationHistory(prev => {
        // Convert exampleAssets (URLs) to HistoryItem objects
        const exampleHistoryItems: HistoryItem[] = exampleAssets.map(url => ({
          url,
          isPro: false,
          isMaster: false,
          modelName: 'demo',
          timestamp: 0, // Mark as demo with timestamp 0
        }));

        // Filter out duplicates based on URL and hidden assets
        const newItems = exampleHistoryItems.filter(
          newItem => !prev.some(existingItem => existingItem.url === newItem.url) && !hiddenDemoAssets.includes(newItem.url)
        );

        if (newItems.length === 0) return prev;
        // Add demo items at the end of history
        return [...prev, ...newItems];
      });
    }
  }, [exampleAssets, hiddenDemoAssets]);

  const handlePickImage = useCallback(async () => {
    const images = await pickMultipleImages();
    if (images.length > 0) {
      setSourceImages(images);
    }
  }, [pickMultipleImages]);

  const handleDocumentPick = useCallback(async () => {
    const doc = await pickDocument();
    if (doc) {
      setSourceImages([doc]);
    }
  }, [pickDocument]);

  const handleFilesPress = useCallback(() => {
    Alert.alert(
      'Select Image Source',
      'Choose where to load your image from',
      [
        { text: 'Photo Library', onPress: handlePickImage },
        { text: 'Browse Documents', onPress: handleDocumentPick },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  }, [handlePickImage, handleDocumentPick]);

  const handleGenerate = useCallback(async () => {
    if (sourceImages.length === 0) {
      setError("Please add reference images first.");
      return;
    }
    setIsLoading(true);
    setError(null);
    const model = isPro ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    try {
      let images: string[] = [];
      if (activeTab === 'painter' && sourceImages.length >= 1) {
        const promptToUse = isPro ? (selectedStyle.promptPro || selectedStyle.prompt) : selectedStyle.prompt;
        const promptParts: string[] = [promptToUse, painterPrompt];

        const nmmEffect = effectPrompts['effect.nmm'];
        if (isNMMEnabled && nmmEffect) {
          promptParts.push(isPro ? nmmEffect.pro : nmmEffect.default);
        } else if (nmmEffect) {
          // Negative Prompts
          const neg = isPro ? nmmEffect.negative_pro : nmmEffect.negative_default;
          if (neg) promptParts.push(neg);
        }

        const oslEffect = effectPrompts['effect.osl'];
        if (isOSLEnabled && oslEffect) {
          promptParts.push(isPro ? oslEffect.pro : oslEffect.default);
        } else if (oslEffect) {
          // Negative Prompts
          const neg = isPro ? oslEffect.negative_pro : oslEffect.negative_default;
          if (neg) promptParts.push(neg);
        }
        if (isPaletteEnabled) {
          if (selectedColors.length > 0) {
            promptParts.push(`strictly using this color palette: ${selectedColors.map(c => `${c.name} (${c.hex})`).join(', ')}`);
          } else if (selectedBrands.length > 0) {
            promptParts.push(`using paints from these brands: ${selectedBrands.join(', ')}`);
          }
        }
        promptParts.push("GENERATE THE IMAGE NOW. Do not output conversational text.");
        const finalPrompt = promptParts.filter(Boolean).join(' ');
        console.log(finalPrompt);
        images = await generatePaintedMiniature(sourceImages, finalPrompt, 1, model);
      } else if (activeTab === 'designer') {
        const characterDesc = designerPrompt.trim() || 'character';
        const typeToUse = sourceImages.length > 1 ? 'combined' : designerType;
        const templateConfig = designerTemplates[typeToUse];
        const template = isPro ? templateConfig.pro : templateConfig.default;
        const prompt = template.replace(/{input}/g, characterDesc);
        console.log(prompt);
        images = await generateImageFromImage(sourceImages, prompt, model);
      }
      if (images && images.length > 0) {
        const resultUrl = images[0];
        setActivePreviewImage(resultUrl);
        setGenerationHistory(prev => [{ url: resultUrl, isPro, isMaster: false, modelName: model, timestamp: Date.now() }, ...prev]);
        setIsResultsDrawerOpen(true);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') setError(err.message || "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, [sourceImages, activeTab, designerPrompt, designerType, isPro, painterPrompt, selectedStyle, isNMMEnabled, isOSLEnabled, isPaletteEnabled, selectedColors, selectedBrands]);

  // Handle dynamic aspect ratio for the preview image
  useEffect(() => {
    if (activePreviewImage) {
      Image.getSize(activePreviewImage, (width, height) => {
        if (width > 0 && height > 0) {
          setPreviewAspectRatio(width / height);
        }
      }, (error) => {
        console.error("Failed to get image size:", error);
        setPreviewAspectRatio(1); // Default to square if it fails
      });
    }
  }, [activePreviewImage]);

  const handleCancelGeneration = useCallback(() => {
    cancelGeneration();
    setIsLoading(false);
  }, []);

  const handleUpscale = useCallback(async () => {
    if (!activePreviewImage) return;
    setIsUpscaling(true);
    const model = isPro ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    try {
      const upscaled = await upscaleImage({ base64: activePreviewImage, mimeType: 'image/png' }, model);
      setActivePreviewImage(upscaled);
      setGenerationHistory(prev => prev.map(item => item.url === activePreviewImage ? { ...item, url: upscaled, isMaster: true } : item));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUpscaling(false);
    }
  }, [activePreviewImage, isPro]);

  const handleDownload = useCallback(async () => {
    if (!activePreviewImage) return;
    const success = await saveImage(activePreviewImage);
    if (success) Alert.alert('Success', 'Image saved to your photo library!');
  }, [activePreviewImage, saveImage]);

  const handleShare = useCallback(async () => {
    if (!activePreviewImage) return;
    try {
      // Check if sharing is available
      const isAvailable = await isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'Sharing is not available on this device');
        return;
      }

      // Generate a temporary file path
      const filename = `ministudio_share_${Date.now()}.png`;
      const fileUri = FileSystem.cacheDirectory + filename;

      // The base64 data usually comes with prefix "data:image/png;base64,", strip it if needed for writeAsStringAsync
      // But passing base64 directly to writeAsStringAsync with encoding base64 expects pure base64.
      // activePreviewImage includes "data:image/png;base64," prefix.
      const base64Data = activePreviewImage.split(',')[1];

      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: 'base64',
      });

      if (Platform.OS === 'ios') {
        await Share.share({
          url: fileUri,
          message: shareMessage,
        });
      } else {
        await shareAsync(fileUri, {
          mimeType: 'image/png',
          dialogTitle: 'Share your Miniature',
          UTI: 'public.png',
        });
      }
    } catch (error: any) {
      Alert.alert('Error sharing', error.message);
    }
  }, [activePreviewImage]);

  const handleUseAsSource = useCallback(async () => {
    if (!activePreviewImage) return;

    let imageData = activePreviewImage;

    // If it's a remote URL (not a data URL), fetch and convert to base64
    if (activePreviewImage.startsWith('http')) {
      try {
        const response = await fetch(activePreviewImage);
        const blob = await response.blob();
        const reader = new FileReader();
        imageData = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        Alert.alert('Error', 'Failed to load image');
        return;
      }
    }

    const newImage: ImageFile = { base64: imageData, mimeType: 'image/png' };
    setSourceImages([newImage]);
    setIsResultsDrawerOpen(false);
  }, [activePreviewImage]);

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedHistoryItems(new Set());
  };

  const toggleSelection = (url: string) => {
    setSelectedHistoryItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(url)) {
        newSet.delete(url);
      } else {
        newSet.add(url);
      }
      return newSet;
    });
  };

  const deleteSelectedItems = async () => {
    Alert.alert(
      'Delete Items',
      `Are you sure you want to delete ${selectedHistoryItems.size} items?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const itemsToDelete = Array.from(selectedHistoryItems);
            
            // Find demo items to hide
            const demosToHide = generationHistory
              .filter(item => itemsToDelete.includes(item.url) && item.modelName === 'demo')
              .map(item => item.url);

            // Update persistent storage for demos
            if (demosToHide.length > 0) {
              const newHidden = [...hiddenDemoAssets, ...demosToHide];
              setHiddenDemoAssets(newHidden);
              await AsyncStorage.setItem('hidden_demo_assets', JSON.stringify(newHidden));
            }

            // Remove from state
            setGenerationHistory(prev => prev.filter(item => !selectedHistoryItems.has(item.url)));
            
            // cleanup
            if (activePreviewImage && selectedHistoryItems.has(activePreviewImage)) {
              setActivePreviewImage(null);
            }
            setIsSelectionMode(false);
            setSelectedHistoryItems(new Set());
          }
        }
      ]
    );
  };

  const toggleColor = (colorName: string, hexCode?: string) => {
    setSelectedColors(prev => {
      const exists = prev.find(c => c.name === colorName);
      if (exists) {
        return prev.filter(c => c.name !== colorName);
      } else {
        return [...prev, { name: colorName, hex: hexCode || '#FFFFFF' }];
      }
    });
  };

  const toggleBrand = (brand: string) => {
    setSelectedBrands(prev => {
      if (prev.includes(brand)) {
        return prev.filter(b => b !== brand);
      } else {
        return [...prev, brand];
      }
    });
  };

  if (authLoading) return <View style={styles.centered}><ActivityIndicator size="large" color="#0058DB" /></View>;

  const hasImageLoaded = sourceImages.length > 0;
  const hasContentToView = hasImageLoaded || generationHistory.length > 0 || exampleAssets.length > 0;

  // paintStylesList is now coming from the hook

  const brandTabs = ['My Paints', 'Army Painter', 'Citadel Colour', 'Scale75', 'Duncan', 'Vallejo'];



  return (
    <View style={styles.screenContainer}>
      <View style={[styles.statusBarBackground, { height: insets.top }]} />
      <StatusBar barStyle="light-content" backgroundColor="#12121F" />
      <View style={styles.container}>

        {/* Top Navigation */}
        <View style={styles.topNav}>
          <View style={styles.topNavSide}>
            <ProBadge isPro={isPro} onToggle={() => setIsPro(!isPro)} />
          </View>
          <View style={styles.topNavTitle}>
            <AppTitleIcon />
          </View>
          <TouchableOpacity onPress={() => router.push('/settings')} style={[styles.topNavSide, styles.userIconContainer]} activeOpacity={0.7}>
            <BiSolidUserCircle32Icon />
          </TouchableOpacity>
        </View>

        {/* Main Content Area */}
        <MainNavTab activeTab={activeTab} onTabChange={setActiveTab} />
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.inputContainer}>
            {hasImageLoaded ? (
              <View style={styles.sourceImageWrapper}>
                <Image source={{ uri: sourceImages[0].base64 }} style={styles.sourceImage} />
                <TouchableOpacity onPress={() => setSourceImages([])} style={styles.removeImageOverlay}>
                  <Text style={styles.removeImageTextSmall}>×</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.sourceInfo}>
                <Text style={styles.inputLabel}>SOURCE</Text>
                <Text style={styles.inputSubtitle}>
                  Choose an image
                </Text>
              </View>
            )}

            <View style={styles.optionsRow}>
              <TouchableOpacity style={styles.optionButton} onPress={() => router.push('/camera')} activeOpacity={0.8}>
                <PhotoCameraIcon />
                <Text style={styles.optionButtonText}>Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.optionButton} onPress={handleFilesPress} activeOpacity={0.8}>
                <PhotoLibraryIcon />
                <Text style={styles.optionButtonText}>Files</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* DESIGN: Mode-Specific Content */}
          {hasImageLoaded && (
            <View style={styles.modeContent}>
              {activeTab === 'designer' ? (
                <>
                  <View style={styles.designStepSection}>
                    <View style={styles.sectionHeader}>
                      <BuildIcon color="rgba(244, 244, 244, 0.4)" />
                      <Text style={styles.sectionHeaderText}>DESIGN STEP</Text>
                    </View>
                    <ConceptNavTab activeType={designerType} onTypeChange={setDesignerType} />
                  </View>
                  <View style={styles.promptContainer}>
                    <TextInput
                      value={designerPrompt}
                      onChangeText={setDesignerPrompt}
                      placeholder="Optional: add more details to the default prompt..."
                      placeholderTextColor={colors.text.secondary}
                      multiline
                      textAlignVertical="top"
                      style={styles.promptInput}
                    />
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.paintStepSection}>
                    <View style={styles.sectionHeader}>
                      <RiPaintFillIcon color="rgba(244, 244, 244, 0.4)" />
                      <Text style={styles.sectionHeaderText}>CHOOSE A STYLE</Text>
                    </View>
                    <View style={styles.styleGrid}>
                      {paintStylesList.map((style) => (
                        <TouchableOpacity
                          key={style.id}
                          onPress={() => setSelectedStyle(paintStylesList.find(s => s.id === style.id) || paintStylesList[0])}
                          style={[styles.styleButton, selectedStyle?.id === style.id && styles.styleButtonActive]}
                        >
                          <Text style={[styles.styleButtonText, selectedStyle?.id === style.id ? styles.styleTextActive : styles.styleTextInactive]}>
                            {style.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.promptContainer}>
                    <TextInput
                      value={painterPrompt}
                      onChangeText={setPainterPrompt}
                      placeholder="Add more details to the default prompt..."
                      placeholderTextColor="rgba(244, 244, 244, 0.4)"
                      multiline
                      textAlignVertical="top"
                      style={styles.promptInput}
                    />
                  </View>

                  <View style={styles.paintStepSection}>
                    <View style={styles.sectionHeader}>
                      <MagicWandIcon color="rgba(244, 244, 244, 0.4)" />
                      <Text style={styles.sectionHeaderText}>ADD EFFECTS</Text>
                    </View>
                    <TouchableOpacity style={styles.optionItem} onPress={() => setIsNMMEnabled(!isNMMEnabled)} activeOpacity={0.7}>
                      <Text style={[styles.optionLabel, isNMMEnabled && styles.optionLabelActive]}>NNM - Non Metallic Metal</Text>
                      <ToggleButton value={isNMMEnabled} onToggle={() => setIsNMMEnabled(!isNMMEnabled)} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.optionItem} onPress={() => setIsOSLEnabled(!isOSLEnabled)} activeOpacity={0.7}>
                      <Text style={[styles.optionLabel, isOSLEnabled && styles.optionLabelActive]}>OSL - Object Source Lighting</Text>
                      <ToggleButton value={isOSLEnabled} onToggle={() => setIsOSLEnabled(!isOSLEnabled)} />
                    </TouchableOpacity>

                    <View style={styles.sectionHeader}>
                      <IoMdColorPaletteIcon color="rgba(244, 244, 244, 0.4)" />
                      <Text style={styles.sectionHeaderText}>COLOR PALETTE</Text>
                    </View>
                    <TouchableOpacity style={styles.optionItem} onPress={() => setIsPaletteEnabled(!isPaletteEnabled)} activeOpacity={0.7}>
                      <Text style={[styles.optionLabel, isPaletteEnabled && styles.optionLabelActive]}>Choose from Brands and Paints</Text>
                      <ToggleButton value={isPaletteEnabled} onToggle={() => setIsPaletteEnabled(!isPaletteEnabled)} />
                    </TouchableOpacity>

                    {isPaletteEnabled && (
                      <>
                        {/* Brand Selection Tabs */}
                        <View style={styles.brandTabs}>
                          {brandTabs.map((brand) => {
                            const isSelected = selectedBrands.includes(brand);
                            return (
                              <TouchableOpacity
                                key={brand}
                                onPress={() => toggleBrand(brand)}
                                style={[styles.brandButton, isSelected && styles.brandButtonActive]}
                              >
                                {brand === 'My Paints' && <BiSolidUserCircleIcon size={16} color={isSelected ? '#1D1D1D' : '#F4F4F4'} opacity={1} />}
                                <Text style={[styles.brandText, isSelected ? styles.styleTextActive : styles.styleTextInactive]}>{brand}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        {/* Paint Selection Container */}
                        <View style={styles.paintSelectionContainer}>
                          {selectedColors.length > 0 ? (
                            <>
                              {/* Header with count and clear */}
                              <View style={styles.paintSelectionHeader}>
                                <Text style={styles.paintSelectionCount}>{selectedColors.length} Colors Selected</Text>
                                <TouchableOpacity onPress={() => setSelectedColors([])}>
                                  <Text style={styles.clearAllText}>Clear All</Text>
                                </TouchableOpacity>
                              </View>
                              {/* Color chips */}
                              <View style={styles.colorChipsGrid}>
                                {selectedColors.map((color) => (
                                  <View key={color.name} style={styles.colorChip}>
                                    <View style={[styles.colorChipCircle, { backgroundColor: color.hex }]} />
                                    <Text style={styles.colorChipName} numberOfLines={1}>{color.name}</Text>
                                    <TouchableOpacity onPress={() => toggleColor(color.name)} style={styles.colorChipClose}>
                                      <CloseIcon color="#F4F4F4" />
                                    </TouchableOpacity>
                                  </View>
                                ))}
                              </View>
                            </>
                          ) : (
                            <View style={styles.paintSelectionEmpty}>
                              <Text style={styles.paintSelectionHint}>
                                {selectedBrands.length > 0
                                  ? `${selectedBrands.length} ${selectedBrands.length === 1 ? 'Brand' : 'Brands'} Selected`
                                  : 'When no specific Brand or Paint is selected, the AI can use any of them to create.'}
                              </Text>
                            </View>
                          )}
                          {/* Paint Selection button - always visible */}
                          <TouchableOpacity style={styles.paintSelectionButton} onPress={() => setIsPaintExplorerOpen(true)} activeOpacity={0.8}>
                            <Text style={styles.paintSelectionButtonText}>Paint Selection</Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                </>
              )}
            </View>
          )}
        </ScrollView>

        {/* Bottom Navigation */}
        <View style={[styles.footerContainer, Platform.OS === 'android' && { paddingBottom: 30 + insets.bottom }]}>
          <View style={styles.bottomButtonsRow}>
            <TouchableOpacity
              style={[styles.galleryButton, !hasContentToView && styles.buttonDisabled]}
              disabled={!hasContentToView}
              onPress={() => setIsResultsDrawerOpen(true)}
              activeOpacity={0.7}
              accessibilityLabel="Open gallery"
              accessibilityRole="button"
              accessibilityState={{ disabled: !hasContentToView }}
            >
              <Text style={styles.galleryButtonText}>Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.createButton, isLoading && styles.cancelButton]}
              onPress={isLoading ? handleCancelGeneration : handleGenerate}
              activeOpacity={0.8}
              accessibilityLabel={isLoading ? 'Cancel generation' : 'Create image'}
              accessibilityRole="button"
              accessibilityHint={isLoading ? 'Stops the current image generation' : 'Generates a new image based on your settings'}
            >
              <View style={styles.createButtonContent}>
                {!isLoading && <MagicWandIcon color="#F4F4F4" />}
                {isLoading && <SpinnerIcon color="#FFFFFF" />}
                <Text style={[styles.createButtonText, isLoading && styles.cancelButtonText]}>{isLoading ? 'Cancel' : 'Create'}</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <Modal visible={isResultsDrawerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsResultsDrawerOpen(false)}>
          <SafeAreaView style={styles.modalContainer} edges={['top']}>
            <View style={styles.grabberContainer}><View style={styles.grabber} /></View>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={toggleSelectionMode} style={[styles.modalHeaderSide, { alignItems: 'flex-start' }]}>
                <Text style={styles.headerButtonText}>{isSelectionMode ? 'Cancel' : 'Select'}</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Results</Text>
              <TouchableOpacity 
                onPress={isSelectionMode ? deleteSelectedItems : () => setIsResultsDrawerOpen(false)} 
                style={[styles.modalHeaderSide, { alignItems: 'flex-end' }]}
                disabled={isSelectionMode && selectedHistoryItems.size === 0}
              >
                <Text style={[styles.doneButtonText, isSelectionMode && selectedHistoryItems.size === 0 && { opacity: 0.5 }, isSelectionMode && { color: '#FF5050' }]}>
                  {isSelectionMode ? `Delete (${selectedHistoryItems.size})` : 'Close'}
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              {activePreviewImage && (
                <View style={styles.resultContainer}>
                  <Image source={{ uri: activePreviewImage }} style={[styles.activeResultImage, { aspectRatio: previewAspectRatio }]} resizeMode="cover" />
                  <View style={styles.resultActions}>
                    <TouchableOpacity onPress={handleUseAsSource} style={[styles.resultActionButton, styles.resultActionButtonPrimary]} accessibilityLabel="Use as source image" accessibilityRole="button"><ToSourceIcon color="#1D1D1D" /><Text style={[styles.resultActionText, styles.resultActionTextDark]}>Use as source</Text></TouchableOpacity>
                    <TouchableOpacity onPress={handleDownload} style={styles.resultActionButtonIcon} accessibilityLabel="Download image" accessibilityRole="button"><MdFileDownloadIcon color="#F4F4F4" /></TouchableOpacity>
                    <TouchableOpacity onPress={handleShare} style={styles.resultActionButtonIcon} accessibilityLabel="Share image" accessibilityRole="button"><ShareIcon color="#F4F4F4" /></TouchableOpacity>
                  </View>
                </View>
              )}
              <View style={[styles.historyContainer, { paddingBottom: 80 + insets.bottom }]}><Text style={styles.historyTitle}>History</Text><View style={styles.historyGrid}>
                {generationHistory.map((item, i) => {
                  const isSelected = selectedHistoryItems.has(item.url);
                  return (
                    <TouchableOpacity 
                      key={i} 
                      style={[
                        styles.historyItem, 
                        activePreviewImage === item.url && !isSelectionMode && styles.historyItemActive,
                        isSelected && styles.historyItemSelected
                      ]} 
                      onPress={() => isSelectionMode ? toggleSelection(item.url) : setActivePreviewImage(item.url)}
                      activeOpacity={0.7}
                    >
                      <Image source={{ uri: item.url }} style={[styles.historyImage, isSelected && { opacity: 0.7 }]} />
                      {isSelectionMode && (
                        <View style={styles.selectionOverlay}>
                          <View style={[styles.selectionCheck, isSelected ? styles.selectionCheckActive : styles.selectionCheckInactive]}>
                            {isSelected && <CheckIcon size={12} color="#FFF" />}
                          </View>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View></View>
            </ScrollView>
          </SafeAreaView>
        </Modal>

        {/* Paint Explorer Modal */}
        <PaintExplorerModal
          visible={isPaintExplorerOpen}
          onClose={() => setIsPaintExplorerOpen(false)}
          selectedBrands={selectedBrands}
          selectedColors={selectedColors}
          onToggleColor={toggleColor}
          triggerLoad={isPaletteEnabled}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: { flex: 1, backgroundColor: colors.background.secondary },
  statusBarBackground: { height: 0, backgroundColor: colors.background.secondary },
  container: { flex: 1, backgroundColor: colors.background.primary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.primary },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 64, paddingHorizontal: 0, backgroundColor: colors.background.secondary },
  topNavSide: { width: 91, alignItems: 'center', justifyContent: 'center' },
  topNavTitle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  userIconContainer: { alignItems: 'flex-end', paddingRight: 16 },
  proBadge: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: colors.button.primary },
  proBadgeInactive: { backgroundColor: '#002761' },
  proBadgeActive: { backgroundColor: colors.button.primary },
  proBadgeText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System', fontWeight: '500', fontSize: 14, letterSpacing: -0.41, marginLeft: 4 },
  proTextInactive: { color: colors.text.primary },
  proTextActive: { color: colors.text.primary },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 150 },
  navTabContainer: { flexDirection: 'row', alignSelf: 'stretch', backgroundColor: colors.background.secondary, paddingHorizontal: 16, paddingVertical: 8 },
  tabButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 6 },
  tabButtonActive: { backgroundColor: colors.button.primary },
  tabButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 14, marginLeft: 4 },
  tabTextActive: { color: colors.text.primary },
  tabTextInactive: { color: colors.text.secondary },
  inputContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', backgroundColor: colors.background.tertiary, borderRadius: 8, borderWidth: 2, borderColor: colors.border.strong, borderStyle: 'dashed', paddingVertical: 8, paddingHorizontal: 8 },
  sourceInfo: { justifyContent: 'center' },
  inputLabel: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '700', fontSize: 12, color: colors.text.secondary },
  inputSubtitle: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '400', fontSize: 13, color: colors.text.primary, marginTop: 2 },
  optionsRow: { flexDirection: 'row', alignItems: 'center' },
  optionButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 17, paddingHorizontal: 16, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 4, marginLeft: 8 },
  optionButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 13, color: colors.text.primary, marginLeft: 8 },
  sourceImageWrapper: { width: 50, height: 50, borderRadius: 6, borderWidth: 3, borderColor: colors.button.primary, overflow: 'hidden' },
  sourceImage: { width: '100%', height: '100%' },
  removeImageOverlay: { position: 'absolute', top: 0, right: 0, width: 15, height: 15, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  removeImageTextSmall: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  modeContent: { marginTop: 8, gap: 5, alignSelf: 'stretch' },
  promptContainer: { alignSelf: 'stretch', backgroundColor: 'rgba(0, 0, 0, 0.3)', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, minHeight: 200 },
  promptInput: { flex: 1, fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System', fontSize: 14, color: colors.text.primary, lineHeight: 20 },
  designStepSection: { gap: 5 },
  paintStepSection: { gap: 5 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 8, padding: 8, marginTop: 12 },
  sectionHeaderText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 13, color: colors.text.secondary },
  conceptTabContainer: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 4 },
  conceptTabButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.3)', height: 40 },
  conceptTabButtonActive: { backgroundColor: colors.button.white },
  conceptTabText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 13 },
  conceptTabTextActive: { color: colors.text.dark },
  conceptTabTextInactive: { color: colors.text.primary },
  styleGrid: { flexDirection: 'row', alignSelf: 'stretch', flexWrap: 'wrap', gap: 4 },
  styleButton: { justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 4, backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  styleButtonActive: { backgroundColor: colors.button.white },
  styleButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 13 },
  styleTextActive: { color: colors.text.dark, fontWeight: '600' },
  styleTextInactive: { color: colors.text.primary },
  optionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 4, backgroundColor: 'rgba(255, 255, 255, 0.05)' },
  optionLabel: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '400', fontSize: 14, color: colors.text.primary },
  optionLabelActive: { color: colors.text.primary },
  toggleContainer: { width: 46, height: 24, padding: 3, borderRadius: 12, justifyContent: 'center' },
  toggleOn: { backgroundColor: colors.button.white },
  toggleOff: { backgroundColor: colors.text.secondary },
  toggleCircle: { width: 18, height: 18, borderRadius: 9 },
  toggleCircleActive: { alignSelf: 'flex-end', backgroundColor: colors.button.primary },
  toggleCircleInactive: { alignSelf: 'flex-start', backgroundColor: colors.text.dark },
  paletteContainer: { padding: 12, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.05)', backgroundColor: 'transparent', gap: 12, alignSelf: 'stretch' },
  paletteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paletteTitle: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 13, color: colors.text.secondary },
  clearAllText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 13, color: '#FF5050' },
  // Paint Selection Component Styles
  paintSelectionContainer: { borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, padding: 12, gap: 4, alignSelf: 'stretch', overflow: 'hidden' },
  paintSelectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, paddingBottom: 8 },
  paintSelectionCount: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 13, color: colors.text.secondary, lineHeight: 14 },
  paintSelectionEmpty: { paddingTop: 4, paddingBottom: 8 },
  paintSelectionHint: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 14, color: colors.text.primary, lineHeight: 18 },
  paintSelectionButton: { alignSelf: 'stretch', padding: 16, backgroundColor: colors.button.white, borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  paintSelectionButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 16, color: colors.text.dark, letterSpacing: -0.408 },
  colorChipsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: 'rgba(0, 0, 0, 0.3)', borderRadius: 4 },
  colorChipCircle: { width: 16, height: 16, borderRadius: 8 },
  colorChipName: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '400', fontSize: 13, color: colors.text.primary, maxWidth: 100 },
  colorChipClose: { marginLeft: 4 },
  brandTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  brandButton: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 12, borderRadius: 4, backgroundColor: 'rgba(0, 0, 0, 0.3)' },
  brandButtonActive: { backgroundColor: colors.button.white },
  brandText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 13 },
  explorerButton: { alignSelf: 'stretch', padding: 16, backgroundColor: colors.button.white, borderRadius: 4, alignItems: 'center' },
  explorerButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 14, color: colors.text.dark },
  footerContainer: { alignSelf: 'stretch', backgroundColor: colors.background.secondary, paddingTop: 32, paddingHorizontal: 16, paddingBottom: 50, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 20 },
  bottomButtonsRow: { flexDirection: 'row', alignSelf: 'stretch', gap: 8 },
  galleryButton: { flex: 1, height: 52, backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.border.strong, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  galleryButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 16, color: colors.text.secondary },
  createButton: { flex: 1, height: 52, backgroundColor: colors.button.primary, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  createButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  createButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 16, color: colors.text.primary },
  cancelButton: { backgroundColor: colors.text.dark },
  cancelButtonText: { color: colors.text.primary, opacity: 0.3 },
  buttonDisabled: { opacity: 0.5 },
  modalContainer: { flex: 1, backgroundColor: colors.background.secondary },
  grabberContainer: { width: '100%', height: 24, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 36, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.2)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  modalHeaderSide: { width: 80, justifyContent: 'center' },
  modalTitle: { flex: 1, textAlign: 'center', color: colors.text.primary, fontSize: 16, fontFamily: 'SF Pro Display', fontWeight: '700', letterSpacing: -0.41 },
  doneButtonText: { color: colors.button.primary, fontSize: 16, fontWeight: '600', textAlign: 'right' },
  closeButton: { paddingVertical: 12, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'flex-end' },
  modalContent: { flex: 1, padding: 24 },
  resultContainer: { alignSelf: 'stretch', gap: 8, marginBottom: 32 },
  activeResultImage: { width: '100%', aspectRatio: undefined, borderRadius: 8, backgroundColor: '#000' },
  resultActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignSelf: 'stretch' },
  resultActionButton: { flex: 1, minWidth: 100, height: 40, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 12 },
  resultActionButtonPrimary: { backgroundColor: colors.button.white },
  resultActionText: { color: colors.text.primary, fontSize: 14, fontFamily: 'SF Pro Display', fontWeight: '500', letterSpacing: -0.41 },
  resultActionTextDark: { color: colors.text.dark },
  resultActionButtonIcon: { height: 40, paddingHorizontal: 24, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  historyContainer: { alignSelf: 'stretch', gap: 9, paddingBottom: 60 },
  historyTitle: { color: colors.text.primary, fontSize: 16, fontFamily: 'SF Pro Display', fontWeight: '700', letterSpacing: -0.41 },
  historyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: '2%', alignSelf: 'stretch' },
  historyItem: { width: '23.5%', aspectRatio: 1, minWidth: 82, minHeight: 82, borderRadius: 8, overflow: 'hidden' },
  historyItemActive: { borderWidth: 2, borderColor: colors.button.primary },
  historyItemSelected: { borderWidth: 2, borderColor: colors.button.primary },
  headerButtonText: { color: colors.text.primary, fontSize: 16, fontFamily: 'SF Pro Display', fontWeight: '400' },
  selectionOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'flex-end', justifyContent: 'flex-start', padding: 4 },
  selectionCheck: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  selectionCheckActive: { backgroundColor: colors.button.primary, borderColor: colors.button.primary },
  selectionCheckInactive: { backgroundColor: 'rgba(0,0,0,0.3)' },
  historyImage: { width: '100%', height: '100%' },
});
