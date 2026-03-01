import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';

interface GradientBackgroundProps {
    colors: string[];
    locations?: number[];
    style?: ViewStyle;
    children?: React.ReactNode;
}

/**
 * LinearGradient background that works on both native and web.
 * - Native: uses react-native-svg for the gradient (works in Expo Go).
 * - Web: uses a CSS linear-gradient applied directly as a background style,
 *   because SVG percentage-based width/height is unreliable on web.
 */
export function GradientBackground({
    colors,
    locations,
    style,
    children
}: GradientBackgroundProps) {
    // Default locations: evenly distributed
    const stops = locations || colors.map((_, i) => i / (colors.length - 1));

    if (Platform.OS === 'web') {
        // Build a CSS linear-gradient string going top to bottom (to bottom = 180deg)
        const colorStops = colors
            .map((color, i) => `${color} ${stops[i] * 100}%`)
            .join(', ');
        const cssGradient = `linear-gradient(to bottom, ${colorStops})`;

        return (
            <View
                style={[
                    styles.container,
                    style,
                    { background: cssGradient } as unknown as ViewStyle,
                ]}
            >
                {children}
            </View>
        );
    }

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
