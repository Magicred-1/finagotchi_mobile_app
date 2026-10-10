import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useCheckinStore } from '../features/checkin/store';
import { useStreakFreezeStore } from '../features/freeze/store';
import { colors, fonts, landing, radius, spacing } from '../theme/tokens';
import { PressableScale } from './PressableScale';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function isWithinLastDays(key: string | null, days: number) {
    if (!key) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(key);
    target.setHours(0, 0, 0, 0);

    const diffMs = today.getTime() - target.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    return diffDays >= 0 && diffDays <= days;
}

export function StreakInfo({ onOpenFreeze }: { onOpenFreeze?: () => void }) {
    const streak = useCheckinStore((state) => state.streak);
    const freezeLastUsedAt = useCheckinStore((state) => state.freezeLastUsedAt);
    const history = useCheckinStore((state) => state.history);
    const consumableFreezes = useStreakFreezeStore((state) => state.streakFreezes);

    const freezeAvailable = useMemo(() => {
        return freezeLastUsedAt === null || !isWithinLastDays(freezeLastUsedAt, 6);
    }, [freezeLastUsedAt]);

    const weekHistory = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const week: boolean[] = [];

        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);

            const key = `${d.getFullYear()}-${String(
                d.getMonth() + 1
            ).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

            week.push(history[key] ?? false);
        }

        return week;
    }, [history]);

    return (
        <View style={styles.container}>
            <View style={styles.left}>
                <Ionicons name="flame" size={16} color={colors.gold} />
                <Text style={styles.streakNumber}>{streak}</Text>
                <Text style={styles.streakLabel}>day streak</Text>
            </View>

            <View style={styles.weekChart}>
                {weekHistory.map((checked, index) => (
                    <View key={index} style={styles.dayColumn}>
                        <View
                            style={[
                                styles.dayDot,
                                checked && styles.dayDotChecked,
                                !checked && styles.dayDotEmpty,
                            ]}
                        />
                        <Text style={styles.dayLabel}>{DAY_LABELS[index]}</Text>
                    </View>
                ))}
            </View>

            <PressableScale onPress={onOpenFreeze} accessibilityLabel="Open streak freeze">
                <View
                    style={[
                        styles.freezePill,
                        freezeAvailable ? styles.freezePillReady : styles.freezePillUsed,
                    ]}
                >
                    <Ionicons
                        name="snow"
                        size={10}
                        color={freezeAvailable ? landing.accent : landing.textMuted}
                    />
                    <Text
                        style={[
                            styles.freezeText,
                            freezeAvailable ? styles.freezeTextReady : styles.freezeTextUsed,
                        ]}
                    >
                        {freezeAvailable ? `Freeze ready ${consumableFreezes > 0 ? `(${consumableFreezes})` : ''}` : 'Freeze used'}
                    </Text>
                </View>
            </PressableScale>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.sm,
        paddingHorizontal: 12,
        borderRadius: radius.md,
        backgroundColor: landing.glassActive,
        borderWidth: 1,
        borderColor: landing.glassBorder,
    },
    left: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    streakNumber: {
        color: landing.text,
        fontSize: 15,
        fontFamily: fonts.bold,
    },
    streakLabel: {
        color: landing.textMuted,
        fontSize: 11,
        fontFamily: fonts.medium,
    },
    weekChart: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.xs,
    },
    dayColumn: {
        alignItems: 'center',
        gap: 3,
    },
    dayDot: {
        width: 9,
        height: 9,
        borderRadius: 5,
    },
    dayDotChecked: {
        backgroundColor: colors.gold,
    },
    dayDotEmpty: {
        backgroundColor: landing.glass,
    },
    dayLabel: {
        color: landing.textMuted,
        fontSize: 9,
        fontFamily: fonts.semiBold,
    },
    freezePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: radius.pill,
        borderWidth: 1,
    },
    freezePillReady: {
        backgroundColor: landing.glassHover,
        borderColor: landing.glassBorderStrong,
    },
    freezePillUsed: {
        backgroundColor: landing.glass,
        borderColor: landing.glassBorder,
    },
    freezeText: {
        fontSize: 10,
        fontFamily: fonts.semiBold,
    },
    freezeTextReady: {
        color: landing.accent,
    },
    freezeTextUsed: {
        color: landing.textMuted,
    },
});
