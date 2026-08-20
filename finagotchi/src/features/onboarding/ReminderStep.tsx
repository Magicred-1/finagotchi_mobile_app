import React, { useState } from 'react';
import {
    SafeAreaView,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { Button } from '../../components/Button';
import { PressableScale } from '../../components/PressableScale';
import {
    requestNotificationPermissions,
    scheduleDailyReminder,
    scheduleLastChanceReminder,
} from '../../lib/notifications';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type Props = {
    onFinished: () => void;
};

const TIME_OPTIONS = [
    { label: '6:00 PM', hour: 18, minute: 0 },
    { label: '7:00 PM', hour: 19, minute: 0 },
    { label: '8:00 PM', hour: 20, minute: 0 },
    { label: '9:00 PM', hour: 21, minute: 0 },
    { label: '10:00 PM', hour: 22, minute: 0 },
];

export default function ReminderStep({ onFinished }: Props) {
    const [selected, setSelected] = useState(2);
    const [loading, setLoading] = useState(false);
    const { width, height } = useWindowDimensions();

    const isSmall = height < 700;

    const handleSelect = (index: number) => {
        if (index === selected) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSelected(index);
    };

    const handleEnable = async () => {
        setLoading(true);

        try {
            const option = TIME_OPTIONS[selected];
            await requestNotificationPermissions();
            await scheduleDailyReminder(option.hour, option.minute);
            await scheduleLastChanceReminder();
        } catch {
            // Continue the flow even if permissions are denied.
        } finally {
            setLoading(false);
            onFinished();
        }
    };

    return (
        <SafeAreaView style={styles.safe}>
            <View
                style={[
                    styles.container,
                    {
                        paddingHorizontal: Math.min(
                            Math.max(width * 0.06, 24),
                            40
                        ),
                        paddingVertical: isSmall ? spacing.lg : spacing.xl,
                    },
                ]}
            >
                <View style={styles.content}>
                    <Text style={styles.emoji}>🔔</Text>

                    <Text
                        style={[
                            styles.title,
                            isSmall && styles.titleSmall,
                        ]}
                    >
                        When should we remind you?
                    </Text>

                    <Text style={styles.body}>
                        A daily nudge helps you keep your streak alive.
                    </Text>
                </View>

                <View style={styles.footer}>
                    <View style={styles.chips}>
                        {TIME_OPTIONS.map((option, index) => (
                            <PressableScale
                                key={option.label}
                                onPress={() => handleSelect(index)}
                                style={[
                                    styles.chip,
                                    selected === index && styles.chipActive,
                                ]}
                            >
                                <Text
                                    style={[
                                        styles.chipText,
                                        selected === index &&
                                            styles.chipTextActive,
                                    ]}
                                >
                                    {option.label}
                                </Text>
                            </PressableScale>
                        ))}
                    </View>

                    <Button
                        title={
                            loading
                                ? 'Setting up...'
                                : 'Enable reminders'
                        }
                        onPress={handleEnable}
                        disabled={loading}
                    />
                </View>
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
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    emoji: {
        fontSize: 80,
        marginBottom: spacing.lg,
    },
    title: {
        color: colors.text,
        fontSize: typography.title,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
        marginBottom: spacing.md,
    },
    titleSmall: {
        fontSize: 28,
    },
    body: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 24,
        maxWidth: 320,
    },
    footer: {
        width: '100%',
        gap: spacing.lg,
        paddingBottom: spacing.lg,
    },
    chips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: spacing.sm,
    },
    chip: {
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    chipActive: {
        backgroundColor: 'rgba(114,228,90,0.15)',
        borderColor: colors.primary,
    },
    chipText: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
    },
    chipTextActive: {
        color: colors.primary,
    },
});
