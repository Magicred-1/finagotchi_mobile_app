import React, { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useLeagueStore, type LeaderboardEntry } from '../features/league/store';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { PressableScale } from './PressableScale';
import {
    fetchLeaderboard,
    type DbsLeaderboardResponse,
} from '../features/dbs/client';
import { useWalletStore } from '../features/wallet/store';

interface Props {
    visible: boolean;
    onClose: () => void;
}

function shortWallet(wallet: string): string {
    return wallet.slice(0, 4) + '...' + wallet.slice(-4);
}

function toEntry(entry: {
    wallet: string;
    score: number;
    displayName: string;
    tier: string;
    isFriend?: boolean;
}): LeaderboardEntry {
    return {
        userId: entry.wallet,
        name: entry.displayName || shortWallet(entry.wallet),
        score: entry.score,
        tier: entry.tier as LeaderboardEntry['tier'],
        isFriend: entry.isFriend,
    };
}

export function LeaderboardSheet({ visible, onClose }: Props) {
    const scope = useLeagueStore((s) => s.leaderboardScope);
    const setScope = useLeagueStore((s) => s.setScope);
    const score = useLeagueStore((s) => s.score);
    const tier = useLeagueStore((s) => s.currentTier);
    const syncFromServer = useLeagueStore((s) => s.syncFromServer);
    const wallet = useWalletStore((s) => s.address);
    const [data, setData] = useState<DbsLeaderboardResponse | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!visible || !wallet) return;
        setFailed(false);
        syncFromServer().catch(() => {});
        fetchLeaderboard(wallet)
            .then((res) => setData(res))
            .catch(() => {
                setData(null);
                setFailed(true);
            });
    }, [visible, wallet, syncFromServer]);

    const entries = useMemo(() => {
        const rows = scope === 'global' ? data?.global : data?.friends;
        const mapped = (rows ?? []).map(toEntry);
        if (wallet && !mapped.some((e) => e.userId === wallet)) {
            const own = data?.own;
            mapped.push(
                own
                    ? { ...toEntry(own), name: 'You' }
                    : { userId: wallet, name: 'You', score, tier }
            );
        }
        mapped.sort((a, b) => b.score - a.score);
        return mapped;
    }, [scope, data, wallet, score, tier]);

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
                            <View
                                key={entry.userId}
                                style={[
                                    styles.row,
                                    entry.userId === wallet && styles.rowOwn,
                                ]}
                            >
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
                        {entries.length === 0 && (
                            <Text style={styles.emptyText}>
                                {failed
                                    ? 'Leaderboard unavailable — check your connection.'
                                    : wallet
                                      ? 'No entries yet. Check in daily to climb the ranks.'
                                      : 'Connect your wallet to see the leaderboard.'}
                            </Text>
                        )}
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
    rowOwn: {
        borderWidth: 1,
        borderColor: colors.primary,
    },
    emptyText: {
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        color: colors.textMuted,
        textAlign: 'center',
        paddingVertical: spacing.md,
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
