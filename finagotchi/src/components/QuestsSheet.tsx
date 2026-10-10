import React, { useEffect, useMemo, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import type { QuestKind } from '../../../shared/quest-engine';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { PressableScale } from './PressableScale';
import { SectionLabel } from './SectionLabel';
import { useWalletStore } from '../features/wallet/store';
import { usePetStore } from '../features/pet/store';
import {
    useClaimQueue,
    useProfileStore,
    useQuestsStore,
    type QuestWithProgress,
} from '../features/quest-engine';
import {
    colors,
    fonts,
    radius,
    spacing,
    tracking,
    typography,
} from '../theme/tokens';

type FilterKind = 'All' | QuestKind;

const FILTERS: { id: FilterKind; label: string }[] = [
    { id: 'All', label: 'All' },
    { id: 'count', label: 'Habits' },
    { id: 'streak', label: 'Streaks' },
    { id: 'explore', label: 'Explore' },
];

const KIND_META: Record<
    QuestKind,
    { label: string; icon: string; accent: string }
> = {
    count: { label: 'Habit', icon: 'repeat-outline', accent: colors.primary },
    streak: { label: 'Streak', icon: 'flame-outline', accent: colors.amber },
    explore: { label: 'Explore', icon: 'compass-outline', accent: colors.amber },
};

/** Human copy for the failure banner's most recent rejection reason. */
const FAILURE_REASON_COPY: Record<string, string> = {
    conditions_not_met: 'The server is still confirming your on-chain activity.',
    unknown_quest: 'Your quest list changed since this reward was earned.',
    signature_not_found: 'Waiting for your transaction to be indexed.',
    bad_signature: 'Wallet sign-in problem. Reconnect your wallet and retry.',
    wallet_mismatch: 'Wallet sign-in problem. Reconnect your wallet and retry.',
    malformed: 'Wallet sign-in problem. Reconnect your wallet and retry.',
    unauthorized: 'Wallet sign-in problem. Reconnect your wallet and retry.',
};

function failureReasonCopy(reason: string): string {
    return FAILURE_REASON_COPY[reason] ?? 'Verification will retry automatically.';
}

type QuestStatus = 'active' | 'claiming' | 'credited' | 'locked';

type Props = {
    visible: boolean;
    onClose: () => void;
    onOpenRevive?: () => void;
};

export default function QuestsSheet({
    visible,
    onClose,
    onOpenRevive,
}: Props) {
    const [filter, setFilter] = useState<FilterKind>('All');
    const [recentlyTappedId, setRecentlyTappedId] = useState<string | null>(null);

    const walletAddress = useWalletStore((state) => state.address);
    const isWalletConnected = Boolean(walletAddress);

    const isDead = usePetStore((state) => state.isDead);
    const petName = usePetStore((state) => state.name);

    const questsByKey = useQuestsStore((state) => state.questsByKey);
    const progressByKey = useQuestsStore((state) => state.progressByKey);
    const credited = useProfileStore((state) => state.credited);
    const pendingClaims = useClaimQueue((state) => state.pending);
    const failedClaims = useClaimQueue((state) => state.failed);
    const pendingForWallet = walletAddress
        ? pendingClaims.filter((c) => c.wallet === walletAddress)
        : [];
    const failedForWallet = walletAddress
        ? failedClaims.filter((f) => f.wallet === walletAddress)
        : [];
    const latestFailure = failedForWallet.length
        ? failedForWallet.reduce((a, b) => (a.failedAt >= b.failedAt ? a : b))
        : undefined;

    // Opening the sheet refreshes today's list and retries pending claims.
    useEffect(() => {
        if (!visible || !walletAddress) return;
        void useQuestsStore.getState().refreshQuests(walletAddress);
        void useClaimQueue.getState().flush();
    }, [visible, walletAddress]);

    const quests = useMemo<QuestWithProgress[]>(() => {
        if (!walletAddress) return [];
        return useQuestsStore.getState().getQuestsWithProgress(walletAddress);
        // questsByKey/progressByKey are the underlying data; re-derive on change.
    }, [walletAddress, questsByKey, progressByKey]);

    const creditedEntries = walletAddress ? credited[walletAddress] ?? [] : [];

    const questsWithStatus = useMemo(() => {
        return quests.map((quest) => {
            let status: QuestStatus = 'active';
            if (
                creditedEntries.some(
                    (e) =>
                        e.day === quest.day &&
                        e.programId === quest.programId &&
                        e.kind === quest.kind
                )
            ) {
                status = 'credited';
            } else if (!isWalletConnected || isDead) {
                status = 'locked';
            } else if (quest.complete) {
                // Progress met locally — the claim is queued or in flight and
                // the server remains the payout authority.
                status = 'claiming';
            }
            return { ...quest, status };
        });
    }, [quests, creditedEntries, isWalletConnected, isDead]);

    const filteredQuests = useMemo(() => {
        const list =
            filter === 'All'
                ? questsWithStatus
                : questsWithStatus.filter((quest) => quest.kind === filter);

        const order: Record<QuestStatus, number> = {
            active: 0,
            claiming: 1,
            locked: 2,
            credited: 3,
        };

        return [...list].sort((a, b) => order[a.status] - order[b.status]);
    }, [filter, questsWithStatus]);

    const creditedCount = questsWithStatus.filter(
        (q) => q.status === 'credited'
    ).length;
    const activeCount = questsWithStatus.filter(
        (q) => q.status === 'active'
    ).length;
    const progressPercent =
        questsWithStatus.length > 0
            ? (creditedCount / questsWithStatus.length) * 100
            : 0;

    function handleFilterPress(item: FilterKind) {
        if (filter === item) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setFilter(item);
    }

    function handleQuestPress(quest: QuestWithProgress & { status: QuestStatus }) {
        if (quest.status === 'claiming') {
            // Atomic retry prep (drops a stale failed entry, un-backs-off a
            // pending one, or enqueues fresh) + immediate flush — the tap
            // always ends with a due claim to send.
            if (walletAddress) {
                useClaimQueue.getState().prepareRetry({
                    wallet: walletAddress,
                    day: quest.day,
                    questId: quest.id,
                    programId: quest.programId,
                    kind: quest.kind,
                });
                void useClaimQueue.getState().flush();
            }
            return;
        }

        if (quest.status === 'active' || quest.status === 'locked') {
            setRecentlyTappedId(quest.id);
            setTimeout(
                () => setRecentlyTappedId((id) => (id === quest.id ? null : id)),
                800
            );
        }
    }

    return (
        <BottomSheet visible={visible} onClose={onClose} title="Quests">
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.container}
            >
                {/* HERO */}
                <View style={styles.hero}>
                    <View style={styles.heroCopy}>
                        <SectionLabel color={colors.primary}>
                            Daily quests
                        </SectionLabel>
                        <Text style={styles.heroTitle}>
                            Earn verified rewards with {petName ?? 'Finny'}.
                        </Text>
                    </View>

                    <View style={styles.progressWrap}>
                        <View style={styles.progressHeader}>
                            <Text style={styles.progressLabel}>Claimed</Text>
                            <Text style={styles.progressValue}>
                                {creditedCount}/{questsWithStatus.length}
                            </Text>
                        </View>
                        <View style={styles.progressTrack}>
                            <View
                                style={[
                                    styles.progressFill,
                                    { width: `${progressPercent}%` },
                                ]}
                            />
                        </View>
                    </View>
                </View>

                {isDead ? (
                    <View style={styles.deathBanner}>
                        <Ionicons
                            name="skull-outline"
                            size={20}
                            color={colors.danger}
                        />
                        <View style={styles.deathText}>
                            <Text style={styles.deathTitle}>
                                Quests are paused
                            </Text>
                            <Text style={styles.deathBody}>
                                {petName ?? 'Your creature'} needs to be revived
                                before you can earn quest rewards.
                            </Text>
                        </View>
                        {onOpenRevive ? (
                            <Button
                                title="Revive"
                                onPress={() => {
                                    onClose();
                                    onOpenRevive();
                                }}
                            />
                        ) : null}
                    </View>
                ) : null}

                {!isWalletConnected ? (
                    <View style={styles.deathBanner}>
                        <Ionicons
                            name="wallet-outline"
                            size={20}
                            color={colors.primary}
                        />
                        <View style={styles.deathText}>
                            <Text style={styles.deathTitle}>
                                Connect a wallet
                            </Text>
                            <Text style={styles.deathBody}>
                                Quests are generated from your on-chain activity
                                and verified on the server.
                            </Text>
                        </View>
                    </View>
                ) : null}

                {failedForWallet.length > 0 ? (
                    <PressableScale
                        onPress={() => {
                            if (!walletAddress) return;
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            // Fresh retry budget for every failed claim, then
                            // try to cash them right away.
                            useClaimQueue.getState().retryFailed(walletAddress);
                            void useClaimQueue.getState().flush();
                        }}
                        style={styles.failedBanner}
                    >
                        <Ionicons
                            name="alert-circle-outline"
                            size={20}
                            color={colors.warning}
                        />
                        <View style={styles.failedBannerTextWrap}>
                            <Text style={styles.failedBannerText}>
                                {failedForWallet.length} reward
                                {failedForWallet.length === 1 ? '' : 's'} failed to
                                verify — tap to retry
                            </Text>
                            {latestFailure ? (
                                <Text style={styles.failedBannerReason}>
                                    {failureReasonCopy(latestFailure.reason)}
                                </Text>
                            ) : null}
                        </View>
                    </PressableScale>
                ) : null}

                {/* FILTERS */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filters}
                >
                    {FILTERS.map((item) => {
                        const active = filter === item.id;

                        return (
                            <PressableScale
                                key={item.id}
                                onPress={() => handleFilterPress(item.id)}
                                style={[
                                    styles.filter,
                                    active && styles.filterActive,
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.filterText,
                                        active && styles.filterTextActive,
                                    ]}
                                >
                                    {item.label}
                                </Text>
                            </PressableScale>
                        );
                    })}
                </ScrollView>

                {/* QUEST LIST */}
                <View style={styles.sectionHeader}>
                    <SectionLabel>Available</SectionLabel>
                    <Text style={styles.sectionCount}>{activeCount}</Text>
                </View>

                <View style={styles.questList}>
                    {filteredQuests.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons
                                name="sparkles-outline"
                                size={22}
                                color={colors.textMuted}
                            />
                            <Text style={styles.emptyText}>
                                {isWalletConnected
                                    ? 'No quests in this category today. New quests arrive at midnight UTC.'
                                    : 'Connect a wallet to see your quests.'}
                            </Text>
                        </View>
                    ) : null}

                    {filteredQuests.map((quest) => {
                        const isCredited = quest.status === 'credited';
                        const isLocked = quest.status === 'locked';
                        const isClaiming = quest.status === 'claiming';
                        const meta = KIND_META[quest.kind];
                        const accent = meta.accent;
                        const isSponsored = Boolean(quest.sponsor);
                        const tappedInactive =
                            recentlyTappedId === quest.id &&
                            (isLocked || quest.status === 'active');
                        const questPercent =
                            quest.goal > 0
                                ? Math.min(100, (quest.current / quest.goal) * 100)
                                : 0;

                        return (
                            <PressableScale
                                key={quest.id}
                                onPress={() => handleQuestPress(quest)}
                                disabled={isCredited}
                                activeOpacity={isCredited ? 0.68 : 0.92}
                                style={[
                                    styles.questCard,
                                    isSponsored && styles.questCardSponsored,
                                    isCredited && styles.questCompleted,
                                    isLocked && styles.questLocked,
                                ]}
                            >
                                <View
                                    style={[
                                        styles.questIcon,
                                        {
                                            backgroundColor: `${accent}18`,
                                            borderColor: `${accent}35`,
                                        },
                                    ]}
                                >
                                    <Ionicons
                                        name={
                                            meta.icon as keyof typeof Ionicons.glyphMap
                                        }
                                        size={22}
                                        color={accent}
                                    />
                                </View>

                                <View style={styles.questBody}>
                                    <View style={styles.questTop}>
                                        <View style={styles.questMeta}>
                                            <Text
                                                style={[
                                                    styles.questCategory,
                                                    { color: accent },
                                                ]}
                                            >
                                                {meta.label.toUpperCase()}
                                            </Text>
                                            {isSponsored ? (
                                                <View style={styles.sponsoredBadge}>
                                                    <Text style={styles.sponsoredText}>
                                                        Sponsored
                                                    </Text>
                                                </View>
                                            ) : null}
                                        </View>
                                        {isCredited ? (
                                            <Ionicons
                                                name="checkmark-circle"
                                                size={18}
                                                color={colors.success}
                                            />
                                        ) : isLocked ? (
                                            <Ionicons
                                                name="lock-closed"
                                                size={16}
                                                color={colors.textMuted}
                                            />
                                        ) : null}
                                    </View>

                                    <Text
                                        style={styles.questTitle}
                                        numberOfLines={1}
                                    >
                                        {quest.title}
                                    </Text>

                                    <Text
                                        style={styles.questDescription}
                                        numberOfLines={2}
                                    >
                                        {quest.description}
                                    </Text>

                                    {!isCredited && !isLocked ? (
                                        <View style={styles.questProgressRow}>
                                            <View style={styles.questProgressTrack}>
                                                <View
                                                    style={[
                                                        styles.questProgressFill,
                                                        {
                                                            width: `${questPercent}%`,
                                                            backgroundColor: accent,
                                                        },
                                                    ]}
                                                />
                                            </View>
                                            <Text style={styles.questProgressText}>
                                                {Math.min(quest.current, quest.goal)}/
                                                {quest.goal}
                                            </Text>
                                        </View>
                                    ) : null}

                                    <View style={styles.questBottom}>
                                        <View style={styles.rewardPills}>
                                            <View style={styles.pointPill}>
                                                <Text style={styles.pointText}>
                                                    +{quest.xp} pts
                                                </Text>
                                            </View>
                                            <View style={styles.xpPill}>
                                                <Text style={styles.xpText}>
                                                    +{quest.xp} XP
                                                </Text>
                                            </View>
                                        </View>

                                        {isClaiming ? (
                                            <Text style={styles.claimHint}>
                                                {pendingForWallet.some(
                                                    (c) => c.questId === quest.id
                                                )
                                                    ? 'Verifying…'
                                                    : 'Tap to verify'}
                                            </Text>
                                        ) : null}
                                    </View>
                                </View>

                                {tappedInactive ? (
                                    <View style={styles.lockedHintOverlay}>
                                        <Text style={styles.lockedHintText}>
                                            {isLocked
                                                ? 'Complete the requirement first'
                                                : 'Do it on-chain to complete this quest'}
                                        </Text>
                                    </View>
                                ) : null}
                            </PressableScale>
                        );
                    })}
                </View>

                {/* FOOTER */}
                <View style={styles.footer}>
                    <Ionicons
                        name="shield-checkmark-outline"
                        size={20}
                        color={colors.primary}
                    />
                    <Text style={styles.footerTitle}>
                        Daily quests reset at midnight UTC.
                    </Text>
                    <Text style={styles.footerText}>
                        Rewards are verified against your on-chain activity and
                        credited by the server — complete a quest and it claims
                        automatically.
                    </Text>
                </View>
            </ScrollView>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingBottom: spacing.xl,
    },
    hero: {
        width: '100%',
        padding: spacing.md,
        borderRadius: radius.xl,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.md,
    },
    heroCopy: {
        gap: spacing.xs,
    },
    heroTitle: {
        color: colors.textStrong,
        fontSize: typography.heading,
        fontFamily: fonts.bold,
        letterSpacing: tracking.heading,
    },
    progressWrap: {
        gap: spacing.sm,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    progressLabel: {
        color: colors.textMuted,
        fontSize: typography.micro,
        fontFamily: fonts.mono,
        letterSpacing: tracking.eyebrow,
        textTransform: 'uppercase',
    },
    progressValue: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: fonts.monoBold,
    },
    progressTrack: {
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.surfaceLight,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 4,
        backgroundColor: colors.primary,
    },
    deathBanner: {
        marginTop: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: 'rgba(243,111,124,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(243,111,124,0.20)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    deathText: {
        flex: 1,
        gap: 2,
    },
    failedBanner: {
        marginTop: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: 'rgba(233,184,70,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(233,184,70,0.22)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    failedBannerTextWrap: {
        flex: 1,
        gap: 2,
    },
    failedBannerText: {
        color: colors.warning,
        fontSize: typography.small,
        lineHeight: 18,
        fontFamily: fonts.semiBold,
    },
    failedBannerReason: {
        color: colors.textMuted,
        fontSize: typography.small,
        lineHeight: 18,
        fontFamily: fonts.regular,
    },
    deathTitle: {
        color: colors.textStrong,
        fontSize: typography.body,
        fontFamily: fonts.semiBold,
    },
    deathBody: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: fonts.regular,
        lineHeight: 18,
    },
    filters: {
        paddingVertical: spacing.md,
        gap: spacing.sm,
    },
    filter: {
        height: 36,
        paddingHorizontal: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: colors.border,
    },
    filterActive: {
        backgroundColor: 'rgba(141,201,246,0.12)',
        borderColor: 'rgba(141,201,246,0.30)',
    },
    filterText: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: fonts.semiBold,
    },
    filterTextActive: {
        color: colors.primary,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.sm,
        gap: spacing.sm,
    },
    sectionCount: {
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radius.sm,
        color: colors.textMuted,
        backgroundColor: colors.chip,
        fontSize: typography.small,
        fontFamily: fonts.monoBold,
    },
    questList: {
        gap: spacing.sm,
    },
    emptyState: {
        alignItems: 'center',
        padding: spacing.lg,
        gap: spacing.sm,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    emptyText: {
        color: colors.textMuted,
        fontSize: typography.small,
        lineHeight: 18,
        textAlign: 'center',
        fontFamily: fonts.regular,
    },
    questCard: {
        minHeight: 108,
        padding: spacing.md,
        borderRadius: radius.md,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
    },
    questCardSponsored: {
        borderColor: 'rgba(248,180,60,0.35)',
        backgroundColor: 'rgba(248,180,60,0.06)',
    },
    questCompleted: {
        opacity: 0.6,
        borderColor: 'rgba(126,214,167,0.30)',
    },
    questLocked: {
        opacity: 0.65,
        backgroundColor: colors.panel,
        borderColor: colors.borderSoft,
    },
    questIcon: {
        width: 48,
        height: 48,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    questBody: {
        flex: 1,
        minWidth: 0,
        marginLeft: spacing.md,
        gap: spacing.xs,
    },
    questTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    questMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    questCategory: {
        fontSize: 10,
        letterSpacing: tracking.eyebrow,
        fontFamily: fonts.mono,
    },
    sponsoredBadge: {
        paddingVertical: 2,
        paddingHorizontal: 6,
        borderRadius: 6,
        backgroundColor: 'rgba(248,180,60,0.15)',
    },
    sponsoredText: {
        color: colors.amber,
        fontSize: 9,
        fontFamily: fonts.semiBold,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    questTitle: {
        color: colors.textStrong,
        fontSize: typography.body,
        fontFamily: fonts.semiBold,
    },
    questDescription: {
        color: colors.textMuted,
        fontSize: typography.small,
        lineHeight: 18,
        fontFamily: fonts.regular,
    },
    questProgressRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    questProgressTrack: {
        flex: 1,
        height: 5,
        borderRadius: 3,
        backgroundColor: colors.surfaceLight,
        overflow: 'hidden',
    },
    questProgressFill: {
        height: '100%',
        borderRadius: 3,
    },
    questProgressText: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: fonts.mono,
    },
    questBottom: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: spacing.xs,
    },
    rewardPills: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    pointPill: {
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radius.sm,
        backgroundColor: colors.chip,
    },
    pointText: {
        color: colors.gold,
        fontSize: typography.small,
        fontFamily: fonts.monoBold,
    },
    xpPill: {
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radius.sm,
        backgroundColor: colors.chip,
    },
    xpText: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: fonts.monoBold,
    },
    claimHint: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: fonts.semiBold,
    },
    lockedHintOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(6,29,61,0.88)',
    },
    lockedHintText: {
        color: colors.textStrong,
        fontSize: typography.small,
        fontFamily: fonts.semiBold,
    },
    footer: {
        alignItems: 'center',
        marginTop: spacing.lg,
        paddingHorizontal: spacing.md,
        gap: spacing.xs,
    },
    footerTitle: {
        color: colors.textStrong,
        fontSize: typography.small,
        textAlign: 'center',
        fontFamily: fonts.semiBold,
    },
    footerText: {
        color: colors.textMuted,
        fontSize: typography.small,
        lineHeight: 18,
        textAlign: 'center',
        fontFamily: fonts.regular,
    },
});
