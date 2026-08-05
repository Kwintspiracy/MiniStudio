import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, ScrollView, RefreshControl, Modal, Pressable } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GradientBackground } from '../src/components/GradientBackground';
import { useAuth } from '../src/context/AuthContext';
import { colors, fontFamily } from '../src/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppModal } from '../src/components/AppModal';
import { useEntitlements } from '../src/hooks/useEntitlements';
import { PaywallDrawer } from '../src/components/PaywallDrawer';
import { FeedbackDrawer } from '../src/components/FeedbackDrawer';

// Import images
const treasureImage = require('../assets/treasure.png');
const studioIcon = require('../assets/icons/studio.png');
const dbIcon = require('../assets/icons/db.png');

export default function SettingsScreen() {
    const { user, signOut, isAnonymous, resetGuestSession } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [isSignOutModalVisible, setIsSignOutModalVisible] = useState(false);
    const [isMenuVisible, setIsMenuVisible] = useState(false);
    const [isPaywallVisible, setIsPaywallVisible] = useState(false);
    const [isFeedbackDrawerOpen, setIsFeedbackDrawerOpen] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const { entitlements, refetch: refetchEntitlements } = useEntitlements();

    const onRefresh = async () => {
        setRefreshing(true);
        await refetchEntitlements();
        setRefreshing(false);
    };

    useFocusEffect(
        useCallback(() => {
            console.log('[Settings] Screen focused, calling refetchEntitlements');
            refetchEntitlements();
            console.log('[Settings] refetchEntitlements called (non-blocking)');
        }, [refetchEntitlements])
    );

    const handleSignOutPress = () => {
        setIsMenuVisible(false);
        setIsSignOutModalVisible(true);
    };

    return (
        <GradientBackground
            colors={[colors.background.secondary, colors.background.primary, colors.background.primary]}
            locations={[0, 0.5, 1]}
            style={styles.container}
        >

            <Stack.Screen
                options={{
                    headerShown: true,
                    title: 'User Settings',
                    contentStyle: { backgroundColor: 'transparent' },
                    headerStyle: { backgroundColor: colors.background.secondary },
                    headerTintColor: colors.accent.blue,
                    headerTitleStyle: {
                        fontFamily: Platform.OS === 'ios' ? 'SF Pro Text' : 'Roboto',
                        fontWeight: '600',
                        fontSize: 17,
                        color: colors.text.primary,
                    },
                    headerShadowVisible: false,
                    headerLeft: () => (
                        <TouchableOpacity
                            onPress={() => {
                                // On web (page reload / direct link) there may be no
                                // navigation history, so router.back() is a no-op.
                                // Fall back to the studio route in that case.
                                if (router.canGoBack()) router.back();
                                else router.replace('/(studio)');
                            }}
                            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                            style={{ paddingHorizontal: 8 }}
                            accessibilityLabel="Go back"
                            accessibilityRole="button"
                        >
                            <Text style={{ color: colors.accent.blue, fontSize: 17 }}>{'‹ Back'}</Text>
                        </TouchableOpacity>
                    ),
                    headerRight: () => (
                        <TouchableOpacity 
                            onPress={() => setIsMenuVisible(true)} 
                            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                            style={{ paddingHorizontal: 8 }}
                            accessibilityLabel="More options"
                            accessibilityRole="button"
                        >
                            <Ionicons name="ellipsis-horizontal" size={24} color={colors.text.primary} />
                        </TouchableOpacity>
                    ),
                }}
            />

            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.accent.blue}
                        colors={[colors.accent.blue]}
                    />
                }
            >
                {/* ── Top section ── */}
                <View style={styles.topSection}>
                    {isAnonymous ? (
                        /* Anonymous: Shared Account */
                        <>
                            <View style={styles.appIconsRow}>
                                <Image source={studioIcon} style={styles.appIcon} resizeMode="cover" />
                                <Image source={dbIcon} style={styles.appIcon} resizeMode="cover" />
                            </View>
                            <View style={styles.sharedAccountTextBlock}>
                                <Text style={styles.sharedAccountTitle}>Shared Account</Text>
                                <Text style={styles.sharedAccountSubtitle}>
                                    Sign up once and use the same account across our Apps, MiniPainterStudio and MiniPainterDB
                                </Text>
                            </View>
                            <View style={styles.signInButtonRow}>
                                <TouchableOpacity
                                    style={styles.signInPillButton}
                                    onPress={() => router.push('/signin')}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.signInPillText}>Sign In</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    ) : (
                        /* Signed in: avatar + email */
                        <View style={styles.profileSection}>
                            <View style={styles.avatarContainer}>
                                {user?.user_metadata?.avatar_url ? (
                                    <Image
                                        source={{ uri: user.user_metadata.avatar_url }}
                                        style={styles.avatar}
                                    />
                                ) : user?.email ? (
                                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                                        <Text style={styles.avatarText}>
                                            {user.email.charAt(0).toUpperCase()}
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                                        <Ionicons name="person" size={48} color={colors.text.secondary} />
                                    </View>
                                )}
                            </View>
                            {user?.email && (
                                <Text style={styles.userEmail}>{user.email}</Text>
                            )}
                        </View>
                    )}
                    {/* Divider — inside top section */}
                    <View style={styles.divider} />
                </View>

                {/* ── Middle section: treasure + tokens ── */}
                <View style={styles.tokenSection}>
                    <Image
                        source={treasureImage}
                        style={styles.treasureImage}
                        resizeMode="contain"
                    />
                    <View style={styles.tokenTextBlock}>
                        <Text style={styles.tokenCount}>
                            {entitlements.remaining_total ?? entitlements.purchased_balance ?? 0}
                        </Text>
                        <Text style={styles.tokenLabel}>CREATIVE TOKENS</Text>
                    </View>
                </View>

                {/* ── Footer buttons ── */}
                <View style={[styles.footerContainer, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
                    <TouchableOpacity
                        style={styles.getTokensButton}
                        onPress={() => setIsPaywallVisible(true)}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.getTokensText}>Get more Tokens</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.feedbackButton}
                        onPress={() => setIsFeedbackDrawerOpen(true)}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.feedbackButtonText}>Send Feedback</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>

            {/* Menu Dropdown */}
            <Modal
                visible={isMenuVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setIsMenuVisible(false)}
            >
                <Pressable 
                    style={styles.menuOverlay} 
                    onPress={() => setIsMenuVisible(false)}
                >
                     <View style={[styles.menuContainer, { top: insets.top + 50 }]}>
                        {isAnonymous || !user ? (
                            <>
                                <TouchableOpacity 
                                    style={styles.menuItem}
                                    onPress={() => {
                                        setIsMenuVisible(false);
                                        // Delay navigation to ensure modal closes first
                                        setTimeout(() => {
                                            router.push('/signin');
                                        }, 100);
                                    }}
                                >
                                    <Ionicons name="log-in-outline" size={20} color={colors.accent.blue} />
                                    <Text style={[styles.menuItemText, { color: colors.accent.blue }]}>Sign In</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <TouchableOpacity 
                                style={styles.menuItem}
                                onPress={handleSignOutPress}
                            >
                                <Ionicons name="log-out-outline" size={20} color={colors.accent.red} />
                                <Text style={styles.menuItemText}>Sign Out</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </Pressable>
            </Modal>

            <AppModal
                visible={isSignOutModalVisible}
                onClose={() => setIsSignOutModalVisible(false)}
                title="Sign Out"
                message="Are you sure you want to sign out of your account?"
                type="critical"
                primaryAction={{
                    label: 'Sign Out',
                    onPress: () => {
                        setIsSignOutModalVisible(false);
                        signOut();
                    }
                }}
                secondaryAction={{
                    label: 'Cancel',
                    onPress: () => setIsSignOutModalVisible(false)
                }}
            />

            <PaywallDrawer 
                visible={isPaywallVisible} 
                onClose={() => setIsPaywallVisible(false)} 
            />

            <FeedbackDrawer 
                visible={isFeedbackDrawerOpen} 
                onClose={() => setIsFeedbackDrawerOpen(false)} 
            />
        </GradientBackground>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    // backgroundGradient removed
    content: {
        flex: 1,
    },
    contentContainer: {
        flexGrow: 1,
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 40,
        paddingBottom: 50,
    },
    // ── Top section (full-width, items centered, gap 16) ──
    topSection: {
        width: '100%',
        alignItems: 'center',
        gap: 16,
    },
    appIconsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    appIcon: {
        width: 60,
        height: 60,
        borderRadius: 12,
    },
    sharedAccountTextBlock: {
        width: '100%',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 32,
    },
    sharedAccountTitle: {
        color: '#f4f4f4',
        fontFamily: fontFamily.primary,
        fontWeight: '700',
        fontSize: 24,
        textAlign: 'center',
        width: 302,
    },
    sharedAccountSubtitle: {
        color: '#878892',
        fontFamily: fontFamily.primary,
        fontWeight: '400',
        fontSize: 16,
        textAlign: 'center',
        width: '100%',
    },
    signInButtonRow: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    signInPillButton: {
        backgroundColor: colors.button.primary,
        borderRadius: 24,
        paddingHorizontal: 24,
        paddingVertical: 8,
    },
    signInPillText: {
        color: colors.text.primary,
        fontFamily: fontFamily.primary,
        fontWeight: '500',
        fontSize: 15,
        letterSpacing: -0.408,
    },
    // Profile Section (signed in)
    profileSection: {
        alignItems: 'center',
    },
    avatarContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 4,
        borderColor: colors.palette.white,
        overflow: 'hidden',
        marginBottom: 12,
    },
    avatar: {
        width: '100%',
        height: '100%',
    },
    avatarPlaceholder: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: colors.text.primary,
        fontSize: 36,
        fontWeight: '600',
    },
    userEmail: {
        color: colors.text.primary,
        fontFamily: fontFamily.primary,
        fontWeight: '400',
        fontSize: 15,
    },
    // Divider — inside top section
    divider: {
        width: 313,
        height: 1,
        backgroundColor: colors.background.primary,
    },
    // ── Middle: treasure + token text ──
    tokenSection: {
        alignItems: 'center',
        gap: 16,
    },
    treasureImage: {
        width: 143,
        height: 107,
    },
    tokenTextBlock: {
        alignItems: 'center',
        gap: 8,
    },
    tokenCount: {
        fontSize: 64,
        fontWeight: '700',
        color: '#f4f4f4',
        fontFamily: fontFamily.primary,
        lineHeight: undefined,
    },
    tokenLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#7e808b',
        fontFamily: fontFamily.primary,
        lineHeight: 14,
    },
    // ── Footer buttons (inside scroll, at bottom) ──
    footerContainer: {
        width: '100%',
        gap: 8,
        paddingHorizontal: 16,
    },
    getTokensButton: {
        height: 48,
        backgroundColor: colors.text.primary,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    getTokensText: {
        color: colors.text.dark,
        fontFamily: fontFamily.primary,
        fontWeight: '500',
        fontSize: 15,
        letterSpacing: -0.408,
    },
    feedbackButton: {
        height: 48,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    feedbackButtonText: {
        color: colors.text.primary,
        fontFamily: fontFamily.primary,
        fontWeight: '500',
        fontSize: 15,
        letterSpacing: -0.408,
    },
    // Menu
    menuOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    menuContainer: {
        position: 'absolute',
        right: 16,
        backgroundColor: colors.background.secondary,
        borderRadius: 12,
        paddingVertical: 8,
        minWidth: 150,
        shadowColor: colors.palette.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 12,
    },
    menuItemText: {
        color: colors.accent.red,
        fontSize: 16,
        fontWeight: '500',
        fontFamily: fontFamily.primary,
    },
});
