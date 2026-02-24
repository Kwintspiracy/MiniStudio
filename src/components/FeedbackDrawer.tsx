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
    Modal,
    Pressable,
    Dimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, spacing, borderRadius, dimensions } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface FeedbackDrawerProps {
    visible: boolean;
    onClose: () => void;
}

export const FeedbackDrawer: React.FC<FeedbackDrawerProps> = ({ visible, onClose }) => {
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const [feedback, setFeedback] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    const handleSendFeedback = async () => {
        if (!feedback.trim()) return;

        setIsSending(true);
        setStatus(null);
        
        try {
            const { data, error } = await supabase.functions.invoke('send-feedback', {
                body: { 
                    feedback: feedback.trim(),
                    userEmail: user?.email || 'Anonymous'
                }
            });

            if (error) throw error;

            setFeedback('');
            setStatus({ type: 'success', message: 'Thanks! Your feedback has been sent.' });
            
            // Close after a brief delay to show success state
            setTimeout(() => {
                onClose();
                setStatus(null);
            }, 2000);

        } catch (error: any) {
            console.error('Failed to send feedback:', error);
            setStatus({ type: 'error', message: 'Failed to send feedback. Please try again.' });
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
                    keyboardVerticalOffset={40}
                    style={[styles.drawer, { paddingBottom: Math.max(insets.bottom + 8, 16) + 40 }]}
                >
                    {/* Handle bar */}
                    <View style={styles.handleBar} />
                    
                    <View style={styles.header}>
                        <Text style={styles.title}>Send Feedback</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color={colors.text.primary} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.content}>
                        <Text style={styles.description}>
                            Your feedback helps us improve MiniStudio. Let us know what you think or report any issues.
                        </Text>

                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder="Write your feedback here..."
                                placeholderTextColor={colors.text.muted}
                                multiline
                                numberOfLines={6}
                                value={feedback}
                                onChangeText={(text) => {
                                    setFeedback(text);
                                    if (status) setStatus(null);
                                }}
                                textAlignVertical="top"
                                autoFocus={visible}
                            />
                        </View>

                        {status && (
                            <Text style={[
                                styles.statusText, 
                                status.type === 'error' ? styles.errorText : styles.successText
                            ]}>
                                {status.message}
                            </Text>
                        )}

                        <TouchableOpacity
                            style={[
                                styles.sendButton, 
                                (!feedback.trim() || isSending) && styles.sendButtonDisabled
                            ]}
                            onPress={handleSendFeedback}
                            disabled={isSending || !feedback.trim()}
                            activeOpacity={0.8}
                        >
                            {isSending ? (
                                <ActivityIndicator color={colors.text.primary} />
                            ) : (
                                <Text style={styles.sendButtonText}>Send Feedback</Text>
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
    drawer: {
        backgroundColor: colors.background.secondary,
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingTop: 12,
        maxHeight: SCREEN_HEIGHT * 0.85,
    },
    handleBar: {
        width: dimensions.modal.grabberWidth,
        height: dimensions.modal.grabberHeight,
        backgroundColor: colors.overlay.medium,
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
        marginBottom: 32,
        position: 'relative',
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: colors.text.primary,
        fontFamily: fontFamily.primary,
        textAlign: 'center',
        lineHeight: 32,
    },
    closeButton: {
        position: 'absolute',
        right: 24,
        padding: 4,
    },
    content: {
        paddingHorizontal: 24,
        gap: 24,
    },
    description: {
        fontSize: 15,
        fontFamily: fontFamily.primary,
        color: colors.text.secondary,
        lineHeight: 22,
        textAlign: 'center',
        paddingHorizontal: 8,
    },
    inputContainer: {
        backgroundColor: colors.background.tertiary,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.border.subtle,
    },
    input: {
        fontFamily: fontFamily.primary,
        fontSize: 16,
        color: colors.text.primary,
        minHeight: 120,
        textAlignVertical: 'top',
    },
    statusText: {
        fontSize: 14,
        fontFamily: fontFamily.primary,
        textAlign: 'center',
        marginTop: -8,
    },
    successText: {
        color: '#4ADE80',
    },
    errorText: {
        color: colors.accent.red,
    },
    sendButton: {
        backgroundColor: colors.button.primary,
        borderRadius: 26,
        height: 52,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
    },
    sendButtonDisabled: {
        opacity: 0.5,
    },
    sendButtonText: {
        color: colors.text.primary,
        fontSize: 15,
        fontWeight: '600',
        fontFamily: fontFamily.primary,
    },
});
