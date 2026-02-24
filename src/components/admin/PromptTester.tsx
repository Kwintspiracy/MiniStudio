import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { colors, fontFamily } from '@/theme';
import { generatePaintPrompt, PromptParams, PromptEffect } from '@/utils/promptGenerator';
import { StyleOption } from '@/types';
import { PaletteColor } from '@/services/paintService';

interface Scenario {
    id: number;
    name: string;
    params: Partial<PromptParams>;
}

export const PromptTester = ({
    stylesList,
    effectsList
}: {
    stylesList: StyleOption[],
    effectsList: Record<string, PromptEffect>
}) => {
    const [selectedScenario, setSelectedScenario] = useState<number | null>(null);

    // Dummy data for testing
    const dummyPaints: PaletteColor[] = [
        { id: '1', name: 'Cadian Fleshtone', hex: '#C87654', brand: 'Citadel', set: 'Base', hue: 0, saturation: 0, lightness: 0, finish: 'Matte', code: 'C-1', is_discontinued: false, r: 0, g: 0, b: 0 },
        { id: '2', name: 'Abaddon Black', hex: '#000000', brand: 'Citadel', set: 'Base', hue: 0, saturation: 0, lightness: 0, finish: 'Matte', code: 'C-2', is_discontinued: false, r: 0, g: 0, b: 0 },
        { id: '3', name: 'Leadbelcher', hex: '#888888', brand: 'Citadel', set: 'Base', hue: 0, saturation: 0, lightness: 0, finish: 'Metallic', code: 'C-3', is_discontinued: false, r: 0, g: 0, b: 0 },
        { id: '4', name: 'Retributor Armour', hex: '#D4AF37', brand: 'Citadel', set: 'Base', hue: 0, saturation: 0, lightness: 0, finish: 'Metallic', code: 'C-4', is_discontinued: false, r: 0, g: 0, b: 0 },
    ];

    const dummyColors = [
        { name: 'Mephiston Red', hex: '#9A1115', finish: 'Matte' },
        { name: 'Evil Sunz Scarlet', hex: '#C42126', finish: 'Matte' }
    ];

    const scenarios: Scenario[] = [
        {
            id: 1,
            name: "BASE Mode | All Brands | No Effects",
            params: {
                isPro: false,
                selectedBrands: ['All Brands'],
                isPaletteEnabled: true,
                isNMMEnabled: false,
                isOSLEnabled: false,
                isPhotoshootEnabled: false
            }
        },
        {
            id: 2,
            name: "BASE Mode | Custom Palette | No Effects",
            params: {
                isPro: false,
                selectedColors: dummyColors,
                isPaletteEnabled: true,
                isNMMEnabled: false,
                isOSLEnabled: false,
                isPhotoshootEnabled: false
            }
        },
        {
            id: 3,
            name: "PRO Mode | All Brands | All Effects",
            params: {
                isPro: true,
                selectedBrands: ['All Brands'],
                isPaletteEnabled: true,
                isNMMEnabled: true,
                isOSLEnabled: true,
                isPhotoshootEnabled: true
            }
        },
        {
            id: 4,
            name: "BASE Mode | NMM Mixed (Metallic colors selected)",
            params: {
                isPro: false,
                selectedColors: [...dummyColors, { name: 'Leadbelcher', hex: '#888888', finish: 'Metallic' }],
                isPaletteEnabled: true,
                isNMMEnabled: true,
                isOSLEnabled: false,
                isPhotoshootEnabled: false
            }
        },
        {
            id: 5,
            name: "BASE Mode | Specific Brand (Citadel)",
            params: {
                isPro: false,
                selectedBrands: ['Citadel'],
                isPaletteEnabled: true,
                isNMMEnabled: false,
                isOSLEnabled: false,
                isPhotoshootEnabled: false
            }
        },
        {
            id: 6,
            name: "BASE Mode | Critical Rules Test",
            params: {
                isPro: false,
                selectedBrands: ['Citadel'],
                isPaletteEnabled: true,
                criticalRules: "1. No bright colors\n2. Must look grimdark"
            }
        }
    ];

    // More scenarios can be added here or generated dynamically

    const results = useMemo(() => {
        return scenarios.map(s => {
            const fullParams: PromptParams = {
                isPro: false,
                selectedStyle: stylesList[0] || { id: 'default', name: 'Default', prompt: 'Paint this miniature' },
                isPaletteEnabled: false,
                selectedBrands: [],
                loadedPaints: dummyPaints,
                selectedColors: [],
                isNMMEnabled: false,
                isOSLEnabled: false,
                isPhotoshootEnabled: false,
                effectPrompts: effectsList,
                painterPrompt: '',
                ...s.params
            };
            return {
                ...s,
                output: generatePaintPrompt(fullParams)
            };
        });
    }, [stylesList, effectsList]);

    const handleShare = (text: string) => {
        Share.share({ message: text });
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>Prompt Scenario Tester</Text>
                <Text style={styles.subtitle}>Test how various combinations of settings generate the final prompt</Text>
            </View>

            <View style={styles.content}>
                <View style={styles.scenarioList}>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        {results.map((r, index) => (
                            <TouchableOpacity 
                                key={r.id} 
                                style={[styles.scenarioItem, selectedScenario === index && styles.scenarioItemActive]}
                                onPress={() => setSelectedScenario(index)}
                            >
                                <Text style={[styles.scenarioName, selectedScenario === index && styles.scenarioNameActive]}>
                                    {r.name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                <View style={styles.outputArea}>
                    {selectedScenario !== null ? (
                        <View style={styles.outputContainer}>
                            <View style={styles.outputHeader}>
                                <Text style={styles.outputTitle}>{results[selectedScenario].name}</Text>
                                <TouchableOpacity 
                                    style={styles.copyButton}
                                    onPress={() => handleShare(results[selectedScenario].output)}
                                >
                                    <Text style={styles.copyButtonText}>Copy/Share</Text>
                                </TouchableOpacity>
                            </View>
                            <ScrollView style={styles.outputScroll}>
                                <Text style={styles.outputText}>{results[selectedScenario].output}</Text>
                            </ScrollView>
                        </View>
                    ) : (
                        <View style={styles.placeholder}>
                            <Text style={styles.placeholderText}>Select a scenario to view the prompt</Text>
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
};

const GH_COLORS = {
    canvas: '#0D1117',
    sidebar: '#010409',
    border: '#30363D',
    textPrimary: '#C9D1D9',
    textSecondary: '#8B949E',
    accent: '#58A6FF',
    success: '#238636',
    danger: '#F85149',
    card: '#0D1117',
    itemHover: '#161B22',
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: GH_COLORS.canvas },
    header: { marginBottom: 24 },
    title: { fontSize: 20, fontWeight: '600', color: GH_COLORS.textPrimary },
    subtitle: { fontSize: 13, color: GH_COLORS.textSecondary, marginTop: 4 },
    content: { flex: 1, flexDirection: 'row', gap: 0, borderWidth: 1, borderColor: GH_COLORS.border, borderRadius: 6, overflow: 'hidden' },
    scenarioList: { width: 300, backgroundColor: '#161b22', borderRightWidth: 1, borderRightColor: GH_COLORS.border },
    scenarioItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: GH_COLORS.border },
    scenarioItemActive: { backgroundColor: GH_COLORS.canvas, borderLeftWidth: 4, borderLeftColor: GH_COLORS.accent },
    scenarioName: { fontSize: 13, color: GH_COLORS.textPrimary, fontWeight: '500' },
    scenarioNameActive: { color: GH_COLORS.accent, fontWeight: '600' },
    outputArea: { flex: 1, backgroundColor: GH_COLORS.canvas },
    outputContainer: { flex: 1 },
    outputHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: GH_COLORS.border, backgroundColor: '#161b22' },
    outputTitle: { fontSize: 13, fontWeight: '600', color: GH_COLORS.textPrimary, flex: 1 },
    copyButton: { backgroundColor: '#21262d', borderWidth: 1, borderColor: GH_COLORS.border, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6 },
    copyButtonText: { color: GH_COLORS.accent, fontSize: 12, fontWeight: '600' },
    outputScroll: { flex: 1, padding: 16 },
    outputText: { fontFamily: 'monospace', fontSize: 13, color: GH_COLORS.textPrimary, lineHeight: 20 },
    placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
    placeholderText: { color: GH_COLORS.textSecondary, fontSize: 14, textAlign: 'center' }
});
