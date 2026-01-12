import React, { useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

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
    const [stats, setStats] = useState<UsageStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        fetchStats();
    }, [user]);

    const fetchStats = async () => {
        try {
            setErrorMsg(null);
            const { data, error } = await supabase.rpc('get_usage_stats', {
                p_user_id: user?.id
            });
            if (error) throw error;
            setStats(data);
        } catch (error: any) {
            console.error('Failed to fetch usage stats:', error);
            setErrorMsg(error.message || 'Failed to load usage.');
        } finally {
            setLoading(false);
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
                <Text style={[styles.title, { color: colors.accent.red }]}>Error Loading Usage</Text>
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
        const percentage = Math.min((used / limit) * 100, 100);
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
            <Text style={styles.title}>Monthly Usage</Text>
            <View style={styles.bars}>
                {renderBar("Basic Generations", stats.basic_used, stats.basic_limit, colors.accent.blue)}
                {renderBar("Premium Generations", stats.premium_used, stats.premium_limit, colors.accent.purple)}
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    title: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text.primary,
        marginBottom: 12,
        fontFamily: 'SF Pro Display',
    },
    subtitle: {
        fontSize: 13,
        color: colors.text.secondary,
        fontFamily: 'SF Pro Display',
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
        color: '#000',
    },
    bars: {
        gap: 16,
    },
    barContainer: {
        gap: 6,
    },
    barHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    barLabel: {
        fontSize: 12, // Reduced size
        color: colors.text.secondary,
        fontFamily: 'SF Pro Display',
    },
    barValue: {
        fontSize: 12, // Reduced size
        color: colors.text.primary,
        fontWeight: '500',
        fontFamily: 'SF Pro Display',
    },
    track: {
        height: 6,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progress: {
        height: '100%',
        borderRadius: 3,
    },
});
