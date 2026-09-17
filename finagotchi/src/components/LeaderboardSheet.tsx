import React, { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { getLeaderboard, useLeagueStore, type LeaderboardEntry } from '../features/league/store';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { PressableScale } from './PressableScale';
import { fetchLeaderboard } from '../features/dbs/client';
import { useWalletStore } from '../features/wallet/store';

interface Props {
    visible: boolean;
    onClose: () => void;
}

export function LeaderboardSheet({ visible, onClose }: Props) {
    const scope = useLeagueStore((s) => s.leaderboardScope);
    const setScope = useLeagueStore((s) => s.setScope);
    const score = useLeagueStore((s) => s.score);
    const tier = useLeagueStore((s) => s.currentTier);
    const wallet = useWalletStore((s) => s.address);
    const [globalEntries, setGlobalEntries] = useState<LeaderboardEntry[] | null>(null);

    useEffect(() => {
        if (!visible || !wallet) return;
        fetchLeaderboard(wallet)
            .then((res) => {
                const mapped: LeaderboardEntry[] = res.global.map((entry) => ({
                    userId: entry.wallet,
                    name: entry.displayName || entry.wallet.slice(0, 4) + '...' + entry.wallet.slice(-4),
                    score: entry.score,
                    tier: 'Bronze',
                    isFriend: entry.isFriend,
                }));
                setGlobalEntries(mapped);
            })
            .catch(() => {
                setGlobalEntries([]);
            });
    }, [visible, wallet]);

    const entries = useMemo(() => {
        if (scope === 'global' && globalEntries !== null) {
            return globalEntries;
        }
        return getLeaderboard(scope, score, tier);
    }, [scope, score, tier, globalEntries]);

    return (
        <Modal transparent visible={visible} animationType="slide">
            <View style={styles.overlay}>
                <View style={styles.sheet}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Leaderboard</Text>
                        <PressableScale onPress={onClose}>
                            <Ionicons name="close" size={22} color={colors.textMuted} />
                        </PressableScale>
                    </View>

                    <View style={styles.scopeRow}>
                        <PressableScale
                            onPress={() => setScope('global')}
                            style={[styles.scopeButton, scope === 'global' && styles.scopeActive]}
                        >
                            <Text
                                style={[
                                    styles.scopeText,
                                    scope === 'global' && styles.scopeTextActive,
                                ]}
                            >
                                Global
                            </Text>
                        </PressableScale>
                        <PressableScale
                            onPress={() => setScope('friends')}
                            style={[styles.scopeButton, scope === 'friends' && styles.scopeActive]}
                        >
                            <Text
                                style={[
                                    styles.scopeText,
                                    scope === 'friends' && styles.scopeTextActive,
                                ]}
                            >
                                Friends
                            </Text>
                        </PressableScale>
                    </View>

                    <View style={styles.list}>
                        {entries.map((entry, index) => (
                            <View key={entry.userId} style={styles.row}>
                                <Text style={styles.rank}>{index + 1}</Text>
                                <View style={[styles.avatar, { backgroundColor: entry.isFriend ? colors.purple : colors.surfaceLight }]}>
                                    <Text style={styles.avatarText}>{entry.name[0]}</Text>
                                </View>
                                <View style={styles.nameCol}>
                                    <Text style={styles.name}>{entry.name}</Text>
                                    <Text style={styles.tier}>{entry.tier}</Text>
                                </View>
                                <Text style={styles.score}>{entry.score}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(2,6,12,0.72)',
    },
    sheet: {
        padding: spacing.md,
        paddingBottom: 32,
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
        backgroundColor: colors.surface,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
    },
    title: {
        fontSize: typography.heading,
        fontFamily: 'Poppins_800ExtraBold',
        color: colors.text,
    },
    scopeRow: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginBottom: spacing.md,
    },
    scopeButton: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 8,
        borderRadius: radius.pill,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    scopeActive: {
        backgroundColor: colors.primary,
    },
    scopeText: {
        fontSize: typography.small,
        fontFamily: 'Poppins_800ExtraBold',
        color: colors.textMuted,
    },
    scopeTextActive: {
        color: colors.background,
    },
    list: {
        gap: 8,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    rank: {
        width: 28,
        fontSize: typography.body,
        fontFamily: 'Poppins_800ExtraBold',
        color: colors.textMuted,
        textAlign: 'center',
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontSize: typography.body,
        fontFamily: 'Poppins_800ExtraBold',
        color: colors.text,
    },
    nameCol: {
        flex: 1,
    },
    name: {
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
        color: colors.text,
    },
    tier: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
        color: colors.textMuted,
    },
    score: {
        fontSize: typography.small,
        fontFamily: 'Poppins_800ExtraBold',
        color: colors.text,
    },
});
