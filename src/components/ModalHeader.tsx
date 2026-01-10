/**
 * ModalHeader Component
 * 
 * Reusable header for modal screens with grabber, title, and action button.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { colors, fontFamily } from '../theme';

interface ModalHeaderProps {
    title: string;
    actionLabel?: string;
    onAction?: () => void;
    showGrabber?: boolean;
}

export const ModalHeader: React.FC<ModalHeaderProps> = ({
    title,
    actionLabel = 'Done',
    onAction,
    showGrabber = true,
}) => {
    return (
        <>
            {showGrabber && (
                <View style={styles.grabberContainer}>
                    <View style={styles.grabber} />
                </View>
            )}
            <View style={styles.header}>
                <View style={styles.headerSide} />
                <Text style={styles.title}>{title}</Text>
                <TouchableOpacity
                    onPress={onAction}
                    style={styles.headerSide}
                    accessibilityLabel={actionLabel}
                    accessibilityRole="button"
                >
                    <Text style={styles.actionText}>{actionLabel}</Text>
                </TouchableOpacity>
            </View>
        </>
    );
};

const styles = StyleSheet.create({
    grabberContainer: {
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 4,
    },
    grabber: {
        width: 36,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: 'rgba(255, 255, 255, 0.3)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    headerSide: {
        width: 60,
        alignItems: 'flex-end',
    },
    title: {
        fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
        fontWeight: '600',
        fontSize: 17,
        color: colors.text.primary,
        textAlign: 'center',
    },
    actionText: {
        fontFamily: Platform.OS === 'ios' ? 'SF Pro Display' : 'System',
        fontWeight: '600',
        fontSize: 17,
        color: colors.accent.blue,
    },
});

export default ModalHeader;
