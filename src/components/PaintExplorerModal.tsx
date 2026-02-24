import React, { useState, useEffect, useMemo, memo, useCallback } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    Modal,
    ActivityIndicator,
    StyleSheet,
    Dimensions,
    FlatList,
    ListRenderItem,
    TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { CloseCircleIcon } from './Icons';
import { PaletteColor, fetchAllPaints, fetchUserPaints } from '../services/paintService';
import { colors, borderRadius, spacing, fontFamily } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_WIDTH = (SCREEN_WIDTH - 48 - 12) / 2; // 24px padding each side, 12px gap




const PaintItem = memo(({ 
    color, 
    isSelected, 
    onToggle 
}: { 
    color: PaletteColor, 
    isSelected: boolean, 
    onToggle: (name: string, hex: string, finish?: string) => void 
}) => {
    const paintKey = color.id || `${color.brand}-${color.name}`;
    
    return (
        <TouchableOpacity
            key={paintKey}
            style={[styles.paintItem, isSelected && styles.paintItemSelected]}
            onPress={() => onToggle(color.name, color.hex || '#FFFFFF', color.finish)}
            activeOpacity={0.7}
        >
            <View
                style={[styles.paintSwatch, { backgroundColor: color.hex || '#D9D9D9' }]}
            />
            <View style={styles.paintInfo}>
                <Text style={styles.paintName} numberOfLines={1}>
                    {color.name || 'Unknown'}
                </Text>
                <Text style={styles.paintCode} numberOfLines={1}>
                    {color.code || color.hex || ''}
                </Text>
            </View>
        </TouchableOpacity>
    );
}, (prev, next) => {
    return prev.isSelected === next.isSelected && 
           prev.color.id === next.color.id && 
           prev.color.name === next.color.name;
});

interface PaintExplorerModalProps {
    visible: boolean;
    onClose: () => void;
    selectedBrands: string[];
    selectedColors: { name: string, hex: string, finish?: string }[];
    onToggleColor: (colorName: string, hexCode: string, finish?: string) => void;
    onPaintsLoaded?: (paints: PaletteColor[]) => void;
    triggerLoad?: boolean;
}

export const PaintExplorerModal: React.FC<PaintExplorerModalProps> = ({
    visible,
    onClose,
    selectedBrands,
    selectedColors,
    onToggleColor,
    onPaintsLoaded,
    triggerLoad = false,
}) => {
    const [dbColors, setDbColors] = useState<PaletteColor[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if ((visible || triggerLoad) && dbColors.length === 0) {
            const init = async () => {
                setIsLoading(true);
                try {
                    const [publicPaints, userPaints] = await Promise.all([
                        fetchAllPaints(),
                        fetchUserPaints(),
                    ]);

                    const allPaints = [...userPaints, ...publicPaints];
                    const uniquePaintsMap = new Map();

                    allPaints.forEach((p) => {
                        const key = p.id || `${p.brand}-${p.name}`;
                        if (!uniquePaintsMap.has(key)) {
                            uniquePaintsMap.set(key, p);
                        }
                    });

                    const uniqueList = Array.from(uniquePaintsMap.values());
                    setDbColors(uniqueList);
                } catch (e) {
                    console.error(e);
                } finally {
                    setIsLoading(false);
                }
            };
            init();
        }
    }, [visible, triggerLoad]);

    // Sync paints to parent whenever dbColors is populated
    useEffect(() => {
        if (dbColors.length > 0 && onPaintsLoaded) {
            onPaintsLoaded(dbColors);
        }
    }, [dbColors, onPaintsLoaded]);

    // 1. Filter by Brands (Heavy lifting, cached until brands change)
    const brandFilteredPaints = useMemo(() => {
        if (__DEV__) {
            // console.log('PaintExplorer: Available brands in database:', [...new Set(dbColors.map(c => c.brand?.trim()))]);
        }

        const normalizedSelectedBrands = selectedBrands.map(b => b.toLowerCase().trim());
        if (normalizedSelectedBrands.includes('all brands')) return dbColors; // Handle "All Brands" selection
        const hasSelection = normalizedSelectedBrands.length > 0;

        return dbColors.filter((c) => {
            // @ts-ignore
            const isUserPaint = c._isUserPaint === true;

            if (!hasSelection) return true;

            const includesMyPaints = normalizedSelectedBrands.includes('my collection');

            if (isUserPaint) {
                return includesMyPaints;
            }

            const paintBrand = (c.brand?.trim() || 'Unknown').toLowerCase();
            return normalizedSelectedBrands.some(selected => selected !== 'my collection' && paintBrand === selected);
        });
    }, [dbColors, selectedBrands]);

    // 2. Base Grouping (Grouped Brand Paints, Cached until brands change)
    const baseGroupedColors = useMemo(() => {
        return brandFilteredPaints.reduce((acc, color) => {
            const setName = color.set?.trim() || 'General';
            if (!acc[setName]) acc[setName] = [];
            acc[setName].push(color);
            return acc;
        }, {} as Record<string, PaletteColor[]>);
    }, [brandFilteredPaints]);

    // 3. Search & Grouping
    const groupedColors = useMemo(() => {
        if (!searchQuery.trim()) {
            return baseGroupedColors;
        }

        const query = searchQuery.toLowerCase().trim();
        // @ts-ignore
        const filteredPaints = brandFilteredPaints.filter(p => 
            p.name.toLowerCase().includes(query) || 
            p.hex.toLowerCase().includes(query) ||
            (p.brand && p.brand.toLowerCase().includes(query))
        );

        if (__DEV__) {
            // console.log(`PaintExplorer: Found ${filteredPaints.length} paints (filtered)`);
        }

        // Group by set/type
        return filteredPaints.reduce((acc, color) => {
            const setName = color.set?.trim() || 'General';
            if (!acc[setName]) acc[setName] = [];
            acc[setName].push(color);
            return acc;
        }, {} as Record<string, PaletteColor[]>);
    }, [baseGroupedColors, brandFilteredPaints, searchQuery]);

    const totalTones = useMemo(() => {
        return Object.values(groupedColors).reduce((acc, colors) => acc + colors.length, 0);
    }, [groupedColors]);

    // Memoize FlatList data to prevent unnecessary re-renders
    const flatListData = useMemo(() => Object.entries(groupedColors), [groupedColors]);

    const isColorSelected = useCallback((colorName: string) => selectedColors.some(c => c.name === colorName), [selectedColors]);

    const renderSection: ListRenderItem<[string, PaletteColor[]]> = useCallback(({ item: [setName, colors] }) => (
        <View style={styles.typeSection}>
            {/* Type Header */}
            <View style={styles.typeHeader}>
                <View style={styles.typeAccentBar} />
                <Text style={styles.typeName}>{setName.toUpperCase()}</Text>
                <Text style={styles.typeCount}>{colors.length} tones</Text>
            </View>

            {/* Paint Grid */}
            <View style={styles.paintGrid}>
                {colors.map((color, idx) => (
                    <PaintItem 
                        key={color.id || `${color.brand}-${color.name}-${idx}`}
                        color={color}
                        isSelected={isColorSelected(color.name)}
                        onToggle={onToggleColor}
                    />
                ))}
            </View>
        </View>
    ), [isColorSelected, onToggleColor]);

    return (
        <Modal
            visible={visible}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onClose}
        >
            <SafeAreaView style={styles.modalContainer} edges={['top']}>
                {/* Grabber */}
                <View style={styles.grabberContainer}>
                    <View style={styles.grabber} />
                </View>

                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Text style={styles.headerTitle}>PAINT EXPLORER</Text>
                        <View style={styles.headerSubtitleRow}>
                            <Text style={styles.brandName} numberOfLines={1}>
                                {selectedBrands.length > 0 ? selectedBrands.join(', ') : 'All Brands'}
                            </Text>
                            <Text style={styles.toneCount}>{totalTones} Tones</Text>
                        </View>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton} activeOpacity={0.7}>
                        {/* 
                          Using imported CloseCircleIcon. 
                          Ideally we should update its prop interface to match others if needed, 
                          but typically size/color are standard.
                        */}
                        <CloseCircleIcon size={24} color={colors.button.white} />
                    </TouchableOpacity>
                </View>

                {/* Content */}
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={colors.button.primary} />
                        <Text style={styles.loadingText}>Loading paints...</Text>
                    </View>
                ) : (
                    <FlatList
                        data={flatListData}
                        renderItem={renderSection}
                        keyExtractor={([setName]) => setName}
                        style={styles.content}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 40 }}
                        initialNumToRender={4}
                        maxToRenderPerBatch={4}
                        windowSize={5}
                        removeClippedSubviews={true} 
                        keyboardShouldPersistTaps="always"
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyTitle}>No paints found</Text>
                                <Text style={styles.emptySubtitle}>
                                    {selectedBrands.includes('My Collection') && selectedBrands.length === 1
                                        ? 'Download MiniPainterDB to track your paint collection.'
                                        : 'No paints available for these brands.'}
                                </Text>
                            </View>
                        }
                        ListHeaderComponent={
                            <View style={styles.searchContainer}>
                                <View style={styles.searchWrapper}>
                                    <TextInput
                                        style={styles.searchInput}
                                        placeholder="Search paints..."
                                        placeholderTextColor="#666"
                                        value={searchQuery}
                                        onChangeText={setSearchQuery}
                                        returnKeyType="search"
                                    />
                                    {searchQuery.length > 0 && (
                                        <TouchableOpacity 
                                            onPress={() => setSearchQuery('')}
                                            style={styles.clearSearchButton}
                                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        >
                                            <CloseCircleIcon size={20} color="#999" />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        }
                    />
                )}
            </SafeAreaView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        backgroundColor: colors.background.secondary,
    },
    grabberContainer: {
        width: '100%',
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    grabber: {
        width: 36,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: colors.overlay.medium,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    headerLeft: {
        flex: 1,
    },
    headerTitle: {
        fontFamily: fontFamily.primary,
        fontWeight: '700',
        fontSize: 20,
        color: colors.button.white,
        letterSpacing: -0.41,
    },
    headerSubtitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    searchContainer: {
        paddingHorizontal: 24,
        paddingBottom: 16,
    },
    searchWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.overlay.soft,
        borderRadius: 8,
        paddingRight: 10,
    },
    searchInput: {
        flex: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
        fontSize: 16,
        color: colors.button.white,
        fontFamily: fontFamily.primary,
    },
    clearSearchButton: {
        padding: 4,
    },
    brandName: {
        fontFamily: fontFamily.primary,
        fontWeight: '600',
        fontSize: 14,
        color: colors.button.white,
    },
    toneCount: {
        fontFamily: fontFamily.primary,
        fontWeight: '400',
        fontSize: 14,
        color: colors.text.secondary,
        marginLeft: 8,
    },
    closeButton: {
        padding: 4,
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
    },
    loadingContainer: {
        paddingVertical: 60,
        alignItems: 'center',
        gap: 16,
    },
    loadingText: {
        fontFamily: fontFamily.primary,
        fontWeight: '400',
        fontSize: 14,
        color: colors.text.secondary,
    },
    emptyContainer: {
        paddingVertical: 60,
        alignItems: 'center',
        gap: 8,
    },
    emptyTitle: {
        fontFamily: fontFamily.primary,
        fontWeight: '600',
        fontSize: 16,
        color: colors.button.white,
    },
    emptySubtitle: {
        fontFamily: fontFamily.primary,
        fontWeight: '400',
        fontSize: 14,
        color: colors.text.secondary,
        textAlign: 'center',
        paddingHorizontal: 24,
    },
    typeSection: {
        marginBottom: 24,
    },
    typeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    typeAccentBar: {
        width: 3,
        height: 16,
        backgroundColor: colors.button.primary,
        borderRadius: 1.5,
        marginRight: 8,
    },
    typeName: {
        flex: 1,
        fontFamily: fontFamily.primary,
        fontWeight: '600',
        fontSize: 13,
        color: colors.text.secondary,
        letterSpacing: 0.5,
    },
    typeCount: {
        fontFamily: fontFamily.primary,
        fontWeight: '400',
        fontSize: 13,
        color: colors.text.secondary,
    },
    paintGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    paintItem: {
        width: ITEM_WIDTH,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 12,
        backgroundColor: colors.overlay.dark,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    paintItemSelected: {
        borderColor: colors.button.primary,
    },
    paintSwatch: {
        width: 24,
        height: 24,
        borderRadius: 6,
    },
    paintInfo: {
        flex: 1,
        gap: 2,
    },
    paintName: {
        fontFamily: fontFamily.primary,
        fontWeight: '700',
        fontSize: 14,
        color: colors.button.white,
        lineHeight: 14,
    },
    paintCode: {
        fontFamily: fontFamily.primary,
        fontWeight: '600',
        fontSize: 13,
        color: colors.text.secondary,
        lineHeight: 13,
    },
});

export default PaintExplorerModal;
