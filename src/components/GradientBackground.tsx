import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';

interface GradientBackgroundProps {
    colors: string[];
    locations?: number[];
    style?: ViewStyle;
    children?: React.ReactNode;
}

/**
 * SVG-based LinearGradient that works in Expo Go
 * (expo-linear-gradient requires a development build)
 */
export function GradientBackground({ 
    colors, 
    locations, 
    style, 
    children 
}: GradientBackgroundProps) {
    // Default locations: evenly distributed
    const stops = locations || colors.map((_, i) => i / (colors.length - 1));

    return (
        <View style={[styles.container, style]}>
            <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
                <Defs>
                    <SvgLinearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
                        {colors.map((color, index) => (
                            <Stop 
                                key={index} 
                                offset={`${stops[index] * 100}%`} 
                                stopColor={color} 
                            />
                        ))}
                    </SvgLinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#grad)" />
            </Svg>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
});
