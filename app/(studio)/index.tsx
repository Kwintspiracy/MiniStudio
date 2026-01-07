import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, TextInput,
  ActivityIndicator, Alert, Modal
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  SparklesIcon, CameraIcon, LibraryIcon, PencilIcon,
  UserIcon, DownloadIcon, ArrowsPointingOutIcon, RefreshIcon,
  GlobeIcon, DocumentTextIcon, XMarkIcon
} from '../../src/components/Icons';
import { PAINTING_STYLES, BACKGROUND_THEMES, DEFAULT_DESIGNER_TEMPLATES } from '../../src/constants';
import type { ImageFile, StyleOption, ToolMode, DesignerType, HistoryItem } from '../../src/types';
import { generatePaintedMiniature, generateImageFromImage, upscaleImage } from '../../src/services/geminiService';
import { setSessionActive } from '../../src/services/storageService';
import { useImagePicker } from '../../src/hooks/useImagePicker';
import { useMediaSave } from '../../src/hooks/useMediaSave';
import { sanitizePrompt } from '../../src/utils/promptSanitizer';
import { useImageContext } from '../../src/context/ImageContext';
import { saveImageToGallery } from '../../src/services/fileSystemService';
import { getData, storeData, GALLERY_INDEX_KEY } from '../../src/services/storageService';
import { randomUUID } from 'expo-crypto';
import { useHaptics } from '../../src/hooks/useHaptics';
import * as Haptics from 'expo-haptics';
import { OnboardingOverlay } from '../../src/components/OnboardingOverlay';
import { HAS_SEEN_ONBOARDING_KEY } from '../../src/services/storageService';
import { PaletteManager } from '../../src/components/PaletteManager';

export default function StudioScreen() {
  // Mode state
  const [activeTab, setActiveTab] = useState<ToolMode>('designer');
  const [useProModel, setUseProModel] = useState(false);

  // Image state
  const [sourceImages, setSourceImages] = useState<ImageFile[]>([]);
  const [activePreviewImage, setActivePreviewImage] = useState<string | null>(null);
  const [generationHistory, setGenerationHistory] = useState<HistoryItem[]>([]);

  // Loading state
  const [isLoading, setIsLoading] = useState(false);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Designer state
  const [designerPrompt, setDesignerPrompt] = useState('');
  const [designerType, setDesignerType] = useState<DesignerType>('sketch');

  // Painter state
  const [painterPrompt, setPainterPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState<StyleOption>(PAINTING_STYLES[0]);
  const [backgroundTheme, setBackgroundTheme] = useState('None');
  const [backgroundPrompt, setBackgroundPrompt] = useState('');
  const [textPrompt, setTextPrompt] = useState('');

  // Palette State Management
  const [isColorPaletteEnabled, setIsColorPaletteEnabled] = useState(false);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [allPaints, setAllPaints] = useState<any[]>([]); // Store full paint data locally

  const togglePaletteBrand = (brand: string) => {
    setSelectedBrands(prev => prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]);
  };

  const togglePaletteColor = (color: string) => {
    setSelectedColors(prev => prev.includes(color) ? prev.filter(c => c !== color) : [...prev, color]);
  };

  // UI state
  const [isResultsDrawerOpen, setIsResultsDrawerOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Hooks
  const { pickImage, pickMultipleImages } = useImagePicker();
  const { saveImage, shareImage } = useMediaSave();

  const handlePickImage = useCallback(async () => {
    const images = await pickMultipleImages();
    if (images.length > 0) {
      setSourceImages(prev => [...prev, ...images]);
    }
  }, [pickMultipleImages]);

  const handleOpenCamera = useCallback(() => {
    router.push('/camera');
  }, []);

  const handleRemoveImage = useCallback((index: number) => {
    setSourceImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (sourceImages.length === 0) {
      setError("Please add reference images first.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const model = useProModel ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';

    try {
      let images: string[] = [];

      if (activeTab === 'painter' && sourceImages.length >= 1) {
        const promptParts: string[] = [];

        // 1. Strict Color Constraints (Highest Priority)
        if (isColorPaletteEnabled) {
          if (selectedColors.length > 0) {
            // Map selected names to "Name (Hex)" strings for better AI accuracy
            const colorDetails = selectedColors.map(name => {
              const p = allPaints.find(x => x.name === name);
              return p && p.hex ? `${name} (Hex: ${p.hex})` : name;
            });

            promptParts.push(`[CRITICAL SYSTEM INSTRUCTION]: You are a digital painting engine with a RESTRICTED PALETTE. You must ONLY use these specific paint colors: ${colorDetails.join(', ')}. VERIFICATION REQUIRED: Scan your final output. If any pixel contains a hue not derivable from this list (e.g. unlisted reds/blues), REPAINT it immediately using the allowed colors. Compliance is mandatory.`);
          } else if (selectedBrands.length > 0) {
            // Auto-expand Brand/Library to a concrete list of hex codes
            // 1. Filter allPaints for matching brands OR user library
            const brandPaints = allPaints.filter(p => {
              if (selectedBrands.includes("User Library") && p._isUserPaint) return true;
              return p.brand && selectedBrands.includes(p.brand.trim());
            });

            // 2. Take a large subset (e.g., up to 500) to cover most user libraries
            // The model has a large context window, so we can afford this.
            const paletteSubset = brandPaints.slice(0, 500).map(p => `${p.name} (Hex: ${p.hex})`);

            if (paletteSubset.length > 0) {
              promptParts.push(`[CRITICAL SYSTEM INSTRUCTION]: You are a digital painting engine using the "${selectedBrands.join(' + ')}" paint range. You must ONLY use these specific paint colors from the range: ${paletteSubset.join(', ')}. Do not introduce colors outside this list.`);
            } else {
              // Fallback if no paints found (shouldn't happen if loaded correctly)
              promptParts.push(`[CRITICAL SYSTEM INSTRUCTION]: You are restricted to using paints from these brands ONLY: ${selectedBrands.join(', ')}.`);
            }
          }
        }

        // 2. Style & Concept
        promptParts.push(selectedStyle.id === 'none' ? "A professionally hand painted miniature." : selectedStyle.prompt);
        promptParts.push(sanitizePrompt(painterPrompt));

        // 3. Environment & Extras
        promptParts.push(backgroundTheme !== 'None' ? `Placed in a ${backgroundTheme} environment. ${sanitizePrompt(backgroundPrompt)}` : 'Preserve original background.');
        if (textPrompt) promptParts.push(`Add text: "${sanitizePrompt(textPrompt)}" on the surface.`);

        // Force image generation behavior
        promptParts.push("GENERATE THE IMAGE NOW. Do not output conversational text.");

        const finalPrompt = promptParts.filter(Boolean).join(' ');

        console.log("--- GENERATING PROMPT ---");
        console.log("Selected Colors Count:", selectedColors.length);
        console.log("Selected Brands Count:", selectedBrands.length);
        console.log("Is Palette Enabled:", isColorPaletteEnabled);
        console.log("Final Prompt:", finalPrompt);
        console.log("-------------------------");

        // setIsLoading(true); // Redundant if already handled
        images = await generatePaintedMiniature(sourceImages, finalPrompt, 1, model);
      } else if (activeTab === 'designer') {
        const characterDesc = designerPrompt.trim() || 'character';
        const typeToUse = sourceImages.length > 1 ? 'combined' : designerType;
        const template = DEFAULT_DESIGNER_TEMPLATES[typeToUse];
        const prompt = template.replace(/{input}/g, characterDesc);
        images = await generateImageFromImage(sourceImages, prompt, model);
      }

      if (images.length > 0) {
        const resultUrl = images[0];
        setActivePreviewImage(resultUrl);
        setGenerationHistory(prev => [{
          url: resultUrl,
          isPro: useProModel,
          isMaster: false,
          modelName: model,
          timestamp: Date.now()
        }, ...prev]);
        setIsResultsDrawerOpen(true);
      }
    } catch (err: any) {
      setError(err.message || "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, [sourceImages, activeTab, selectedStyle, painterPrompt, backgroundTheme, backgroundPrompt, textPrompt, designerPrompt, designerType, useProModel, isColorPaletteEnabled, selectedBrands, selectedColors]);

  const handleUpscale = useCallback(async () => {
    if (!activePreviewImage) return;

    setIsUpscaling(true);
    const model = useProModel ? 'gemini-3-pro-image-preview' : 'gemini-2.5-flash-image';

    try {
      const base64Data = activePreviewImage.split(',')[1];
      const upscaled = await upscaleImage({ base64: activePreviewImage, mimeType: 'image/png' }, model);
      setActivePreviewImage(upscaled);
      setGenerationHistory(prev =>
        prev.map(item => item.url === activePreviewImage ? { ...item, url: upscaled, isMaster: true } : item)
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUpscaling(false);
    }
  }, [activePreviewImage, useProModel]);

  const handleDownload = useCallback(async () => {
    if (!activePreviewImage) return;
    const success = await saveImage(activePreviewImage);
    if (success) {
      Alert.alert('Success', 'Image saved to your photo library!');
    }
  }, [activePreviewImage, saveImage]);

  const handleUseAsSource = useCallback(() => {
    if (!activePreviewImage) return;
    const newImage: ImageFile = { base64: activePreviewImage, mimeType: 'image/png' };
    setSourceImages([newImage]);
    setIsResultsDrawerOpen(false);
  }, [activePreviewImage]);

  const handleLogout = useCallback(async () => {
    await setSessionActive(false);
    router.replace('/');
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-[#0D1117]">
      {/* Header */}
      <View className="px-4 py-3 flex-row items-center justify-between border-b border-zinc-900/40">
        <View>
          <Text className="text-lg font-black text-white tracking-tight uppercase italic">
            STUDIO<Text className="text-indigo-500 font-light">v7</Text>
          </Text>
          <Text className="text-[8px] text-zinc-600 font-bold uppercase tracking-widest">Atelier</Text>
        </View>

        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={() => setUseProModel(!useProModel)}
            className={`flex-row items-center px-3 py-2 rounded-lg border ${useProModel ? 'bg-indigo-600 border-indigo-500' : 'bg-zinc-800 border-zinc-700'
              }`}
          >
            <SparklesIcon size={12} color={useProModel ? '#ffffff' : '#71717a'} />
            <Text className={`text-[8px] font-bold uppercase tracking-widest ml-1.5 ${useProModel ? 'text-white' : 'text-zinc-500'
              }`}>PRO</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setIsUserMenuOpen(true)}
            className="w-8 h-8 rounded-lg bg-zinc-800/40 border border-zinc-700/60 items-center justify-center"
          >
            <UserIcon size={14} color="#a1a1aa" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
        {/* Mode Tabs */}
        <View className="flex-row gap-1 p-1 bg-black/20 rounded-xl mt-4 mb-4">
          {[
            { id: 'designer' as ToolMode, label: 'Design', Icon: PencilIcon },
            { id: 'painter' as ToolMode, label: 'Paint', Icon: SparklesIcon }
          ].map(tab => (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              className={`flex-1 flex-row items-center justify-center py-3 rounded-lg ${activeTab === tab.id ? 'bg-indigo-600' : ''
                }`}
            >
              <tab.Icon size={12} color={activeTab === tab.id ? '#ffffff' : '#71717a'} />
              <Text className={`text-[9px] font-bold uppercase tracking-widest ml-2 ${activeTab === tab.id ? 'text-white' : 'text-zinc-600'
                }`}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Image Source Buttons */}
        <View className="flex-row gap-3 mb-4">
          <TouchableOpacity
            onPress={handleOpenCamera}
            className="flex-1 flex-row items-center justify-center p-3 bg-indigo-600 rounded-xl"
          >
            <CameraIcon size={14} color="#ffffff" />
            <Text className="text-white font-bold uppercase text-[9px] tracking-widest ml-2">Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handlePickImage}
            className="flex-1 flex-row items-center justify-center p-3 bg-zinc-800 border border-zinc-700 rounded-xl"
          >
            <LibraryIcon size={14} color="#ffffff" />
            <Text className="text-white font-bold uppercase text-[9px] tracking-widest ml-2">Library</Text>
          </TouchableOpacity>
        </View>

        {/* Source Images Preview */}
        {sourceImages.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
            <View className="flex-row gap-2">
              {sourceImages.map((img, i) => (
                <View key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-zinc-800">
                  <Image source={{ uri: img.base64 }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  <TouchableOpacity
                    onPress={() => handleRemoveImage(i)}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-600 rounded-full items-center justify-center"
                  >
                    <Text className="text-white text-[10px]">×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Designer Mode */}
        {activeTab === 'designer' && (
          <View className="gap-4">
            <View className="flex-row gap-2">
              {sourceImages.length > 1 ? (
                <View className="flex-1 py-3 bg-indigo-600 rounded-xl items-center">
                  <Text className="text-white text-[8px] font-bold uppercase tracking-widest">Combined</Text>
                </View>
              ) : (
                ['sketch', 'miniature', 'pro-shot'].map((t) => (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setDesignerType(t as DesignerType)}
                    className={`flex-1 py-3 rounded-xl border ${designerType === t ? 'bg-indigo-600 border-indigo-400' : 'bg-zinc-800/40 border-zinc-700'
                      }`}
                  >
                    <Text className={`text-center text-[8px] font-bold uppercase tracking-widest ${designerType === t ? 'text-white' : 'text-zinc-500'
                      }`}>
                      {t === 'pro-shot' ? 'Studio' : t === 'miniature' ? '3D' : 'Sketch'}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>

            <View className="p-3 bg-black/30 border border-zinc-800 rounded-2xl">
              <Text className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Concept Parameters</Text>
              <TextInput
                value={designerPrompt}
                onChangeText={setDesignerPrompt}
                placeholder="Describe character..."
                placeholderTextColor="#27272a"
                multiline
                className="text-gray-300 text-[11px] min-h-[60px]"
              />
            </View>
          </View>
        )}

        {/* Painter Mode */}
        {activeTab === 'painter' && (
          <View className="gap-4">
            {/* Style Selection */}
            <View>
              <Text className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Technique</Text>
              <View className="flex-row flex-wrap gap-2">
                {PAINTING_STYLES.slice(0, 9).map(style => (
                  <TouchableOpacity
                    key={style.id}
                    onPress={() => setSelectedStyle(style)}
                    className={`px-3 py-2.5 rounded-xl border ${selectedStyle.id === style.id ? 'bg-indigo-600 border-indigo-500' : 'bg-[#161B22] border-zinc-800'
                      }`}
                  >
                    <Text className={`text-[8px] font-bold uppercase tracking-widest ${selectedStyle.id === style.id ? 'text-white' : 'text-zinc-500'
                      }`}>{style.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Painting Scheme */}
            <View className="p-3 bg-black/30 border border-zinc-800 rounded-2xl">
              <Text className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Painting Scheme</Text>
              <TextInput
                value={painterPrompt}
                onChangeText={setPainterPrompt}
                placeholder="Add materials/colors..."
                placeholderTextColor="#27272a"
                multiline
                className="text-gray-300 text-[11px] min-h-[60px]"
              />
            </View>

            {/* Palette Manager */}
            <PaletteManager
              isEnabled={isColorPaletteEnabled}
              onToggleEnabled={setIsColorPaletteEnabled}
              selectedBrands={selectedBrands}
              onToggleBrand={togglePaletteBrand}
              selectedColors={selectedColors}
              onToggleColor={togglePaletteColor}
              onClearColors={() => setSelectedColors([])}
              onPaintsLoaded={setAllPaints}
            />

            {/* Background */}
            <View className="p-3 bg-black/20 border border-zinc-800/50 rounded-2xl">
              <View className="flex-row items-center mb-2">
                <GlobeIcon size={12} color="#71717a" />
                <Text className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest ml-2">Atmosphere</Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {BACKGROUND_THEMES.map(theme => (
                  <TouchableOpacity
                    key={theme}
                    onPress={() => setBackgroundTheme(theme)}
                    className={`px-3 py-2 rounded-lg border ${backgroundTheme === theme ? 'bg-indigo-600/20 border-indigo-500/50' : 'bg-zinc-900/40 border-zinc-800'
                      }`}
                  >
                    <Text className={`text-[8px] font-bold uppercase tracking-widest ${backgroundTheme === theme ? 'text-indigo-400' : 'text-zinc-500'
                      }`}>{theme}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {backgroundTheme !== 'None' && (
                <TextInput
                  value={backgroundPrompt}
                  onChangeText={setBackgroundPrompt}
                  placeholder="Environment details..."
                  placeholderTextColor="#27272a"
                  className="text-gray-300 text-[11px] mt-2 border border-zinc-800 rounded-lg p-3"
                />
              )}
            </View>

            {/* Text/Decals */}
            <View className="p-3 bg-black/20 border border-zinc-800/50 rounded-2xl">
              <View className="flex-row items-center mb-2">
                <DocumentTextIcon size={12} color="#71717a" />
                <Text className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest ml-2">Decals & Text</Text>
              </View>
              <TextInput
                value={textPrompt}
                onChangeText={setTextPrompt}
                placeholder="e.g. 'Vae Victis' on shield..."
                placeholderTextColor="#27272a"
                className="text-gray-300 text-[11px] border border-zinc-800 rounded-lg p-3"
              />
            </View>
          </View>
        )}

        {/* Generate Button */}
        <View className="mt-6 mb-6">
          {isLoading ? (
            <TouchableOpacity
              onPress={() => setIsLoading(false)}
              className="h-14 bg-red-600/20 border border-red-600/40 rounded-2xl items-center justify-center flex-row"
            >
              <ActivityIndicator color="#ef4444" size="small" />
              <Text className="text-red-500 font-bold uppercase text-[10px] tracking-widest ml-2">Generating...</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleGenerate}
              className="h-14 bg-emerald-600 rounded-2xl items-center justify-center flex-row shadow-lg"
            >
              <SparklesIcon size={16} color="#ffffff" />
              <Text className="text-white font-bold uppercase text-[11px] tracking-widest ml-2">Craft Engine</Text>
            </TouchableOpacity>
          )}

          {error && (
            <View className="mt-3 bg-red-400/10 border border-red-400/30 rounded-xl py-2 px-4">
              <Text className="text-red-400 text-[9px] font-bold text-center uppercase">{error}</Text>
            </View>
          )}
        </View>

        {/* History Preview */}
        {generationHistory.length > 0 && (
          <View className="mb-6">
            <TouchableOpacity onPress={() => setIsResultsDrawerOpen(true)}>
              <Text className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Recent Results</Text>
            </TouchableOpacity>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                {generationHistory.slice(0, 5).map((item, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => {
                      setActivePreviewImage(item.url);
                      setIsResultsDrawerOpen(true);
                    }}
                    className="w-16 h-16 rounded-lg overflow-hidden border border-zinc-800"
                  >
                    <Image source={{ uri: item.url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Results Modal */}
      <Modal
        visible={isResultsDrawerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsResultsDrawerOpen(false)}
      >
        <SafeAreaView className="flex-1 bg-[#161B22]">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-zinc-800/50">
            <Text className="text-sm font-bold text-white uppercase tracking-widest">Results</Text>
            <TouchableOpacity onPress={() => setIsResultsDrawerOpen(false)}>
              <XMarkIcon size={20} color="#71717a" />
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1 p-4">
            {activePreviewImage && (
              <View className="aspect-square w-full rounded-2xl overflow-hidden bg-black border border-zinc-800 mb-4">
                <Image source={{ uri: activePreviewImage }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
              </View>
            )}

            {activePreviewImage && (
              <View className="flex-row gap-2 mb-6">
                <TouchableOpacity
                  onPress={handleDownload}
                  className="flex-1 h-12 bg-white rounded-xl flex-row items-center justify-center"
                >
                  <DownloadIcon size={16} color="#000000" />
                  <Text className="text-black font-bold uppercase text-[9px] tracking-widest ml-2">Save</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleUpscale}
                  disabled={isUpscaling}
                  className="w-12 h-12 bg-black/60 border border-white/10 rounded-xl items-center justify-center"
                >
                  {isUpscaling ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <ArrowsPointingOutIcon size={16} color="#ffffff" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleUseAsSource}
                  className="w-12 h-12 bg-black/60 border border-white/10 rounded-xl items-center justify-center"
                >
                  <RefreshIcon size={16} color="#ffffff" />
                </TouchableOpacity>
              </View>
            )}

            {generationHistory.length > 0 && (
              <View>
                <Text className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest mb-3">History</Text>
                <View className="flex-row flex-wrap gap-2">
                  {generationHistory.map((item, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setActivePreviewImage(item.url)}
                      className={`w-16 h-16 rounded-lg overflow-hidden border ${activePreviewImage === item.url ? 'border-indigo-500' : 'border-zinc-800'
                        }`}
                    >
                      <Image source={{ uri: item.url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* User Menu Modal */}
      <Modal
        visible={isUserMenuOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsUserMenuOpen(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/60"
          activeOpacity={1}
          onPress={() => setIsUserMenuOpen(false)}
        >
          <View className="absolute top-20 right-4 w-40 bg-[#161B22] border border-zinc-800 rounded-xl overflow-hidden">
            <TouchableOpacity
              onPress={() => {
                setIsUserMenuOpen(false);
                router.push('/settings');
              }}
              className="flex-row items-center p-3 border-b border-zinc-800"
            >
              <Text className="text-white text-[10px] font-bold uppercase tracking-widest">Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setIsUserMenuOpen(false);
                handleLogout();
              }}
              className="flex-row items-center p-3"
            >
              <Text className="text-red-400 text-[10px] font-bold uppercase tracking-widest">Sign Out</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
