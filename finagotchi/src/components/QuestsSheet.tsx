import React, { useMemo, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { BottomSheet } from './BottomSheet';
import { PressableScale } from './PressableScale';
import { useWalletStore } from '../features/wallet/store';
import { colors, radius, spacing, typography } from '../theme/tokens';

type QuestCategory = 'All' | 'Wallet' | 'Bank' | 'Habits' | 'Social';
type QuestSource = 'wallet' | 'bank' | 'habit' | 'social';

type Quest = {
    id: string;
    category: Exclude<QuestCategory, 'All'>;
    source: QuestSource;
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    description: string;
    reward: number;
    accent: string;
    /** For data-driven quests: the metric to read once wallet/bank data is indexed. */
    requirement?: {
        metric: 'transactions' | 'balance' | 'accounts' | 'streak';
        target: number;
    };
};

const QUESTS: Quest[] = [
    {
        id: 'save-streak',
        category: 'Habits',
        source: 'habit',
        icon: 'leaf-outline',
        title: 'Daily savings streak',
        description: 'Keep your daily savings streak alive.',
        reward: 25,
        accent: colors.primary,
    },
    {
        id: 'wallet-activity',
        category: 'Wallet',
        source: 'wallet',
        icon: 'wallet-outline',
        title: 'On-chain activity',
        description: 'Make one wallet transaction today.',
        reward: 75,
        accent: '#6EA8FF',
        requirement: { metric: 'transactions', target: 1 },
    },
    {
        id: 'bank-linked',
        category: 'Bank',
        source: 'bank',
        icon: 'card-outline',
        title: 'Link a bank account',
        description: 'Connect a bank to track saving goals.',
        reward: 150,
        accent: '#F6C85F',
        requirement: { metric: 'accounts', target: 1 },
    },
    {
        id: 'share',
        category: 'Social',
        source: 'social',
        icon: 'share-outline',
        title: 'Share your Finny',
        description: 'Show your companion to a friend.',
        reward: 40,
        accent: '#FF8E9E',
    },
];

const FILTERS: QuestCategory[] = ['All', 'Wallet', 'Bank', 'Habits', 'Social'];

type Props = {
    visible: boolean;
    onClose: () => void;
};

export default function QuestsSheet({ visible, onClose }: Props) {
    const { width } = useWindowDimensions();
    const [filter, setFilter] = useState<QuestCategory>('All');
    const [manualCompleted, setManualCompleted] = useState<Record<string, boolean>>({});

    const walletAddress = useWalletStore((state) => state.address);
    const isWalletConnected = Boolean(walletAddress);

    const isSmallDevice = width < 360;

    const questStatus = useMemo(() => {
        return QUESTS.map((quest) => {
            if (manualCompleted[quest.id]) {
                return { ...quest, status: 'completed' as const };
            }

            if (quest.source === 'wallet') {
                // TODO: replace with indexed wallet transaction count.
                return { ...quest, status: isWalletConnected ? 'available' : 'locked' as const };
            }

            if (quest.source === 'bank') {
                // TODO: replace with indexed bank account count.
                return { ...quest, status: 'locked' as const };
            }

            return { ...quest, status: 'available' as const };
        });
    }, [isWalletConnected, manualCompleted]);

    const filteredQuests = useMemo(
        () =>
            filter === 'All'
                ? questStatus
                : questStatus.filter((quest) => quest.category === filter),
        [filter, questStatus]
    );

    const completedCount = questStatus.filter((q) => q.status === 'completed').length;
    const totalRewards = questStatus.reduce(
        (sum, quest) => sum + (quest.status === 'completed' ? quest.reward : 0),
        0
    );

    function handleFilterPress(item: QuestCategory) {
        if (filter === item) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setFilter(item);
    }

    function handleQuestPress(quest: Quest & { status: string }) {
        if (quest.status !== 'available') return;
        if (quest.source !== 'habit' && quest.source !== 'social') return;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setManualCompleted((current) => ({
            ...current,
            [quest.id]: true,
        }));
    }

    return (
        <BottomSheet visible={visible} onClose={onClose} title="Quests">
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.container}
            >
                {/* HERO */}
                <View style={styles.hero}>
                    <View style={styles.heroTop}>
                        <View style={styles.heroCopy}>
                            <Text style={styles.heroEyebrow}>
                                QUESTS
                            </Text>
                            <Text style={styles.heroTitle}>
                                Grow with good habits.
                            </Text>
                            <Text style={styles.heroSubtitle}>
                                Wallet and bank quests complete automatically once
                                your accounts are connected.
                            </Text>
                        </View>

                        <View style={styles.heroCreature}>
                            <Ionicons
                                name="egg-outline"
                                size={32}
                                color={colors.primary}
                            />
                        </View>
                    </View>

                    <View style={styles.dailyProgressHeader}>
                        <Text style={styles.dailyProgressLabel}>
                            Daily progress
                        </Text>
                        <Text style={styles.dailyProgressValue}>
                            {completedCount}/{QUESTS.length}
                        </Text>
                    </View>

                    <View style={styles.progressTrack}>
                        <View
                            style={[
                                styles.progressFill,
                                {
                                    width: `${
                                        (completedCount / QUESTS.length) * 100
                                    }%`,
                                },
                            ]}
                        />
                    </View>
                </View>

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
                    <Text style={styles.sectionTitle}>Available quests</Text>
                    <Text style={styles.sectionCount}>
                        {filteredQuests.length}
                    </Text>
                </View>

                <View style={styles.questList}>
                    {filteredQuests.map((quest) => {
                        const isCompleted = quest.status === 'completed';
                        const isLocked = quest.status === 'locked';
                        const isTappable = quest.status === 'available' &&
                            (quest.source === 'habit' || quest.source === 'social');

                        return (
                            <PressableScale
                                key={quest.id}
                                onPress={() => handleQuestPress(quest)}
                                disabled={!isTappable}
                                activeOpacity={isCompleted ? 0.68 : 0.85}
                                style={[
                                    styles.questCard,
                                    isCompleted && styles.questCompleted,
                                    isLocked && styles.questLocked,
                                ]}
                            >
                                <View
                                    style={[
                                        styles.questIcon,
                                        {
                                            backgroundColor: `${quest.accent}18`,
                                            borderColor: `${quest.accent}35`,
                                        },
                                    ]}
                                >
                                    <Ionicons
                                        name={quest.icon}
                                        size={22}
                                        color={quest.accent}
                                    />
                                </View>

                                <View style={styles.questBody}>
                                    <View style={styles.questTitleRow}>
                                        <View style={styles.questTitleWrap}>
                                            <Text style={styles.questCategory}>
                                                {quest.category.toUpperCase()}
                                            </Text>

                                            <Text
                                                style={styles.questTitle}
                                                numberOfLines={1}
                                            >
                                                {quest.title}
                                            </Text>
                                        </View>

                                        {isLocked && (
                                            <View style={styles.lockedBadge}>
                                                <Text style={styles.lockedText}>
                                                    Connect
                                                </Text>
                                            </View>
                                        )}
                                    </View>

                                    <Text
                                        style={styles.questDescription}
                                        numberOfLines={2}
                                    >
                                        {quest.description}
                                    </Text>

                                    <View style={styles.questBottom}>
                                        <View style={styles.xpPill}>
                                            <Text style={styles.xpText}>
                                                +{quest.reward} XP
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                <Ionicons
                                    name={
                                        isCompleted
                                            ? 'checkmark-circle'
                                            : isLocked
                                            ? 'lock-closed'
                                            : 'chevron-forward'
                                    }
                                    size={22}
                                    color={
                                        isCompleted
                                            ? colors.primary
                                            : colors.textMuted
                                    }
                                    style={styles.questChevron}
                                />
                            </PressableScale>
                        );
                    })}
                </View>

                {/* FOOTER */}
                <View style={styles.footer}>
                    <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
                    <Text style={styles.footerTitle}>
                        Every good habit makes Finny stronger.
                    </Text>
                    <Text style={styles.footerText}>
                        Wallet and bank quests will unlock once those accounts
                        are connected.
                    </Text>
                </View>
            </ScrollView>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingBottom: 32,
    },
    hero: {
        width: '100%',
        padding: 17,
        borderRadius: 22,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
    },
    heroTop: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    heroCopy: {
        flex: 1,
        paddingRight: 10,
    },
    heroEyebrow: {
        color: colors.primary,
        fontSize: 9,
        letterSpacing: 1.1,
        fontFamily: 'Poppins_700Bold',
    },
    heroTitle: {
        marginTop: 3,
        color: colors.text,
        fontSize: 19,
        fontFamily: 'Poppins_800ExtraBold',
    },
    heroSubtitle: {
        marginTop: 4,
        color: colors.textMuted,
        fontSize: 11,
        lineHeight: 17,
        fontFamily: 'Poppins_400Regular',
    },
    heroCreature: {
        width: 66,
        height: 66,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(93,226,166,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(93,226,166,0.20)',
    },
    dailyProgressHeader: {
        marginTop: 18,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    dailyProgressLabel: {
        color: colors.textMuted,
        fontSize: 10,
        fontFamily: 'Poppins_600SemiBold',
    },
    dailyProgressValue: {
        color: colors.primary,
        fontSize: 11,
        fontFamily: 'Poppins_800ExtraBold',
    },
    progressTrack: {
        height: 7,
        marginTop: 7,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.07)',
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 4,
        backgroundColor: colors.primary,
    },
    filters: {
        paddingVertical: 16,
        gap: 8,
    },
    filter: {
        height: 34,
        paddingHorizontal: 13,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 17,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
    },
    filterActive: {
        backgroundColor: 'rgba(93,226,166,0.12)',
        borderColor: 'rgba(93,226,166,0.28)',
    },
    filterText: {
        color: colors.textMuted,
        fontSize: 10,
        fontFamily: 'Poppins_600SemiBold',
    },
    filterTextActive: {
        color: colors.primary,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 9,
    },
    sectionTitle: {
        color: colors.text,
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
    },
    sectionCount: {
        marginLeft: 7,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 8,
        color: colors.textMuted,
        backgroundColor: 'rgba(255,255,255,0.05)',
        fontSize: 9,
        fontFamily: 'Poppins_600SemiBold',
    },
    questList: {
        gap: 9,
    },
    questCard: {
        minHeight: 104,
        padding: 12,
        borderRadius: 18,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
    },
    questCompleted: {
        opacity: 0.68,
    },
    questLocked: {
        opacity: 0.55,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderColor: 'rgba(255,255,255,0.04)',
    },
    questIcon: {
        width: 48,
        height: 48,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    questBody: {
        flex: 1,
        minWidth: 0,
        marginLeft: 11,
    },
    questTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    questTitleWrap: {
        flex: 1,
        minWidth: 0,
    },
    questCategory: {
        color: colors.textMuted,
        fontSize: 7,
        letterSpacing: 0.8,
        fontFamily: 'Poppins_700Bold',
    },
    questTitle: {
        marginTop: 1,
        color: colors.text,
        fontSize: 13,
        fontFamily: 'Poppins_700Bold',
    },
    lockedBadge: {
        marginLeft: 6,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
    },
    lockedText: {
        color: colors.textMuted,
        fontSize: 7,
        letterSpacing: 0.5,
        fontFamily: 'Poppins_800ExtraBold',
        textTransform: 'uppercase',
    },
    questDescription: {
        marginTop: 2,
        color: colors.textMuted,
        fontSize: 9,
        lineHeight: 14,
        fontFamily: 'Poppins_400Regular',
    },
    questBottom: {
        marginTop: 7,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    xpPill: {
        paddingHorizontal: 7,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: 'rgba(93,226,166,0.08)',
    },
    xpText: {
        color: colors.primary,
        fontSize: 8,
        fontFamily: 'Poppins_700Bold',
    },
    questChevron: {
        marginLeft: 6,
    },
    footer: {
        alignItems: 'center',
        marginTop: 24,
        paddingHorizontal: 20,
    },
    footerTitle: {
        color: colors.text,
        fontSize: 11,
        textAlign: 'center',
        fontFamily: 'Poppins_700Bold',
    },
    footerText: {
        marginTop: 3,
        color: colors.textMuted,
        fontSize: 9,
        lineHeight: 14,
        textAlign: 'center',
        fontFamily: 'Poppins_400Regular',
    },
});
