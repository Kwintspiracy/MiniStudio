import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, TextInput,
  ActivityIndicator, Alert, Modal, StyleSheet, Platform, Dimensions, StatusBar
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import {
  UserIcon, XMarkIcon, RefreshIcon, ArrowsPointingOutIcon, DownloadIcon
} from '../../src/components/Icons';
import { PAINTING_STYLES, DEFAULT_DESIGNER_TEMPLATES } from '../../src/constants';
import type { ImageFile, ToolMode, DesignerType, HistoryItem } from '../../src/types';
import { generatePaintedMiniature, generateImageFromImage, upscaleImage, cancelGeneration } from '../../src/services/geminiService';
import { useImagePicker } from '../../src/hooks/useImagePicker';
import { useMediaSave } from '../../src/hooks/useMediaSave';
import { useAuth } from '../../src/context/AuthContext';

// Get screen dimensions
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// --- Dedicated SVG Icon Components (from assets/icons/react-icons/) ---

const CreateIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M13.7342 12.8891L10.8795 5.5V2.78125H11.9998V1.71875H3.9998V2.78125H5.12012V5.5L2.26543 12.8891C2.22168 13.0047 2.19824 13.1266 2.19824 13.25C2.19824 13.8016 2.64668 14.25 3.19824 14.25H12.8014C12.9248 14.25 13.0467 14.2266 13.1623 14.1828C13.6779 13.9844 13.9342 13.4047 13.7342 12.8891ZM6.18262 5.69844V2.8125H9.81699V5.69844L11.2373 9.375C10.9139 9.29219 10.5795 9.25 10.2389 9.25C9.28262 9.25 8.37637 9.58594 7.65605 10.1875C7.12443 10.6316 6.45346 10.8744 5.76074 10.8734C5.2498 10.8734 4.75918 10.7438 4.32637 10.5031L6.18262 5.69844ZM3.28887 13.1875L3.93887 11.5063L3.94043 11.5031C4.49824 11.7859 5.11855 11.9375 5.7623 11.9375C6.71855 11.9375 7.6248 11.6016 8.34512 11C8.8748 10.5594 9.5373 10.3141 10.2404 10.3141C10.7873 10.3141 11.3092 10.4625 11.7654 10.7375L11.7748 10.7625L12.7107 13.1875H3.28887Z" fill={color}/>
    <Path d="M8.625 8C8.92656 8 9.17813 7.7875 9.2375 7.50313C9.24688 7.46094 9.25 7.41875 9.25 7.375C9.25 7.02969 8.97031 6.75 8.625 6.75C8.27969 6.75 8 7.02969 8 7.375V7.38438C8.00246 7.54851 8.0694 7.70508 8.18634 7.82027C8.30328 7.93546 8.46085 8.00002 8.625 8Z" fill={color}/>
  </Svg>
);

const PaintIcon = ({ color = "#F4F4F4", opacity = 1 }: { color?: string, opacity?: number }) => (
  <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
    <Path d="M3.91477 7.25016C2.97445 7.31063 2.12109 7.66875 1.63688 8.94469C1.5818 9.09023 1.44938 9.17859 1.29492 9.17859C1.03453 9.17859 0.229453 8.53008 0 8.37352C0.000234375 10.3036 0.889219 12 3.00023 12C4.7782 12 6.00023 10.9741 6.00023 9.18305C6.00023 9.11016 5.985 9.04055 5.9775 8.96906L3.91477 7.25016ZM10.732 0C10.3767 0 10.0437 0.157266 9.78961 0.385547C4.99875 4.66523 4.50023 4.76578 4.50023 6.02555C4.50023 6.34664 4.57641 6.65273 4.70484 6.93258L6.20062 8.17898C6.36961 8.22117 6.54375 8.25 6.72539 8.25C8.18109 8.25 9.02484 7.1843 11.6745 2.23922C11.8474 1.90289 12.0002 1.53961 12.0002 1.16133C12.0002 0.48375 11.3909 0 10.732 0Z" fill={color} fillOpacity={opacity}/>
  </Svg>
);

const DrawIcon = ({ color = "#1D1D1D" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M12.5667 6.92667L13.2733 6.22C13.7933 5.7 13.7933 4.85333 13.2733 4.33333L12.3333 3.39333C11.8133 2.87333 10.9667 2.87333 10.4467 3.39333L9.74 4.1L12.5667 6.92667ZM8.79333 5.04L2.66667 11.1733V14H5.49333L11.62 7.87333L8.79333 5.04ZM12.6667 11.6667C12.6667 13.1267 10.9733 14 9.33333 14C8.96667 14 8.66667 13.7 8.66667 13.3333C8.66667 12.9667 8.96667 12.6667 9.33333 12.6667C10.36 12.6667 11.3333 12.18 11.3333 11.6667C11.3333 11.3533 11.0133 11.0867 10.5133 10.8667L11.5 9.88C12.2133 10.3 12.6667 10.86 12.6667 11.6667ZM3.05333 8.9C2.40667 8.52667 2 8.04 2 7.33333C2 6.13333 3.26 5.58 4.37333 5.09333C5.06 4.78667 6 4.37333 6 4C6 3.72667 5.48 3.33333 4.66667 3.33333C3.82667 3.33333 3.46667 3.74 3.44667 3.76C3.21333 4.03333 2.79333 4.06667 2.51333 3.84C2.37965 3.7302 2.29431 3.57239 2.27561 3.4004C2.25692 3.22842 2.30636 3.05596 2.41333 2.92C2.48667 2.82667 3.17333 2 4.66667 2C6.16 2 7.33333 2.88 7.33333 4C7.33333 5.24667 6.04667 5.81333 4.90667 6.31333C4.28 6.58667 3.33333 7 3.33333 7.33333C3.33333 7.54 3.62 7.73333 4.04667 7.90667L3.05333 8.9Z" fill={color}/>
  </Svg>
);

const SculptIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M11.836 9.33294C12.6414 9.33294 13.2985 9.96801 13.3338 10.7647L13.3332 10.833L8.00231 10.8329V11.499L13.3191 11.4998C13.2786 11.8542 13.1627 12.1953 12.98 12.5005L8.00231 12.499V13.1663L12.428 13.167C11.3874 14.1709 9.9015 14.6671 7.99991 14.6671C5.90268 14.6671 4.31201 14.0636 3.2678 12.8408C2.88129 12.3881 2.66895 11.8125 2.66895 11.2173V10.8322C2.66895 10.0042 3.34019 9.33294 4.1682 9.33294H11.836ZM7.99991 1.33301C9.09044 1.33301 10.0586 1.85665 10.6667 2.66621L8.0019 2.66634L8.00164 3.33234L11.056 3.33331C11.192 3.6447 11.2818 3.98089 11.3168 4.33321L8.00164 4.33234V4.99901L11.3168 5.00014C11.2817 5.35247 11.1918 5.68865 11.0557 6.00003L8.00164 5.99901L8.0019 6.66634L10.6662 6.66714C10.058 7.47634 9.09011 7.99967 7.99991 7.99967C6.15897 7.99967 4.66659 6.50729 4.66659 4.66634C4.66659 2.82539 6.15897 1.33301 7.99991 1.33301Z" fill={color}/>
  </Svg>
);

const ApertureIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M12.7757 3.22688C11.8317 2.28292 10.629 1.64009 9.31963 1.37967C8.01027 1.11926 6.65309 1.25295 5.41972 1.76386C4.18634 2.27476 3.13216 3.13993 2.39048 4.24995C1.6488 5.35997 1.25293 6.665 1.25293 8C1.25293 9.33501 1.6488 10.64 2.39048 11.7501C3.13216 12.8601 4.18634 13.7252 5.41972 14.2361C6.65309 14.7471 8.01027 14.8808 9.31963 14.6203C10.629 14.3599 11.8317 13.7171 12.7757 12.7731C13.4072 12.1489 13.9086 11.4057 14.2508 10.5863C14.5929 9.767 14.7691 8.88791 14.7691 8C14.7691 7.11209 14.5929 6.23301 14.2508 5.41368C13.9086 4.59435 13.4072 3.85106 12.7757 3.22688ZM11.7132 4.28938C11.9149 4.49005 12.0999 4.70681 12.2664 4.9375L10.5626 6.94313L9.10637 2.8675C10.0949 3.07835 11.0009 3.57165 11.7145 4.2875L11.7132 4.28938ZM4.28512 4.28938C5.1414 3.42876 6.27111 2.89386 7.4795 2.77688L8.3645 5.255L4.107 4.47563C4.16512 4.41188 4.2245 4.34938 4.28637 4.2875L4.28512 4.28938ZM3.00012 9.60625C2.60414 8.36674 2.67981 7.02465 3.21262 5.8375L5.80262 6.3125L3.00012 9.60625ZM4.2845 11.7125C4.08364 11.5111 3.89949 11.2937 3.73387 11.0625L5.43762 9.05688L6.89387 13.1325C5.90559 12.9215 4.99978 12.4282 4.28637 11.7125H4.2845ZM6.557 7.73688L7.50575 6.62125L8.947 6.88438L9.4395 8.26313L8.49137 9.37875L7.05012 9.11563L6.557 7.73688ZM11.7126 11.7125C10.8562 12.5729 9.72656 13.1078 8.51825 13.225L7.6345 10.75L11.8932 11.5275C11.8351 11.5881 11.7757 11.6506 11.7145 11.7125H11.7126ZM10.1976 9.6875L13.0001 6.39375C13.3962 7.63331 13.3203 8.97551 12.787 10.1625L10.1976 9.6875Z" fill={color}/>
  </Svg>
);

const PhotoCameraIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M8.00003 10.1329C9.17824 10.1329 10.1334 9.17775 10.1334 7.99954C10.1334 6.82134 9.17824 5.86621 8.00003 5.86621C6.82182 5.86621 5.8667 6.82134 5.8667 7.99954C5.8667 9.17775 6.82182 10.1329 8.00003 10.1329Z" fill={color}/>
    <Path d="M6.00016 1.33301L4.78016 2.66634H2.66683C1.9335 2.66634 1.3335 3.26634 1.3335 3.99967V11.9997C1.3335 12.733 1.9335 13.333 2.66683 13.333H13.3335C14.0668 13.333 14.6668 12.733 14.6668 11.9997V3.99967C14.6668 3.26634 14.0668 2.66634 13.3335 2.66634H11.2202L10.0002 1.33301H6.00016ZM8.00016 11.333C6.16016 11.333 4.66683 9.83967 4.66683 7.99967C4.66683 6.15967 6.16016 4.66634 8.00016 4.66634C9.84016 4.66634 11.3335 6.15967 11.3335 7.99967C11.3335 9.83967 9.84016 11.333 8.00016 11.333Z" fill={color}/>
  </Svg>
);

const PhotoLibraryIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M14.6668 10.6663V2.66634C14.6668 1.93301 14.0668 1.33301 13.3335 1.33301H5.3335C4.60016 1.33301 4.00016 1.93301 4.00016 2.66634V10.6663C4.00016 11.3997 4.60016 11.9997 5.3335 11.9997H13.3335C14.0668 11.9997 14.6668 11.3997 14.6668 10.6663ZM7.3335 7.99967L8.68683 9.80634L10.6668 7.33301L13.3335 10.6663H5.3335L7.3335 7.99967ZM1.3335 3.99967V13.333C1.3335 14.0663 1.9335 14.6663 2.66683 14.6663H12.0002V13.333H2.66683V3.99967H1.3335Z" fill={color}/>
  </Svg>
);

const TbProgressCheckIcon = ({ color = "#F4F4F4" }: { color?: string }) => (
  <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
    <Path d="M6.66652 13.8511C6.08626 13.7195 5.52897 13.5017 5.01318 13.2051" stroke={color} stroke-linecap="round" stroke-linejoin="round"/>
    <Path d="M9.3335 2.14844C10.6589 2.45115 11.8423 3.1949 12.6899 4.25791C13.5375 5.32092 13.9991 6.64021 13.9991 7.99977C13.9991 9.35934 13.5375 10.6786 12.6899 11.7416C11.8423 12.8046 10.6589 13.5484 9.3335 13.8511" stroke={color} stroke-linecap="round" stroke-linejoin="round"/>
    <Path d="M3.05286 11.395C2.6892 10.8666 2.413 10.2832 2.23486 9.66699" stroke={color} stroke-linecap="round" stroke-linejoin="round"/>
    <Path d="M2.08252 7.00034C2.18919 6.36701 2.39452 5.76701 2.68252 5.21701L2.79519 5.01367" stroke={color} stroke-linecap="round" stroke-linejoin="round"/>
    <Path d="M4.60449 3.05244C5.22826 2.62304 5.92804 2.31625 6.66649 2.14844" stroke={color} stroke-linecap="round" stroke-linejoin="round"/>
    <Path d="M6 8.00033L7.33333 9.33366L10 6.66699" stroke={color} stroke-linecap="round" stroke-linejoin="round"/>
  </Svg>
);

// --- Figma Components ---

const MainNavTab = ({ activeTab, onTabChange }: { activeTab: ToolMode; onTabChange: (tab: ToolMode) => void }) => (
  <View style={styles.navTabContainer}>
    <TouchableOpacity 
      onPress={() => onTabChange('designer')}
      style={[styles.tabButton, activeTab === 'designer' && styles.tabButtonActive]}
      activeOpacity={0.8}
    >
      <DrawIcon color={activeTab === 'designer' ? '#FFFFFF' : 'rgba(244, 244, 244, 0.4)'} />
      <Text style={[styles.tabButtonText, activeTab === 'designer' ? styles.tabTextActive : styles.tabTextInactive]}>DESIGN</Text>
    </TouchableOpacity>

    <TouchableOpacity 
      onPress={() => onTabChange('painter')}
      style={[styles.tabButton, activeTab === 'painter' && styles.tabButtonActive]}
      activeOpacity={0.8}
    >
      <PaintIcon color={activeTab === 'painter' ? '#FFFFFF' : '#F4F4F4'} opacity={activeTab === 'painter' ? 1 : 0.4} />
      <Text style={[styles.tabButtonText, activeTab === 'painter' ? styles.tabTextActive : styles.tabTextInactive]}>PAINT</Text>
    </TouchableOpacity>
  </View>
);

const ConceptNavTab = ({ activeType, onTypeChange }: { activeType: DesignerType; onTypeChange: (type: DesignerType) => void }) => {
  const tabs: { id: DesignerType; label: string; Icon: any }[] = [
    { id: 'sketch', label: 'Sketch', Icon: DrawIcon },
    { id: 'miniature', label: 'Sculpt', Icon: SculptIcon },
    { id: 'pro-shot', label: 'Photoshoot', Icon: ApertureIcon }
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
    <TbProgressCheckIcon color={isPro ? "#1D1D1D" : "#FFFFFF"} />
    <Text style={[styles.proBadgeText, isPro ? styles.proTextActive : styles.proTextInactive]}>Pro</Text>
  </TouchableOpacity>
);

export default function StudioScreen() {
  const { loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<ToolMode>('designer');
  const [designerType, setDesignerType] = useState<DesignerType>('sketch');
  const [designerPrompt, setDesignerPrompt] = useState('');
  const [painterPrompt, setPainterPrompt] = useState('');
  const [isPro, setIsPro] = useState(true);
  
  const [sourceImages, setSourceImages] = useState<ImageFile[]>([]);
  const [activePreviewImage, setActivePreviewImage] = useState<string | null>(null);
  const [generationHistory, setGenerationHistory] = useState<HistoryItem[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [isResultsDrawerOpen, setIsResultsDrawerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { pickMultipleImages } = useImagePicker();
  const { saveImage } = useMediaSave();

  const handlePickImage = useCallback(async () => {
    const images = await pickMultipleImages();
    if (images.length > 0) {
      setSourceImages(prev => [...prev, ...images]);
    }
  }, [pickMultipleImages]);

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
        const promptParts: string[] = [PAINTING_STYLES[0].prompt, painterPrompt, "GENERATE THE IMAGE NOW. Do not output conversational text."];
        const finalPrompt = promptParts.filter(Boolean).join(' ');
        images = await generatePaintedMiniature(sourceImages, finalPrompt, 1, model);
      } else if (activeTab === 'designer') {
        const characterDesc = designerPrompt.trim() || 'character';
        const typeToUse = sourceImages.length > 1 ? 'combined' : designerType;
        const template = DEFAULT_DESIGNER_TEMPLATES[typeToUse];
        const prompt = template.replace(/{input}/g, characterDesc);
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
  }, [sourceImages, activeTab, designerPrompt, designerType, isPro, painterPrompt]);

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

  const handleUseAsSource = useCallback(() => {
    if (!activePreviewImage) return;
    const newImage: ImageFile = { base64: activePreviewImage, mimeType: 'image/png' };
    setSourceImages([newImage]);
    setIsResultsDrawerOpen(false);
  }, [activePreviewImage]);

  if (authLoading) return <View style={styles.centered}><ActivityIndicator size="large" color="#0058DB" /></View>;

  const hasImageLoaded = sourceImages.length > 0;
  const hasContentToView = hasImageLoaded || generationHistory.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      {/* Top Navigation */}
      <View style={styles.topNav}>
        <ProBadge isPro={isPro} onToggle={() => setIsPro(!isPro)} />
        <Text style={styles.topTitle}>MINIPAINTERSTUDIO</Text>
        <TouchableOpacity onPress={() => router.push('/settings')} style={styles.userIcon} activeOpacity={0.7}>
          <UserIcon size={24} color="#F4F4F4" />
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <MainNavTab activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Input Container */}
        <View style={styles.inputContainer}>
          <View style={styles.sourceInfo}>
            <Text style={styles.inputLabel}>Input</Text>
            <Text style={styles.inputSubtitle}>
              {hasImageLoaded ? 'Image to Image Generation' : 'Choose an image'}
            </Text>
          </View>
          
          {hasImageLoaded ? (
            <View style={styles.sourceImageWrapper}>
              <Image source={{ uri: sourceImages[0].base64 }} style={styles.sourceImage} />
              <TouchableOpacity onPress={() => setSourceImages([])} style={styles.removeImageOverlay}>
                <Text style={styles.removeImageTextSmall}>×</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.optionsRow}>
              <TouchableOpacity style={styles.optionButton} onPress={() => router.push('/camera')} activeOpacity={0.8}>
                <PhotoCameraIcon color="#F4F4F4" />
                <Text style={styles.optionButtonText}>Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.optionButton} onPress={handlePickImage} activeOpacity={0.8}>
                <PhotoLibraryIcon color="#F4F4F4" />
                <Text style={styles.optionButtonText}>Files</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* DESIGN/PAINT STEP Section */}
        {hasImageLoaded && (
          <View style={styles.designStepSection}>
            <View style={styles.stepTitleRow}>
              <CreateIcon color="rgba(244, 244, 244, 0.4)" />
              <Text style={styles.stepTitleText}>{activeTab === 'designer' ? 'DESIGN STEP' : 'PAINTING SCHEME'}</Text>
            </View>

            {activeTab === 'designer' && (
              <ConceptNavTab activeType={designerType} onTypeChange={setDesignerType} />
            )}

            <View style={styles.promptContainer}>
              <TextInput
                value={activeTab === 'designer' ? designerPrompt : painterPrompt}
                onChangeText={activeTab === 'designer' ? setDesignerPrompt : setPainterPrompt}
                placeholder="You can add more details to the default prompt..."
                placeholderTextColor="rgba(244, 244, 244, 0.4)"
                multiline
                textAlignVertical="top"
                style={styles.promptInput}
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <View style={styles.bottomButtonsRow}>
          <TouchableOpacity 
            style={[styles.galleryButton, !hasContentToView && styles.buttonDisabled]}
            disabled={!hasContentToView}
            onPress={() => setIsResultsDrawerOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.galleryButtonText}>Open Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.createButton, isLoading && styles.cancelButton]} 
            onPress={isLoading ? handleCancelGeneration : handleGenerate}
            activeOpacity={0.8}
          >
            {isLoading && <ActivityIndicator color="#FFFFFF" size="small" style={{ marginRight: 8 }} />}
            <Text style={[styles.createButtonText, isLoading && styles.cancelButtonText]}>
              {isLoading ? 'Cancel' : 'Create'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Results/Gallery Modal */}
      <Modal
        visible={isResultsDrawerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsResultsDrawerOpen(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>RESULTS</Text>
            <TouchableOpacity onPress={() => setIsResultsDrawerOpen(false)}>
              <XMarkIcon size={24} color="#F4F4F4" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalContent}>
            {activePreviewImage && (
              <View style={styles.activeResultContainer}>
                <Image source={{ uri: activePreviewImage }} style={styles.activeResultImage} resizeMode="contain" />
                <View style={styles.resultActions}>
                  <TouchableOpacity onPress={handleDownload} style={styles.actionIcon}><DownloadIcon size={20} color="#F4F4F4" /></TouchableOpacity>
                  <TouchableOpacity onPress={handleUpscale} disabled={isUpscaling} style={styles.actionIcon}>
                    {isUpscaling ? <ActivityIndicator size="small" color="#F4F4F4" /> : <ArrowsPointingOutIcon size={20} color="#F4F4F4" />}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleUseAsSource} style={styles.actionIcon}><RefreshIcon size={20} color="#F4F4F4" /></TouchableOpacity>
                </View>
              </View>
            )}
            <Text style={styles.historyLabel}>History</Text>
            <View style={styles.galleryGrid}>
              {generationHistory.map((item, i) => (
                <TouchableOpacity key={i} style={styles.galleryItem} onPress={() => setActivePreviewImage(item.url)}>
                  <Image source={{ uri: item.url }} style={styles.galleryImage} />
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1E1E2B' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1E1E2B' },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 42, paddingHorizontal: 16, marginTop: 8 },
  proBadge: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0058DB',
  },
  proBadgeInactive: {
    backgroundColor: '#003583',
  },
  proBadgeActive: {
    backgroundColor: '#0058DB',
  },
  proBadgeText: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System',
    fontWeight: '500',
    fontSize: 14,
    letterSpacing: -0.41,
    marginLeft: 4,
  },
  proTextInactive: {
    color: '#F4F4F4',
  },
  proTextActive: {
    color: '#1D1D1D',
  },
  topTitle: { fontFamily: Platform.OS === 'ios' ? 'Sansita One' : 'System', fontSize: 20, fontWeight: '400', color: '#F4F4F4', textAlign: 'center' },
  userIcon: { width: 91, alignItems: 'flex-end', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 150 },
  navTabContainer: { flexDirection: 'row', width: '100%', backgroundColor: 'rgba(0, 0, 0, 0.3)', borderRadius: 8, padding: 6, marginBottom: 7 },
  tabButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 6 },
  tabButtonActive: { backgroundColor: '#0058DB' },
  tabButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 14, marginLeft: 4 },
  tabTextActive: { color: '#F4F4F4' },
  tabTextInactive: { color: 'rgba(244, 244, 244, 0.4)' },
  inputContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 8, paddingLeft: 16 },
  sourceInfo: { justifyContent: 'center' },
  inputLabel: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '700', fontSize: 12, color: 'rgba(244, 244, 244, 0.4)' },
  inputSubtitle: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '400', fontSize: 13, color: '#F4F4F4', marginTop: 2 },
  optionsRow: { flexDirection: 'row', alignItems: 'center' },
  optionButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 17, paddingHorizontal: 16, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 4, marginLeft: 8 },
  optionButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 13, color: '#F4F4F4', marginLeft: 8 },
  sourceImageWrapper: { width: 50, height: 50, borderRadius: 6, borderWidth: 2, borderColor: '#0058DB', overflow: 'hidden' },
  sourceImage: { width: '100%', height: '100%' },
  removeImageOverlay: { position: 'absolute', top: 0, right: 0, width: 15, height: 15, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  removeImageTextSmall: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  designStepSection: { marginTop: 12, gap: 5 },
  stepTitleRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 8 },
  stepTitleText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 13, color: 'rgba(244, 244, 244, 0.4)' },
  conceptTabContainer: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 4 },
  conceptTabButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: 8, backgroundColor: 'rgba(0, 0, 0, 0.3)', height: 40 },
  conceptTabButtonActive: { backgroundColor: '#F4F4F4' },
  conceptTabText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 13 },
  conceptTabTextActive: { color: '#1D1D1D' },
  conceptTabTextInactive: { color: '#F4F4F4' },
  promptContainer: { alignSelf: 'stretch', backgroundColor: 'rgba(0, 0, 0, 0.3)', borderRadius: 8, padding: 16, height: 207 },
  promptInput: { flex: 1, fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System', fontSize: 14, color: '#F4F4F4', lineHeight: 20 },
  bottomNav: { position: 'absolute', bottom: 0, width: SCREEN_WIDTH, backgroundColor: '#12121F', paddingTop: 24, paddingHorizontal: 16, paddingBottom: 40, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 20 },
  bottomButtonsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  galleryButton: { flex: 1, height: 40, backgroundColor: 'rgba(0, 0, 0, 0.3)', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 4 },
  galleryButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 16, color: '#F4F4F4' },
  createButton: { flex: 1, height: 40, backgroundColor: '#FA0439', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 4, flexDirection: 'row' },
  createButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '700', fontSize: 16, color: '#000000' },
  cancelButton: { backgroundColor: '#333333' },
  cancelButtonText: { color: '#FFFFFF' },
  buttonDisabled: { opacity: 0.5 },
  modalContainer: { flex: 1, backgroundColor: '#1E1E2B' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  modalTitle: { color: '#F4F4F4', fontSize: 18, fontWeight: 'bold' },
  modalContent: { flex: 1, padding: 16 },
  activeResultContainer: { width: '100%', aspectRatio: 1, backgroundColor: '#000', borderRadius: 16, overflow: 'hidden', marginBottom: 20 },
  activeResultImage: { width: '100%', height: '100%' },
  resultActions: { flexDirection: 'row', position: 'absolute', bottom: 16, right: 16, gap: 8 },
  actionIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  historyLabel: { color: 'rgba(244, 244, 244, 0.4)', fontSize: 12, fontWeight: 'bold', marginBottom: 12, textTransform: 'uppercase' },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  galleryItem: { width: (SCREEN_WIDTH - 48) / 3, aspectRatio: 1, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000', marginRight: 8, marginBottom: 8 },
  galleryImage: { width: '100%', height: '100%' },
});
