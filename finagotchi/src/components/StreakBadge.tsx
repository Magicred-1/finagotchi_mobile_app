import React from 'react';
import {
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { colors, radius, spacing } from '../theme/tokens';

type Props = {
    streak: number;
};

export function StreakBadge({ streak }: Props) {
    return (
        <View style={styles.container}>
        <Text style={styles.emoji}>🔥</Text>

        <View>
            <Text style={styles.number}>
            {streak} day{streak === 1 ? '' : 's'}
            </Text>

            <Text style={styles.label}>
            savings streak
            </Text>
        </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',

        backgroundColor: colors.surface,
        borderRadius: radius.md,

        padding: spacing.md,
        gap: spacing.sm,

        borderWidth: 1,
        borderColor: colors.border,
    },

    emoji: {
        fontSize: 28,
    },

    number: {
        color: colors.text,
        fontSize: 18,
        fontWeight: '800',
    },

    label: {
        color: colors.textMuted,
        marginTop: 2,
    },
});