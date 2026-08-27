import React, { useMemo, useState } from 'react';
import {
    ScrollView,
    Share,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { PressableScale } from './PressableScale';
import { useWalletStore } from '../features/wallet/store';
import { usePetStore } from '../features/pet/store';
import { useCheckinStore } from '../features/checkin/store';
import {
    QUESTS,
    QUEST_ACCENTS,
    useQuestStore,
    type Quest,
    type QuestCategory,
} from '../features/quests/store';
import { colors, radius, spacing, typography } from '../theme/tokens';

type FilterCategory = 'All' | QuestCategory;

type QuestStatus = 'available' | 'completed' | 'locked' | 'coming-soon';

const FILTERS: FilterCategory[] = [
    'All',
    'Wallet',
    'Bank',
    'Habits',
    'Social',
    'Sponsored',
];

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
    const { width } = useWindowDimensions();
    const [filter, setFilter] = useState<FilterCategory>('All');
    const [claimedId, setClaimedId] = useState<string | null>(null);
    const [recentlyTappedId, setRecentlyTappedId] = useState<string | null>(null);

    const walletAddress = useWalletStore((state) => state.address);
    const transactionsToday = useWalletStore(
        (state) => state.transactionsToday
    );
    const isWalletConnected = Boolean(walletAddress);

    const addBalance = usePetStore((state) => state.addBalance);
    const addXp = usePetStore((state) => state.addXp);
    const boostHappiness = usePetStore((state) => state.boostHappiness);
    const isDead = usePetStore((state) => state.isDead);
    const petName = usePetStore((state) => state.name);

    const hasCheckedInToday = useCheckinStore(
        (state) => state.hasCheckedInToday
    );

    const isCompletedToday = useQuestStore((state) => state.isCompletedToday);
    const completeQuest = useQuestStore((state) => state.completeQuest);
    const getProgress = useQuestStore((state) => state.getProgress);

    const isSmallDevice = width < 360;

    const questsWithStatus = useMemo(() => {
        return QUESTS.map((quest) => {
            if (isCompletedToday(quest.id)) {
                return { ...quest, status: 'completed' as QuestStatus };
            }

            if (isDead) {
                return { ...quest, status: 'locked' as QuestStatus };
            }

            if (quest.source === 'bank') {
                return { ...quest, status: 'coming-soon' as QuestStatus };
            }

            if (quest.source === 'wallet' && !isWalletConnected) {
                return { ...quest, status: 'locked' as QuestStatus };
            }

            if (quest.source === 'wallet' && transactionsToday < 1) {
                return { ...quest, status: 'locked' as QuestStatus };
            }

            if (quest.source === 'habit' && !hasCheckedInToday()) {
                return { ...quest, status: 'locked' as QuestStatus };
            }

            return { ...quest, status: 'available' as QuestStatus };
        });
    }, [
        isWalletConnected,
        transactionsToday,
        hasCheckedInToday,
        isCompletedToday,
        isDead,
    ]);

    const filteredQuests = useMemo(() => {
        const list =
            filter === 'All'
                ? questsWithStatus
                : questsWithStatus.filter((quest) => quest.category === filter);

        const order: Record<QuestStatus, number> = {
            available: 0,
            locked: 1,
            'coming-soon': 2,
            completed: 3,
        };

        return list.sort((a, b) => order[a.status] - order[b.status]);
    }, [filter, questsWithStatus]);

    const progress = getProgress();
    const completedCount = questsWithStatus.filter(
        (q) => q.status === 'completed'
    ).length;
    const availableCount = questsWithStatus.filter(
        (q) => q.status === 'available'
    ).length;

    function handleFilterPress(item: FilterCategory) {
        if (filter === item) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setFilter(item);
    }

    function claimReward(quest: Quest) {
        completeQuest(quest.id);
        addBalance(quest.reward);
        addXp(quest.rewardXp);
        boostHappiness(10);
        setClaimedId(quest.id);
        setTimeout(() => setClaimedId((id) => (id === quest.id ? null : id)), 1600);
    }

    async function handleQuestPress(quest: Quest & { status: QuestStatus }) {
        if (quest.status !== 'available') {
            setRecentlyTappedId(quest.id);
            setTimeout(() => setRecentlyTappedId((id) => (id === quest.id ? null : id)), 800);
            return;
        }

        if (quest.source === 'social') {
            try {
                const result = await Share.share({
                    message: `${petName ?? 'My Finagotchi'} and I are building a daily savings streak on Solana. Come raise yours with Finagotchi.`,
                    url: 'https://www.finagotchi.app',
                    title: 'Share your Finagotchi',
                });
                if (result.action === Share.sharedAction) {
                    Haptics.notificationAsync(
                        Haptics.NotificationFeedbackType.Success
                    );
                    claimReward(quest);
                }
            } catch {
                // User cancelled or share failed; do not reward.
            }
            return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        claimReward(quest);
    }

    const progressPercent =
        progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;

    return (
        <BottomSheet visible={visible} onClose={onClose} title="Quests">
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.container}
            >
                {/* HERO */}
                <View style={styles.hero}>
                    <View style={styles.heroCopy}>
                        <Text style={styles.heroEyebrow}>Daily quests</Text>
                        <Text style={styles.heroTitle}>
                            Earn rewards by caring for {petName ?? 'Finny'}.
                        </Text>
                    </View>

                    <View style={styles.progressWrap}>
                        <View style={styles.progressHeader}>
                            <Text style={styles.progressLabel}>Progress</Text>
                            <Text style={styles.progressValue}>
                                {completedCount}/{progress.total}
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

                {/* FILTERS */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filters}
                >
                    {FILTERS.map((item) => {
                        const active = filter === item;

                        return (
                            <PressableScale
                                key={item}
                                onPress={() => handleFilterPress(item)}
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
                                    {item}
                                </Text>
                            </PressableScale>
                        );
                    })}
                </ScrollView>

                {/* QUEST LIST */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Available</Text>
                    <Text style={styles.sectionCount}>{availableCount}</Text>
                </View>

                <View style={styles.questList}>
                    {filteredQuests.map((quest) => {
                        const isCompleted = quest.status === 'completed';
                        const isLocked = quest.status === 'locked';
                        const isComingSoon = quest.status === 'coming-soon';
                        const isAvailable = quest.status === 'available';
                        const accent = QUEST_ACCENTS[quest.category];
                        const isSponsored = quest.source === 'sponsored';
                        const justClaimed = claimedId === quest.id;
                        const tappedLocked = recentlyTappedId === quest.id && isLocked;

                        return (
                            <PressableScale
                                key={quest.id}
                                onPress={() => handleQuestPress(quest)}
                                disabled={isCompleted || isComingSoon}
                                activeOpacity={isCompleted ? 0.68 : 0.92}
                                style={[
                                    styles.questCard,
                                    isSponsored && styles.questCardSponsored,
                                    isCompleted && styles.questCompleted,
                                    isLocked && styles.questLocked,
                                    isComingSoon && styles.questLocked,
                                    justClaimed && styles.questClaimed,
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
                                            quest.icon as keyof typeof Ionicons.glyphMap
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
                                                {quest.category.toUpperCase()}
                                            </Text>
                                            {isSponsored ? (
                                                <View style={styles.sponsoredBadge}>
                                                    <Text style={styles.sponsoredText}>
                                                        Sponsored
                                                    </Text>
                                                </View>
                                            ) : null}
                                        </View>
                                        {isCompleted ? (
                                            <Ionicons
                                                name="checkmark-circle"
                                                size={18}
                                                color={colors.primary}
                                            />
                                        ) : isLocked ? (
                                            <Ionicons
                                                name="lock-closed"
                                                size={16}
                                                color={colors.textMuted}
                                            />
                                        ) : isComingSoon ? (
                                            <Ionicons
                                                name="time-outline"
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
                                        {isLocked && quest.source === 'wallet' && !isWalletConnected
                                            ? 'Connect a wallet to unlock this reward.'
                                            : isLocked && quest.source === 'wallet'
                                            ? 'Make one wallet transaction today to unlock.'
                                            : isLocked && quest.source === 'habit'
                                            ? 'Check in today to unlock this reward.'
                                            : isComingSoon
                                            ? 'Bank linking is coming soon.'
                                            : quest.description}
                                    </Text>

                                    <View style={styles.questBottom}>
                                        <View style={styles.rewardPills}>
                                            <View style={styles.pointPill}>
                                                <Text style={styles.pointText}>
                                                    +{quest.reward} pts
                                                </Text>
                                            </View>
                                            <View style={styles.xpPill}>
                                                <Text style={styles.xpText}>
                                                    +{quest.rewardXp} XP
                                                </Text>
                                            </View>
                                        </View>

                                        {isAvailable && !isCompleted && (
                                            <Text style={styles.claimHint}>
                                                {justClaimed
                                                    ? 'Claimed!'
                                                    : quest.source === 'social'
                                                    ? 'Tap to share'
                                                    : 'Tap to claim'}
                                            </Text>
                                        )}
                                    </View>
                                </View>

                                {tappedLocked ? (
                                    <View style={styles.lockedHintOverlay}>
                                        <Text style={styles.lockedHintText}>
                                            Complete the requirement first
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
                        name="sparkles-outline"
                        size={20}
                        color={colors.primary}
                    />
                    <Text style={styles.footerTitle}>
                        Daily quests reset at midnight.
                    </Text>
                    <Text style={styles.footerText}>
                        Wallet and bank quests complete automatically once your
                        accounts are connected.
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
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.md,
    },
    heroCopy: {
        gap: spacing.xs,
    },
    heroEyebrow: {
        color: colors.primary,
        fontSize: typography.small,
        letterSpacing: 0.5,
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
    },
    heroTitle: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_800ExtraBold',
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
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
    },
    progressValue: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: 'Poppins_800ExtraBold',
    },
    progressTrack: {
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.07)',
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
        backgroundColor: 'rgba(255,100,124,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,100,124,0.20)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    deathText: {
        flex: 1,
        gap: 2,
    },
    deathTitle: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
    },
    deathBody: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
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
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    filterActive: {
        backgroundColor: 'rgba(93,226,166,0.12)',
        borderColor: 'rgba(93,226,166,0.28)',
    },
    filterText: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
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
    sectionTitle: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
    },
    sectionCount: {
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radius.sm,
        color: colors.textMuted,
        backgroundColor: 'rgba(255,255,255,0.05)',
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
    },
    questList: {
        gap: spacing.sm,
    },
    questCard: {
        minHeight: 108,
        padding: spacing.md,
        borderRadius: radius.lg,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
    },
    questCardSponsored: {
        borderColor: 'rgba(153,69,255,0.35)',
        backgroundColor: 'rgba(153,69,255,0.06)',
    },
    questCompleted: {
        opacity: 0.6,
        borderColor: 'rgba(93,226,166,0.25)',
    },
    questLocked: {
        opacity: 0.65,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderColor: 'rgba(255,255,255,0.05)',
    },
    questClaimed: {
        borderColor: colors.primary,
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
        letterSpacing: 0.6,
        fontFamily: 'Poppins_700Bold',
    },
    sponsoredBadge: {
        paddingVertical: 2,
        paddingHorizontal: 6,
        borderRadius: 6,
        backgroundColor: 'rgba(153,69,255,0.15)',
    },
    sponsoredText: {
        color: colors.purple,
        fontSize: 9,
        fontFamily: 'Poppins_800ExtraBold',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    questTitle: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
    },
    questDescription: {
        color: colors.textMuted,
        fontSize: typography.small,
        lineHeight: 18,
        fontFamily: 'Poppins_400Regular',
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
        backgroundColor: 'rgba(255,209,102,0.10)',
    },
    pointText: {
        color: colors.warning,
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
    },
    xpPill: {
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
        borderRadius: radius.sm,
        backgroundColor: 'rgba(153,69,255,0.12)',
    },
    xpText: {
        color: colors.purple,
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
    },
    claimHint: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
    },
    lockedHintOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(7,17,31,0.85)',
    },
    lockedHintText: {
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
    },
    footer: {
        alignItems: 'center',
        marginTop: spacing.lg,
        paddingHorizontal: spacing.md,
        gap: spacing.xs,
    },
    footerTitle: {
        color: colors.text,
        fontSize: typography.small,
        textAlign: 'center',
        fontFamily: 'Poppins_700Bold',
    },
    footerText: {
        color: colors.textMuted,
        fontSize: typography.small,
        lineHeight: 18,
        textAlign: 'center',
        fontFamily: 'Poppins_400Regular',
    },
});
