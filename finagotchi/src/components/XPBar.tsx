import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePetStore, xpForNextLevel } from '../features/pet/store';
import { colors, radius, spacing, typography } from '../theme/tokens';

export function XPBar() {
    const xp = usePetStore((state) => state.xp);
    const level = usePetStore((state) => state.level);

    const xpNeeded = xpForNextLevel(level);
    const percent = Math.min(100, Math.max(0, (xp / xpNeeded) * 100));

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.levelLabel}>Level {level}</Text>
                <Text style={styles.xpValue}>
                    {xp}/{xpNeeded} XP
                </Text>
            </View>
            <View style={styles.track}>
                <View style={[styles.fill, { width: `${percent}%` }]} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        gap: 5,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    levelLabel: {
        color: colors.text,
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    xpValue: {
        color: colors.textMuted,
        fontSize: 9,
        fontFamily: 'Poppins_800ExtraBold',
    },
    track: {
        width: '100%',
        height: 5,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.10)',
        overflow: 'hidden',
    },
    fill: {
        height: '100%',
        borderRadius: 3,
        backgroundColor: '#8B5CF6',
    },
});
