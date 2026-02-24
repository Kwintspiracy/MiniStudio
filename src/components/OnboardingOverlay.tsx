import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, useWindowDimensions, Platform } from 'react-native';
import Svg, { Defs, Rect, Mask } from 'react-native-svg';
import { SparklesIcon } from './Icons';
import { useHaptics } from '../hooks/useHaptics';

export type TutorialStep = 
    | 'checking'
    | 'idle' 
    | 'welcome' 
    | 'open_gallery' 
    | 'select_demo_image' 
    | 'confirm_source' 
    | 'select_style_vivid' 
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

export const OnboardingOverlay = ({ step, onNext, targetLayout }: OnboardingOverlayProps) => {
    const { trigger } = useHaptics();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();

    useEffect(() => {
        if (step !== 'idle' && step !== 'finished' && step !== 'checking') {
            const animation = Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            });
            animation.start();
            return () => animation.stop();
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
                        accessibilityLabel="Let's Go"
                        accessibilityRole="button"
                    >
                        <Text style={styles.buttonText}>Let's Go</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // --- Interactive Tooltips with SVG Spotlight ---
    
    if (!targetLayout) return null;

    let tooltipText = "";
    switch (step) {
        case 'open_gallery': tooltipText = "Start here! Tap the Gallery button below."; break;
        case 'select_demo_image': tooltipText = "Pick this demo image to try out."; break;
        case 'confirm_source': tooltipText = "Great choice! Now use it as your source."; break;
        case 'select_style_vivid': tooltipText = "Select the 'Vivid' style."; break;
        case 'enable_palette': tooltipText = "Enable Custom Palette to choose brands."; break;
        case 'select_brand_vallejo': tooltipText = "Choose 'Vallejo' paints."; break;
        case 'toggle_pro': tooltipText = "Switch to Pro mode for high quality result."; break;
        case 'generate': tooltipText = "Ready? Tap here to create!"; break;
    }

    // Calculate Spotlight Geometry
    const { x, y, width, height } = targetLayout;
    
    // Add padding to the hole
    const PADDING = 8; 
    const holeX = x - PADDING;
    const holeY = y - PADDING;
    const holeW = width + (PADDING * 2);
    const holeH = height + (PADDING * 2);

    // Calculate Tooltip Position
    const isAbove = y > 200;
    const tooltipY = isAbove 
        ? y - 90 
        : y + height + 22;

    let tooltipX = x + (width / 2) - 140; 
    tooltipX = Math.max(16, Math.min(tooltipX, SCREEN_WIDTH - 280 - 16));
    const arrowX = x + (width / 2) - tooltipX - 10;

    // INTERACTION BLOCKERS (Transparent, Square)
    // These block touches outside the hole area.
    const topStyle = { top: 0, left: 0, right: 0, height: holeY, position: 'absolute' as const };
    const bottomStyle = { top: holeY + holeH, left: 0, right: 0, bottom: 0, position: 'absolute' as const };
    const leftStyle = { top: holeY, left: 0, width: holeX, height: holeH, position: 'absolute' as const };
    const rightStyle = { top: holeY, left: holeX + holeW, right: 0, height: holeH, position: 'absolute' as const };

    return (
        <View style={styles.interactiveOverlay} pointerEvents="box-none">
            
            {/* 1. VISUAL LAYER: Full Screen SVG with Mask */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <Svg height="100%" width="100%">
                    <Defs>
                        <Mask id="spotlightMask">
                            {/* Everything is white (visible) by default */}
                            <Rect x="0" y="0" width="100%" height="100%" fill="white" />
                            {/* The hole is black (hidden/transparent) */}
                            {/* Using rounded corners rx/ry for smoother look */}
                            <Rect 
                                x={holeX} 
                                y={holeY} 
                                width={holeW} 
                                height={holeH} 
                                rx="12" 
                                ry="12" 
                                fill="black" 
                            />
                        </Mask>
                    </Defs>
                    {/* The Overlay Color, masked by the definition above */}
                    <Rect 
                        x="0" 
                        y="0" 
                        width="100%" 
                        height="100%" 
                        fill="rgba(0,0,0,0.6)" 
                        mask="url(#spotlightMask)" 
                    />
                </Svg>
            </View>

            {/* 2. LOGIC LAYER: Transparent Blockers */}
            {/* These exist solely to catch touches outside the hole */}
            <View style={topStyle} pointerEvents="auto" onStartShouldSetResponder={() => true} />
            <View style={bottomStyle} pointerEvents="auto" onStartShouldSetResponder={() => true} />
            <View style={leftStyle} pointerEvents="auto" onStartShouldSetResponder={() => true} />
            <View style={rightStyle} pointerEvents="auto" onStartShouldSetResponder={() => true} />

            {/* 3. TOOLTIP LAYER */}
            <Animated.View
                style={[
                    styles.tooltipContainer,
                    {
                        top: tooltipY,
                        left: tooltipX,
                        opacity: fadeAnim
                    }
                ]}
                accessibilityLabel={tooltipText}
                accessibilityRole="text"
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
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 20,
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
