import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { colors, fontFamily } from '@/theme';
import { generatePaintPrompt, PromptParams } from '@/utils/promptGenerator';
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
    effectsList: Record<string, any> 
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

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { marginBottom: 24 },
    title: { fontSize: 24, fontWeight: 'bold', color: colors.admin.text },
    subtitle: { fontSize: 14, color: colors.admin.textSecondary, marginTop: 4 },
    content: { flex: 1, flexDirection: 'row', gap: 20 },
    scenarioList: { width: 300, borderRightWidth: 1, borderRightColor: colors.admin.border, paddingRight: 20 },
    scenarioItem: { padding: 12, borderRadius: 6, marginBottom: 8, backgroundColor: colors.admin.card, borderWidth: 1, borderColor: colors.admin.border },
    scenarioItemActive: { backgroundColor: colors.admin.active, borderColor: colors.admin.active },
    scenarioName: { fontSize: 13, color: colors.admin.text, fontWeight: '500' },
    scenarioNameActive: { color: colors.palette.white },
    outputArea: { flex: 1, backgroundColor: colors.admin.card, borderRadius: 8, borderWidth: 1, borderColor: colors.admin.border, overflow: 'hidden' },
    outputContainer: { flex: 1 },
    outputHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.admin.border, backgroundColor: colors.admin.background },
    outputTitle: { fontSize: 14, fontWeight: 'bold', color: colors.admin.text, flex: 1 },
    copyButton: { backgroundColor: colors.admin.active, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 4 },
    copyButtonText: { color: colors.palette.white, fontSize: 12, fontWeight: 'bold' },
    outputScroll: { flex: 1, padding: 16 },
    outputText: { fontFamily: 'monospace', fontSize: 12, color: colors.admin.textCode, lineHeight: 18 },
    placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    placeholderText: { color: colors.admin.textSecondary, fontSize: 16 }
});
