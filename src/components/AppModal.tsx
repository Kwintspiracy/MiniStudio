import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { colors } from '../theme';

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
                <View style={styles.container}>
                    <View style={styles.content}>
                        <Text style={styles.title}>{title}</Text>
                        <Text style={styles.message}>{message}</Text>
                    </View>
                    
                    <View style={styles.buttonContainer}>
                        {secondaryAction && (
                            <TouchableOpacity
                                style={styles.secondaryButton}
                                onPress={secondaryAction.onPress}
                            >
                                <Text style={styles.buttonText}>{secondaryAction.label}</Text>
                            </TouchableOpacity>
                        )}
                        
                        {primaryAction && (
                            <TouchableOpacity
                                style={[styles.primaryButton, { backgroundColor: getPrimaryButtonColor() }]}
                                onPress={primaryAction.onPress}
                            >
                                <Text style={styles.buttonText}>{primaryAction.label}</Text>
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
        backgroundColor: 'rgba(0, 0, 0, 0.6)', // Modal overlay opacity
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    container: {
        width: '100%',
        maxWidth: 345,
        backgroundColor: colors.background.modal,
        borderRadius: 32,
        padding: 24,
        gap: 24,
    },
    content: {
        gap: 8,
    },
    title: {
        fontFamily: 'SF Pro Display',
        fontWeight: '700',
        fontSize: 20,
        color: colors.text.primary,
    },
    message: {
        fontFamily: 'SF Pro Display',
        fontWeight: '400',
        fontSize: 16,
        color: colors.text.secondary,
        lineHeight: 21,
    },
    buttonContainer: {
        flexDirection: 'row',
        gap: 8,
    },
    primaryButton: {
        flex: 1,
        height: 52,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 12,
    },
    secondaryButton: {
        flex: 1,
        height: 52,
        backgroundColor: colors.button.secondary, // Standardized to theme
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 12,
    },
    buttonText: {
        fontFamily: 'SF Pro Display',
        fontWeight: '500',
        fontSize: 16,
        color: colors.text.primary,
    },
});
