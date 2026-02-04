import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    Dimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, textStyles, spacing, borderRadius } from '../theme';
import { Ionicons } from '@expo/vector-icons';


const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface FeedbackDrawerProps {
    visible: boolean;
    onClose: () => void;
}

export const FeedbackDrawer: React.FC<FeedbackDrawerProps> = ({ visible, onClose }) => {
    const insets = useSafeAreaInsets();
    const [feedback, setFeedback] = useState('');
    const [isSending, setIsSending] = useState(false);

    const handleSendFeedback = async () => {
        if (!feedback.trim()) {
            Alert.alert('Error', 'Please enter your feedback.');
            return;
        }

        setIsSending(true);
        try {
            // Lazy load mail-composer to prevent startup crash if module is missing
            const MailComposer = require('expo-mail-composer');
            const isAvailable = await MailComposer.isAvailableAsync();
            if (isAvailable) {
                await MailComposer.composeAsync({
                    recipients: ['quentinbeau@gmail.com'],
                    subject: 'MiniStudio App Feedback',
                    body: feedback,
                });
                setFeedback('');
                onClose();
            } else {
                Alert.alert(
                    'Email Not Available',
                    'We could not open your email app. Please send your feedback directly to quentinbeau@gmail.com'
                );
            }
        } catch (error) {
            console.error('Failed to send feedback:', error);
            Alert.alert('Error', 'Failed to open email composer.');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <Pressable style={styles.dismissArea} onPress={onClose} />
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={[styles.container, { paddingBottom: Math.max(insets.bottom, 20) }]}
                >
                    <View style={styles.header}>
                        <View style={styles.grabber} />
                        <View style={styles.headerTitleRow}>
                            <Text style={styles.title}>Send Feedback</Text>
                            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                <Ionicons name="close" size={24} color={colors.text.primary} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.content}>
                        <Text style={styles.description}>
                            Your feedback helps us improve MiniStudio. Let us know what you think or report any issues.
                        </Text>

                        <TextInput
                            style={styles.input}
                            placeholder="Write your feedback here..."
                            placeholderTextColor={colors.text.muted}
                            multiline
                            numberOfLines={10}
                            value={feedback}
                            onChangeText={setFeedback}
                            textAlignVertical="top"
                            autoFocus
                        />

                        <TouchableOpacity
                            style={[styles.sendButton, !feedback.trim() && styles.sendButtonDisabled]}
                            onPress={handleSendFeedback}
                            disabled={isSending || !feedback.trim()}
                        >
                            {isSending ? (
                                <ActivityIndicator color={colors.palette.white} />
                            ) : (
                                <Text style={styles.sendButtonText}>Send via Email</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    dismissArea: {
        flex: 1,
    },
    container: {
        backgroundColor: colors.background.secondary,
        borderTopLeftRadius: borderRadius.xl,
        borderTopRightRadius: borderRadius.xl,
        maxHeight: SCREEN_HEIGHT * 0.8,
    },
    header: {
        alignItems: 'center',
        paddingTop: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.sm,
    },
    grabber: {
        width: 40,
        height: 4,
        backgroundColor: colors.overlay.medium,
        borderRadius: 2,
        marginBottom: spacing.md,
    },
    headerTitleRow: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    title: {
        ...textStyles.subheading,
        fontWeight: 'bold',
        fontSize: 20,
        color: colors.text.primary,
    },
    closeButton: {
        padding: spacing.xs,
    },
    content: {
        paddingHorizontal: spacing.xl,
        paddingBottom: spacing.xl,
        gap: spacing.md,
    },
    description: {
        ...textStyles.caption,
        color: colors.text.secondary,
        marginBottom: spacing.sm,
    },
    input: {
        backgroundColor: colors.text.textfieldbg,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        color: colors.text.primary,
        height: 180,
        ...textStyles.body,
    },
    sendButton: {
        backgroundColor: colors.button.primary,
        borderRadius: borderRadius.full,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: spacing.md,
    },
    sendButtonDisabled: {
        opacity: 0.5,
    },
    sendButtonText: {
        ...textStyles.button,
        fontSize: 16,
        color: colors.palette.white,
    },
});
