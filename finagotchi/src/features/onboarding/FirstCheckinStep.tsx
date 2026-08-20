import React, { useEffect, useState } from 'react';
import {
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    View,
    Pressable,
    useWindowDimensions,
} from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';

import { colors, radius, spacing, typography } from '../../theme/tokens';

export type CheckinDetails = {
    amount?: number;
    category?: string;
};

type Props = {
    creatureName: string;
    onCheckIn: (
        saved: boolean,
        details?: CheckinDetails
    ) => { success: boolean } | void;
    onFinished: () => void;
};

const CATEGORIES = ['Savings', 'Investment', 'Other'];

export default function FirstCheckinStep({
    creatureName,
    onCheckIn,
    onFinished,
}: Props) {
    const { width, height } = useWindowDimensions();
    const [showDetails, setShowDetails] = useState(false);
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('');
    const [reaction, setReaction] = useState<'idle' | 'happy' | 'neutral'>(
        'idle'
    );

    const pulse = useSharedValue(1);

    useEffect(() => {
        pulse.value = withRepeat(
            withTiming(1.04, {
                duration: 900,
                easing: Easing.inOut(Easing.cubic),
            }),
            -1,
            true
        );
    }, []);

    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulse.value }],
    }));

    const isSmall = height < 700;

    const handleYes = () => {
        const parsedAmount = amount ? parseFloat(amount) : NaN;
        const details: CheckinDetails | undefined =
            amount || category
                ? {
                      amount: Number.isFinite(parsedAmount)
                          ? parsedAmount
                          : undefined,
                      category: category || undefined,
                  }
                : undefined;

        onCheckIn(true, details);
        setReaction('happy');

        setTimeout(() => {
            onFinished();
        }, 1200);
    };

    const handleNo = () => {
        onCheckIn(false);
        setReaction('neutral');

        setTimeout(() => {
            onFinished();
        }, 1200);
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
                    <Text style={styles.emoji}>
                        {reaction === 'happy'
                            ? '🎉'
                            : reaction === 'neutral'
                            ? '🌙'
                            : '💰'}
                    </Text>

                    <Text
                        style={[
                            styles.title,
                            isSmall && styles.titleSmall,
                        ]}
                    >
                        Did you save or invest today?
                    </Text>

                    <Text style={styles.body}>
                        {creatureName} grows when you stick to your plan.
                    </Text>
                </View>

                <View style={styles.footer}>
                    <Animated.View style={[styles.yesButtonWrap, pulseStyle]}>
                        <Pressable
                            onPress={handleYes}
                            style={styles.yesButton}
                            disabled={reaction !== 'idle'}
                        >
                            <Text style={styles.yesText}>YES</Text>
                        </Pressable>
                    </Animated.View>

                    <Pressable
                        onPress={() => setShowDetails((s) => !s)}
                        style={styles.detailsToggle}
                    >
                        <Text style={styles.detailsToggleText}>
                            {showDetails ? 'Hide details' : 'Add details'}
                        </Text>
                    </Pressable>

                    {showDetails ? (
                        <View style={styles.detailsForm}>
                            <TextInput
                                value={amount}
                                onChangeText={setAmount}
                                placeholder="Amount (optional)"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="decimal-pad"
                                style={styles.input}
                            />

                            <View style={styles.chips}>
                                {CATEGORIES.map((cat) => (
                                    <Pressable
                                        key={cat}
                                        onPress={() =>
                                            setCategory(
                                                category === cat ? '' : cat
                                            )
                                        }
                                        style={[
                                            styles.chip,
                                            category === cat &&
                                                styles.chipActive,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.chipText,
                                                category === cat &&
                                                    styles.chipTextActive,
                                            ]}
                                        >
                                            {cat}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                    ) : null}

                    <Pressable
                        onPress={handleNo}
                        style={styles.noButton}
                        disabled={reaction !== 'idle'}
                    >
                        <Text style={styles.noText}>Not today</Text>
                    </Pressable>
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
        alignItems: 'center',
        gap: spacing.md,
        paddingBottom: spacing.lg,
    },
    yesButtonWrap: {
        width: '100%',
    },
    yesButton: {
        width: '100%',
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.md,
        alignItems: 'center',
        backgroundColor: colors.primary,
    },
    yesText: {
        color: colors.background,
        fontSize: typography.heading,
        fontFamily: 'Poppins_800ExtraBold',
    },
    detailsToggle: {
        paddingVertical: spacing.sm,
    },
    detailsToggleText: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
    },
    detailsForm: {
        width: '100%',
        gap: spacing.md,
    },
    input: {
        backgroundColor: colors.surface,
        color: colors.text,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        fontSize: typography.body,
        fontFamily: 'Poppins_500Medium',
    },
    chips: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    chip: {
        flex: 1,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.pill,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
    },
    chipActive: {
        backgroundColor: 'rgba(114,228,90,0.15)',
        borderColor: colors.primary,
    },
    chipText: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
    },
    chipTextActive: {
        color: colors.primary,
    },
    noButton: {
        paddingVertical: spacing.md,
    },
    noText: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_600SemiBold',
    },
});
