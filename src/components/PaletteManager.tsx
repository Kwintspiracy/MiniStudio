import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { PaletteColor, fetchAllPaints, fetchUserPaints } from '../services/paintService';
import { SwatchIcon, AdjustmentsIcon, CheckIcon, XMarkIcon } from './Icons';

interface PaletteManagerProps {
    isEnabled: boolean;
    onToggleEnabled: (val: boolean) => void;
    selectedBrands: string[];
    onToggleBrand: (brand: string) => void;
    selectedColors: string[];
    onToggleColor: (color: string) => void;
    onClearColors: () => void;
    onPaintsLoaded?: (paints: PaletteColor[]) => void;
}

export const PaletteManager: React.FC<PaletteManagerProps> = ({
    isEnabled, onToggleEnabled, selectedBrands, onToggleBrand, selectedColors, onToggleColor, onClearColors, onPaintsLoaded
}) => {
    const [dbColors, setDbColors] = useState<PaletteColor[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isExplorerOpen, setIsExplorerOpen] = useState(false);

    useEffect(() => {
        // Only fetch if enabled and not already fetched
        if (isEnabled && dbColors.length === 0) {
            const init = async () => {
                setIsLoading(true);
                try {
                    // Fetch both public and user paints
                    const [publicPaints, userPaints] = await Promise.all([
                        fetchAllPaints(),
                        fetchUserPaints()
                    ]);

                    console.log(`PaletteManager: Loaded ${publicPaints.length} public, ${userPaints.length} user paints.`);

                    // Merge and deduplicate by ID
                    // IMPORTANT: Put userPaints FIRST so they take precedence in the Map (preserving the _isUserPaint tag)
                    const allPaints = [...userPaints, ...publicPaints];
                    const uniquePaintsMap = new Map();

                    allPaints.forEach(p => {
                        // If explicit ID exists, use it. Otherwise fallback to name+brand combination
                        // Prefer the user version (later in array) if it overrides? 
                        // Actually, if it's the same paint, we just want one instance.
                        const key = p.id || `${p.brand}-${p.name}`;
                        if (!uniquePaintsMap.has(key)) {
                            uniquePaintsMap.set(key, p);
                        }
                    });

                    const uniqueList = Array.from(uniquePaintsMap.values());
                    setDbColors(uniqueList);
                    if (onPaintsLoaded) onPaintsLoaded(uniqueList);
                } catch (e) {
                    console.error(e);
                } finally {
                    setIsLoading(false);
                }
            };
            init();
        }
    }, [isEnabled]);

    const availableBrands = useMemo(() => {
        const brands = new Set<string>();
        dbColors.forEach(c => {
            // @ts-ignore
            const isUserPaint = c._isUserPaint === true;
            const b = isUserPaint ? "User Library" : (c.brand ? c.brand.trim() : "User Library");
            brands.add(b);
        });
        const brandList = Array.from(brands).sort();

        // Remove 'User Library' if it exists in the sorted list, then prepend it
        const filtered = brandList.filter(b => b !== "User Library");
        return ["User Library", ...filtered];
    }, [dbColors]);

    const groupedColors = useMemo(() => {
        const groups = dbColors.reduce((acc, color) => {
            // Check for user paint tag (added by paintService)
            // @ts-ignore
            const isUserPaint = color._isUserPaint === true;

            const b = isUserPaint ? "User Library" : (color.brand?.trim() || "User Library");
            const s = color.set?.trim() || "General";
            if (!acc[b]) acc[b] = {};
            if (!acc[b][s]) acc[b][s] = [];
            acc[b][s].push(color);
            return acc;
        }, {} as Record<string, Record<string, PaletteColor[]>>);

        // Ensure User Library group exists even if empty
        if (!groups["User Library"]) {
            groups["User Library"] = {};
        }

        return groups;
    }, [dbColors]);

    return (
        <View className="space-y-4">
            {/* Header / Toggle */}
            <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-2">
                    <AdjustmentsIcon size={16} color="#71717a" />
                    <Text className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Color Palettes</Text>
                </View>
                <TouchableOpacity
                    onPress={() => onToggleEnabled(!isEnabled)}
                    className={`w-9 h-5 rounded-full justify-center ${isEnabled ? 'bg-indigo-600' : 'bg-zinc-800'}`}
                >
                    <View className={`bg-white w-3 h-3 rounded-full absolute ${isEnabled ? 'right-1' : 'left-1'}`} />
                </TouchableOpacity>
            </View>

            {isEnabled && (
                <View className="bg-black/40 rounded-2xl border border-zinc-800/50 p-4 space-y-4">
                    {/* Brand Selection */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2 mb-4">
                        {isLoading ? (
                            <ActivityIndicator size="small" color="#71717a" />
                        ) : availableBrands.length > 0 ? (
                            availableBrands.map(brand => (
                                <TouchableOpacity
                                    key={brand}
                                    onPress={() => onToggleBrand(brand)}
                                    className={`px-3 py-2 rounded-lg border transition-all mr-2 ${selectedBrands.includes(brand) ? 'bg-indigo-600 border-indigo-500' : 'bg-zinc-900/50 border-zinc-800'
                                        }`}
                                >
                                    <Text className={`text-[8px] font-black uppercase tracking-widest ${selectedBrands.includes(brand) ? 'text-white' : 'text-zinc-500'
                                        }`}>
                                        {brand}
                                    </Text>
                                </TouchableOpacity>
                            ))
                        ) : (
                            <Text className="text-zinc-600 text-[9px] uppercase tracking-widest">Loading database...</Text>
                        )}

                    </ScrollView>

                    {/* Open Explorer Button */}
                    <TouchableOpacity
                        onPress={() => setIsExplorerOpen(true)}
                        className="w-full py-3 bg-white hover:bg-zinc-200 rounded-xl flex-row items-center justify-center gap-2"
                    >
                        <SwatchIcon size={14} color="#000" />
                        <Text className="text-[9px] font-black uppercase tracking-widest text-black">Open Paint Explorer</Text>
                    </TouchableOpacity>

                    {/* Selected Colors Preview */}
                    {selectedColors.length > 0 && (
                        <View className="flex-row flex-wrap gap-1.5 mt-2">
                            {selectedColors.map(name => {
                                const c = dbColors.find(x => x.name === name);
                                return (
                                    <View key={name} className="flex-row items-center gap-2 bg-zinc-900 border border-zinc-800 pl-2 pr-1.5 py-1.5 rounded-lg">
                                        <View className="w-2.5 h-2.5 rounded-sm border border-white/10" style={{ backgroundColor: c?.hex || '#fff' }} />
                                        <Text className="text-[9px] font-bold text-zinc-300 uppercase tracking-tighter truncate max-w-[100px]">
                                            {name}
                                        </Text>
                                        <TouchableOpacity onPress={() => onToggleColor(name)} className="w-4 h-4 items-center justify-center bg-zinc-800 rounded">
                                            <Text className="text-zinc-400 text-[10px] font-bold">×</Text>
                                        </TouchableOpacity>
                                    </View>
                                );
                            })}
                            <TouchableOpacity onPress={onClearColors} className="ml-1 justify-center">
                                <Text className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Clear All</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            )}

            {/* Explorer Modal */}
            <Modal visible={isExplorerOpen} animationType="slide" transparent={true} onRequestClose={() => setIsExplorerOpen(false)}>
                <View className="flex-1 bg-black/90 justify-center items-center p-4">
                    <View className="bg-[#0D1117] border border-zinc-800 rounded-3xl w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden">
                        <View className="flex-row justify-between items-center p-6 border-b border-zinc-800">
                            <View>
                                <Text className="text-xl font-black text-white uppercase italic tracking-tighter">Paint Explorer</Text>
                                <Text className="text-[8px] text-zinc-600 font-black uppercase tracking-widest mt-1">Database • {dbColors.length} Tones</Text>
                            </View>
                            <TouchableOpacity onPress={() => setIsExplorerOpen(false)} className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 items-center justify-center">
                                <XMarkIcon size={20} color="#a1a1aa" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView className="flex-1 p-6">
                            {isLoading ? (
                                <View className="py-20 items-center">
                                    <Text className="text-zinc-700 uppercase font-black text-[10px] tracking-[0.4em]">Syncing Database...</Text>
                                </View>
                            ) : (
                                Object.entries(groupedColors)
                                    .filter(([brand]) => selectedBrands.length === 0 || selectedBrands.includes(brand))
                                    .map(([brand, sets]) => {
                                        const hasPaints = Object.keys(sets).length > 0;
                                        if (brand === "User Library") {
                                            console.log("Rendering User Library. Has Paints:", hasPaints);
                                            console.log("Sets:", Object.keys(sets));
                                            Object.keys(sets).forEach(s => console.log(`Set ${s} count:`, sets[s].length));
                                        }

                                        return (
                                            <View key={brand} className="mb-6">
                                                <Text className="text-sm font-black text-white pl-4 border-l-4 border-indigo-600 mb-6 uppercase italic tracking-widest">{brand}</Text>

                                                {!hasPaints && brand === "User Library" ? (
                                                    <View className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6 items-center">
                                                        <Text className="text-zinc-400 text-xs font-bold mb-2">Build Your Collection</Text>
                                                        <Text className="text-zinc-600 text-[10px] text-center mb-4">
                                                            Download the MiniPainterDB app to track your paint collection and sync it here nicely.
                                                        </Text>
                                                        {/* 
                                                        <TouchableOpacity className="bg-indigo-600 px-4 py-2 rounded-lg">
                                                            <Text className="text-white text-[10px] font-bold uppercase">Get MiniPainterDB</Text>
                                                        </TouchableOpacity> 
                                                        */}
                                                    </View>
                                                ) : (
                                                    Object.entries(sets).map(([setName, colors]) => (
                                                        <View key={setName} className="mb-8 pl-5">
                                                            <Text className="text-[9px] uppercase tracking-[0.2em] text-zinc-600 font-black mb-4 italic opacity-60">{setName}</Text>
                                                            <View className="flex-row flex-wrap gap-3">
                                                                {colors.map((c, idx) => {
                                                                    // Debug log for render
                                                                    if (brand === "User Library") console.log("Rendering Color Item:", c.name, c.hex);
                                                                    return (
                                                                        <TouchableOpacity
                                                                            key={c.id || `${c.brand}-${c.name}-${idx}`}
                                                                            onPress={() => onToggleColor(c.name)}
                                                                            className={`flex-row items-center gap-3 p-3 rounded-xl border w-[48%] ${selectedColors.includes(c.name) ? 'bg-indigo-600/10 border-indigo-500/50' : 'bg-zinc-900/40 border-zinc-800'}`}
                                                                        >
                                                                            <View className="w-5 h-5 rounded-md border border-white/10" style={{ backgroundColor: c.hex }} />
                                                                            <View className="flex-1">
                                                                                <Text className={`text-[10px] font-black uppercase tracking-tighter truncate ${selectedColors.includes(c.name) ? 'text-white' : 'text-zinc-400'}`}>
                                                                                    {c.name || "Unknown Name"}
                                                                                </Text>
                                                                                {c.code && <Text className="text-[7px] text-zinc-600 font-bold uppercase">{c.code}</Text>}
                                                                            </View>
                                                                            {selectedColors.includes(c.name) && <CheckIcon size={12} color="#6366f1" />}
                                                                        </TouchableOpacity>
                                                                    );
                                                                })}
                                                            </View>
                                                        </View>
                                                    ))
                                                )}
                                            </View>
                                        );
                                    })
                            )}
                        </ScrollView>

                        <View className="p-6 border-t border-zinc-800 bg-black/20 flex-row justify-between items-center">
                            <Text className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">{selectedColors.length} tones selected</Text>
                            <TouchableOpacity onPress={() => setIsExplorerOpen(false)} className="bg-indigo-600 px-8 py-3 rounded-xl">
                                <Text className="text-white font-black uppercase tracking-widest text-[10px]">Apply Selection</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};
