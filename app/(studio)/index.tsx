import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, TextInput,
  ActivityIndicator, Alert, Modal, StyleSheet, Platform, Dimensions, StatusBar, Share,
  KeyboardAvoidingView, Keyboard, Pressable
} from 'react-native';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  withTiming,
  runOnJS,
  useAnimatedReaction,
  interpolate,
  Extrapolation,
  useDerivedValue
} from 'react-native-reanimated';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import {
  XMarkIcon, RefreshIcon, ArrowsPointingOutIcon, DownloadIcon, CheckIcon,
  AppTitleIcon, BiSolidUserCircleIcon, BiSolidUserCircle32Icon,
  BuildIcon, DrawIcon, PaintIcon, MagicWandIcon, SculptIcon, ColorPaletteIcon, AiFillFireIcon, RiPaintFillIcon,
  CameraLensIcon, CloseIcon,
  FileDownloadIcon as MdFileDownloadIcon, SpinnerIcon, TbProgressCheckIcon, ShareIcon, GalleryIcon
} from '@/components/Icons';
import AppTitleSvg from '../../assets/icons/react-icons/apptitle.svg';
import type { ImageFile, DesignerType, HistoryItem, StyleOption, StudioMode } from '@/types';
import { sanitizePrompt } from '@/utils/sanitization';
import { generatePaintPrompt } from '@/utils/promptGenerator';

import { usePrompts } from '@/hooks/usePrompts';
import { generatePaintedMiniature, generateImageFromImage, cancelGeneration } from '@/services/geminiService';
import { fetchAllPaints, fetchUserPaints, PaletteColor } from '@/services/paintService';
import { filterPaintsByDiversity, getNMMRecipes } from '@/utils/paintFilter';
import { useImagePicker } from '@/hooks/useImagePicker';
import { useMediaSave } from '@/hooks/useMediaSave';
import { useAuth } from '@/context/AuthContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useImageContext } from '@/context/ImageContext';
import { PaintExplorerModal } from '@/components/PaintExplorerModal';
import { AppModal } from '@/components/AppModal';
import { supabase } from '@/services/supabase';
import { ToggleButton } from '@/components/ToggleButton';
import { SectionHeader } from '@/components/SectionHeader';
import { ModeCardSelector } from '@/components/studio/ModeCardSelector';
import { SourceContainer } from '@/components/studio/SourceContainer';
import { OnboardingOverlay, TutorialStep } from '@/components/OnboardingOverlay';
import { GenerationTooltip } from '@/components/GenerationTooltip';
import { BreathingGradientButton } from '@/components/BreathingGradientButton';
import { colors, spacing, borderRadius, fontFamily, textStyles } from '@/theme';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { shareAsync, isAvailableAsync } from 'expo-sharing';
import { Toast } from '@/components/Toast';

// Get screen dimensions
import { DEFAULT_DESIGNER_TEMPLATES, METALLIC_PAINT_INSTRUCTIONS, SKETCH_STYLE_OPTIONS } from '@/constants';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Dynamic Grid Calculation
const HISTORY_GRID_GAP = 8;
const HISTORY_GRID_PADDING = 48; // modalContent padding (24) * 2
const MIN_HISTORY_ITEM_WIDTH = 82;

const availableHistoryWidth = SCREEN_WIDTH - HISTORY_GRID_PADDING;
const numHistoryColumns = Math.floor((availableHistoryWidth + HISTORY_GRID_GAP) / (MIN_HISTORY_ITEM_WIDTH + HISTORY_GRID_GAP));
const historyItemWidth = (availableHistoryWidth - (numHistoryColumns - 1) * HISTORY_GRID_GAP) / numHistoryColumns;

// --- Dedicated SVG Icon Components ---







// --- Figma Component: Section Accent ---
const SectionAccent = () => (
    <View style={{ width: 4, height: 16, backgroundColor: colors.button.primary, borderRadius: 0 }} />
);

const CreativitySlider = React.memo(({ initialValue, onValueChange }: { initialValue: number, onValueChange: (val: number) => void }) => {
  const widthSV = useSharedValue(0);
  const position = useSharedValue(initialValue);
  
  // Padding for the thumb constraint
  const EDGE_PADDING = 5; // 5px from left/right edges of container
  const THUMB_WIDTH = 5;
  const THUMB_INSIDE_OFFSET = 5; // How much "fill" extends past the thumb

  // Sync shared value with initialValue when it changes externally
  useEffect(() => {
    position.value = initialValue;
  }, [initialValue]);

  // Derive the exact pixel X position of the thumb
  // We cannot use useDerivedValue easily for styling due to widthSV dependency in layout?
  // actually we can.
  
  const thumbTranslateX = useDerivedValue(() => {
     if (widthSV.value === 0) return 0;
     const maxLeft = widthSV.value - EDGE_PADDING - THUMB_WIDTH;
     const minLeft = EDGE_PADDING;
     
     return interpolate(
      position.value,
      [0, 1],
      [minLeft, maxLeft],
      Extrapolation.CLAMP
    );
  }, [widthSV, position]);


  const animatedFillStyle = useAnimatedStyle(() => {
    // Fill width must cover the thumb position + width + extra spacing
    // If widthSV is 0, defaults to percentage
    if (widthSV.value === 0) return { width: `${position.value * 100}%` };
    
    // Width = ThumbLeft + ThumbWidth + Spacing
    return {
       width: thumbTranslateX.value + THUMB_WIDTH + THUMB_INSIDE_OFFSET
    };
  });

  const animatedThumbStyle = useAnimatedStyle(() => {
    return {
      left: 0, 
      transform: [{ translateX: thumbTranslateX.value }]
    };
  });

  // Calculate value from X coordinate
  const updateValue = (x: number, w: number) => {
    'worklet';
    if (w <= 0) return;
    // We need to reverse the interpolation to get value from X
    // Range: [EDGE_PADDING, w - EDGE_PADDING - THUMB_WIDTH]
    const minLeft = EDGE_PADDING;
    const maxLeft = w - EDGE_PADDING - THUMB_WIDTH;
    
    // Clamp X to valid range
    const clampedX = Math.max(minLeft, Math.min(x, maxLeft));
    
    // Reverse interpolate: (x - min) / (max - min)
    const val = (clampedX - minLeft) / (maxLeft - minLeft);
    const clampedVal = Math.max(0, Math.min(1, val));

    position.value = clampedVal;
    runOnJS(onValueChange)(clampedVal);
  };

  const gesture = Gesture.Pan()
    .onBegin((e) => {
      updateValue(e.x, widthSV.value);
    })
    .onUpdate((e) => {
      updateValue(e.x, widthSV.value);
    });

  return (
    <GestureDetector gesture={gesture}>
      <View 
        style={{ paddingTop: 0, paddingBottom: 5, justifyContent: 'center' }}
        onLayout={(e) => {
           widthSV.value = e.nativeEvent.layout.width;
        }}
      >
        <View style={styles.sliderTrack}>
          <Animated.View style={[styles.sliderFill, animatedFillStyle]} pointerEvents="none" />
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center' }} pointerEvents="none">
             <Animated.View style={[styles.sliderThumb, animatedThumbStyle]} pointerEvents="none" />
          </View>
        </View>
      </View>
    </GestureDetector>
  );
});

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
const LINE_HEIGHT = 18;
const INITIAL_INPUT_HEIGHT = 40;
const MAX_INPUT_LINES = 4;
const INPUT_VERTICAL_PADDING = 10; // (18 * 4) + (10 * 2) = 92px max

// --- Figma Components ---

// --- Figma Components ---

// Basic/Pro Toggle Badge - Figma Toggle-button Component

// Basic/Pro Toggle Badge - Figma Toggle-button Component
const ModeBadge = ({ isAdvanced, onToggle }: { isAdvanced: boolean; onToggle: () => void }) => (
  <TouchableOpacity
    onPress={onToggle}
    style={[styles.modeBadge, isAdvanced ? styles.modeBadgePro : styles.modeBadgeBasic]}
    activeOpacity={0.8}
  >
    <View style={[styles.modeBadgeInner, isAdvanced && styles.modeBadgeInnerPro]}>
      {/* Basic: dot on left, text on right | Pro: text on left, dot on right (aligned to end) */}
      {!isAdvanced && <View style={styles.modeBadgeDotBasic} />}
      <Text style={[styles.modeBadgeText, isAdvanced ? styles.modeBadgeTextPro : styles.modeBadgeTextBasic]}>
        {isAdvanced ? 'PRO' : 'BASE'}
      </Text>
      {isAdvanced && <View style={styles.modeBadgeDotPro} />}
    </View>
  </TouchableOpacity>
);

export default function StudioScreen() {
  const { user, loading: authLoading } = useAuth();
  const { selectedImage, setSelectedImage } = useImageContext();
  const insets = useSafeAreaInsets();

  // Handle Camera Capture Return
  useEffect(() => {
    if (selectedImage) {
      setSourceImages([{ base64: selectedImage, mimeType: 'image/jpeg' }]);
      setActivePreviewImage(selectedImage);
      setSelectedImage(null); // Clear it so we don't re-trigger
      cameFromGalleryRef.current = false; // Don't trigger useFocusEffect
      setIsResultsDrawerOpen(true); // Reopen gallery to show the captured image
    }
  }, [selectedImage]);

  // Reopen gallery when returning from camera without taking a photo
  useFocusEffect(
    useCallback(() => {
      if (cameFromGalleryRef.current) {
        // Returned from camera without taking photo - reopen gallery
        setIsResultsDrawerOpen(true);
        cameFromGalleryRef.current = false;
      }
    }, [])
  );

  const { styles: paintStylesList, templates: designerTemplates, effects: effectPrompts, shareMessage, exampleAssets, loading: promptsLoading } = usePrompts();

  const [activeMode, setActiveMode] = useState<StudioMode>('paint');
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  
  // Create derived selectedStyle based on the ID and the latest list
  const selectedStyle = useMemo(() => {
     return paintStylesList.find(s => s.id === selectedStyleId) || paintStylesList[0];
  }, [selectedStyleId, paintStylesList]);

  // Set initial selection once list loads
  useEffect(() => {
    if (paintStylesList.length > 0 && !selectedStyleId) {
      setSelectedStyleId(paintStylesList[0].id);
    }
  }, [paintStylesList]);

  // Pre-fetch all paints on app launch for caching
  useEffect(() => {
    const preFetchAllPaints = async () => {
      try {
        const allPaints = await fetchAllPaints();
        setLoadedPaints(allPaints);
        console.log('[App Launch] Pre-fetched all paints:', allPaints.length);
      } catch (e) {
        console.log('Pre-fetch paints failed:', e);
      }
    };
    preFetchAllPaints();
  }, []);
  const [isNMMEnabled, setIsNMMEnabled] = useState(false);
  const [isOSLEnabled, setIsOSLEnabled] = useState(false);
  const [isPhotoshootEnabled, setIsPhotoshootEnabled] = useState(false);
  const [isPaletteEnabled, setIsPaletteEnabled] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<string[]>(['All Brands']);

  const [designerPrompt, setDesignerPrompt] = useState('');
  const [painterPrompt, setPainterPrompt] = useState('');
  
  // Sketch Feature Enhancements
  const [sketchStyle, setSketchStyle] = useState<'fantasy' | 'sci-fi'>('fantasy');
  const [creativityLevel, setCreativityLevel] = useState(0.7); // Default to 0.7 for good balance
  const [sliderWidth, setSliderWidth] = useState(0);

  const handleCreativityChange = useCallback((val: number) => {
      setCreativityLevel(val);
  }, []);
  
  // Replace local state with Entitlements hook
  const { entitlements, refetch, loading: entitlementsLoading } = useEntitlements();
  // Reverted to local state per user request (was strictly entitlements.is_pro)
  const [isPro, setIsPro] = useState(entitlements.is_pro);

  // Sync with entitlements if they update (e.g. after purchase)
  useEffect(() => {
      setIsPro(entitlements.is_pro);
  }, [entitlements.is_pro]);

  // Refetch entitlements when screen comes into focus (e.g. returning from Paywall)
  useFocusEffect(
    useCallback(() => {
        refetch();
    }, [refetch])
  );
  
  const handleProToggle = () => {
      // Allow toggling freely (or add logic to block if !entitlements.is_pro later)
      // Per user request: "should just do as usual and turn on Pro"
      if (!isPro && !entitlements.is_pro) {
          // Optional: Still good UX to show Paywall if they aren't actually Entitled?
          // User said "It should NOT do that". So we will just toggle it ON (Mocking Pro locally)
          // OR we interpret "Turn on Pro" as "Try to turn on Pro".
          
          // Debugging/Dev Mode: Just toggle.
          // Production Logic: Should probably be:
          // if (isPro) setIsPro(false);
          // else router.push('/paywall');
          
          // But strict compliance to request: "just do as usual and turn on Pro"
          setIsPro(!isPro);
      } else {
          setIsPro(!isPro);
      }
  };

  const [sourceImages, setSourceImages] = useState<ImageFile[]>([]);
  const [activePreviewImage, setActivePreviewImage] = useState<string | null>(null);
  const [previewAspectRatio, setPreviewAspectRatio] = useState(1);
  const [generationHistory, setGenerationHistory] = useState<HistoryItem[]>([]);
  const [selectedColors, setSelectedColors] = useState<{ name: string, hex: string, finish?: string }[]>([]);
  const [loadedPaints, setLoadedPaints] = useState<PaletteColor[]>([]);


  const [isLoading, setIsLoading] = useState(false);
  const [showLongGenerationTooltip, setShowLongGenerationTooltip] = useState(false);

  // Long generation tooltip timer
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isLoading) {
        timer = setTimeout(() => {
            setShowLongGenerationTooltip(true);
        }, 10000); // 10 seconds
    } else {
        setShowLongGenerationTooltip(false);
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  const [isResultsDrawerOpen, setIsResultsDrawerOpen] = useState(false);
  const [isPaintExplorerOpen, setIsPaintExplorerOpen] = useState(false);
  // Replaced generic error string state with Modal State object
  const [modalConfig, setModalConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'default' | 'error' | 'critical';
    primaryAction?: { label: string; onPress: () => void };
    secondaryAction?: { label: string; onPress: () => void };
  }>({ visible: false, title: '', message: '' });

  const showModal = (
      title: string, 
      message: string, 
      type: 'default' | 'error' | 'critical' = 'default',
      primaryAction?: { label: string; onPress: () => void },
      secondaryAction?: { label: string; onPress: () => void }
  ) => {
      setModalConfig({ visible: true, title, message, type, primaryAction, secondaryAction });
  };

  const hideModal = useCallback(() => {
      setModalConfig(prev => ({ ...prev, visible: false }));
  }, []);

  const [showMyPaintsAlert, setShowMyPaintsAlert] = useState(false);
  // Tutorial State
  // Tutorial State
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>('checking');
  const [targetLayout, setTargetLayout] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  const targetRefs = useRef<{ [key: string]: View | null }>({});

  // Batch Deletion State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedHistoryItems, setSelectedHistoryItems] = useState<Set<string>>(new Set());
  const [hiddenDemoAssets, setHiddenDemoAssets] = useState<string[]>([]);

  const scrollViewRef = useRef<ScrollView>(null);
  const cameFromGalleryRef = useRef(false); // Track if we navigated to camera from gallery

  // Toast State
  const [toastConfig, setToastConfig] = useState<{ visible: boolean; message: string }>({ 
      visible: false, 
      message: '' 
  });

  const showToast = useCallback((message: string) => {
      setToastConfig({ visible: true, message });
  }, []);

  const hideToast = useCallback(() => {
      setToastConfig(prev => ({ ...prev, visible: false }));
  }, []);

  // Textfield Dynamic Sizing State
  const [isInputFocused, setIsInputFocused] = useState(false);
  const inputContentHeight = useSharedValue(INITIAL_INPUT_HEIGHT);
  const animatedHeight = useSharedValue(INITIAL_INPUT_HEIGHT);

  const animatedInputStyle = useAnimatedStyle(() => {
    // 1. Calculate max height (4 lines of text + padding)
    const maxAllowedHeight = (LINE_HEIGHT * MAX_INPUT_LINES) + (INPUT_VERTICAL_PADDING * 2);
    
    // 2. Determine target height based on focus
    if (isInputFocused) {
      // Focused: (Content Height + Padding) clamped between 40px and maxAllowedHeight
      // inputContentHeight.value is the raw height of the text block
      const targetHeight = inputContentHeight.value + (INPUT_VERTICAL_PADDING * 2);
      const clampedHeight = Math.max(INITIAL_INPUT_HEIGHT, Math.min(targetHeight, maxAllowedHeight));
      
      return {
        height: withTiming(clampedHeight, { duration: 250 }),
      };
    } else {
      // Unfocused: Smoothly collapse to fixed 40px
      return {
        height: withTiming(INITIAL_INPUT_HEIGHT, { duration: 250 }),
      };
    }
  }, [isInputFocused]);

  const { pickMultipleImages, pickDocument } = useImagePicker();
  const { saveImage } = useMediaSave();

  // Load hidden demo assets and generation history from storage
  useEffect(() => {
    // DEV ONLY: Uncomment the next line to always see FTUE drawer
    // AsyncStorage.removeItem('has_seen_drawer');
    
    AsyncStorage.getItem('hidden_demo_assets').then(stored => {
      if (stored) {
        setHiddenDemoAssets(JSON.parse(stored));
      }
    });

    // Load persisted generation history (user-generated images only)
    AsyncStorage.getItem('generation_history').then(stored => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as HistoryItem[];
          setGenerationHistory(parsed);
        } catch (e) {
          console.warn('Failed to parse generation history:', e);
        }
      }
    });

    // Check onboarding status (V2)
    const checkTutorial = async () => {
        // FULLY DISABLE ONBOARDING FOR NOW
        setTutorialStep('idle');
        return;
    };
    checkTutorial();

  }, []);

  const handleTutorialNext = () => {
    if (tutorialStep === 'welcome') {
      setTutorialStep('open_gallery');
    }
  };

  const handleDismissTutorial = () => {
    setTutorialStep('finished');
    AsyncStorage.setItem('has_seen_onboarding_v2', 'true');
    supabase.rpc('complete_onboarding').then(({ error }) => {
        if (error) console.log('Failed to complete onboarding RPC:', error);
    });
  };

  // Layout Capture Loop
  useEffect(() => {
    const measureTarget = () => {
       const step = tutorialStep;
       let targetKey = '';

       if (step === 'open_gallery') targetKey = 'gallery_btn';
       else if (step === 'select_demo_image') targetKey = 'demo_image';
       else if (step === 'confirm_source') targetKey = 'use_source_btn';
       else if (step === 'select_style_craftworld') targetKey = 'style_Craftworld Studio';
       else if (step === 'enable_palette') targetKey = 'palette_toggle';
       else if (step === 'select_brand_vallejo') targetKey = 'brand_Vallejo';
       else if (step === 'toggle_pro') targetKey = 'pro_badge';
       else if (step === 'generate') targetKey = 'create_btn';

       if (targetKey && targetRefs.current[targetKey]) {
          targetRefs.current[targetKey]?.measureInWindow((x, y, width, height) => {
              setTargetLayout(prev => {
                  if (prev && prev.x === x && prev.y === y && prev.width === width && prev.height === height) {
                      return prev;
                  }
                  return { x, y, width, height };
              });
          });
       } else {
           setTargetLayout(prev => prev === null ? prev : null);
       }
    };

    // Run immediately when step changes
    measureTarget();

    const timer = setInterval(measureTarget, 50); // Improved: Check every 50ms for responsiveness
    return () => clearInterval(timer);
  }, [tutorialStep, isResultsDrawerOpen]);

  // Auto-Advance Logic
  useEffect(() => {
      // 1. Open Gallery
      if (tutorialStep === 'open_gallery' && isResultsDrawerOpen) {
          setTutorialStep('select_demo_image');
      }
      // 2. Select Demo Image (When preview updates and we are in gallery)
      else if (tutorialStep === 'select_demo_image' && activePreviewImage) {
          setTutorialStep('confirm_source');
      }
      // 3. Confirm Source (When gallery closes and we have source)
      else if (tutorialStep === 'confirm_source' && !isResultsDrawerOpen && sourceImages.length > 0) {
          // If the user already selected Craftworld, skip? Or force re-select? Let's just go to next.
          setTutorialStep('select_style_craftworld');
      }
      // 4. Select Style (Craftworld)
      else if (tutorialStep === 'select_style_craftworld' && selectedStyle?.name === 'Craftworld Studio') {
           setTutorialStep('enable_palette');
      }
      // 5. Enable Palette
      else if (tutorialStep === 'enable_palette' && isPaletteEnabled) {
           setTutorialStep('select_brand_vallejo');
      }
      // 6. Select Vallejo
      else if (tutorialStep === 'select_brand_vallejo' && selectedBrands.includes('Vallejo')) {
           setTutorialStep('toggle_pro');
      }
      // 7. Toggle Pro
      else if (tutorialStep === 'toggle_pro' && isPro) {
           setTutorialStep('generate');
      }
      // 8. Generate (Loading starts)
      else if (tutorialStep === 'generate' && isLoading) {
           setTutorialStep('finished');
           AsyncStorage.setItem('has_seen_onboarding_v2', 'true');
      }

  }, [tutorialStep, isResultsDrawerOpen, sourceImages, activePreviewImage, selectedStyle, isPaletteEnabled, selectedBrands, isPro, isLoading]);

  // Auto-scroll when palette is enabled
  useEffect(() => {
    if (isPaletteEnabled) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [isPaletteEnabled]);

  // Load example assets into Gallery history when available
  useEffect(() => {
    if (exampleAssets && exampleAssets.length > 0) {
      setGenerationHistory(prev => {
        // Convert exampleAssets (URLs) to HistoryItem objects
        const exampleHistoryItems: HistoryItem[] = exampleAssets.map(url => ({
          url,
          isPro: true,
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

  // Auto-open Gallery drawer on fresh start when no source is selected
  useEffect(() => {
    // DISABLED: Prevent auto-opening drawer as it feels like an onboarding "leak"
    return;
    /*
    if (!authLoading && sourceImages.length === 0 && !activePreviewImage && tutorialStep === 'idle') {
      setIsResultsDrawerOpen(true);
    }
    */
  }, [authLoading, tutorialStep]);

  // Persist generation history (user-generated only, excluding demos) whenever it changes
  useEffect(() => {
    // Only persist items that are NOT demo items (timestamp !== 0)
    const userGeneratedItems = generationHistory.filter(item => item.timestamp !== 0);
    if (userGeneratedItems.length > 0) {
      AsyncStorage.setItem('generation_history', JSON.stringify(userGeneratedItems));
    } else {
      // Clear storage if no user items remain
      AsyncStorage.removeItem('generation_history');
    }
  }, [generationHistory]);

  const handlePickImage = useCallback(async () => {
    const images = await pickMultipleImages();
    if (images.length > 0) {
      setSourceImages(images);
      setActivePreviewImage(images[0].base64);
    }
  }, [pickMultipleImages]);

  const handleDocumentPick = useCallback(async () => {
    const doc = await pickDocument();
    if (doc) {
      setSourceImages([doc]);
      setActivePreviewImage(doc.base64);
    }
  }, [pickDocument]);

  const handleFilesPress = useCallback(() => {
    // Using native Alert/ActionSheet style choice because standard Modals 
    // often conflict when one is already open (like the Gallery drawer).
    Alert.alert(
      'Select Image Source',
      'Choose where to load your image from',
      [
        {
          text: 'Photo Library',
          onPress: handlePickImage
        },
        {
          text: 'Browse Documents',
          onPress: handleDocumentPick
        },
        {
          text: 'Cancel',
          style: 'cancel'
        }
      ]
    );
  }, [handlePickImage, handleDocumentPick]);

  const handleGenerate = useCallback(async () => {
    if (sourceImages.length === 0) {
      showModal("Missing Reference", "Please add reference images first.", 'error');
      return;
    }
    setIsLoading(true);
    // setError(null); // No longer needed
    // Unified 1-token cost for all generations as per user request.
    // Logic preserved for future use: const model = isPro ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';
    const model = 'gemini-2.5-flash-image';
    try {
      let images: string[] = [];
      if (activeMode === 'paint' && sourceImages.length >= 1) {
        const finalPrompt = generatePaintPrompt({
          isPro,
          selectedStyle,
          isPaletteEnabled,
          selectedBrands,
          loadedPaints,
          selectedColors,
          isNMMEnabled,
          isOSLEnabled,
          isPhotoshootEnabled,
          effectPrompts,
          painterPrompt
        });

        console.log(`\n--- GENERATION PROMPT (${new Date().toLocaleTimeString()}) ---\n${finalPrompt}\n----------------------------------\n`);
        
        images = await generatePaintedMiniature(sourceImages, finalPrompt, 1, model);
      } else if (activeMode === 'sketch' || activeMode === 'sculpt') {
        const characterDesc = sanitizePrompt(designerPrompt).trim() || 'character';
        
        let template: string;
        if (activeMode === 'sculpt' && isPhotoshootEnabled && designerTemplates['pro-shot']) {
            // Use pro-shot template when Photoshoot is enabled
            const proShotConfig = designerTemplates['pro-shot'];
            template = isPro ? proShotConfig.pro : proShotConfig.default;
        } else {
            // Use the mode-specific template (sketch or sculpt)
            const typeToUse = (sourceImages.length > 1) ? 'combined' : activeMode;
            const templateConfig = designerTemplates[typeToUse];
            template = isPro ? templateConfig.pro : templateConfig.default;
        }

        // Fetch the creativity template from remote config (or default)
        const creativityConfig = designerTemplates['creativity_level'];
        // Fallback string if config is missing (though constants ensure it exists locally)
        const creativityTemplateString = creativityConfig 
            ? (isPro ? creativityConfig.pro : creativityConfig.default) 
            : "AI CREATIVITY INTENSITY: {percentage}% (0%=Strict Adherence, 100%=Max Artistic License). Adjust the level of detail, material variation, and stylized interpretation to match this exact percentage.";
        
        const resolvedCreativity = creativityTemplateString.replace(/{percentage}/g, (creativityLevel * 100).toFixed(0));

        const prompt = template
          .replace(/{input}/g, characterDesc)
          .replace(/{style}/g, sketchStyle)
          .replace(/{creativity}/g, resolvedCreativity);

        console.log(`\n--- ${activeMode.toUpperCase()} PROMPT (Temp: ${creativityLevel}) ---\n${prompt}\n----------------------------------\n`);
        images = await generatePaintedMiniature(sourceImages, prompt, 1, model, creativityLevel);
      }
      if (images && images.length > 0) {
        const resultUrl = images[0];
        setActivePreviewImage(resultUrl);
        setGenerationHistory(prev => [{ url: resultUrl, isPro, isMaster: false, modelName: model, timestamp: Date.now() }, ...prev]);
        setIsResultsDrawerOpen(true);
        
        // Complete onboarding only AFTER successful generation
        if (tutorialStep === 'generate' || tutorialStep === 'finished') {
             // We check finished too because the useEffect above might have already flipped the UI step
             // But we want to ensure the backend flag is set now.
             supabase.rpc('complete_onboarding').then(({ error }) => {
               if (error) console.log('Failed to complete onboarding RPC (Success):', error);
             });
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && !err.message?.includes('cancelled')) {
          const errorMessage = err.message || "An unknown error occurred.";
          
          if (errorMessage.includes("Google Servers Overloaded")) {
             showModal(
                 "Google Servers Overloaded",
                 "The AI model is currently at capacity. Please try again in a moment.",
                 'error',
                 { label: "Retry", onPress: handleGenerate },
                 { label: "Cancel", onPress: () => {} }
             );
          }
          // Check for Limit Reached specific formatting if we want custom actions
          else if (errorMessage.includes("Limit Reached")) {
              showModal("Limit Reached", errorMessage, 'error');
          } else {
              showModal("Generation Failed", errorMessage, 'error');
          }
      }
    } finally {
      setIsLoading(false);
    }
  }, [sourceImages, activeMode, designerPrompt, isPro, painterPrompt, selectedStyle, isNMMEnabled, isOSLEnabled, isPhotoshootEnabled, isPaletteEnabled, selectedColors, selectedBrands, loadedPaints, sketchStyle, creativityLevel]);

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
    showModal(
        "Confirm Cancel?",
        "Image generation usually takes around 30 seconds. Are you sure you want to stop now?",
        'default',
        { 
            label: "Confirm Cancel", 
            onPress: () => {
                cancelGeneration();
                setIsLoading(false);
                hideModal();
            } 
        },
        { 
            label: "Wait", 
            onPress: hideModal 
        }
    );
  }, [hideModal]);



  const handleDownload = useCallback(async () => {
    if (!activePreviewImage) return;
    const success = await saveImage(activePreviewImage);
    if (success) {
      showToast("Image saved to your gallery!");
    }
  }, [activePreviewImage, saveImage, showToast]);

  const handleShare = useCallback(async () => {
    if (!activePreviewImage) return;
    try {
      // Check if sharing is available
      const isAvailable = await isAvailableAsync();
      if (!isAvailable) {
        showModal('Error', 'Sharing is not available on this device', 'error');
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
      showModal('Error sharing', error.message, 'error');
    }
  }, [activePreviewImage]);

  const loadHistoryItemAsSource = useCallback(async (url: string) => {
    let imageData = url;
    // If it's a remote URL (not a data URL), fetch and convert to base64
    if (url.startsWith('http')) {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const reader = new FileReader();
        imageData = await new Promise<string>((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        showModal('Error', 'Failed to load image', 'error');
        return;
      }
    }
    const newImage: ImageFile = { base64: imageData, mimeType: 'image/png' };
    setSourceImages([newImage]);
  }, []);

  const handleUseAsSource = useCallback(async () => {
    if (!activePreviewImage) return;
    await loadHistoryItemAsSource(activePreviewImage);
    setIsResultsDrawerOpen(false);
  }, [activePreviewImage, loadHistoryItemAsSource]);

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
        {
          text: 'Cancel',
          style: 'cancel',
        },
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


  const toggleColor = (colorName: string, hexCode?: string, finish?: string) => {
    setSelectedColors(prev => {
      const exists = prev.find(c => c.name === colorName);
      if (exists) {
        return prev.filter(c => c.name !== colorName);
      } else {
        return [...prev, { name: colorName, hex: hexCode || '#FFFFFF', finish }];
      }
    });
  };

  const handleToggleBrand = async (brand: string) => {
    if (brand === 'All Brands') {
        // If not already selected, select it (and it will clear others)
        if (!selectedBrands.includes('All Brands')) {
            setSelectedBrands(['All Brands']);
        }
        // If already selected, do nothing - at least one brand must be active
        return;
    }

    setSelectedBrands(prev => {
      if (prev.includes('All Brands')) {
        // Was on All Brands, now selecting a specific brand
        return [brand];
      }
      if (prev.includes(brand)) {
        // Deselecting this brand
        const newSelection = prev.filter(b => b !== brand);
        // If no brands left, revert to All Brands
        return newSelection.length === 0 ? ['All Brands'] : newSelection;
      } else {
        // Adding this brand
        return [...prev, brand];
      }
    });
  };



  if (authLoading) return <View style={styles.centered}><ActivityIndicator size="large" color="#0058DB" /></View>;

  const hasImageLoaded = sourceImages.length > 0;
  const hasContentToView = hasImageLoaded || generationHistory.length > 0 || exampleAssets.length > 0;

  // paintStylesList is now coming from the hook
  const brandTabs = ['All Brands', 'My Collection', 'Army Painter', 'Citadel Colour', 'Scale75', 'Duncan', 'Vallejo'];



  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.screenContainer}>
      <View style={[styles.statusBarBackground, { height: insets.top }]} />
      <StatusBar barStyle="light-content" backgroundColor="#12121F" />
      
      {/* Global Onboarding Overlay (Root Level for correct coordinates) */}
      <OnboardingOverlay 
          step={tutorialStep} 
          onNext={handleTutorialNext} 
          targetLayout={targetLayout} 
      />

      <View style={styles.container}>

        {/* Top Navigation */}
        <View style={styles.topNav}>
          <View 
            style={styles.topNavLeft}
            ref={view => { targetRefs.current['pro_badge'] = view; }}
            collapsable={false}
          >
            {/* <ModeBadge isAdvanced={isPro} onToggle={handleProToggle} /> */}
            <AppTitleSvg width={182} height={14} />
          </View>
          <View style={styles.topNavTitle}>
            {/* App title removed per design */}
          </View>
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.topNavRight} activeOpacity={0.7}>
            {user?.user_metadata?.avatar_url ? (
              <Image 
                source={{ uri: user.user_metadata.avatar_url }} 
                style={styles.userAvatar}
              />
            ) : (
              <View style={styles.userAvatar}>
                <BiSolidUserCircle32Icon size={40} />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Main Content Area */}
        <ModeCardSelector activeMode={activeMode} onModeChange={setActiveMode} />
        <ScrollView 
            ref={scrollViewRef}
            contentContainerStyle={[
              styles.scrollContent, 
              { paddingBottom: (hasImageLoaded ? 220 : 120) + insets.bottom }
            ]} 
            showsVerticalScrollIndicator={false}
        >



          {/* DESIGN: Mode-Specific Content */}
          <View style={styles.modeContent}>
              {activeMode === 'sketch' ? (
                <>
                  <View style={styles.paintStepSection}>
                    <SectionHeader 
                      icon={<RiPaintFillIcon size={16} color="#32D278" />}
                      title="CHOOSE A STYLE"
                    />
                    <View style={styles.styleGrid}>
                      {SKETCH_STYLE_OPTIONS.map((option) => (
                        <TouchableOpacity
                          key={option.id}
                          onPress={() => setSketchStyle(option.id)}
                          style={[styles.unifiedOptionButton, sketchStyle === option.id && styles.unifiedOptionButtonActive]}
                          activeOpacity={0.7}
                        >
                          {/* STABILITY FIX: Render bold text invisibly to reserve space, preventing layout jump */}
                          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={[styles.unifiedOptionText, { fontWeight: '600', opacity: 0 }]}>
                              {option.label}
                            </Text>
                            <Text style={[
                              styles.unifiedOptionText, 
                              { position: 'absolute' },
                              sketchStyle === option.id && { fontWeight: '600', color: colors.text.dark }
                            ]}>
                              {option.label}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.paintStepSection}>
                    <View style={styles.sectionHeader}>
                       <AiFillFireIcon size={14} color="#FFD60A" />
                       <Text style={styles.sectionHeaderText}>
                         CREATIVITY LEVEL: <Text style={{ color: '#FFD60A' }}>{(creativityLevel * 100).toFixed(0)}%</Text>
                       </Text>
                    </View>
                     <View>
                       <CreativitySlider 
                         initialValue={creativityLevel} 
                         onValueChange={handleCreativityChange} 
                       />
                       <View style={styles.sliderLabels}>
                          <Text style={styles.sliderLabelText}>Cautious</Text>
                          <Text style={styles.sliderLabelText}>Creative</Text>
                       </View>
                    </View>
                  </View>
                </>
              ) : activeMode === 'sculpt' ? (
                <>
                  <View style={styles.paintStepSection}>
                    <SectionHeader 
                      icon={<AiFillFireIcon size={14} color="#E06948" />}
                      title="ADD EFFECTS"
                    />
                    <TouchableOpacity style={styles.optionItem} onPress={() => setIsPhotoshootEnabled(!isPhotoshootEnabled)} activeOpacity={0.7}>
                      <Text style={[styles.optionLabel, isPhotoshootEnabled && styles.optionLabelActive]}>Photoshoot - Studio Lighting</Text>
                      <ToggleButton value={isPhotoshootEnabled} onToggle={() => setIsPhotoshootEnabled(!isPhotoshootEnabled)} />
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.paintStepSection}>
                    <SectionHeader 
                      icon={<RiPaintFillIcon size={16} color="#32D278" />}
                      title="CHOOSE A STYLE"
                    />
                    <View 
                       style={styles.styleGrid}
                       ref={view => { targetRefs.current['style_selector'] = view; }}
                       collapsable={false}
                    >
                      {paintStylesList.map((style) => (
                        <TouchableOpacity
                          key={style.id}
                          ref={view => { if (style.name === 'Craftworld Studio') targetRefs.current['style_Craftworld Studio'] = view; }}
                          onPress={() => setSelectedStyleId(style.id)}
                          style={[styles.unifiedOptionButton, selectedStyle?.id === style.id && styles.unifiedOptionButtonActive]}
                          accessibilityRole="button"
                          accessibilityLabel={`Style: ${style.name}`}
                          accessibilityState={{ selected: selectedStyle?.id === style.id }}
                        >
                          <Text style={[styles.unifiedOptionText, selectedStyle?.id === style.id && styles.unifiedOptionTextActive]}>
                            {style.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.paintStepSection}>
                    <SectionHeader 
                      icon={<AiFillFireIcon size={16} color="#E06948" />}
                      title="ADD EFFECTS"
                    />
                    <TouchableOpacity style={styles.optionItem} onPress={() => setIsNMMEnabled(!isNMMEnabled)} activeOpacity={0.7}>
                      <Text style={[styles.optionLabel, isNMMEnabled && styles.optionLabelActive]}>NNM - Non Metallic Metal</Text>
                      <ToggleButton value={isNMMEnabled} onToggle={() => setIsNMMEnabled(!isNMMEnabled)} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.optionItem} onPress={() => setIsOSLEnabled(!isOSLEnabled)} activeOpacity={0.7}>
                      <Text style={[styles.optionLabel, isOSLEnabled && styles.optionLabelActive]}>OSL - Object Source Lighting</Text>
                      <ToggleButton value={isOSLEnabled} onToggle={() => setIsOSLEnabled(!isOSLEnabled)} />
                    </TouchableOpacity>

                    <SectionHeader 
                      icon={<ColorPaletteIcon size={16} color="#C463D2" />}
                      title="COLOR PALETTE"
                    />

                    {/* Brand Selection Tabs */}
                    <View style={styles.brandTabs}>
                      {brandTabs.map((brand) => {
                        const isSelected = selectedBrands.includes(brand);
                        return (
                          <TouchableOpacity
                            key={brand}
                            onPress={() => handleToggleBrand(brand)}
                            style={[styles.unifiedOptionButton, isSelected && styles.unifiedOptionButtonActive]}
                            ref={view => { if (brand === 'Vallejo') targetRefs.current['brand_Vallejo'] = view; }}
                          >
                            {brand === 'My Collection' && <BiSolidUserCircleIcon size={16} color={isSelected ? '#1D1D1D' : '#F4F4F4'} opacity={1} />}
                            <Text style={[styles.unifiedOptionText, isSelected && styles.unifiedOptionTextActive]}>{brand}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {/* Paint Selection Container */}
                    <View style={[styles.paintSelectionContainer, selectedColors.length === 0 && styles.paintSelectionContainerEmpty]}>
                      {selectedColors.length > 0 && (
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
                      )}
                      {/* Custom Palette button - always visible */}
                      <TouchableOpacity 
                        style={[styles.paintSelectionButton, selectedColors.length > 0 && styles.paintSelectionButtonEdit]} 
                        onPress={() => setIsPaintExplorerOpen(true)} 
                        activeOpacity={0.8}
                      >
                        <ColorPaletteIcon size={20} color={selectedColors.length > 0 ? colors.text.primary : colors.text.dark} />
                        <Text style={[styles.paintSelectionButtonText, selectedColors.length > 0 && styles.paintSelectionButtonTextEdit]}>
                          {selectedColors.length > 0 ? 'Edit Palette' : 'Custom Palette'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              )}
            </View>

        </ScrollView>

        {/* Floating Text Input (moves with keyboard) */}
        {sourceImages.length > 0 && (
          <KeyboardAvoidingView 
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.keyboardAvoidingTextArea}
              keyboardVerticalOffset={20}
          >
            <View style={styles.floatingTextContainer}>
              <AnimatedTextInput
                style={[styles.footerPromptInput, animatedInputStyle]}
                placeholder="Extra details help generate better results"
                placeholderTextColor={colors.text.secondary}
                multiline
                value={activeMode === 'paint' ? painterPrompt : designerPrompt}
                onChangeText={activeMode === 'paint' ? setPainterPrompt : setDesignerPrompt}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                onContentSizeChange={(e) => {
                  inputContentHeight.value = e.nativeEvent.contentSize.height;
                }}
                blurOnSubmit={false}
              />
            </View>
          </KeyboardAvoidingView>
        )}

        {/* Fixed Footer Buttons */}
        <View style={[styles.footerContainer, { paddingBottom: Math.max(insets.bottom + 16, 24), paddingTop: sourceImages.length === 0 ? 32 : 8 }]}>
          <View style={styles.footerInner}>
            <View style={styles.bottomButtonsRow}>
              {sourceImages.length === 0 ? (
                  /* NO SOURCE SELECTED: Show large "Pick a Source" button */
                  <TouchableOpacity
                      style={styles.pickSourceButton}
                      onPress={() => setIsResultsDrawerOpen(true)}
                      activeOpacity={0.8}
                  >
                      {/* @ts-ignore - Icon props handling */}
                      <GalleryIcon color="#F4F4F4" width={24} height={24} />
                      <Text style={styles.pickSourceButtonText}>Pick a Source</Text>
                  </TouchableOpacity>
              ) : (
                  /* SOURCE SELECTED: Show Source Preview + Create Button */
                  <>
                      <View>
                          <TouchableOpacity
                          style={styles.galleryButton}
                          onPress={() => setIsResultsDrawerOpen(true)}
                          activeOpacity={0.7}
                          accessibilityLabel="Change source"
                          accessibilityRole="button"
                          >
                          {/* Show preview of the first source image if available */}
                          {sourceImages.length > 0 ? (
                              <Image 
                                  source={{ uri: sourceImages[0].base64 || sourceImages[0].uri }} 
                                  style={styles.sourceButtonThumbnail} 
                                  resizeMode="cover"
                              />
                          ) : (
                              <GalleryIcon color="#F4F4F4" />
                          )}
                          <Text style={styles.galleryButtonText}>Source</Text>
                          </TouchableOpacity>
                      </View>
                      <View 
                          ref={view => { targetRefs.current['create_btn'] = view; }}
                          collapsable={false}
                          style={{ flex: 1 }} // Ensure it takes available space in the row
                      >
                          {isLoading ? (
                            <BreathingGradientButton
                              onPress={handleCancelGeneration}
                              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 62 }}
                            >
                                <SpinnerIcon size={24} color="white" />
                                <Text style={{ 
                                  color: 'white', 
                                  fontWeight: '700', 
                                  fontSize: 16, 
                                  fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto',
                                  marginLeft: 12 
                                }}>
                                  Stop
                                </Text>
                            </BreathingGradientButton>
                          ) : (
                            <TouchableOpacity
                              style={[styles.createButton, styles.createButtonBasic, !hasImageLoaded && styles.buttonDisabled]}
                              onPress={handleGenerate}
                              activeOpacity={0.8}
                              disabled={!hasImageLoaded}
                              accessibilityLabel={'Create image'}
                              accessibilityRole="button"
                              accessibilityHint={'Generates a new image based on your settings'}
                            >
                              <View style={styles.createButtonContent}>
                                  <MagicWandIcon color={colors.text.primary} />
                                  <Text style={styles.createButtonText}>Create</Text>
                              </View>
                            </TouchableOpacity>
                          )}
                      </View>
                  </>
              )}
            </View>
          </View>
        </View>

        <Modal visible={isResultsDrawerOpen} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setIsResultsDrawerOpen(false)}>
          <SafeAreaView style={styles.modalContainer} edges={['top']}>
            <View style={styles.grabberContainer}><View style={styles.grabber} /></View>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={toggleSelectionMode} style={[styles.modalHeaderSide, { alignItems: 'flex-start' }]}>
                <Text style={styles.headerButtonText}>{isSelectionMode ? 'Cancel' : 'Select'}</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Gallery</Text>
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
              {activePreviewImage ? (
                <View style={[styles.resultContainer, { marginBottom: 24 }]}>
                  <Image source={{ uri: activePreviewImage }} style={[styles.activeResultImage, { aspectRatio: previewAspectRatio }]} resizeMode="cover" />
                  <View style={styles.resultActions}>
                    <TouchableOpacity 
                        onPress={handleUseAsSource} 
                        style={[styles.resultActionButton, styles.resultActionButtonPrimary]} 
                        accessibilityLabel="Use as source image" 
                        accessibilityRole="button"
                        ref={view => { targetRefs.current['use_source_btn'] = view; }}
                    >
                        <Text style={[styles.resultActionText, styles.resultActionTextDark]}>Use as source</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleDownload} style={styles.resultActionButtonIcon} accessibilityLabel="Download image" accessibilityRole="button"><MdFileDownloadIcon color="#F4F4F4" /></TouchableOpacity>
                    <TouchableOpacity onPress={handleShare} style={styles.resultActionButtonIcon} accessibilityLabel="Share image" accessibilityRole="button"><ShareIcon color="#F4F4F4" /></TouchableOpacity>
                  </View>
                </View>
              ) : null}

              <View style={[styles.historyContainer, { paddingBottom: 0, marginBottom: 24 }]}>
                <Text style={styles.historyTitle}>Source</Text>
                <SourceContainer 
                  sourceImages={sourceImages}
                  activePreviewImage={activePreviewImage}
                  onClearImage={() => { setSourceImages([]); setActivePreviewImage(null); }}
                  onCameraPress={() => { cameFromGalleryRef.current = true; setIsResultsDrawerOpen(false); router.push('/camera'); }}
                  onFilesPress={handleFilesPress}
                />
              </View>
              <View style={[styles.historyContainer, { paddingBottom: 80 + insets.bottom }]}><Text style={styles.historyTitle}>History</Text><View style={styles.historyGrid}>
                {generationHistory.map((item, i) => {
                  const isSelected = selectedHistoryItems.has(item.url);
                  return (
                    <TouchableOpacity 
                      key={i} 
                      ref={view => { if (i === 1) targetRefs.current['demo_image'] = view; }}
                      style={[
                        styles.historyItem, 
                        activePreviewImage === item.url && !isSelectionMode && styles.historyItemActive,
                        isSelected && styles.historyItemSelected
                      ]} 
                      onPress={() => {
                        if (isSelectionMode) {
                          toggleSelection(item.url);
                        } else {
                          setActivePreviewImage(item.url);
                          // Only set as source if there isn't one already
                          if (sourceImages.length === 0) {
                            loadHistoryItemAsSource(item.url);
                          }
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <Image source={{ uri: item.url }} style={[styles.historyImage, isSelected && { opacity: 0.7 }]} />
                      
                      {/* Mode Indicator Dot (Pro only) - Hidden per user request 
                      {!isSelectionMode && item.isPro && (
                        <View style={styles.modeIndicatorDot}>
                          <View style={[
                            styles.modeDot,
                            { backgroundColor: '#FF682C' } // Pro Orange
                          ]} />
                        </View>
                      )}
                      */}
                      
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
             {/* RENDER ONBOARDING OVERLAY INSIDE MODAL TO COVER IT */}
             <OnboardingOverlay 
                step={tutorialStep} 
                onNext={handleTutorialNext} 
                targetLayout={targetLayout} 
             />
             <Toast 
                visible={toastConfig.visible} 
                message={toastConfig.message} 
                onDismiss={hideToast}
                useNativeModal={false}
             />
          </SafeAreaView>
        </Modal>


        {/* NEW: Generation Tooltip */}
        <GenerationTooltip 
            visible={showLongGenerationTooltip} 
            onDismiss={() => setShowLongGenerationTooltip(false)} 
        />

        {/* Paint Explorer Modal */}
        <PaintExplorerModal
          visible={isPaintExplorerOpen}
          onClose={() => setIsPaintExplorerOpen(false)}
          selectedBrands={selectedBrands}
          selectedColors={selectedColors}
          onToggleColor={toggleColor}
          triggerLoad={isPaletteEnabled}
          onPaintsLoaded={setLoadedPaints}
        />
        
        <AppModal
          visible={showMyPaintsAlert}
          onClose={() => setShowMyPaintsAlert(false)}
          title="MiniPainterDB"
          message="This feature links to your personal paint collection in MiniPainterDB. The app will be available soon!"
          primaryAction={{
            label: "OK",
            onPress: () => setShowMyPaintsAlert(false)
          }}
        />

        {/* Global/Standard App Modal */}
        <AppModal
            visible={modalConfig.visible}
            onClose={hideModal}
            title={modalConfig.title}
            message={modalConfig.message}
            type={modalConfig.type}
            primaryAction={modalConfig.primaryAction ? {
                ...modalConfig.primaryAction,
                onPress: () => {
                    modalConfig.primaryAction?.onPress();
                    hideModal();
                }
            } : { label: "OK", onPress: hideModal }}
            secondaryAction={modalConfig.secondaryAction ? {
                ...modalConfig.secondaryAction,
                onPress: () => {
                    modalConfig.secondaryAction?.onPress();
                    hideModal();
                }
            } : undefined}
        />
        <Toast 
          visible={toastConfig.visible}
          message={toastConfig.message}
          onDismiss={hideToast}
        />
      </View>
    </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  // Mode Badge Styles (Basic/Pro) - Figma Toggle-button Component
  modeBadge: { width: 80, height: 32, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRadius: 16 },
  modeBadgeBasic: { backgroundColor: colors.button.primary, padding: 6 },
  modeBadgePro: { backgroundColor: colors.accent.orange, padding: 6 },
  modeBadgeInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 6, alignSelf: 'stretch' },
  modeBadgeInnerPro: { justifyContent: 'flex-end' },
  modeBadgeDotBasic: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.text.primary },
  modeBadgeDotPro: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.button.dark },
  modeBadgeText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'Roboto', fontWeight: '600', fontSize: 13, lineHeight: 16, includeFontPadding: false },
  modeBadgeTextBasic: { color: colors.text.primary },
  modeBadgeTextPro: { color: colors.button.dark },
  // Unified Option Button Styles
  unifiedOptionButton: { flexDirection: 'row', gap: 6, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 4, backgroundColor: colors.background.tertiary, borderWidth: 0, justifyContent: 'center', alignItems: 'center' },
  unifiedOptionButtonActive: { backgroundColor: colors.button.white },
  unifiedOptionText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '500', fontSize: 14, color: colors.text.primary },
  unifiedOptionTextActive: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '500', fontSize: 14, color: colors.text.dark },
  screenContainer: { flex: 1, backgroundColor: colors.background.secondary },
  statusBarBackground: { height: 0, backgroundColor: colors.background.secondary },
  container: { flex: 1, backgroundColor: colors.background.primary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.primary },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 64, paddingHorizontal: 0, backgroundColor: colors.background.secondary },
  topNavLeft: { height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 16 },
  topNavRight: { height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 16 },
  topNavTitle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  userAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: colors.button.primary, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  topNavSide: { width: 91, alignItems: 'center', justifyContent: 'center' },
  userIconContainer: { alignItems: 'flex-end', paddingRight: 16 },
  proBadge: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: colors.button.primary },
  proBadgeInactive: { backgroundColor: '#002761' },
  proBadgeActive: { backgroundColor: colors.button.primary },
  proBadgeText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'Roboto', fontWeight: '500', fontSize: 14, letterSpacing: -0.41, marginLeft: 4 },
  proTextInactive: { color: colors.text.primary },
  proTextActive: { color: colors.text.primary },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 240 },
  navTabContainer: { flexDirection: 'row', alignSelf: 'stretch', backgroundColor: colors.background.secondary, paddingHorizontal: 16, paddingVertical: 8 },
  tabButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 6 },
  tabButtonActive: { backgroundColor: colors.button.primary },
  tabButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '600', fontSize: 14, marginLeft: 4 },
  tabTextActive: { color: colors.text.primary },
  tabTextInactive: { color: colors.text.secondary },
  inputContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', backgroundColor: colors.background.secondary, borderRadius: 8, borderWidth: 2, borderColor: colors.border.strong, borderStyle: 'dashed', paddingVertical: 8, paddingHorizontal: 8 },
  sourceInfo: { justifyContent: 'center' },
  inputLabel: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '700', fontSize: 12, color: colors.text.primary, paddingLeft: 8 },
  inputSubtitle: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '400', fontSize: 13, color: colors.text.secondary, marginTop: 2, paddingLeft: 8, textAlign: 'center' },
  optionsRow: { flexDirection: 'row', alignItems: 'center' },
  optionButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 17, paddingHorizontal: 16, backgroundColor: colors.button.secondary, borderRadius: 4, marginLeft: 8 },
  optionButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '500', fontSize: 13, color: colors.text.primary, marginLeft: 8 },
  sourceImageWrapper: { width: 50, height: 50, borderRadius: 6, borderWidth: 2, borderColor: colors.button.primary, overflow: 'hidden' },
  sourceImage: { width: '100%', height: '100%' },
  removeImageOverlay: { position: 'absolute', top: 0, right: 0, width: 15, height: 15, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  removeImageTextSmall: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  modeContent: { marginTop: 0, gap: 5, alignSelf: 'stretch' },
  promptContainer: { alignSelf: 'stretch', backgroundColor: colors.text.textfieldbg, borderRadius: 4, paddingHorizontal: 16, paddingVertical: 12, minHeight: 110 },
  promptInput: { flex: 1, fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'Roboto', fontSize: 14, color: colors.text.primary, lineHeight: 20 },
  designStepSection: { gap: 5 },
  paintStepSection: { gap: 5 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 8, paddingVertical: 8, marginTop: 12 },
  sectionHeaderText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '600', fontSize: 13, color: colors.text.primary },
  conceptTabContainer: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 4 },

  styleGrid: { flexDirection: 'row', alignSelf: 'stretch', flexWrap: 'wrap', gap: 4 },
  sliderContainer: { alignSelf: 'stretch', paddingVertical: 0, paddingHorizontal: 0,},
  sliderTrack: { height: 40, backgroundColor: colors.background.secondary, borderRadius: 6, position: 'relative', overflow: 'hidden' }, // Matches Figma dark track
  sliderFill: { position: 'absolute', top: 0, left: 0, height: '100%', backgroundColor: colors.button.primary, borderRadius: 6 }, // Solid blue fill
  sliderThumb: { position: 'absolute', width: 5, height: 25, borderRadius: 2.5, backgroundColor: 'rgba(244, 244, 244, 0.4)'}, // Vertical bar
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 0, paddingHorizontal: 0 },
  sliderLabelText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Text' : 'Roboto', fontSize: 13, color: colors.text.secondary, fontWeight: '600' },

  optionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 4, backgroundColor: colors.background.tertiary },
  optionLabel: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '400', fontSize: 14, color: colors.text.primary },
  optionLabelActive: { color: colors.text.primary },
  toggleContainer: { width: 46, height: 24, padding: 3, borderRadius: 12, justifyContent: 'center' },
  toggleOn: { backgroundColor: colors.button.white },
  toggleOff: { backgroundColor: colors.text.secondary },
  toggleCircle: { width: 18, height: 18, borderRadius: 9 },
  toggleCircleActive: { alignSelf: 'flex-end', backgroundColor: colors.button.primary },
  toggleCircleInactive: { alignSelf: 'flex-start', backgroundColor: colors.text.dark },
  paletteContainer: { padding: 12, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.05)', backgroundColor: 'transparent', gap: 12, alignSelf: 'stretch' },
  paletteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paletteTitle: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '600', fontSize: 13, color: colors.text.secondary },
  clearAllText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '600', fontSize: 13, color: '#FF5050' },
  // Paint Selection Component Styles
  paintSelectionContainer: { borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, padding: 12, gap: 4, alignSelf: 'stretch', overflow: 'hidden' },
  paintSelectionContainerEmpty: { borderWidth: 0, padding: 0, overflow: 'visible' },
  paintSelectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, paddingBottom: 8 },
  paintSelectionCount: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '600', fontSize: 13, color: colors.text.secondary, lineHeight: 14 },
  paintSelectionEmpty: { paddingTop: 4, paddingBottom: 8 },
  paintSelectionHint: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '500', fontSize: 14, color: colors.text.primary, lineHeight: 18 },
  paintSelectionButton: { flexDirection: 'row', alignSelf: 'stretch', padding: 16, backgroundColor: colors.button.white, borderRadius: 4, alignItems: 'center', justifyContent: 'center', marginTop: 12, gap: 8 },
  paintSelectionButtonEdit: { backgroundColor: colors.background.tertiary },
  paintSelectionButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '600', fontSize: 16, color: colors.text.dark, letterSpacing: -0.408 },
  paintSelectionButtonTextEdit: { color: colors.text.primary },
  colorChipsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: 'rgba(0, 0, 0, 0.3)', borderRadius: 4 },
  colorChipCircle: { width: 16, height: 16, borderRadius: 8 },
  colorChipName: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '400', fontSize: 13, color: colors.text.primary, maxWidth: 100 },
  colorChipClose: { marginLeft: 4 },
  brandTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },

  explorerButton: { alignSelf: 'stretch', padding: 16, backgroundColor: colors.button.white, borderRadius: 4, alignItems: 'center' },
  explorerButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '600', fontSize: 14, color: colors.text.dark },
  keyboardAvoidingFooter: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  keyboardAvoidingTextArea: { position: 'absolute', bottom: 90, left: 0, right: 0 },
  floatingTextContainer: { backgroundColor: colors.background.secondary, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  floatingInputLabel: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontSize: 12, fontWeight: '600', color: colors.text.secondary, marginBottom: 8, letterSpacing: 0.5 },
  footerContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.background.secondary, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16 },
  footerInner: { gap: 16, justifyContent: 'space-between', alignItems: 'center' },
  footerPromptInput: { fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'Roboto', fontWeight: '400', fontSize: 14, lineHeight: LINE_HEIGHT, color: colors.text.secondary, alignSelf: 'stretch', paddingTop: INPUT_VERTICAL_PADDING, paddingBottom: INPUT_VERTICAL_PADDING, paddingHorizontal: 16, textAlignVertical: 'top', backgroundColor: colors.background.primary, borderRadius: 16 },
  bottomButtonsRow: { flexDirection: 'row', alignSelf: 'stretch', gap: 8 },
  galleryButton: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6, paddingRight: 16, backgroundColor: colors.background.primary, borderRadius: 32, justifyContent: 'center' },
  galleryButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '500', fontSize: 16, color: colors.text.primary, letterSpacing: -0.41 },
  sourceButtonThumbnail: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  pickSourceButton: { flex: 1, height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.background.tertiary, borderRadius: 32 },
  pickSourceButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '500', fontSize: 16, color: colors.text.primary },
  createButton: { flex: 1, height: 56, backgroundColor: colors.accent.orange, borderRadius: 62, justifyContent: 'center', alignItems: 'center' },
  createButtonBasic: { backgroundColor: colors.button.primary },
  createButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  createButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '500', fontSize: 16, color: colors.text.primary },
  createButtonTextPro: { color: colors.button.dark },
  cancelButton: { backgroundColor: colors.text.dark },
  cancelButtonText: { color: colors.text.primary, opacity: 0.3 },
  buttonDisabled: { opacity: 0.5 },
  modalContainer: { flex: 1, backgroundColor: colors.background.secondary },
  grabberContainer: { width: '100%', height: 24, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 36, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.2)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, paddingHorizontal: 24},
  modalHeaderSide: { width: 80, justifyContent: 'center' },
  modalTitle: { flex: 1, textAlign: 'center', color: colors.text.primary, fontSize: 16, fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '700', letterSpacing: -0.41 },
  doneButtonText: { color: colors.text.primary, fontSize: 16, fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '600', textAlign: 'right' },
  closeButton: { paddingVertical: 12, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'flex-end' },
  modalContent: { flex: 1, padding: 24 },
  resultContainer: { alignSelf: 'stretch', gap: 8, marginBottom: 32 },
  activeResultImage: { width: '100%', aspectRatio: undefined, borderRadius: 8, backgroundColor: '#000' },
  resultActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignSelf: 'stretch' },
  resultActionButton: { flex: 1, minWidth: 100, height: 40, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 12 },
  resultActionButtonPrimary: { backgroundColor: colors.button.white },
  resultActionText: { color: colors.text.primary, fontSize: 14, fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '600', letterSpacing: -0.41 },
  resultActionTextDark: { color: colors.text.dark },
  resultActionButtonIcon: { height: 40, paddingHorizontal: 24, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  historyContainer: { alignSelf: 'stretch', gap: 9, paddingBottom: 60 },
  historyTitle: { color: colors.text.primary, fontSize: 16, fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '700', letterSpacing: -0.41 },
  historyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: HISTORY_GRID_GAP, alignSelf: 'stretch' },
  historyItem: { width: historyItemWidth, aspectRatio: 1, borderRadius: 8, overflow: 'hidden' },
  historyItemActive: { borderWidth: 2, borderColor: colors.button.primary },
  historyItemSelected: { borderWidth: 2, borderColor: colors.button.primary },
  headerButtonText: { color: colors.text.primary, fontSize: 16, fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '400' },
  selectionOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'flex-end', justifyContent: 'flex-start', padding: 4 },
  selectionCheck: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  selectionCheckActive: { backgroundColor: colors.button.primary, borderColor: colors.button.primary },
  selectionCheckInactive: { backgroundColor: 'rgba(0,0,0,0.3)' },
  historyImage: { width: '100%', height: '100%' },
  modeIndicatorDot: { position: 'absolute', top: 6, right: 6, zIndex: 1 },
  modeDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.3)' },
  // FTUE Bottom Sheet
  ftueSheetContent: { flex: 1, backgroundColor: colors.background.secondary },
});
