import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, ScrollView, RefreshControl } from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import { colors, fontFamily } from '../src/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppModal } from '../src/components/AppModal';

import { UsageTracker, UsageTrackerRef } from '../src/components/UsageTracker';

export default function SettingsScreen() {
    const { user, signOut } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [isSignOutModalVisible, setIsSignOutModalVisible] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const usageTrackerRef = useRef<UsageTrackerRef>(null);

    const onRefresh = async () => {
        setRefreshing(true);
        await usageTrackerRef.current?.refresh();
        setRefreshing(false);
    };

    useFocusEffect(
        useCallback(() => {
            usageTrackerRef.current?.refresh();
        }, [])
    );

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    headerShown: true,
                    title: 'User Settings',
                    headerStyle: { backgroundColor: colors.background.secondary },
                    headerTintColor: colors.accent.blue,
                    headerTitleStyle: {
                        fontFamily: 'SF Pro Text',
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
                <View style={styles.profileCard}>
                    <View style={styles.profileInfo}>
                        <View style={styles.avatarContainer}>
                            {user?.user_metadata?.avatar_url ? (
                                <Image
                                    source={{ uri: user.user_metadata.avatar_url }}
                                    style={styles.avatar}
                                />
                            ) : (
                                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                                    <Text style={styles.avatarText}>
                                        {user?.email?.charAt(0).toUpperCase() ?? 'U'}
                                    </Text>
                                </View>
                            )}
                        </View>
                        <View style={styles.userDetails}>
                            <Text style={styles.userName}>ACCOUNT</Text>
                            <Text style={styles.userEmail}>{user?.email}</Text>
                        </View>
                    </View>
                </View>

                <View style={{ marginBottom: 16 }}>
                    <TouchableOpacity
                        style={{
                            backgroundColor: colors.button.primary,
                            padding: 16,
                            borderRadius: 8,
                            alignItems: 'center',
                            flexDirection: 'row',
                            justifyContent: 'center',
                            gap: 8
                        }}
                        onPress={() => router.push('/paywall')}
                    >
                        <Text style={{ color: colors.text.primary, fontWeight: 'bold', fontSize: 16 }}>Manage Subscription & Tokens</Text>
                    </TouchableOpacity>
                </View>

                {/* Usage Tracker */}
                <UsageTracker ref={usageTrackerRef} />
            </ScrollView>

            <View style={[styles.footerContainer, Platform.OS === 'android' && { paddingBottom: 30 + insets.bottom }]}>
                <View style={styles.bottomButtonsRow}>
                    <TouchableOpacity
                        style={styles.signOutButton}
                        onPress={() => setIsSignOutModalVisible(true)}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.signOutText}>Sign Out</Text>
                    </TouchableOpacity>
                </View>
            </View>

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
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background.primary,
    },
    content: {
        flex: 1,
        paddingHorizontal: 16,
    },
    contentContainer: {
        paddingTop: 17,
        gap: 16,
    },
    profileCard: {
        backgroundColor: colors.button.secondary, // using secondary button bg (transparent white)
        borderRadius: 8,
        padding: 16,
    },
    profileInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    avatarContainer: {
        width: 60,
        height: 60,
        borderRadius: 30,
        borderWidth: 3,
        borderColor: colors.button.primary,
        overflow: 'hidden',
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
        fontSize: 18,
        fontWeight: '600',
    },
    userDetails: {
        flex: 1,
        justifyContent: 'center',
    },
    userName: {
        color: colors.text.secondary,
        fontFamily: fontFamily.primary,
        fontWeight: '700',
        fontSize: 12,
        marginBottom: 2,
    },
    userEmail: {
        color: colors.text.primary,
        fontFamily: fontFamily.primary,
        fontWeight: '400',
        fontSize: 13,
    },
    footerContainer: {
        alignSelf: 'stretch',
        backgroundColor: colors.background.secondary,
        paddingTop: 32,
        paddingHorizontal: 16,
        paddingBottom: 50,
        shadowColor: colors.palette.black,
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 20,
    },
    bottomButtonsRow: {
        flexDirection: 'row',
        alignSelf: 'stretch',
    },
    signOutButton: {
        flex: 1,
        height: 52,
        backgroundColor: colors.button.dangerDark, // Standardized to design system danger color
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    signOutText: {
        color: colors.text.primary,
        fontFamily: fontFamily.primary,
        fontWeight: '500',
        fontSize: 16,
    },
});
