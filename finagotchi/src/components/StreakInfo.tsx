import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useCheckinStore } from '../features/checkin/store';
import { useStreakFreezeStore } from '../features/freeze/store';
import { colors, radius, spacing, typography } from '../theme/tokens';
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
                <Ionicons name="flame" size={18} color={colors.warning} />
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

            <PressableScale onPress={onOpenFreeze}>
                <View
                    style={[
                        styles.freezePill,
                        freezeAvailable ? styles.freezePillReady : styles.freezePillUsed,
                    ]}
                >
                    <Ionicons
                        name="snow"
                        size={10}
                        color={freezeAvailable ? colors.cyan : colors.textMuted}
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
        paddingHorizontal: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: 'rgba(14,27,46,0.60)',
        borderWidth: 1,
        borderColor: colors.border,
    },
    left: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    streakNumber: {
        color: colors.text,
        fontSize: 16,
        fontFamily: 'Poppins_800ExtraBold',
    },
    streakLabel: {
        color: colors.textMuted,
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
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
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    dayDotChecked: {
        backgroundColor: colors.warning,
    },
    dayDotEmpty: {
        backgroundColor: 'rgba(255,255,255,0.10)',
    },
    dayLabel: {
        color: colors.textMuted,
        fontSize: 9,
        fontFamily: 'Poppins_700Bold',
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
        backgroundColor: 'rgba(53,215,255,0.12)',
        borderColor: 'rgba(53,215,255,0.30)',
    },
    freezePillUsed: {
        backgroundColor: 'rgba(143,162,184,0.12)',
        borderColor: colors.border,
    },
    freezeText: {
        fontSize: 10,
        fontFamily: 'Poppins_800ExtraBold',
    },
    freezeTextReady: {
        color: colors.cyan,
    },
    freezeTextUsed: {
        color: colors.textMuted,
    },
});
