import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions, Modal } from 'react-native';
import { SparklesIcon } from './Icons';
import { useHaptics } from '../hooks/useHaptics';

export type TutorialStep = 
    | 'checking'
    | 'idle' 
    | 'welcome' 
    | 'open_gallery' 
    | 'select_demo_image' 
    | 'confirm_source' 
    | 'select_style_craftworld' 
    | 'enable_palette'
    | 'select_brand_vallejo' 
    | 'toggle_pro' 
    | 'generate' 
    | 'finished';

interface OnboardingOverlayProps {
    step: TutorialStep;
    onNext: () => void;
    targetLayout?: { x: number; y: number; width: number; height: number } | null;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const OnboardingOverlay = ({ step, onNext, targetLayout }: OnboardingOverlayProps) => {
    const { trigger } = useHaptics();
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (step !== 'idle' && step !== 'finished' && step !== 'checking') {
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }).start();
        } else {
            fadeAnim.setValue(0);
        }
    }, [step]);

    if (step === 'idle' || step === 'finished' || step === 'checking') return null;

    // --- Step 1: Welcome Modal ---
    if (step === 'welcome') {
        return (
            <View style={[styles.interactiveOverlay, styles.overlay]}>
                <View style={styles.card}>
                    <View style={[styles.iconContainer, { backgroundColor: 'rgba(99, 102, 241, 0.2)' }]}>
                        <SparklesIcon size={32} color="#818cf8" />
                    </View>
                    <Text style={styles.title}>Welcome to MiniStudio</Text>
                    <Text style={styles.description}>
                        Let's create your first miniature! Follow the guide to generate stunning concept art.
                    </Text>
                    <TouchableOpacity
                        onPress={() => {
                            trigger('medium');
                            onNext();
                        }}
                        style={styles.button}
                        activeOpacity={0.9}
                    >
                        <Text style={styles.buttonText}>Let's Go</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // --- Interactive Tooltips with Blocking Spotlight ---
    
    // Fallback if no layout yet (show nothing or a full blocker? Let's show nothing to avoid blocking prematurely)
    if (!targetLayout) return null;

    let tooltipText = "";
    switch (step) {
        case 'open_gallery': tooltipText = "Start here! Tap the Gallery button below."; break;
        case 'select_demo_image': tooltipText = "Pick this demo image to try out."; break;
        case 'confirm_source': tooltipText = "Great choice! Now use it as your source."; break;
        case 'select_style_craftworld': tooltipText = "Select the 'Craftworld Studio' style."; break;
        case 'enable_palette': tooltipText = "Enable Custom Palette to choose brands."; break;
        case 'select_brand_vallejo': tooltipText = "Choose 'Vallejo' paints."; break;
        case 'toggle_pro': tooltipText = "Switch to Pro mode for high quality result."; break;
        case 'generate': tooltipText = "Ready? Tap here to create!"; break;
    }

    // Calculate Spotlight Rectangles
    const { x, y, width, height } = targetLayout;
    // Add some padding to the hole so it's not too tight
    const PADDING = 8; 
    const holeX = x - PADDING;
    const holeY = y - PADDING;
    const holeW = width + (PADDING * 2);
    const holeH = height + (PADDING * 2);

    const overlayColor = 'rgba(0,0,0,0.5)'; // Lighter overlay

    // Top, Bottom, Left, Right blockers
    const topStyle = { top: 0, left: 0, right: 0, height: holeY, backgroundColor: overlayColor, position: 'absolute' as const };
    const bottomStyle = { top: holeY + holeH, left: 0, right: 0, bottom: 0, backgroundColor: overlayColor, position: 'absolute' as const };
    const leftStyle = { top: holeY, left: 0, width: holeX, height: holeH, backgroundColor: overlayColor, position: 'absolute' as const };
    const rightStyle = { top: holeY, left: holeX + holeW, right: 0, height: holeH, backgroundColor: overlayColor, position: 'absolute' as const };


    // Calculate Tooltip Position
    const isAbove = y > 200;
    const tooltipY = isAbove 
        ? y - 120 
        : y + height + 20;

    let tooltipX = x + (width / 2) - 140; 
    tooltipX = Math.max(16, Math.min(tooltipX, SCREEN_WIDTH - 280 - 16));

    const arrowX = x + (width / 2) - tooltipX - 10;

    return (
        <View style={styles.interactiveOverlay} pointerEvents="box-none">
            {/* Blocking Views */}
            <View style={topStyle} pointerEvents="auto" />
            <View style={bottomStyle} pointerEvents="auto" />
            <View style={leftStyle} pointerEvents="auto" />
            <View style={rightStyle} pointerEvents="auto" />

            {/* Tooltip */}
            <Animated.View 
                style={[
                    styles.tooltipContainer, 
                    { 
                        top: tooltipY, 
                        left: tooltipX,
                        opacity: fadeAnim 
                    }
                ]}
            >
                <Text style={styles.tooltipText}>{tooltipText}</Text>
                
                {/* Arrow */}
                <View style={[
                    styles.arrow, 
                    isAbove ? styles.arrowDown : styles.arrowUp,
                    { left: arrowX }
                ]} />
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    interactiveOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 9999, // Ensure it's on top
        elevation: 9999,
    },
    card: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: '#161B22',
        borderWidth: 1,
        borderColor: '#3F3F46',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 8,
        textAlign: 'center',
    },
    description: {
        color: '#A1A1AA',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 24,
    },
    button: {
        width: '100%',
        height: 48,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonText: {
        color: '#000000',
        fontWeight: 'bold',
        fontSize: 16,
    },
    // Tooltip
    tooltipContainer: {
        position: 'absolute',
        width: 280,
        backgroundColor: '#6366f1', // Indigo-500
        padding: 16,
        borderRadius: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
        zIndex: 10000,
    },
    tooltipText: {
        color: 'white',
        fontWeight: '700',
        fontSize: 16,
        textAlign: 'center',
    },
    arrow: {
        position: 'absolute',
        width: 0,
        height: 0,
        borderLeftWidth: 10,
        borderRightWidth: 10,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
    },
    arrowDown: {
        bottom: -10,
        borderTopWidth: 10,
        borderTopColor: '#6366f1',
    },
    arrowUp: {
        top: -10,
        borderBottomWidth: 10,
        borderBottomColor: '#6366f1',
    },
});
