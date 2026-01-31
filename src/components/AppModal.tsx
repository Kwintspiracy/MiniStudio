import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Dimensions, Platform } from 'react-native';
import { colors, fontFamily } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface AppModalProps {
    visible: boolean;
    onClose: () => void;
    title: string;
    message: string;
    type?: 'default' | 'error' | 'critical';
    primaryAction?: {
        label: string;
        onPress: () => void;
    };
    secondaryAction?: {
        label: string;
        onPress: () => void;
    };
}

export const AppModal: React.FC<AppModalProps> = ({
    visible,
    onClose,
    title,
    message,
    type = 'default',
    primaryAction,
    secondaryAction
}) => {
    const getPrimaryButtonColor = () => {
        switch (type) {
            case 'error':
            case 'critical':
                return colors.button.danger;
            case 'default':
            default:
                return colors.button.primary;
        }
    };

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.modalContainer}>
                    <View style={styles.contentContainer}>
                        <Text style={styles.title}>{title}</Text>
                        <Text style={styles.message}>{message}</Text>
                    </View>
                    
                    <View style={styles.actionsContainer}>
                        {secondaryAction && (
                            <TouchableOpacity
                                style={styles.secondaryButton}
                                onPress={secondaryAction.onPress}
                            >
                                <Text style={styles.secondaryButtonText}>
                                    {secondaryAction.label}
                                </Text>
                            </TouchableOpacity>
                        )}
                        
                        {primaryAction && (
                            <TouchableOpacity
                                style={[styles.primaryButton, { backgroundColor: getPrimaryButtonColor() }]}
                                onPress={primaryAction.onPress}
                            >
                                <Text style={styles.primaryButtonText}>
                                    {primaryAction.label}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.overlay.modal,
        padding: 24,
    },
    modalContainer: {
        width: '100%',
        maxWidth: 345,
        backgroundColor: colors.background.modal,
        borderRadius: 32,
        padding: 24,
        gap: 24,
    },
    contentContainer: {
        gap: 8,
    },
    title: {
        fontFamily: fontFamily.primary,
        fontWeight: '700',
        fontSize: 20,
        color: colors.text.primary,
    },
    message: {
        fontFamily: fontFamily.primary,
        fontWeight: '400',
        fontSize: 16,
        color: colors.text.secondary,
        lineHeight: 21,
    },
    actionsContainer: {
        flexDirection: 'row',
        gap: 8,
    },
    secondaryButton: {
        flex: 1,
        height: 52,
        backgroundColor: colors.button.secondary,
        borderRadius: 26,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 12,
    },
    secondaryButtonText: {
        fontFamily: fontFamily.primary,
        fontWeight: '500',
        fontSize: 16,
        color: colors.text.primary,
    },
    primaryButton: {
        flex: 1,
        height: 52,
        borderRadius: 26,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 12,
    },
    primaryButtonText: {
        fontFamily: fontFamily.primary,
        fontWeight: '500',
        fontSize: 16,
        color: colors.text.primary,
    },
});
