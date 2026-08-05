import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, TextInput, FlatList,
  ActivityIndicator, Alert, Modal, StyleSheet, Platform, Dimensions, StatusBar, Share,
  KeyboardAvoidingView, Pressable
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MenuView } from '@react-native-menu/menu';
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
  FileDownloadIcon as MdFileDownloadIcon, SpinnerIcon, TbProgressCheckIcon, ShareIcon, GalleryIcon, TrashIcon
} from '@/components/Icons';
import AppTitleSvg from '../../assets/icons/react-icons/apptitle.svg';
import type { ImageFile, DesignerType, HistoryItem, StyleOption, StudioMode } from '@/types';
import { sanitizePrompt } from '@/utils/sanitization';
import { generatePaintPrompt } from '@/utils/promptGenerator';

import { usePrompts } from '@/hooks/usePrompts';
import { generatePaintedMiniature, generateImageFromImage, cancelGeneration } from '@/services/geminiService';
import { PaletteColor, fetchUserPaints } from '@/services/paintService';
import { filterPaintsByDiversity, getNMMRecipes } from '@/utils/paintFilter';
import { useImagePicker } from '@/hooks/useImagePicker';
import { useMediaSave } from '@/hooks/useMediaSave';
import { useAuth } from '@/context/AuthContext';
import { saveBase64ToFile, cleanupTempFiles } from '@/services/fileSystemService';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useImageContext } from '@/context/ImageContext';
import { PaintExplorerModal } from '@/components/PaintExplorerModal';
import { AppModal } from '@/components/AppModal';
import { MiniPainterDBModal } from '@/components/MiniPainterDBModal';
import { PaywallDrawer } from '@/components/PaywallDrawer';
import { supabase } from '@/services/supabase';
import { ToggleButton } from '@/components/ToggleButton';
import { SectionHeader } from '@/components/SectionHeader';
import { ModeCardSelector } from '@/components/studio/ModeCardSelector';
import { SourceContainer } from '@/components/studio/SourceContainer';
import { GenerationTooltip } from '@/components/GenerationTooltip';
import { BreathingGradientButton } from '@/components/BreathingGradientButton';
import { WelcomeOnboarding } from '@/components/WelcomeOnboarding';
import { colors, spacing, borderRadius, fontFamily, textStyles } from '@/theme';
import * as FileSystem from 'expo-file-system/legacy';
// expo-image: disk+memory cache and automatic downsampling. Used for all
// rendered thumbnails/previews. RN's Image is still imported above for getSize().
import { Image as ExpoImage } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { shareAsync, isAvailableAsync } from 'expo-sharing';
import { Toast } from '@/components/Toast';

// Get screen dimensions
import { DEFAULT_DESIGNER_TEMPLATES, METALLIC_PAINT_INSTRUCTIONS, SKETCH_STYLE_OPTIONS } from '@/constants';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Dynamic Grid Calculation
const HISTORY_GRID_GAP = 8;
const HISTORY_GRID_PADDING = 48; // modalContent padding (24) * 2
const MIN_HISTORY_ITEM_WIDTH = 82;

const availableHistoryWidth = SCREEN_WIDTH - HISTORY_GRID_PADDING;
const numHistoryColumns = Math.floor((availableHistoryWidth + HISTORY_GRID_GAP) / (MIN_HISTORY_ITEM_WIDTH + HISTORY_GRID_GAP));
const historyItemWidth = (availableHistoryWidth - (numHistoryColumns - 1) * HISTORY_GRID_GAP) / numHistoryColumns;

// --- Dedicated SVG Icon Components ---







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

  const triggerReleaseHaptic = () => {
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 50);
  };

  const gesture = Gesture.Pan()
    .onBegin((e) => {
      updateValue(e.x, widthSV.value);
      runOnJS(triggerReleaseHaptic)();
    })
    .onUpdate((e) => {
      updateValue(e.x, widthSV.value);
    })
    .onEnd(() => {
      runOnJS(triggerReleaseHaptic)();
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

export default function StudioScreen() {
  const { user, loading: authLoading, isAnonymous } = useAuth();
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

  const { 
    styles: paintStylesList, 
    templates: designerTemplates, 
    effects: effectPrompts, 
    rules: stateRules,
    shareMessage, 
    exampleAssets, 
    loading: promptsLoading,
    refetch: refetchPrompts
  } = usePrompts();

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

  const [isNMMEnabled, setIsNMMEnabled] = useState(false);
  const [isOSLEnabled, setIsOSLEnabled] = useState(false);
  const [isPhotoshootEnabled, setIsPhotoshootEnabled] = useState(false);
  const [isPaletteEnabled, setIsPaletteEnabled] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<string[]>(['All Brands']);
  const [showPhotoshootTip, setShowPhotoshootTip] = useState(false);
  const [showWelcomeOnboarding, setShowWelcomeOnboarding] = useState(false);

  const [designerPrompt, setDesignerPrompt] = useState('');
  const [painterPrompt, setPainterPrompt] = useState('');
  
  // Sketch Feature Enhancements
  const [sketchStyle, setSketchStyle] = useState<'fantasy' | 'sci-fi'>('fantasy');
  const [creativityLevel, setCreativityLevel] = useState(0.7); // Default to 0.7 for good balance

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
  // Note: Prompts are fetched only on mount to avoid performance issues
  // DISABLED: This was causing freezes when closing modals
  // useFocusEffect(
  //   useCallback(() => {
  //       console.log('[DEBUG] useFocusEffect fired - refetching entitlements');
  //       refetch();
  //   }, [refetch])
  // );
  
  const [sourceImages, setSourceImages] = useState<ImageFile[]>([]);
  const [activePreviewImage, setActivePreviewImage] = useState<string | null>(null);
  const [previewAspectRatio, setPreviewAspectRatio] = useState(1);
  const [generationHistory, setGenerationHistory] = useState<HistoryItem[]>([]);
  const [selectedColors, setSelectedColors] = useState<{ name: string, hex: string, finish?: string, product_type?: string }[]>([]);
  const [loadedPaints, setLoadedPaints] = useState<PaletteColor[]>([]);


  const [isLoading, setIsLoading] = useState(false);
  const [showLongGenerationTooltip, setShowLongGenerationTooltip] = useState(false);

  // Long generation tooltip timer — show at most once per week
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isLoading) {
        timer = setTimeout(async () => {
            try {
                const lastShown = await AsyncStorage.getItem('long_gen_tooltip_last_shown');
                const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
                if (lastShown && Date.now() - parseInt(lastShown, 10) < oneWeekMs) return;
                await AsyncStorage.setItem('long_gen_tooltip_last_shown', String(Date.now()));
                setShowLongGenerationTooltip(true);
            } catch {}
        }, 10000); // 10 seconds
    } else {
        setShowLongGenerationTooltip(false);
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  const [isResultsDrawerOpen, setIsResultsDrawerOpen] = useState(false);
  const [isPaintExplorerOpen, setIsPaintExplorerOpen] = useState(false);
  const [isPaywallVisible, setIsPaywallVisible] = useState(false);
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

  const toggleHaptic = () => setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 50);

  const handlePhotoshootToggle = useCallback(() => { toggleHaptic(); setIsPhotoshootEnabled(prev => !prev); }, []);
  const handleNMMToggle = useCallback(() => { toggleHaptic(); setIsNMMEnabled(prev => !prev); }, []);
  const handleOSLToggle = useCallback(() => { toggleHaptic(); setIsOSLEnabled(prev => !prev); }, []);

  // Photoshoot is only toggleable in sculpt mode; reset it on every mode change so a
  // stale value can't leak into paint/sketch and silently drive other modes.
  const handleModeChange = useCallback((mode: StudioMode) => {
    setActiveMode(mode);
    setIsPhotoshootEnabled(false);
  }, []);

  const [showMyPaintsAlert, setShowMyPaintsAlert] = useState(false);

  // Batch Deletion State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedHistoryItems, setSelectedHistoryItems] = useState<Set<string>>(new Set());
  const [hiddenDemoAssets, setHiddenDemoAssets] = useState<string[]>([]);

  const scrollViewRef = useRef<ScrollView>(null);
  const cameFromGalleryRef = useRef(false); // Track if we navigated to camera from gallery
  const hasShownGalleryFullModal = useRef(false); // Track if gallery_full modal was shown this session

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

    // Load photoshoot tip dismissed state
    AsyncStorage.getItem('photoshoot_tip_dismissed').then(stored => {
      if (!stored) {
        setShowPhotoshootTip(true);
      }
    });

    // Check if welcome onboarding has been shown
    AsyncStorage.getItem('has_seen_welcome_onboarding').then(stored => {
      if (!stored) {
        setShowWelcomeOnboarding(true);
      }
    });

    // Load persisted generation history (user-generated images only)
    AsyncStorage.getItem('generation_history').then(stored => {
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as HistoryItem[];
          setGenerationHistory(parsed);
        } catch (e) {
          if (__DEV__) console.warn('Failed to parse generation history:', e);
        }
      }
    });

  }, []);

  // Performance Optimization: Migrate base64 history to local files
  useEffect(() => {
    if (generationHistory.length === 0) return;

    const migrationNeeded = generationHistory.some(item => item.url.startsWith('data:image'));
    if (!migrationNeeded) return;

    if (__DEV__) console.log('[Gallery] Migration needed: converting base64 history to local files...');
    
    const migrateHistory = async () => {
      let changed = false;
      const migratedHistory = await Promise.all(generationHistory.map(async (item) => {
        if (item.url.startsWith('data:image')) {
          try {
            const fileUri = await saveBase64ToFile(item.url, 'history_');
            changed = true;
            return { ...item, url: fileUri };
          } catch (e) {
            console.error('Migration failed for item:', item.url.substring(0, 50));
            return item;
          }
        }
        return item;
      }));

      if (changed) {
        setGenerationHistory(migratedHistory);
        await AsyncStorage.setItem('generation_history', JSON.stringify(migratedHistory.filter(i => i.timestamp !== 0)));
        if (__DEV__) console.log('[Gallery] Migration complete.');
      }
    };

    migrateHistory();
  }, [generationHistory.length]); // Only run when length changes or on mount

  // Auto-scroll when palette is enabled
  useEffect(() => {
    if (isPaletteEnabled) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [isPaletteEnabled]);

  // Warm the disk cache for remote demo assets so the Gallery opens instantly.
  useEffect(() => {
    if (exampleAssets && exampleAssets.length > 0) {
      const remote = exampleAssets.filter(u => typeof u === 'string' && u.startsWith('http'));
      if (remote.length > 0) ExpoImage.prefetch(remote, { cachePolicy: 'memory-disk' });
    }
  }, [exampleAssets]);

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

  // Persist generation history with 10-image limit for anonymous users (debounced 1s)
  useEffect(() => {
    const timer = setTimeout(() => {
      const userGeneratedItems = generationHistory.filter(item => item.timestamp !== 0);

      // Apply 10-image limit for anonymous users only
      const imagesToSave = isAnonymous
        ? userGeneratedItems.slice(0, 10)  // Last 10 for anonymous
        : userGeneratedItems;               // Unlimited for signed-in

      // Save to AsyncStorage in background
      if (imagesToSave.length > 0) {
        AsyncStorage.setItem('generation_history', JSON.stringify(imagesToSave));
      } else {
        AsyncStorage.removeItem('generation_history');
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [generationHistory, isAnonymous]);

  // Show gallery full modal ONLY on app launch (once per session)
  useEffect(() => {
    if (authLoading) return; // Wait for auth to be ready
    
    const userGeneratedItems = generationHistory.filter(item => item.timestamp !== 0);
    
    // Show modal on app launch if user is anonymous and has reached 10-image limit
    if (isAnonymous && userGeneratedItems.length >= 10 && !hasShownGalleryFullModal.current) {
      hasShownGalleryFullModal.current = true;
      if (__DEV__) console.log('[DEBUG] App launch: Gallery limit reached, showing modal');
      
      showModal(
        "Gallery full",
        "You've hit the 10-image guest limit. Sign in to save unlimited images.",
        'default',
        { label: "Sign In", onPress: () => router.push('/signin') },
        { label: "Maybe Later", onPress: () => {} }
      );
    }
  }, [authLoading, generationHistory.length, isAnonymous]); // Only run on mount or when these values change

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
    if (Platform.OS === 'web') {
      // On web, Alert.alert is a no-op. The web image picker already opens
      // a file dialog that handles all file types, so go straight to it.
      handlePickImage();
      return;
    }
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
      // Open gallery instead of showing error
      setIsResultsDrawerOpen(true);
      return;
    }

    // Check for token exhaustion
    if ((entitlements.remaining_total ?? 0) <= 0) {
       if (entitlements.is_pro) {
           // Pro user exhausted their tier tokens
           showModal(
               "Token limit reached",
               "You’ve used all 60 tokens for this month. Get a token pack to keep going.",
               'default',
               { label: "Get Tokens", onPress: () => setIsPaywallVisible(true) },
               { label: "Maybe Later", onPress: () => {} }
           );
       } else {
           // Standard/Guest user exhausted all tokens
           showModal(
               "Tokens Exhausted",
               "You've used all your tokens. Subscribe or get a Pack to keep creating!",
               'default',
               { label: "Get Tokens", onPress: () => setIsPaywallVisible(true) },
               { label: "Maybe Later", onPress: () => {} }
           );
       }
       return;
    }

    setIsLoading(true);
    // setError(null); // No longer needed
    // Unified 1-token cost for all generations as per user request.
    try {
      // Prepare source images: if they are file URIs, read as base64
      const preparedSources = await Promise.all(sourceImages.map(async img => {
        if (img.base64.startsWith('file://')) {
          try {
            const base64 = await FileSystem.readAsStringAsync(img.base64, {
              encoding: FileSystem.EncodingType.Base64,
            });
            return {
              ...img,
              base64: `data:${img.mimeType || 'image/png'};base64,${base64}`
            };
          } catch (e) {
            console.error('Failed to read source image from file:', img.base64);
            return img;
          }
        }
        return img;
      }));

      let images: string[] = [];
      if (activeMode === 'paint' && preparedSources.length >= 1) {
        const promptParams = {
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
          painterPrompt,
          criticalRules: isPro ? stateRules['rules.paint']?.pro : stateRules['rules.paint']?.default
        };

        const metadata = {
          mode: 'paint',
          style_id: selectedStyle?.id,
          style_name: selectedStyle?.name,
          effects: [isNMMEnabled && 'NMM', isOSLEnabled && 'OSL', isPhotoshootEnabled && 'Photoshoot'].filter(Boolean),
          colors_count: selectedColors.length,
          is_pro: isPro,
        };

        // Generate single prompt with color filtering enabled for PoYo
        const finalPrompt = generatePaintPrompt({ ...promptParams, skipColorFiltering: false });

        if (__DEV__) console.log(`\n--- GENERATION PROMPT ---\n${finalPrompt}\n----------------------------------\n`);

        images = await generatePaintedMiniature(preparedSources, finalPrompt, 1, undefined, metadata, sanitizePrompt(painterPrompt));
      } else if (activeMode === 'sketch' || activeMode === 'sculpt') {
        const characterDesc = sanitizePrompt(designerPrompt).trim() || 'character';
        
        let template: string;
        // Track whether we've already resolved to the pro-shot template so we don't
        // ALSO inject effect.photoshoot separately below (avoids double-injection).
        const usedProShotTemplate = activeMode === 'sculpt' && isPhotoshootEnabled && !!designerTemplates['pro-shot'];
        if (usedProShotTemplate) {
            // Use pro-shot template when Photoshoot is enabled
            const proShotConfig = designerTemplates['pro-shot'];
            template = isPro ? proShotConfig.pro : proShotConfig.default;
        } else {
            // Use the mode-specific template (sketch or sculpt)
            const typeToUse = (preparedSources.length > 1) ? 'combined' : activeMode;
            const templateConfig = designerTemplates[typeToUse];
            template = isPro ? templateConfig.pro : templateConfig.default;
        }

        // Fetch the creativity template from remote config (or default)
        const creativityConfig = designerTemplates['creativity_level'];
        const creativityTemplateString = creativityConfig 
            ? (isPro ? creativityConfig.pro : creativityConfig.default) 
            : "AI CREATIVITY INTENSITY: {percentage}% (0%=Strict Adherence, 100%=Max Artistic License). Adjust the level of detail, material variation, and stylized interpretation to match this exact percentage.";
        
        const resolvedCreativity = creativityTemplateString.replace(/{percentage}/g, (creativityLevel * 100).toFixed(0));

        const goalPrompt = template
          .replace(/{input}/g, characterDesc)
          .replace(/{style}/g, sketchStyle)
          .replace(/{creativity}/g, resolvedCreativity);

        // Assembly of standardized prompt for Sketch/Sculpt
        const promptParts: string[] = [];
        // Collect negatives from the effects actually injected into [Effects] below,
        // so we can append a final [AVOID] section (mirrors the paint path).
        const negativeParts: string[] = [];

        promptParts.push("[Goal]");
        promptParts.push(goalPrompt);

        // [Effects] section for Sketch/Sculpt (Photoshoot if enabled and not already
        // baked into the pro-shot template — avoids double-injecting the effect).
        if (isPhotoshootEnabled && !usedProShotTemplate) {
            const photoEffect = effectPrompts['effect.photoshoot'];
            if (photoEffect) {
                promptParts.push("[Effects]");
                promptParts.push(isPro ? photoEffect.pro : photoEffect.default);

                const photoNegative = isPro ? photoEffect.negative_pro : photoEffect.negative_default;
                if (photoNegative) negativeParts.push(photoNegative);
            }
        }

        // [Rules]
        const ruleKey = activeMode === 'sketch' ? 'rules.sketch' : 'rules.render';
        const ruleContent = isPro ? stateRules[ruleKey]?.pro : stateRules[ruleKey]?.default;

        if (ruleContent) {
            promptParts.push("[Rules]");
            promptParts.push(ruleContent);
        }

        // [AVOID] — only emitted when there is at least one non-empty negative
        // collected from the effects actually injected above.
        if (negativeParts.length > 0) {
            promptParts.push(`[AVOID]\n${negativeParts.join(', ')}`);
        }

        const finalPrompt = promptParts.join('\n\n');

        const metadata = {
          mode: activeMode,
          is_pro: isPro,
          sketch_style: sketchStyle,
          creativity_level: (creativityLevel * 100).toFixed(0) + '%',
          effects: [isPhotoshootEnabled && 'Photoshoot'].filter(Boolean)
        };

        if (__DEV__) console.log(`\n--- ${activeMode.toUpperCase()} PROMPT (Temp: ${creativityLevel}) ---\n${finalPrompt}\n----------------------------------\n`);
        images = await generatePaintedMiniature(preparedSources, finalPrompt, 1, creativityLevel, metadata, characterDesc);
      }
      if (images && images.length > 0) {
        const resultUrl = images[0];
        if (__DEV__) console.log('[DEBUG] Generation success, result URL type:', resultUrl.startsWith('data:') ? 'base64' : (resultUrl.startsWith('http') ? 'remote' : 'file'));
        
        // Save the result base64 to a local file permanently
        let persistentUrl = resultUrl;
        try {
          if (__DEV__) console.log('[DEBUG] Attempting to save to file...');
          persistentUrl = await saveBase64ToFile(resultUrl, 'gen_');
          if (__DEV__) console.log('[DEBUG] Saved to file:', persistentUrl.substring(0, 50));
        } catch (e) {
          console.error('Failed to save generated image to file:', e);
        }

        if (__DEV__) console.log('[DEBUG] Setting preview and adding to history immediately...');
        setActivePreviewImage(persistentUrl);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 80);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 100);
        
        // Add to history with immediate 10-image limit for anonymous users
        setGenerationHistory(prev => {
          const newItem = { url: persistentUrl, isPro, isMaster: false, modelName: 'generated', timestamp: Date.now() };
          const allItems = [newItem, ...prev];
          
          // For anonymous users: keep only the 10 most recent items (including demos)
          // Oldest items (whether demo or user-generated) get pushed out
          if (isAnonymous) {
            return allItems.slice(0, 10);
          }
          
          return allItems;
        });
        
        if (__DEV__) console.log('[DEBUG] Opening results drawer...');
        setIsResultsDrawerOpen(true);
        
        // Modal will be shown when user manually closes drawer (see Modal onRequestClose handler)
        
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
              showModal("Limit Reached", errorMessage, 'error', {
                  label: "Get Tokens",
                  onPress: () => setIsPaywallVisible(true)
              });
          } else {
              showModal("Generation Failed", errorMessage, 'error');
          }
      }
    } finally {
      setIsLoading(false);
    }
  }, [sourceImages, activeMode, designerPrompt, isPro, painterPrompt, selectedStyle, isNMMEnabled, isOSLEnabled, isPhotoshootEnabled, isPaletteEnabled, selectedColors, selectedBrands, loadedPaints, sketchStyle, creativityLevel, entitlements.remaining_total, isAnonymous]);

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
            label: "Confirm", 
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

  const deleteSingleHistoryItem = useCallback(async (url: string) => {
    const item = generationHistory.find(i => i.url === url);
    if (item?.modelName === 'demo') {
      const newHidden = [...hiddenDemoAssets, url];
      setHiddenDemoAssets(newHidden);
      await AsyncStorage.setItem('hidden_demo_assets', JSON.stringify(newHidden));
    }
    setGenerationHistory(prev => prev.filter(i => i.url !== url));
    if (activePreviewImage === url) {
      setActivePreviewImage(null);
      setSourceImages([]);
    }
  }, [generationHistory, hiddenDemoAssets, activePreviewImage]);

  const confirmAndDeleteSingleItem = useCallback((url: string) => {
    Alert.alert('Delete Image', 'Are you sure you want to delete this image?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSingleHistoryItem(url) },
    ]);
  }, [deleteSingleHistoryItem]);

  const handleDeleteActive = useCallback(() => {
    if (!activePreviewImage) return;
    const isHistoryItem = generationHistory.some(item => item.url === activePreviewImage);
    const isSourceImage = sourceImages.some(img => (img.base64 || img.uri) === activePreviewImage);

    if (isHistoryItem) {
      confirmAndDeleteSingleItem(activePreviewImage);
    } else if (isSourceImage) {
      Alert.alert('Delete Image', 'Are you sure you want to delete this image?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { setSourceImages([]); setActivePreviewImage(null); } },
      ]);
    }
  }, [activePreviewImage, generationHistory, sourceImages, confirmAndDeleteSingleItem]);

  const handleShare = useCallback(async () => {
    if (!activePreviewImage) return;
    const tempFilesToCleanup: string[] = [];
    try {
      // Web: native sharing/filesystem are unavailable — trigger a download.
      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = activePreviewImage;
        link.download = `ministudio_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }

      // Check if sharing is available
      const isAvailable = await isAvailableAsync();
      if (!isAvailable) {
        showModal('Error', 'Sharing is not available on this device', 'error');
        return;
      }

      let fileUri = activePreviewImage;

      // If it's a base64 data URI, we need to save it to a temporary file for sharing
      if (activePreviewImage.startsWith('data:')) {
        const filename = `ministudio_share_${Date.now()}.png`;
        fileUri = FileSystem.cacheDirectory + filename;

        // The base64 data usually comes with prefix "data:image/png;base64,", strip it if needed
        const base64Data = activePreviewImage.includes(',')
          ? activePreviewImage.split(',')[1]
          : activePreviewImage;

        await FileSystem.writeAsStringAsync(fileUri, base64Data, {
          encoding: 'base64',
        });
        tempFilesToCleanup.push(fileUri);
      }

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
    } finally {
      if (tempFilesToCleanup.length > 0) {
        cleanupTempFiles(tempFilesToCleanup);
      }
    }
  }, [activePreviewImage]);

  const loadHistoryItemAsSource = useCallback(async (url: string) => {
    let imageData = url;
    
    // Efficiency: If it's already a local file or data URI, we don't need to do anything
    // the UI components handle both file:// and data: URIs natively.
    if (url.startsWith('file://') || url.startsWith('data:')) {
      const newImage: ImageFile = { base64: url, mimeType: 'image/png' };
      setSourceImages([newImage]);
      return;
    }

    // If it's a remote URL, keep it as a remote reference instead of fetching it
    // client-side. Fetching the CDN image from the browser is blocked by CORS
    // (the CDN sends no Access-Control-Allow-Origin header), and the image is
    // already publicly hosted, so the backend can consume it by URL directly.
    if (url.startsWith('http')) {
      const newImage: ImageFile = { base64: url, mimeType: 'image/png', uri: url, remoteUrl: url };
      setSourceImages([newImage]);
      return;
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


  // AI-001 : `product_type` accompagne désormais chaque couleur jusqu'au
  // générateur de prompt. Sans lui, lavis et contrast étaient rendus en aplat.
  const toggleColor = (colorName: string, hexCode?: string, finish?: string, productType?: string) => {
    setSelectedColors(prev => {
      const exists = prev.find(c => c.name === colorName);
      if (exists) {
        return prev.filter(c => c.name !== colorName);
      } else {
        return [...prev, { name: colorName, hex: hexCode || '#FFFFFF', finish, product_type: productType }];
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

    if (brand === 'My Collection') {
        try {
            const userPaints = await fetchUserPaints();
            if (userPaints.length === 0) {
                setShowMyPaintsAlert(true);
                return; // No collection — show info modal, don't toggle brand
            }
        } catch {
            setShowMyPaintsAlert(true);
            return; // Show modal as fallback on error
        }
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
      
      <View style={styles.container}>

        {/* Top Navigation */}
        <View style={styles.topNav}>
          <View style={styles.topNavLeft}>
            <AppTitleSvg width={182} height={14} />
          </View>
          <View style={styles.topNavTitle}>
            {/* App title removed per design */}
          </View>
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.topNavRight} activeOpacity={0.7}>
            <View style={styles.userAvatar}>
              {isAnonymous || !user ? (
                <Ionicons name="person" size={24} color={colors.text.secondary} />
              ) : user.user_metadata?.avatar_url ? (
                <ExpoImage
                  source={{ uri: user.user_metadata.avatar_url }}
                  style={styles.userAvatarImage}
                  cachePolicy="memory-disk"
                  contentFit="cover"
                />
              ) : (
                <BiSolidUserCircle32Icon size={24} />
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Main Content Area */}
        <ModeCardSelector activeMode={activeMode} onModeChange={handleModeChange} />
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
                    <TouchableOpacity style={styles.optionItem} onPress={handlePhotoshootToggle} activeOpacity={0.7}>
                      <Text style={[styles.optionLabel, isPhotoshootEnabled && styles.optionLabelActive]}>Photoshoot - Studio Lighting</Text>
                      <ToggleButton value={isPhotoshootEnabled} onToggle={handlePhotoshootToggle} />
                    </TouchableOpacity>
                    
                    {/* Photoshoot Tip Box */}
                    {showPhotoshootTip && (
                      <View style={styles.tipBox}>
                        <View style={styles.tipInfo}>
                          <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
                            <Circle cx="9" cy="9" r="7.5" stroke="#FFFFFF" strokeWidth="1.5" />
                            <Path d="M9 8.5V12.5M9 5.5V6" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
                          </Svg>
                          <Text style={styles.tipText}>
                            Pro tip: Render your mobile miniature photos before painting for the best results.
                          </Text>
                        </View>
                        <TouchableOpacity 
                          style={styles.tipButton}
                          onPress={() => {
                            setShowPhotoshootTip(false);
                            AsyncStorage.setItem('photoshoot_tip_dismissed', 'true');
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.tipButtonText}>Close</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.paintStepSection}>
                    <SectionHeader 
                      icon={<RiPaintFillIcon size={16} color="#32D278" />}
                      title="CHOOSE A STYLE"
                    />
                    <View style={styles.styleGrid}>
                      {paintStylesList.map((style) => (
                        <TouchableOpacity
                          key={style.id}
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
                    <TouchableOpacity style={styles.optionItem} onPress={handleNMMToggle} activeOpacity={0.7}>
                      <Text style={[styles.optionLabel, isNMMEnabled && styles.optionLabelActive]}>NNM - Non Metallic Metal</Text>
                      <ToggleButton value={isNMMEnabled} onToggle={handleNMMToggle} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.optionItem} onPress={handleOSLToggle} activeOpacity={0.7}>
                      <Text style={[styles.optionLabel, isOSLEnabled && styles.optionLabelActive]}>OSL - Object Source Lighting</Text>
                      <ToggleButton value={isOSLEnabled} onToggle={handleOSLToggle} />
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
                style={[
                  styles.footerPromptInput, 
                  animatedInputStyle,
                  // Override to normal (non-italic) style when user has typed text
                  (activeMode === 'paint' ? painterPrompt : designerPrompt).length > 0 && {
                    fontStyle: 'normal',
                    color: colors.text.primary
                  }
                ]}
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
                      onPress={() => { setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 70); setIsResultsDrawerOpen(true); }}
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
                          onPress={() => { setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 70); setIsResultsDrawerOpen(true); }}
                          activeOpacity={0.7}
                          accessibilityLabel="Change source"
                          accessibilityRole="button"
                          >
                          {/* Show preview of the first source image if available */}
                          {sourceImages.length > 0 ? (
                              <ExpoImage
                                  source={{ uri: sourceImages[0].base64 || sourceImages[0].uri }}
                                  style={styles.sourceButtonThumbnail}
                                  contentFit="cover"
                              />
                          ) : (
                              <GalleryIcon color="#F4F4F4" />
                          )}
                          <Text style={styles.galleryButtonText}>Source</Text>
                          </TouchableOpacity>
                      </View>
                      <View style={{ flex: 1 }}>
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
                              accessibilityLabel={(entitlements.remaining_total ?? 0) > 0 ? 'Create image' : 'Get more tokens'}
                              accessibilityRole="button"
                              accessibilityHint={(entitlements.remaining_total ?? 0) > 0 ? 'Generates a new image based on your settings' : 'Opens the token shop'}
                            >
                              <View style={styles.createButtonContent}>
                                  {(entitlements.remaining_total ?? 0) > 0 ? (
                                    <>
                                        <MagicWandIcon color={colors.text.primary} />
                                        <Text style={styles.createButtonText}>Create</Text>
                                    </>
                                  ) : (
                                    <Text style={styles.createButtonText}>Get more tokens</Text>
                                  )}
                              </View>
                            </TouchableOpacity>
                          )}
                      </View>
                  </>
              )}
            </View>
          </View>
        </View>

        <Modal visible={isResultsDrawerOpen} animationType="slide" presentationStyle="formSheet" onRequestClose={() => {
          if (__DEV__) console.log('[DEBUG] Gallery Modal onRequestClose triggered');
          if (__DEV__) console.log('[DEBUG] Total history items:', generationHistory.length);
          if (__DEV__) console.log('[DEBUG] hasShownGalleryFullModal:', hasShownGalleryFullModal.current);
          setIsResultsDrawerOpen(false);
          if (__DEV__) console.log('[DEBUG] Gallery Modal isResultsDrawerOpen set to false');

          // CRITICAL FIX: Never show modal after closing drawer - causes freeze with many images
          // Instead, modal will only show from the useEffect when limit is first reached
          if (__DEV__) console.log('[DEBUG] Skipping all modal logic in onRequestClose to prevent freeze');
        }}>
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
            <FlatList
              data={generationHistory}
              keyExtractor={(item) => item.url}
              numColumns={numHistoryColumns}
              columnWrapperStyle={{ gap: HISTORY_GRID_GAP, marginBottom: HISTORY_GRID_GAP }}
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 24 }}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={true}
              initialNumToRender={6}
              maxToRenderPerBatch={4}
              windowSize={3}
              key={numHistoryColumns} // Force re-render if columns change
              ListHeaderComponent={
                <>
                  {activePreviewImage ? (
                    <View style={[styles.resultContainer, { marginBottom: 24 }]}>
                      <ExpoImage source={{ uri: activePreviewImage }} style={[styles.activeResultImage, { aspectRatio: previewAspectRatio }]} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                      <View style={styles.resultActions}>
                        <TouchableOpacity
                            onPress={handleUseAsSource}
                            style={[styles.resultActionButton, styles.resultActionButtonPrimary]}
                            accessibilityLabel="Use as source image"
                            accessibilityRole="button"
                        >
                            <Text style={[styles.resultActionText, styles.resultActionTextDark]}>Use as source</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleDownload} style={styles.resultActionButtonIcon} accessibilityLabel="Download image" accessibilityRole="button"><MdFileDownloadIcon color="#F4F4F4" /></TouchableOpacity>
                        <TouchableOpacity onPress={handleDeleteActive} style={styles.resultActionButtonIcon} accessibilityLabel="Delete image" accessibilityRole="button"><TrashIcon color="#F4F4F4" /></TouchableOpacity>
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
                  <Text style={[styles.historyTitle, { marginBottom: 12 }]}>History</Text>
                </>
              }
              renderItem={({ item }) => {
                const isSelected = selectedHistoryItems.has(item.url);

                if (isSelectionMode) {
                  return (
                    <TouchableOpacity
                      style={[styles.historyItem, isSelected && styles.historyItemSelected]}
                      onPress={() => toggleSelection(item.url)}
                      activeOpacity={0.7}
                    >
                      <ExpoImage source={{ uri: item.url }} style={[styles.historyImage, isSelected && { opacity: 0.7 }]} contentFit="cover" cachePolicy="memory-disk" recyclingKey={item.url} />
                      <View style={styles.selectionOverlay}>
                        <View style={[styles.selectionCheck, isSelected ? styles.selectionCheckActive : styles.selectionCheckInactive]}>
                          {isSelected && <CheckIcon size={12} color="#FFF" />}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                }

                return (
                  <TouchableOpacity
                    style={[styles.historyItem, activePreviewImage === item.url && styles.historyItemActive]}
                    onPress={() => {
                      setActivePreviewImage(item.url);
                      if (sourceImages.length === 0) loadHistoryItemAsSource(item.url);
                    }}
                    activeOpacity={0.7}
                  >
                    <ExpoImage source={{ uri: item.url }} style={styles.historyImage} contentFit="cover" cachePolicy="memory-disk" recyclingKey={item.url} transition={120} />
                    <MenuView
                      style={StyleSheet.absoluteFillObject}
                      shouldOpenOnLongPress
                      onOpenMenu={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
                      actions={[
                        { id: 'use-as-source', title: 'Use as Source', image: Platform.select({ ios: 'photo.on.rectangle', android: 'ic_menu_gallery' }), imageColor: '#FFFFFF' },
                        { id: 'delete', title: 'Delete', attributes: { destructive: true }, image: Platform.select({ ios: 'trash', android: 'ic_menu_delete' }), imageColor: '#FF453A' },
                      ]}
                      onPressAction={({ nativeEvent }) => {
                        if (nativeEvent.event === 'use-as-source') {
                          loadHistoryItemAsSource(item.url);
                          setIsResultsDrawerOpen(false);
                        } else if (nativeEvent.event === 'delete') {
                          deleteSingleHistoryItem(item.url);
                        }
                      }}
                    >
                      <View style={StyleSheet.absoluteFillObject} />
                    </MenuView>
                  </TouchableOpacity>
                );
              }}
              ListFooterComponent={<View style={{ height: 80 + insets.bottom }} />} // Bottom padding replacement
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
          triggerLoad={isPaletteEnabled || selectedBrands.length > 0}
          onPaintsLoaded={setLoadedPaints}
        />
        
        <MiniPainterDBModal
          visible={showMyPaintsAlert}
          onClose={() => setShowMyPaintsAlert(false)}
        />

        {/* Global/Standard App Modal
            AppModal n'appelle jamais onClose lui-même : il exécute seulement
            l'action reçue. Une action qui ne ferme pas — « Maybe Later » vaut
            () => {} — laissait donc la modale ouverte, son voile bloquant tous
            les gestes, ce qui se manifestait comme un gel de l'application.
            On enveloppe chaque action pour fermer après coup, comme le fait
            déjà AuthContext. */}
        <AppModal
            visible={modalConfig.visible}
            onClose={hideModal}
            title={modalConfig.title}
            message={modalConfig.message}
            type={modalConfig.type}
            primaryAction={modalConfig.primaryAction ? {
                ...modalConfig.primaryAction,
                onPress: () => { modalConfig.primaryAction?.onPress(); hideModal(); },
            } : { label: "OK", onPress: hideModal }}
            secondaryAction={modalConfig.secondaryAction ? {
                ...modalConfig.secondaryAction,
                onPress: () => { modalConfig.secondaryAction?.onPress(); hideModal(); },
            } : undefined}
        />
        <Toast 
          visible={toastConfig.visible}
          message={toastConfig.message}
          onDismiss={hideToast}
        />
        <PaywallDrawer 
            visible={isPaywallVisible} 
            onClose={() => setIsPaywallVisible(false)} 
        />
        
        {/* Welcome Onboarding */}
        <WelcomeOnboarding
          visible={showWelcomeOnboarding}
          onComplete={() => {
            setShowWelcomeOnboarding(false);
            AsyncStorage.setItem('has_seen_welcome_onboarding', 'true');
          }}
        />
      </View>
    </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
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
  userAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: colors.button.primary, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background.tertiary },
  userAvatarImage: { width: '100%', height: '100%' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 240 },
  modeContent: { marginTop: 0, gap: 5, alignSelf: 'stretch' },
  paintStepSection: { gap: 5 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 8, paddingVertical: 8, marginTop: 12 },
  sectionHeaderText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '600', fontSize: 13, color: colors.text.primary },
  styleGrid: { flexDirection: 'row', alignSelf: 'stretch', flexWrap: 'wrap', gap: 4 },
  sliderTrack: { height: 40, backgroundColor: colors.background.secondary, borderRadius: 6, position: 'relative', overflow: 'hidden' }, // Matches Figma dark track
  sliderFill: { position: 'absolute', top: 0, left: 0, height: '100%', backgroundColor: colors.button.primary, borderRadius: 6 }, // Solid blue fill
  sliderThumb: { position: 'absolute', width: 5, height: 25, borderRadius: 2.5, backgroundColor: 'rgba(244, 244, 244, 0.4)'}, // Vertical bar
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 0, paddingHorizontal: 0 },
  sliderLabelText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Text' : 'Roboto', fontSize: 13, color: colors.text.secondary, fontWeight: '600' },

  optionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 4, backgroundColor: colors.background.tertiary },
  optionLabel: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '400', fontSize: 14, color: colors.text.primary },
  optionLabelActive: { color: colors.text.primary },
  clearAllText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '600', fontSize: 13, color: '#FF5050' },
  // Paint Selection Component Styles
  paintSelectionContainer: { borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, padding: 12, gap: 4, alignSelf: 'stretch', overflow: 'hidden' },
  paintSelectionContainerEmpty: { borderWidth: 0, padding: 0, overflow: 'visible' },
  paintSelectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4, paddingBottom: 8 },
  paintSelectionCount: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '600', fontSize: 13, color: colors.text.secondary, lineHeight: 14 },
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
  keyboardAvoidingTextArea: { position: 'absolute', bottom: 90, left: 0, right: 0 },
  floatingTextContainer: { backgroundColor: colors.background.secondary, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  footerContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.background.secondary, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16 },
  footerInner: { gap: 16, justifyContent: 'space-between', alignItems: 'center' },
  footerPromptInput: { fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'Roboto', fontWeight: '400', fontStyle: 'italic', fontSize: 14, lineHeight: LINE_HEIGHT, color: colors.text.secondary, alignSelf: 'stretch', paddingTop: INPUT_VERTICAL_PADDING, paddingBottom: INPUT_VERTICAL_PADDING, paddingHorizontal: 16, textAlignVertical: 'top', backgroundColor: colors.background.primary, borderRadius: 16 },
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
  buttonDisabled: { opacity: 0.5 },
  modalContainer: { flex: 1, backgroundColor: colors.background.secondary },
  grabberContainer: { width: '100%', height: 24, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 36, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.2)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, paddingHorizontal: 24},
  modalHeaderSide: { width: 80, justifyContent: 'center' },
  modalTitle: { flex: 1, textAlign: 'center', color: colors.text.primary, fontSize: 16, fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '700', letterSpacing: -0.41 },
  doneButtonText: { color: colors.text.primary, fontSize: 16, fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '600', textAlign: 'right' },
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
  historyItem: { width: historyItemWidth, aspectRatio: 1, borderRadius: 8, overflow: 'hidden' },
  historyItemActive: { borderWidth: 2, borderColor: colors.button.primary },
  historyItemSelected: { borderWidth: 2, borderColor: colors.button.primary },
  headerButtonText: { color: colors.text.primary, fontSize: 16, fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', fontWeight: '400' },
  selectionOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'flex-end', justifyContent: 'flex-start', padding: 4 },
  selectionCheck: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  selectionCheckActive: { backgroundColor: colors.button.primary, borderColor: colors.button.primary },
  selectionCheckInactive: { backgroundColor: 'rgba(0,0,0,0.3)' },
  historyImage: { width: '100%', height: '100%' },
  // Tip Box Styles
  tipBox: { 
    borderWidth: 2, 
    borderColor: '#464B5D', 
    borderRadius: 8, 
    padding: 16, 
    gap: 16, 
    alignItems: 'center',
    marginTop: 11
  },
  tipInfo: { 
    flexDirection: 'row', 
    alignSelf: 'stretch', 
    gap: 8, 
    alignItems: 'flex-start' 
  },
  tipText: { 
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', 
    fontWeight: '400', 
    fontSize: 13, 
    lineHeight: 16, 
    color: '#F4F4F4' 
  },
  tipButton: { 
    alignSelf: 'stretch', 
    backgroundColor: '#464B5D', 
    borderRadius: 24, 
    paddingVertical: 8, 
    paddingHorizontal: 12, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  tipButtonText: { 
    fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'Roboto', 
    fontWeight: '500', 
    fontSize: 16, 
    color: '#F4F4F4' 
  },
});
