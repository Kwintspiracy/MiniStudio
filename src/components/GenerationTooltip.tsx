import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { CloseIcon, SparklesIcon } from './Icons';
import { colors } from '@/theme';

interface GenerationTooltipProps {
    visible: boolean;
    onDismiss: () => void;
}

export const GenerationTooltip = ({ visible, onDismiss }: GenerationTooltipProps) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 400,
                    useNativeDriver: true,
                }),
                Animated.spring(slideAnim, {
                    toValue: 0,
                    friction: 8,
                    useNativeDriver: true,
                })
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: 20,
                    duration: 300,
                    useNativeDriver: true,
                })
            ]).start();
        }
    }, [visible]);

    return (
        <Animated.View 
            style={[
                styles.container, 
                { 
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }]
                }
            ]}
            pointerEvents={visible ? 'auto' : 'none'}
        >
            <View style={styles.content}>
                <View style={styles.iconContainer}>
                    <SparklesIcon size={20} color={colors.text.dark} />
                </View>
                <Text style={styles.text}>
                    Generation usually takes 30 seconds to a few minutes, depending on server traffic.
                </Text>
                <TouchableOpacity onPress={onDismiss} style={styles.dismissButton} hitSlop={12}>
                    <CloseIcon color="white" />
                </TouchableOpacity>
            </View>
            <View style={styles.arrow} />
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 120, // Just above the main button area
        left: 24,
        right: 24,
        alignItems: 'center',
        zIndex: 9999,
    },
    content: {
        backgroundColor: '#FF682C', // Pro Orange
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 8,
        maxWidth: 400,
    },
    iconContainer: {
        marginRight: 12,
        opacity: 0.9,
    },
    text: {
        flex: 1,
        color: colors.text.dark,
        fontSize: 14,
        fontWeight: '600',
        lineHeight: 20,
    },
    dismissButton: {
        marginLeft: 12,
        padding: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.11)',
        borderRadius: 12,
    },
    arrow: {
        position: 'absolute',
        bottom: -10,
        right: '30%', // Approx center of the right-side button (flex: 1 vs flex: 1)
        width: 0,
        height: 0,
        backgroundColor: 'transparent',
        borderStyle: 'solid',
        borderLeftWidth: 10,
        borderRightWidth: 10,
        borderTopWidth: 10,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderTopColor: '#FF682C', // Match background
    }
});
