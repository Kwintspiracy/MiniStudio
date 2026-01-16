/**
 * LoadingOverlay Component
 * 
 * Reusable full-screen loading overlay with spinner and optional message.
 */
import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, fontFamily } from '../theme';

interface LoadingOverlayProps {
    visible: boolean;
    message?: string;
    transparent?: boolean;
}

const SpinnerSvg = ({ color = '#FFFFFF', size = 32 }: { color?: string; size?: number }) => (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
        <Path
            opacity="0.2"
            fillRule="evenodd"
            clipRule="evenodd"
            d="M8.00016 12.6663C10.5775 12.6663 12.6668 10.577 12.6668 7.99967C12.6668 5.42235 10.5775 3.33301 8.00016 3.33301C5.42284 3.33301 3.3335 5.42235 3.3335 7.99967C3.3335 10.577 5.42284 12.6663 8.00016 12.6663ZM8.00016 14.6663C11.682 14.6663 14.6668 11.6815 14.6668 7.99967C14.6668 4.31777 11.682 1.33301 8.00016 1.33301C4.31826 1.33301 1.3335 4.31777 1.3335 7.99967C1.3335 11.6815 4.31826 14.6663 8.00016 14.6663Z"
            fill={color}
        />
        <Path
            d="M1.3335 7.99967C1.3335 4.31777 4.31826 1.33301 8.00016 1.33301V3.33301C5.42284 3.33301 3.3335 5.42235 3.3335 7.99967H1.3335Z"
            fill={color}
        />
    </Svg>
);

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
    visible,
    message,
    transparent = false,
}) => {
    const spinValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.loop(
                Animated.timing(spinValue, {
                    toValue: 1,
                    duration: 1000,
                    easing: Easing.linear,
                    useNativeDriver: true,
                })
            ).start();
        } else {
            spinValue.setValue(0);
        }
    }, [visible, spinValue]);

    const spin = spinValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    if (!visible) return null;

    return (
        <View style={[styles.container, transparent && styles.transparent]}>
            <View style={styles.content}>
                <Animated.View style={{ transform: [{ rotate: spin }] }}>
                    <SpinnerSvg size={48} color={colors.text.primary} />
                </Animated.View>
                {message && <Text style={styles.message}>{message}</Text>}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    transparent: {
        backgroundColor: 'transparent',
    },
    content: {
        alignItems: 'center',
        gap: 16,
    },
    message: {
        fontFamily: fontFamily.primary,
        fontWeight: '500',
        fontSize: 16,
        color: colors.text.primary,
        textAlign: 'center',
    },
});

export default LoadingOverlay;
