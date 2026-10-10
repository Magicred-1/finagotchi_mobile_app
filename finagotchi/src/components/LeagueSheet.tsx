import React, { useEffect } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { LEAGUE_TIERS, useLeagueStore } from '../features/league/store';
import { useWalletStore } from '../features/wallet/store';
import { colors, fonts, landing, radius, spacing, tracking, typography } from '../theme/tokens';
import { PressableScale } from './PressableScale';
import { SectionLabel } from './SectionLabel';

interface Props {
    visible: boolean;
    onClose: () => void;
}

export function LeagueSheet({ visible, onClose }: Props) {
    const { currentTier, score, getProgress } = useLeagueStore();
    const tier = useLeagueStore((s) => s.getTier());
    const syncFromServer = useLeagueStore((s) => s.syncFromServer);
    const wallet = useWalletStore((s) => s.address);
    const progress = getProgress();

    useEffect(() => {
        if (visible && wallet) {
            syncFromServer().catch(() => {});
        }
    }, [visible, wallet, syncFromServer]);

    return (
        <Modal transparent visible={visible} animationType="slide">
            <View style={styles.overlay}>
                <View style={styles.sheet}>
                    <View style={styles.header}>
                        <Text style={styles.title}>League</Text>
                        <PressableScale onPress={onClose}>
                            <Ionicons name="close" size={22} color={colors.textMuted} />
                        </PressableScale>
                    </View>

                    <View style={styles.currentCard}>
                        <Text style={[styles.tierName, { color: tier.color }]}>{currentTier}</Text>
                        <Text style={styles.score}>{score} XP</Text>
                        <View style={styles.progressTrack}>
                            <View
                                style={[
                                    styles.progressFill,
                                    { width: `${progress.percent}%` },
                                ]}
                            />
                        </View>
                        <Text style={styles.progressText}>
                            {progress.current} / {progress.target} to next tier
                        </Text>
                    </View>

                    <View style={styles.sectionHeader}>
                        <SectionLabel>Tiers</SectionLabel>
                    </View>
                    <View style={styles.tierList}>
                        {LEAGUE_TIERS.map((t) => (
                            <View
                                key={t.name}
                                style={[
                                    styles.tierRow,
                                    t.name === currentTier && styles.tierRowCurrent,
                                ]}
                            >
                                <View style={[styles.tierDot, { backgroundColor: t.color }]} />
                                <Text style={styles.tierRowName}>{t.name}</Text>
                                <Text style={styles.tierRowScore}>≥ {t.minScore} XP</Text>
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
        backgroundColor: 'rgba(6,29,61,0.72)',
    },
    sheet: {
        padding: spacing.md,
        paddingBottom: 32,
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
        backgroundColor: landing.navy,
        borderTopWidth: 1,
        borderTopColor: landing.glassBorderStrong,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
    },
    title: {
        fontSize: typography.heading,
        fontFamily: fonts.bold,
        color: colors.textStrong,
        letterSpacing: tracking.heading,
    },
    currentCard: {
        alignItems: 'center',
        padding: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: 'rgba(141,201,246,0.08)',
        borderWidth: 1,
        borderColor: colors.primary,
        marginBottom: spacing.md,
    },
    tierName: {
        fontSize: typography.heading,
        fontFamily: fonts.bold,
        letterSpacing: tracking.heading,
    },
    score: {
        fontSize: typography.title,
        fontFamily: fonts.monoBold,
        color: colors.textStrong,
        marginTop: 4,
    },
    progressTrack: {
        width: '100%',
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.surfaceLight,
        overflow: 'hidden',
        marginTop: spacing.sm,
    },
    progressFill: {
        height: '100%',
        borderRadius: 4,
        backgroundColor: colors.primary,
    },
    progressText: {
        fontSize: typography.small,
        fontFamily: fonts.mono,
        color: colors.textMuted,
        marginTop: spacing.xs,
    },
    sectionHeader: {
        marginBottom: spacing.sm,
    },
    tierList: {
        gap: spacing.sm,
    },
    tierRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    tierRowCurrent: {
        borderColor: colors.primary,
        backgroundColor: 'rgba(141,201,246,0.08)',
    },
    tierDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    tierRowName: {
        flex: 1,
        fontSize: typography.small,
        fontFamily: fonts.medium,
        color: colors.textStrong,
    },
    tierRowScore: {
        fontSize: typography.small,
        fontFamily: fonts.mono,
        color: colors.textMuted,
    },
});
