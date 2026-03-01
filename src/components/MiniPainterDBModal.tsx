import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Modal,
    StyleSheet,
    Image,
    Dimensions,
    Linking,
    Platform,
} from 'react-native';
import { colors, fontFamily } from '../theme';

const dbIcon = require('../../assets/icons/db.png');

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface MiniPainterDBModalProps {
    visible: boolean;
    onClose: () => void;
}

export const MiniPainterDBModal: React.FC<MiniPainterDBModalProps> = ({
    visible,
    onClose,
}) => {
    const handleDownload = () => {
        // TODO: replace with actual App Store / Play Store URL when published
        const url = Platform.select({
            ios: 'https://apps.apple.com',
            android: 'https://play.google.com',
        });
        if (url) Linking.openURL(url);
        onClose();
    };

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.card}>
                    {/* Header */}
                    <View style={styles.headerSection}>
                        <Text style={styles.title}>MiniPainterDB</Text>

                        {/* Icon stacked above description */}
                        <View style={styles.iconAndDescSection}>
                            <Image
                                source={dbIcon}
                                style={styles.appIcon}
                                resizeMode="cover"
                            />
                            <Text style={styles.description}>
                                {`Build and manage your paint collection. Sync it with MiniPainterStudio to paint your miniatures with your exact library. Both apps share the same account.`}
                            </Text>
                        </View>
                    </View>

                    {/* Buttons */}
                    <View style={styles.buttonsRow}>
                        <TouchableOpacity
                            style={styles.notNowButton}
                            onPress={onClose}
                            activeOpacity={0.75}
                        >
                            <Text style={styles.notNowText}>Not now</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.downloadButton}
                            onPress={handleDownload}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.downloadText}>Download</Text>
                        </TouchableOpacity>
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
        paddingHorizontal: 24,
    },
    card: {
        width: '100%',
        maxWidth: SCREEN_WIDTH - 48,
        backgroundColor: colors.text.primary, // #EFEFF1
        borderRadius: 32,
        padding: 32,
        gap: 24,
    },
    headerSection: {
        gap: 8,
    },
    title: {
        fontFamily: fontFamily.primary,
        fontWeight: '700',
        fontSize: 24,
        lineHeight: 24,
        color: colors.text.dark, // #1D1D1D
    },
    iconAndDescSection: {
        flexDirection: 'column',
        gap: 8,
        alignItems: 'flex-start',
    },
    appIcon: {
        width: 60,
        height: 60,
        borderRadius: 16,
    },
    description: {
        width: '100%',
        fontFamily: fontFamily.primary,
        fontWeight: '400',
        fontSize: 15,
        lineHeight: 19,
        color: colors.background.primary, // #2C2F3A
    },
    buttonsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    notNowButton: {
        flex: 1,
        backgroundColor: colors.text.dark, // #1D1D1D
        borderRadius: 24,
        paddingHorizontal: 12,
        paddingVertical: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    notNowText: {
        fontFamily: fontFamily.primary,
        fontWeight: '500',
        fontSize: 16,
        color: colors.text.primary, // #EFEFF1
        letterSpacing: -0.408,
    },
    downloadButton: {
        flex: 1,
        backgroundColor: colors.button.primary, // #2C59FF
        borderRadius: 24,
        paddingHorizontal: 12,
        paddingVertical: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    downloadText: {
        fontFamily: fontFamily.primary,
        fontWeight: '500',
        fontSize: 16,
        color: colors.text.primary, // #EFEFF1
        letterSpacing: -0.408,
    },
});
