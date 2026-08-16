import React, { useState } from 'react';

import {
    SafeAreaView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { Button } from '../../src/components/Button';
import { useCheckinStore } from '../../src/features/checkin/store';
import { usePetStore } from '../../src/features/pet/store';
import { colors, spacing } from '../../src/theme/tokens';

export default function CheckinScreen() {
    const [complete, setComplete] = useState(false);

    const checkIn = useCheckinStore(
        (state) => state.checkIn
    );

    const hasCheckedInToday = useCheckinStore(
        (state) => state.hasCheckedInToday()
    );

    const streak = useCheckinStore(
        (state) => state.streak
    );

    const stage = usePetStore(
        (state) => state.stage
    );

    function handleCheckin(saved: boolean) {
        const success = checkIn(saved);

        if (success) {
        setComplete(true);
        }
    }

    if (complete || hasCheckedInToday) {
        return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.center}>
            <Text style={styles.emoji}>
                🌱
            </Text>

            <Text style={styles.title}>
                Check-in complete
            </Text>

            <Text style={styles.subtitle}>
                Your pet is proud of you.
            </Text>

            <Text style={styles.streak}>
                🔥 {streak} day streak
            </Text>

            <Text style={styles.stage}>
                Pet stage: {stage}
            </Text>
            </View>
        </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
            <Text style={styles.emoji}>
            💰
            </Text>

            <Text style={styles.title}>
            Daily check-in
            </Text>

            <Text style={styles.question}>
            Did you save money today?
            </Text>

            <View style={styles.buttons}>
            <Button
                title="YES — I SAVED 💚"
                onPress={() => handleCheckin(true)}
            />

            <Button
                title="NO — NOT TODAY"
                onPress={() => handleCheckin(false)}
            />
            </View>

            <Text style={styles.hint}>
            7 days → Stage 2{'\n'}
            30 days → Stage 3
            </Text>
        </View>
        </SafeAreaView>
    );
    }

    const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: colors.background,
    },

    container: {
        flex: 1,
        padding: spacing.lg,
        justifyContent: 'center',
    },

    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.lg,
    },

    emoji: {
        fontSize: 64,
        marginBottom: spacing.md,
    },

    title: {
        color: colors.text,
        fontSize: 30,
        fontWeight: '900',
        textAlign: 'center',
    },

    subtitle: {
        color: colors.textMuted,
        fontSize: 17,
        marginTop: spacing.sm,
    },

    question: {
        color: colors.text,
        fontSize: 22,
        fontWeight: '700',
        textAlign: 'center',
        marginTop: spacing.xl,
        marginBottom: spacing.lg,
    },

    buttons: {
        gap: spacing.md,
    },

    streak: {
        color: colors.primary,
        fontSize: 22,
        fontWeight: '800',
        marginTop: spacing.lg,
    },

    stage: {
        color: colors.textMuted,
        marginTop: spacing.sm,
    },

    hint: {
        color: colors.textMuted,
        textAlign: 'center',
        marginTop: spacing.xl,
        lineHeight: 24,
    },
});