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
import { colors, radius, spacing, typography } from '../theme/tokens';

type QuestCategory = 'All' | 'Daily' | 'Security' | 'Growth' | 'Social';

type Quest = {
    id: string;
    category: Exclude<QuestCategory, 'All'>;
    icon: string;
    title: string;
    description: string;
    reward: number;
    progress: number;
    total: number;
    accent: string;
    completed?: boolean;
    urgent?: boolean;
};

const QUESTS: Quest[] = [
    {
        id: 'check-in',
        category: 'Daily',
        icon: '🌱',
        title: 'Check in with Finny',
        description: 'Keep your daily streak alive.',
        reward: 25,
        progress: 1,
        total: 1,
        accent: colors.primary,
        completed: true,
    },
    {
        id: 'wallet-review',
        category: 'Security',
        icon: '🛡️',
        title: 'Review your wallet',
        description: 'Run a quick wallet health check.',
        reward: 75,
        progress: 0,
        total: 1,
        accent: '#6EA8FF',
        urgent: true,
    },
    {
        id: 'learn',
        category: 'Growth',
        icon: '🧠',
        title: 'Learn one thing',
        description: 'Complete a 2-minute crypto lesson.',
        reward: 50,
        progress: 1,
        total: 3,
        accent: '#C08CFF',
    },
    {
        id: 'security-streak',
        category: 'Security',
        icon: '🔐',
        title: 'Build your security streak',
        description: 'Complete 3 security actions this week.',
        reward: 150,
        progress: 2,
        total: 3,
        accent: '#F6C85F',
    },
    {
        id: 'share',
        category: 'Social',
        icon: '✨',
        title: 'Show your Finny',
        description: 'Share your creature with a friend.',
        reward: 40,
        progress: 0,
        total: 1,
        accent: '#FF8E9E',
    },
];

const FILTERS: QuestCategory[] = [
    'All',
    'Daily',
    'Security',
    'Growth',
    'Social',
];

type Props = {
    visible: boolean;
    onClose: () => void;
};

export default function QuestsSheet({ visible, onClose }: Props) {
    const { width } = useWindowDimensions();
    const [filter, setFilter] = useState<QuestCategory>('All');
    const [completed, setCompleted] = useState<Record<string, boolean>>({});

    const isSmallDevice = width < 360;

    const filteredQuests = useMemo(
        () =>
            filter === 'All'
                ? QUESTS
                : QUESTS.filter((quest) => quest.category === filter),
        [filter]
    );

    const activeCompletedCount = QUESTS.filter(
        (quest) => quest.completed || completed[quest.id]
    ).length;

    const totalRewards = QUESTS.reduce(
        (sum, quest) =>
            sum + (quest.completed || completed[quest.id] ? quest.reward : 0),
        0
    );

    function handleFilterPress(item: QuestCategory) {
        if (filter === item) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setFilter(item);
    }

    function handleQuestPress(quest: Quest) {
        if (quest.completed) return;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setCompleted((current) => ({
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
                                TODAY'S ADVENTURE
                            </Text>
                            <Text style={styles.heroTitle}>
                                Keep Finny growing.
                            </Text>
                            <Text style={styles.heroSubtitle}>
                                Complete quests that improve your wallet health
                                and earn XP along the way.
                            </Text>
                        </View>

                        <View style={styles.heroCreature}>
                            <Text style={styles.heroCreatureEmoji}>🐣</Text>
                        </View>
                    </View>

                    <View style={styles.dailyProgressHeader}>
                        <Text style={styles.dailyProgressLabel}>
                            Daily progress
                        </Text>
                        <Text style={styles.dailyProgressValue}>
                            {activeCompletedCount}/{QUESTS.length}
                        </Text>
                    </View>

                    <View style={styles.progressTrack}>
                        <View
                            style={[
                                styles.progressFill,
                                {
                                    width: `${
                                        (activeCompletedCount /
                                            QUESTS.length) *
                                        100
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
                        const isCompleted =
                            quest.completed || completed[quest.id];
                        const progress = Math.min(
                            quest.progress +
                                (isCompleted && !quest.completed ? 1 : 0),
                            quest.total
                        );

                        return (
                            <PressableScale
                                key={quest.id}
                                onPress={() => handleQuestPress(quest)}
                                disabled={isCompleted}
                                activeOpacity={isCompleted ? 0.68 : 0.85}
                                style={[
                                    styles.questCard,
                                    isCompleted && styles.questCompleted,
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
                                    <Text style={styles.questEmoji}>
                                        {quest.icon}
                                    </Text>
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

                                        {quest.urgent && !isCompleted && (
                                            <View style={styles.urgentBadge}>
                                                <Text style={styles.urgentText}>
                                                    NOW
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
                                        <View style={styles.miniProgress}>
                                            <View
                                                style={styles.miniProgressTrack}
                                            >
                                                <View
                                                    style={[
                                                        styles.miniProgressFill,
                                                        {
                                                            width: `${
                                                                (progress /
                                                                    quest.total) *
                                                                100
                                                            }%`,
                                                            backgroundColor:
                                                                quest.accent,
                                                        },
                                                    ]}
                                                />
                                            </View>

                                            <Text style={styles.progressText}>
                                                {progress}/{quest.total}
                                            </Text>
                                        </View>

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
                    <Text style={styles.footerEmoji}>🐾</Text>
                    <Text style={styles.footerTitle}>
                        Every good habit makes Finny stronger.
                    </Text>
                    <Text style={styles.footerText}>
                        Quests reward healthy wallet behavior — not how much
                        money you hold.
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
    heroCreatureEmoji: {
        fontSize: 39,
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
    questIcon: {
        width: 48,
        height: 48,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    questEmoji: {
        fontSize: 25,
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
    urgentBadge: {
        marginLeft: 5,
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: 'rgba(255,142,158,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,142,158,0.22)',
    },
    urgentText: {
        color: '#FF8E9E',
        fontSize: 7,
        letterSpacing: 0.6,
        fontFamily: 'Poppins_800ExtraBold',
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
    miniProgress: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 8,
    },
    miniProgressTrack: {
        flex: 1,
        maxWidth: 90,
        height: 4,
        borderRadius: 2,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.07)',
    },
    miniProgressFill: {
        height: '100%',
        borderRadius: 2,
    },
    progressText: {
        marginLeft: 5,
        color: colors.textMuted,
        fontSize: 8,
        fontFamily: 'Poppins_500Medium',
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
    footerEmoji: {
        fontSize: 20,
        marginBottom: 5,
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
