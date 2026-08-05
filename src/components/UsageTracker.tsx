import React, { useEffect, useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { colors, fontFamily } from '../theme';
import { useEntitlements } from '../hooks/useEntitlements';

interface UsageStats {
    is_unlimited: boolean;
    basic_used: number;
    basic_limit: number;
    premium_used: number;
    premium_limit: number;
}

export interface UsageTrackerRef {
    refresh: () => Promise<void>;
}

export const UsageTracker = forwardRef<UsageTrackerRef>((_, ref) => {
    const { user } = useAuth();
    const { entitlements, refetch: refetchEntitlements } = useEntitlements();
    const [stats, setStats] = useState<UsageStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        if (!user) {
            // Reset transient state when the user goes away (e.g. sign-out)
            setStats(null);
            setLoading(false);
            return;
        }
        fetchStats();
        return () => { isMounted.current = false; };
    }, [user]);

    const fetchStats = async () => {
        try {
            setErrorMsg(null);
            // Reload entitlements to get fresh balance
            await refetchEntitlements();

            const { data, error } = await supabase.rpc('get_usage_stats', {
                p_user_id: user?.id
            });
            if (error) throw error;
            if (isMounted.current) setStats(data);
        } catch (error: any) {
            console.error('Failed to fetch usage stats:', error);
            if (isMounted.current) setErrorMsg(error.message || 'Failed to load usage.');
        } finally {
            if (isMounted.current) setLoading(false);
        }
    };

    // Expose refresh function to parent via ref
    useImperativeHandle(ref, () => ({
        refresh: fetchStats
    }));

    if (loading) {
        return <ActivityIndicator size="small" color={colors.text.secondary} />;
    }

    if (errorMsg) {
        return (
            <View style={styles.container}>
                <Text style={[styles.title, { color: colors.text.red }]}>Error Loading Usage</Text>
                <Text style={styles.subtitle}>{errorMsg}</Text>
            </View>
        );
    }

    if (!stats) return null;

    if (stats.is_unlimited) {
        return (
            <View style={styles.container}>
                <View style={styles.headerRow}>
                    <Text style={styles.title}>Plan Usage</Text>
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>UNLIMITED</Text>
                    </View>
                </View>
                <Text style={styles.subtitle}>You have unlimited generations.</Text>
            </View>
        );
    }

    const renderBar = (label: string, used: number, limit: number, color: string) => {
        // Guard against limit === 0 → NaN width ('NaN%' is an invalid RN style).
        const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
        return (
            <View style={styles.barContainer}>
                <View style={styles.barHeader}>
                    <Text style={styles.barLabel}>{label}</Text>
                    <Text style={styles.barValue}>{used} / {limit}</Text>
                </View>
                <View style={styles.track}>
                    <View style={[styles.progress, { width: `${percentage}%`, backgroundColor: color }]} />
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {entitlements.isStale && (
                <TouchableOpacity style={styles.staleBanner} onPress={fetchStats}>
                    <Text style={styles.staleBannerText}>Could not refresh balance. Tap to retry.</Text>
                </TouchableOpacity>
            )}
            <View style={styles.headerRow}>
                <Text style={styles.title}>Your Balance</Text>
                {entitlements.is_pro &&
                    <View style={[styles.badge, { backgroundColor: colors.accent.purple }]}>
                         <Text style={[styles.badgeText, { color: 'white' }]}>PRO</Text>
                    </View>
                }
            </View>

             <View style={styles.tokenSection}>
                <View style={styles.tokenRow}>
                    <Text style={styles.tokenValue}>{entitlements.remaining_total ?? entitlements.purchased_balance}</Text>
                    <Text style={styles.tokenLabel}>Tokens</Text>
                </View>
                <Text style={styles.tokenHint}>Tokens are used to generate miniatures.</Text>
            </View>

        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        backgroundColor: colors.border.subtle,
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
    },
    staleBanner: {
        backgroundColor: colors.accent.yellow,
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 6,
        marginBottom: 10,
    },
    staleBannerText: {
        fontSize: 12,
        color: colors.palette.black,
        fontFamily: fontFamily.primary,
        fontWeight: '600',
        textAlign: 'center',
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    title: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.text.primary,
        fontFamily: fontFamily.primary,
    },
    subtitle: {
        fontSize: 13,
        color: colors.text.secondary,
        fontFamily: fontFamily.primary,
    },
    badge: {
        backgroundColor: colors.accent.yellow,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    badgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: colors.palette.black,
    },
    bars: {
        gap: 16,
        marginBottom: 20,
    },
    barContainer: {
        gap: 6,
    },
    barHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    barLabel: {
        fontSize: 12,
        color: colors.text.secondary,
        fontFamily: fontFamily.primary,
    },
    barValue: {
        fontSize: 12,
        color: colors.text.primary,
        fontWeight: '500',
        fontFamily: fontFamily.primary,
    },
    track: {
        height: 6,
        backgroundColor: colors.overlay.soft,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progress: {
        height: '100%',
        borderRadius: 3,
    },
    tokenSection: {
        borderTopWidth: 1,
        borderTopColor: colors.overlay.soft,
        paddingTop: 16,
    },
    tokenTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text.primary,
        marginBottom: 8,
    },
    tokenRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 6,
        marginBottom: 4,
    },
    tokenValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.accent.blue,
    },
    tokenLabel: {
        fontSize: 14,
        color: colors.text.secondary,
    },
    tokenHint: {
         fontSize: 12,
         color: colors.text.secondary,
         fontStyle: 'italic',
    }
});
