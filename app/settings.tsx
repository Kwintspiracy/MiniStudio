import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, ScrollView, RefreshControl, Modal, Pressable } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GradientBackground } from '../src/components/GradientBackground';
import { useAuth } from '../src/context/AuthContext';
import { colors, fontFamily } from '../src/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppModal } from '../src/components/AppModal';
import { useEntitlements } from '../src/hooks/useEntitlements';
import { PaywallDrawer } from '../src/components/PaywallDrawer';
import { FeedbackDrawer } from '../src/components/FeedbackDrawer';

// Import treasure image
const treasureImage = require('../assets/treasure.png');

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
                            onPress={() => router.back()} 
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
                {/* Profile Section - Centered */}
                <View style={styles.profileSection}>
                    <View style={styles.avatarContainer}>
                        {!isAnonymous && user?.user_metadata?.avatar_url ? (
                            <Image
                                source={{ uri: user.user_metadata.avatar_url }}
                                style={styles.avatar}
                            />
                        ) : !isAnonymous && user?.email ? (
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
                    {!isAnonymous && user?.email && (
                        <Text style={styles.userEmail}>{user.email}</Text>
                    )}

                    {isAnonymous && (
                        <TouchableOpacity
                            style={styles.inlineSignInButton}
                            onPress={() => router.push('/signin')}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.inlineSignInText}>Sign In</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Divider */}
                <View style={styles.divider} />

                {/* Token Display Section */}
                <View style={styles.tokenSection}>
                    <Image 
                        source={treasureImage} 
                        style={styles.treasureImage}
                        resizeMode="contain"
                    />
                    <Text style={styles.tokenCount}>
                        {entitlements.remaining_total ?? entitlements.purchased_balance ?? 0}
                    </Text>
                    <Text style={styles.tokenLabel}>CREATIVE TOKENS</Text>
                </View>
            </ScrollView>

            {/* Footer with Get more Tokens button */}
            <View style={[styles.footerContainer, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
                <TouchableOpacity
                    style={styles.getTokensButton}
                    onPress={() => setIsPaywallVisible(true)}
                    activeOpacity={0.8}
                >
                    <Text style={styles.getTokensText}>Get more Tokens</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    style={[styles.getTokensButton, { marginTop: 12, backgroundColor: colors.button.secondary, borderWidth: 1, borderColor: colors.border.subtle }]}
                    onPress={() => setIsFeedbackDrawerOpen(true)}
                    activeOpacity={0.8}
                >
                    <Text style={[styles.getTokensText, { color: colors.text.primary }]}>Send Feedback</Text>
                </TouchableOpacity>
            </View>

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
        paddingTop: 40,
        alignItems: 'center',
    },
    // Profile Section
    profileSection: {
        alignItems: 'center',
        marginBottom: 16,
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
    inlineSignInButton: {
        marginTop: 16,
        paddingHorizontal: 24,
        paddingVertical: 10,
        backgroundColor: colors.button.primary,
        borderRadius: 20,
    },
    inlineSignInText: {
        color: colors.text.primary,
        fontFamily: fontFamily.primary,
        fontWeight: '600',
        fontSize: 14,
    },
    // Divider
    divider: {
        width: 313,
        height: 1,
        backgroundColor: colors.overlay.soft,
        marginVertical: 20,
    },
    // Token Section
    tokenSection: {
        alignItems: 'center',
        paddingVertical: 20,
    },
    treasureImage: {
        width: 200,
        height: 180,
        marginBottom: 16,
    },
    tokenCount: {
        fontSize: 72,
        fontWeight: '700',
        color: colors.text.primary,
        fontFamily: fontFamily.primary,
        letterSpacing: -2,
    },
    tokenLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: colors.text.secondary,
        fontFamily: fontFamily.primary,
        letterSpacing: 1,
        marginTop: 4,
    },
    // Footer - Standardized to match mainView
    footerContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'transparent',
        borderTopLeftRadius: 32,
        borderTopRightRadius: 32,
        paddingHorizontal: 24,
        paddingTop: 12,
    },
    getTokensButton: {
        height: 52,
        backgroundColor: colors.palette.white,
        borderRadius: 26,
        justifyContent: 'center',
        alignItems: 'center',
    },
    getTokensText: {
        color: colors.text.dark,
        fontFamily: fontFamily.primary,
        fontWeight: '500',
        fontSize: 15,
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
