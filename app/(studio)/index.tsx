import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, TextInput,
  ActivityIndicator, Alert, Modal, StyleSheet, Platform, Dimensions, StatusBar, Share, Animated, Easing,
  KeyboardAvoidingView, Keyboard
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import {
  XMarkIcon, RefreshIcon, ArrowsPointingOutIcon, DownloadIcon, CheckIcon,
  AppTitleIcon, BiSolidUserCircleIcon, BiSolidUserCircle32Icon,
  BuildIcon, DrawIcon, PaintIcon, MagicWandIcon, SculptIcon,
  CameraLensIcon, CloseIcon,
  FileDownloadIcon as MdFileDownloadIcon, SpinnerIcon, TbProgressCheckIcon, ShareIcon, GalleryIcon
} from '@/components/Icons';
import type { ImageFile, DesignerType, HistoryItem, StyleOption, StudioMode } from '@/types';
import { sanitizePrompt } from '@/utils/sanitization';

import { usePrompts } from '@/hooks/usePrompts';
import { generatePaintedMiniature, generateImageFromImage, cancelGeneration } from '@/services/geminiService';
import { fetchAllPaints, fetchUserPaints, PaletteColor } from '@/services/paintService';
import { useImagePicker } from '@/hooks/useImagePicker';
import { useMediaSave } from '@/hooks/useMediaSave';
import { useAuth } from '@/context/AuthContext';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useImageContext } from '@/context/ImageContext';
import { PaintExplorerModal } from '@/components/PaintExplorerModal';
import { AppModal } from '@/components/AppModal';
import { ToggleButton } from '@/components/ToggleButton';
import { SectionHeader } from '@/components/SectionHeader';
import { ModeCardSelector } from '@/components/studio/ModeCardSelector';
import { SourceContainer } from '@/components/studio/SourceContainer';
import { OnboardingOverlay, TutorialStep } from '@/components/OnboardingOverlay';
import { colors, spacing, borderRadius, fontFamily, textStyles } from '@/theme';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { shareAsync, isAvailableAsync } from 'expo-sharing';

// Get screen dimensions
import { DEFAULT_DESIGNER_TEMPLATES, METALLIC_PAINT_INSTRUCTIONS } from '@/constants';
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
  const [isNMMEnabled, setIsNMMEnabled] = useState(false);
  const [isOSLEnabled, setIsOSLEnabled] = useState(false);
  const [isPhotoshootEnabled, setIsPhotoshootEnabled] = useState(false);
  const [isPaletteEnabled, setIsPaletteEnabled] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);

  const [designerPrompt, setDesignerPrompt] = useState('');
  const [painterPrompt, setPainterPrompt] = useState('');
  
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

  const [isResultsDrawerOpen, setIsResultsDrawerOpen] = useState(false);
  const [isPaintExplorerOpen, setIsPaintExplorerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        try {
            // DEBUG: Force 'welcome' for testing (Reset by setting to false manually if needed)
            const alwaysShow = false; 
            const hasSeen = await AsyncStorage.getItem('has_seen_onboarding_v2');
            
            if (!hasSeen || alwaysShow) {
                setTutorialStep('welcome');
                // Ensure drawer is closed if starting tutorial
                setIsResultsDrawerOpen(false);
            } else {
                setTutorialStep('idle');
            }
        } catch (e) {
            setTutorialStep('idle');
        }
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

    const timer = setInterval(measureTarget, 500); // Check every 500ms
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

  // Auto-open Gallery drawer on fresh start when no source is selected
  useEffect(() => {
    // Only open gallery if onboarding is NOT visible (Modal conflict prevention)
    if (!authLoading && sourceImages.length === 0 && !activePreviewImage && tutorialStep === 'idle') {
      setIsResultsDrawerOpen(true);
    }
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
      if (activeMode === 'paint' && sourceImages.length >= 1) {
        
        // 1. STYLE SECTION
        let finalStylePrompt = isPro ? (selectedStyle.promptPro || selectedStyle.prompt) : selectedStyle.prompt;

        // 2. COLORS SECTION (Calculated first to inform Effects)
        let standardColorsList: string[] = [];
        let metallicColorsList: string[] = [];
        
        if (isPaletteEnabled) {
          // Gather paints
          let paintsToUse: { name: string, hex: string, finish?: string }[] = [];

          if (selectedColors.length > 0) {
            paintsToUse = selectedColors;
          } else if (selectedBrands.length > 0 && loadedPaints.length > 0) {
             // ... (Existing filtering logic)
             const normalizedBrands = selectedBrands.map(b => b.toLowerCase().trim());
             const includesMyPaints = normalizedBrands.includes('my paints');
             
             const brandPaints = loadedPaints.filter((p: any) => {
               const isUserPaint = p._isUserPaint === true;
               if (isUserPaint) return includesMyPaints;
               const paintBrand = (p.brand?.trim() || 'Unknown').toLowerCase();
               return normalizedBrands.some(b => b !== 'my paints' && paintBrand === b);
             }).filter(p => {
               const nameLower = p.name.toLowerCase();
               return !nameLower.includes('cleaner') && 
                      !nameLower.includes('thinner') && 
                      !nameLower.includes('reducer') && 
                      !nameLower.includes('flow improver');
             });
             
             paintsToUse = brandPaints.map(p => ({
                 name: p.name,
                 hex: p.hex,
                 finish: p.finish // Assuming loadedPaints includes finish info, otherwise defaults
             }));
          }
          
          if (paintsToUse.length > 0) {
              standardColorsList = paintsToUse
                .filter(c => c.finish !== 'Metallic')
                .map(c => `${c.name}: ${c.hex}`);
              
              metallicColorsList = paintsToUse
                .filter(c => c.finish === 'Metallic')
                .map(c => `${c.name}: ${c.hex}`);
          }
        }
        
        // 3. EFFECTS SECTION
        const effectsParts: string[] = [];
        
        const nmmEffect = effectPrompts['effect.nmm'];
        if (isNMMEnabled) {
           if (metallicColorsList.length > 0) {
              // Mixed Mode: NMM enabled but user picked metallic paints
              const mixedEffect = effectPrompts['effect.nmm.mixed'];
              if (mixedEffect) {
                  effectsParts.push(isPro ? mixedEffect.pro : mixedEffect.default);
              }
           } else if (nmmEffect) {
              // Standard NMM
              effectsParts.push(isPro ? nmmEffect.pro : nmmEffect.default);
           }
        } else {
          // Default TMM / Metallic Instructions (User requested this as the "Default Effect")
          // Logic: If NMM is NOT enabled, we supply the TMM instructions.
          // Check if we have a remote "negative" template for NMM (which serves as the "NMM OFF" instruction)
          if (nmmEffect && (isPro ? nmmEffect.negative_pro : nmmEffect.negative_default)) {
              effectsParts.push(isPro ? nmmEffect.negative_pro! : nmmEffect.negative_default!);
          } else {
              effectsParts.push(METALLIC_PAINT_INSTRUCTIONS);
          }
        }

        const oslEffect = effectPrompts['effect.osl'];
        if (isOSLEnabled && oslEffect) {
          effectsParts.push(isPro ? oslEffect.pro : oslEffect.default);
        }
        
        // Photoshoot effect (if applicable to Paint mode, though usually for Designer)
        if (isPhotoshootEnabled) {
             const photoEffect = effectPrompts['effect.photoshoot'];
             if (photoEffect) effectsParts.push(isPro ? photoEffect.pro : photoEffect.default);
        }
        
        // --- ASSEMBLY ---
        
        // Handle {{METALLIC_PALETTE}} Tag
        let metallicBlock = "";
        if (metallicColorsList.length > 0) {
             metallicBlock = "Metallic Paints (Render with TMM pigment texture based on these hues):\n" + metallicColorsList.join(', ');
        }

        if (finalStylePrompt.includes('{{METALLIC_PALETTE}}')) {
             // Inject into style prompt
             finalStylePrompt = finalStylePrompt.replace('{{METALLIC_PALETTE}}', metallicBlock);
             metallicBlock = ""; // Clear so it doesn't get added to [Colors]
        }

        const promptParts: string[] = [];
        
        // [Style Prompt Details]
        promptParts.push("[Style Prompt Details]");
        promptParts.push(finalStylePrompt);
        
        // [Colors] (Only if we have content)
        if (standardColorsList.length > 0 || metallicBlock.length > 0 || (!isPaletteEnabled && selectedBrands.length > 0)) {
            promptParts.push("[Colors]");
            
            if (isPaletteEnabled) {
                promptParts.push("STRICT COLOR PALETTE:");
                if (standardColorsList.length > 0) {
                    promptParts.push("Standard Colors:");
                    promptParts.push(standardColorsList.join(', '));
                }
                if (metallicBlock.length > 0) {
                    promptParts.push(metallicBlock);
                }
            } else if (selectedBrands.length > 0) {
                promptParts.push(`using paints from these brands: ${selectedBrands.join(', ')}`);
            }
        }

        // [Effects]
        if (effectsParts.length > 0) {
            promptParts.push("[Effects]");
            promptParts.push(effectsParts.join('\n'));
        }

        // Sanitized User Prompt
        const sanitizedPainterPrompt = sanitizePrompt(painterPrompt);
        if (sanitizedPainterPrompt) {
            // Where does the user input go? Usually interleaved, but here structure is strict.
            // Putting it after style prompt? Or just appending at end?
            // "We need to review the way prompts are generated... The color palette template need to look like this..."
            // I'll append it to Style for now, or maybe as a separate block? 
            // In the previous logic it was just joined. 
            // I'll append it to the [Style Prompt Details] block for context.
            promptParts.splice(2, 0, sanitizedPainterPrompt); 
        }

        const finalPrompt = promptParts.join('\n\n');
        console.log(finalPrompt);
        
        images = await generatePaintedMiniature(sourceImages, finalPrompt, 1, model);
      } else if (activeMode === 'sketch' || activeMode === 'sculpt') {
        const characterDesc = sanitizePrompt(designerPrompt).trim() || 'character';
        
        let template: string;
        if (isPhotoshootEnabled && designerTemplates['pro-shot']) {
            // Use pro-shot template when Photoshoot is enabled
            const proShotConfig = designerTemplates['pro-shot'];
            template = isPro ? proShotConfig.pro : proShotConfig.default;
        } else {
            // Use the mode-specific template (sketch or sculpt)
            const typeToUse = sourceImages.length > 1 ? 'combined' : activeMode;
            const templateConfig = designerTemplates[typeToUse];
            template = isPro ? templateConfig.pro : templateConfig.default;
        }

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
  }, [sourceImages, activeMode, designerPrompt, isPro, painterPrompt, selectedStyle, isNMMEnabled, isOSLEnabled, isPhotoshootEnabled, isPaletteEnabled, selectedColors, selectedBrands, loadedPaints]);

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
        Alert.alert('Error', 'Failed to load image');
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
    if (brand === 'My Paints' && !selectedBrands.includes(brand)) {
        const userPaints = await fetchUserPaints();
        if (userPaints.length === 0) {
            setShowMyPaintsAlert(true);
            return;
        }
    }

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
            <ModeBadge isAdvanced={isPro} onToggle={handleProToggle} />

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
          {hasImageLoaded && (
            <View style={styles.modeContent}>
              {activeMode === 'sketch' ? (
                <>{/* Sketch mode has no additional effects */}</>
              ) : activeMode === 'sculpt' ? (
                <>
                  <View style={styles.paintStepSection}>
                    <SectionHeader 
                      icon={<SectionAccent />}
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
                      icon={<SectionAccent />}
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
                      icon={<SectionAccent />}
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
                      icon={<SectionAccent />}
                      title="COLOR PALETTE"
                    />
                    <TouchableOpacity 
                        style={styles.optionItem} 
                        onPress={() => setIsPaletteEnabled(!isPaletteEnabled)} 
                        activeOpacity={0.7}
                        ref={view => { targetRefs.current['palette_toggle'] = view; }}
                    >
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
                                onPress={() => handleToggleBrand(brand)}
                                style={[styles.unifiedOptionButton, isSelected && styles.unifiedOptionButtonActive]}
                                ref={view => { if (brand === 'Vallejo') targetRefs.current['brand_Vallejo'] = view; }}
                              >
                                {brand === 'My Paints' && <BiSolidUserCircleIcon size={16} color={isSelected ? '#1D1D1D' : '#F4F4F4'} opacity={1} />}
                                <Text style={[styles.unifiedOptionText, isSelected && styles.unifiedOptionTextActive]}>{brand}</Text>
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

        {/* Bottom Navigation - Text area moves above keyboard, buttons stay at bottom */}
        {hasImageLoaded && (
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardAvoidingTextArea}
            keyboardVerticalOffset={0}
          >
            <View style={styles.floatingTextContainer}>
              <TextInput
                value={activeMode === 'paint' ? painterPrompt : designerPrompt}
                onChangeText={activeMode === 'paint' ? setPainterPrompt : setDesignerPrompt}
                placeholder="Any specific detail to add ?"
                placeholderTextColor="#7E808B"
                style={styles.footerPromptInput}
                multiline
                scrollEnabled={true}
              />
            </View>
          </KeyboardAvoidingView>
        )}

        {/* Fixed bottom buttons - don't move with keyboard */}
        <View style={[styles.footerContainer, { paddingBottom: Platform.OS === 'android' ? 30 + insets.bottom : insets.bottom + 16 }, !hasImageLoaded && { paddingTop: 32 }]}>
          <View style={styles.bottomButtonsRow}>
            <View 
                ref={view => { targetRefs.current['gallery_btn'] = view; }}
                collapsable={false}
            >
            <TouchableOpacity
              style={styles.galleryButton}
              onPress={() => setIsResultsDrawerOpen(true)}
              activeOpacity={0.7}
              accessibilityLabel="Open gallery"
              accessibilityRole="button"
              accessibilityState={{ disabled: !hasContentToView }}
            >
              <GalleryIcon color="#F4F4F4" />
              <Text style={styles.galleryButtonText}>Gallery</Text>
            </TouchableOpacity>
            </View>
            <View 
                ref={view => { targetRefs.current['create_btn'] = view; }}
                collapsable={false}
                style={{ flex: 1 }} // Ensure it takes available space in the row
            >
            <TouchableOpacity
              style={[styles.createButton, !isPro && styles.createButtonBasic, !hasImageLoaded && styles.buttonDisabled, isLoading && styles.cancelButton]}
              onPress={isLoading ? handleCancelGeneration : handleGenerate}
              activeOpacity={0.8}
              disabled={!hasImageLoaded && !isLoading}
              accessibilityLabel={isLoading ? 'Cancel generation' : `Create image in ${isPro ? 'Pro' : 'Basic'} mode`}
              accessibilityRole="button"
              accessibilityHint={isLoading ? 'Stops the current image generation' : 'Generates a new image based on your settings'}
            >
              <View style={styles.createButtonContent}>
                {!isLoading && <MagicWandIcon color={isPro ? colors.button.dark : colors.text.primary} />}
                {isLoading && <SpinnerIcon color={colors.text.primary} />}
                <Text style={[styles.createButtonText, isPro && styles.createButtonTextPro, isLoading && styles.cancelButtonText]}>{isLoading ? 'Cancel' : `Create (${isPro ? '2 Tokens' : '1 Token'})`}</Text>
              </View>
            </TouchableOpacity>
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
                      ref={view => { if (i === 0) targetRefs.current['demo_image'] = view; }}
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
                      
                      {/* Mode Indicator Dot */}
                      {!isSelectionMode && (
                        <View style={styles.modeIndicatorDot}>
                          <View style={[
                            styles.modeDot,
                            { backgroundColor: item.isPro ? '#FF682C' : '#2C59FF' }
                          ]} />
                        </View>
                      )}
                      
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

      </View>
    </View>
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
  modeBadgeText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System', fontWeight: '600', fontSize: 13, lineHeight: 16, includeFontPadding: false },
  modeBadgeTextBasic: { color: colors.text.primary },
  modeBadgeTextPro: { color: colors.button.dark },
  // Unified Option Button Styles
  unifiedOptionButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, padding: 12, borderRadius: 4, backgroundColor: colors.background.tertiary },
  unifiedOptionButtonActive: { backgroundColor: colors.button.white },
  unifiedOptionText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 13, color: colors.text.primary },
  unifiedOptionTextActive: { fontWeight: '600', color: colors.text.dark },
  screenContainer: { flex: 1, backgroundColor: colors.background.secondary },
  statusBarBackground: { height: 0, backgroundColor: colors.background.secondary },
  container: { flex: 1, backgroundColor: colors.background.primary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.primary },
  topNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 64, paddingHorizontal: 0, backgroundColor: colors.background.secondary },
  topNavLeft: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', paddingLeft: 16 },
  topNavRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 16 },
  topNavTitle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  userAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: colors.button.primary, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  topNavSide: { width: 91, alignItems: 'center', justifyContent: 'center' },
  userIconContainer: { alignItems: 'flex-end', paddingRight: 16 },
  proBadge: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, borderWidth: 1, borderColor: colors.button.primary },
  proBadgeInactive: { backgroundColor: '#002761' },
  proBadgeActive: { backgroundColor: colors.button.primary },
  proBadgeText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System', fontWeight: '500', fontSize: 14, letterSpacing: -0.41, marginLeft: 4 },
  proTextInactive: { color: colors.text.primary },
  proTextActive: { color: colors.text.primary },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 240 },
  navTabContainer: { flexDirection: 'row', alignSelf: 'stretch', backgroundColor: colors.background.secondary, paddingHorizontal: 16, paddingVertical: 8 },
  tabButton: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 6 },
  tabButtonActive: { backgroundColor: colors.button.primary },
  tabButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 14, marginLeft: 4 },
  tabTextActive: { color: colors.text.primary },
  tabTextInactive: { color: colors.text.secondary },
  inputContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', backgroundColor: colors.background.secondary, borderRadius: 8, borderWidth: 2, borderColor: colors.border.strong, borderStyle: 'dashed', paddingVertical: 8, paddingHorizontal: 8 },
  sourceInfo: { justifyContent: 'center' },
  inputLabel: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '700', fontSize: 12, color: colors.text.primary, paddingLeft: 8 },
  inputSubtitle: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '400', fontSize: 13, color: colors.text.secondary, marginTop: 2, paddingLeft: 8, textAlign: 'center' },
  optionsRow: { flexDirection: 'row', alignItems: 'center' },
  optionButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 17, paddingHorizontal: 16, backgroundColor: colors.button.secondary, borderRadius: 4, marginLeft: 8 },
  optionButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 13, color: colors.text.primary, marginLeft: 8 },
  sourceImageWrapper: { width: 50, height: 50, borderRadius: 6, borderWidth: 2, borderColor: colors.button.primary, overflow: 'hidden' },
  sourceImage: { width: '100%', height: '100%' },
  removeImageOverlay: { position: 'absolute', top: 0, right: 0, width: 15, height: 15, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  removeImageTextSmall: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  modeContent: { marginTop: 0, gap: 5, alignSelf: 'stretch' },
  promptContainer: { alignSelf: 'stretch', backgroundColor: colors.text.textfieldbg, borderRadius: 4, paddingHorizontal: 16, paddingVertical: 12, minHeight: 110 },
  promptInput: { flex: 1, fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System', fontSize: 14, color: colors.text.primary, lineHeight: 20 },
  designStepSection: { gap: 5 },
  paintStepSection: { gap: 5 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', gap: 8, paddingVertical: 8, marginTop: 12 },
  sectionHeaderText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 13, color: '#EFEFF1' },
  conceptTabContainer: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 4 },

  styleGrid: { flexDirection: 'row', alignSelf: 'stretch', flexWrap: 'wrap', gap: 4 },

  optionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 4, backgroundColor: colors.background.tertiary },
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

  explorerButton: { alignSelf: 'stretch', padding: 16, backgroundColor: colors.button.white, borderRadius: 4, alignItems: 'center' },
  explorerButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '600', fontSize: 14, color: colors.text.dark },
  keyboardAvoidingFooter: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  keyboardAvoidingTextArea: { position: 'absolute', bottom: 70., left: 0, right: 0 },
  floatingTextContainer: { backgroundColor: colors.background.secondary, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 },
  footerContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.background.secondary, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16 },
  footerInner: { gap: 16, justifyContent: 'space-between', alignItems: 'center' },
  footerPromptInput: { fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System', fontWeight: '400', fontSize: 14, lineHeight: 20, color: colors.text.primary, alignSelf: 'stretch', paddingVertical: 0, minHeight: 88, textAlignVertical: 'top' },
  bottomButtonsRow: { flexDirection: 'row', alignSelf: 'stretch', gap: 8 },
  galleryButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 24, paddingVertical: 16, backgroundColor: colors.background.card, borderRadius: 33, justifyContent: 'center' },
  galleryButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 16, color: colors.button.white, letterSpacing: -0.41 },
  createButton: { flex: 1, paddingVertical: 16, backgroundColor: colors.accent.orange, borderRadius: 62, justifyContent: 'center', alignItems: 'center' },
  createButtonBasic: { backgroundColor: colors.button.primary },
  createButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  createButtonText: { fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System', fontWeight: '500', fontSize: 16, color: colors.text.primary },
  createButtonTextPro: { color: colors.button.dark },
  cancelButton: { backgroundColor: colors.text.dark },
  cancelButtonText: { color: colors.text.primary, opacity: 0.3 },
  buttonDisabled: { opacity: 0.5 },
  modalContainer: { flex: 1, backgroundColor: colors.text.textfieldbg },
  grabberContainer: { width: '100%', height: 24, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 36, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.2)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, paddingHorizontal: 24},
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
  resultActionText: { color: colors.text.primary, fontSize: 14, fontFamily: 'SF Pro Display', fontWeight: '600', letterSpacing: -0.41 },
  resultActionTextDark: { color: colors.text.dark },
  resultActionButtonIcon: { height: 40, paddingHorizontal: 24, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  historyContainer: { alignSelf: 'stretch', gap: 9, paddingBottom: 60 },
  historyTitle: { color: colors.text.primary, fontSize: 16, fontFamily: 'SF Pro Display', fontWeight: '700', letterSpacing: -0.41 },
  historyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: HISTORY_GRID_GAP, alignSelf: 'stretch' },
  historyItem: { width: historyItemWidth, aspectRatio: 1, borderRadius: 8, overflow: 'hidden' },
  historyItemActive: { borderWidth: 2, borderColor: colors.button.primary },
  historyItemSelected: { borderWidth: 2, borderColor: colors.button.primary },
  headerButtonText: { color: colors.text.primary, fontSize: 16, fontFamily: 'SF Pro Display', fontWeight: '400' },
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
