import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    Modal,
    ActivityIndicator,
    StyleSheet,
    Platform,
    Dimensions,
    FlatList,
    ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { CloseCircleIcon } from './Icons';
import { PaletteColor, fetchAllPaints, fetchUserPaints } from '../services/paintService';
import { colors, borderRadius, spacing } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ITEM_WIDTH = (SCREEN_WIDTH - 48 - 12) / 2; // 24px padding each side, 12px gap



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
                    if (onPaintsLoaded) {
                        onPaintsLoaded(uniqueList);
                    }
                } catch (e) {
                    console.error(e);
                } finally {
                    setIsLoading(false);
                }
            };
            init();
        }
    }, [visible, triggerLoad]);

    // Group colors by brand and type/set
    const groupedColors = useMemo(() => {
        // Debug: log unique brands in database
        if (__DEV__) {
            const uniqueBrands = [...new Set(dbColors.map(c => c.brand?.trim()))];
            console.log('PaintExplorer: Available brands in database:', uniqueBrands);
            console.log('PaintExplorer: Selected brands:', selectedBrands);
        }

        const normalizedSelectedBrands = selectedBrands.map(b => b.toLowerCase().trim());
        const hasSelection = normalizedSelectedBrands.length > 0;

        const brandPaints = dbColors.filter((c) => {
            // @ts-ignore
            const isUserPaint = c._isUserPaint === true;

            if (!hasSelection) return true;

            const includesMyPaints = normalizedSelectedBrands.includes('my paints');

            if (isUserPaint) {
                return includesMyPaints;
            }

            const paintBrand = (c.brand?.trim() || 'Unknown').toLowerCase();

            // Check if the paint's brand matches any selected brand
            // Only compare against non-"My Paints" selections since we already handled user paints
            return normalizedSelectedBrands.some(selected => selected !== 'my paints' && paintBrand === selected);
        });

        if (__DEV__) {
            console.log(`PaintExplorer: Found ${brandPaints.length} paints for brands "${selectedBrands.join(', ')}"`);
        }

        // Group by set/type
        const groups = brandPaints.reduce((acc, color) => {
            const setName = color.set?.trim() || 'General';
            if (!acc[setName]) acc[setName] = [];
            acc[setName].push(color);
            return acc;
        }, {} as Record<string, PaletteColor[]>);

        return groups;
    }, [dbColors, selectedBrands]);

    const totalTones = useMemo(() => {
        return Object.values(groupedColors).reduce((acc, colors) => acc + colors.length, 0);
    }, [groupedColors]);

    const isColorSelected = (colorName: string) => selectedColors.some(c => c.name === colorName);

    const renderSection: ListRenderItem<[string, PaletteColor[]]> = ({ item: [setName, colors] }) => (
        <View style={styles.typeSection}>
            {/* Type Header */}
            <View style={styles.typeHeader}>
                <View style={styles.typeAccentBar} />
                <Text style={styles.typeName}>{setName.toUpperCase()}</Text>
                <Text style={styles.typeCount}>{colors.length} tones</Text>
            </View>

            {/* Paint Grid */}
            <View style={styles.paintGrid}>
                {colors.map((color, idx) => {
                    // Use a stable key combinator as paint ids might not be unique across public/user paints
                    const paintKey = color.id || `${color.brand}-${color.name}-${idx}`;
                    const selected = isColorSelected(color.name);
                    return (
                        <TouchableOpacity
                            key={paintKey}
                            style={[styles.paintItem, selected && styles.paintItemSelected]}
                            onPress={() => onToggleColor(color.name, color.hex || '#FFFFFF', color.finish)}
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
                })}
            </View>
        </View>
    );

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
                        <CloseCircleIcon size={24} color="#F4F4F4" />
                    </TouchableOpacity>
                </View>

                {/* Content */}
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#0058DB" />
                        <Text style={styles.loadingText}>Loading paints...</Text>
                    </View>
                ) : Object.keys(groupedColors).length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyTitle}>No paints found</Text>
                        <Text style={styles.emptySubtitle}>
                            {selectedBrands.includes('My Paints') && selectedBrands.length === 1
                                ? 'Download MiniPainterDB to track your paint collection.'
                                : 'No paints available for these brands.'}
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        data={Object.entries(groupedColors)}
                        renderItem={renderSection}
                        keyExtractor={([setName]) => setName}
                        style={styles.content}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 40 }}
                    />
                )}
            </SafeAreaView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        backgroundColor: '#12121F',
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
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
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
        fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
        fontWeight: '700',
        fontSize: 20,
        color: '#F4F4F4',
        letterSpacing: -0.41,
    },
    headerSubtitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    brandName: {
        fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
        fontWeight: '600',
        fontSize: 14,
        color: '#F4F4F4',
    },
    toneCount: {
        fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
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
        fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
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
        fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
        fontWeight: '600',
        fontSize: 16,
        color: '#F4F4F4',
    },
    emptySubtitle: {
        fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
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
        backgroundColor: '#0058DB',
        borderRadius: 1.5,
        marginRight: 8,
    },
    typeName: {
        flex: 1,
        fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
        fontWeight: '600',
        fontSize: 13,
        color: colors.text.secondary,
        letterSpacing: 0.5,
    },
    typeCount: {
        fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
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
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        borderRadius: 8,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    paintItemSelected: {
        borderColor: '#0058DB',
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
        fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
        fontWeight: '700',
        fontSize: 14,
        color: '#F4F4F4',
        lineHeight: 14,
    },
    paintCode: {
        fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
        fontWeight: '600',
        fontSize: 13,
        color: colors.text.secondary,
        lineHeight: 13,
    },
});

export default PaintExplorerModal;
