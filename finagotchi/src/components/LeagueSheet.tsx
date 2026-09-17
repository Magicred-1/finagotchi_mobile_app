import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { LEAGUE_TIERS, useLeagueStore } from '../features/league/store';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { PressableScale } from './PressableScale';

interface Props {
    visible: boolean;
    onClose: () => void;
}

export function LeagueSheet({ visible, onClose }: Props) {
    const { currentTier, score, getProgress } = useLeagueStore();
    const tier = useLeagueStore((s) => s.getTier());
    const progress = getProgress();

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

                    <View style={[styles.currentCard, { borderColor: tier.color }]}>
                        <Text style={[styles.tierName, { color: tier.color }]}>{currentTier}</Text>
                        <Text style={styles.score}>{score} XP</Text>
                        <View style={styles.progressTrack}>
                            <View
                                style={[
                                    styles.progressFill,
                                    { width: `${progress.percent}%`, backgroundColor: tier.color },
                                ]}
                            />
                        </View>
                        <Text style={styles.progressText}>
                            {progress.current} / {progress.target} to next tier
                        </Text>
                    </View>

                    <Text style={styles.sectionTitle}>Tiers</Text>
                    {LEAGUE_TIERS.map((t) => (
                        <View key={t.name} style={styles.tierRow}>
                            <View style={[styles.tierDot, { backgroundColor: t.color }]} />
                            <Text style={styles.tierRowName}>{t.name}</Text>
                            <Text style={styles.tierRowScore}>≥ {t.minScore} XP</Text>
                        </View>
                    ))}
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
    currentCard: {
        alignItems: 'center',
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        marginBottom: spacing.md,
    },
    tierName: {
        fontSize: 28,
        fontFamily: 'Poppins_800ExtraBold',
    },
    score: {
        fontSize: typography.body,
        fontFamily: 'Poppins_600SemiBold',
        color: colors.textMuted,
        marginTop: 4,
    },
    progressTrack: {
        width: '100%',
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.10)',
        overflow: 'hidden',
        marginTop: spacing.sm,
    },
    progressFill: {
        height: '100%',
        borderRadius: 4,
    },
    progressText: {
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        color: colors.textMuted,
        marginTop: spacing.xs,
    },
    sectionTitle: {
        fontSize: typography.body,
        fontFamily: 'Poppins_800ExtraBold',
        color: colors.text,
        marginBottom: spacing.sm,
    },
    tierRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: 8,
    },
    tierDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    tierRowName: {
        flex: 1,
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
        color: colors.text,
    },
    tierRowScore: {
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        color: colors.textMuted,
    },
});
