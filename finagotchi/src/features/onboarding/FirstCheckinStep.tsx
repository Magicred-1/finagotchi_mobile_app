import React, { useEffect, useRef, useState } from 'react';
import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
} from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { PressableScale } from '../../components/PressableScale';
import { RadialPet } from '../../components/RadialPet';
import { colors, radius, spacing, typography } from '../../theme/tokens';

const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : 'height';

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

const MOOD_BY_REACTION: Record<
    'idle' | 'happy' | 'neutral',
    'calm' | 'excited' | 'sleepy'
> = {
    idle: 'calm',
    happy: 'excited',
    neutral: 'sleepy',
};

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
    const reducedMotion = useReducedMotion();

    useEffect(() => {
        if (reducedMotion) {
            pulse.value = 1;
            return;
        }
        pulse.value = withRepeat(
            withTiming(1.04, {
                duration: 900,
                easing: Easing.inOut(Easing.cubic),
            }),
            -1,
            true
        );
    }, [reducedMotion]);

    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulse.value }],
    }));

    const isSmall = height < 700;
    const horizontalPadding = Math.min(Math.max(width * 0.06, 24), 40);
    const scrollRef = useRef<ScrollView>(null);

    const scrollToForm = () => {
        setTimeout(() => {
            scrollRef.current?.scrollToEnd({ animated: true });
        }, 150);
    };

    const handleYes = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onCheckIn(false);
        setReaction('neutral');

        setTimeout(() => {
            onFinished();
        }, 1200);
    };

    const toggleCategory = (cat: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCategory(category === cat ? '' : cat);
    };

    return (
        <SafeAreaView style={styles.safe}>
            <KeyboardAvoidingView
                behavior={KEYBOARD_BEHAVIOR}
                style={styles.keyboard}
                keyboardVerticalOffset={0}
            >
                <ScrollView
                    ref={scrollRef}
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                >
                    <Pressable
                        style={styles.dismissArea}
                        onPress={Keyboard.dismiss}
                    >
                        <View style={[styles.content, { paddingHorizontal: horizontalPadding }]}>
                            <View style={styles.petWrap}>
                                <RadialPet
                                    stage="egg"
                                    mood={MOOD_BY_REACTION[reaction]}
                                    size={128}
                                />
                            </View>

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

                        <View style={[styles.footer, { paddingHorizontal: horizontalPadding }]}>
                            <Animated.View style={[styles.yesButtonWrap, pulseStyle]}>
                                <PressableScale
                                    onPress={handleYes}
                                    style={styles.yesButton}
                                    disabled={reaction !== 'idle'}
                                >
                                    <Text style={styles.yesText}>YES</Text>
                                </PressableScale>
                            </Animated.View>

                            <PressableScale
                                onPress={() => setShowDetails((s) => !s)}
                                style={styles.detailsToggle}
                            >
                                <Text style={styles.detailsToggleText}>
                                    {showDetails ? 'Hide details' : 'Add details'}
                                </Text>
                            </PressableScale>

                            {showDetails ? (
                                <View style={styles.detailsForm}>
                                    <TextInput
                                        value={amount}
                                        onChangeText={setAmount}
                                        placeholder="Amount (optional)"
                                        placeholderTextColor={colors.textMuted}
                                        keyboardType="decimal-pad"
                                        style={styles.input}
                                        onFocus={scrollToForm}
                                    />

                                    <View style={styles.chips}>
                                        {CATEGORIES.map((cat) => (
                                            <PressableScale
                                                key={cat}
                                                onPress={() => toggleCategory(cat)}
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
                                            </PressableScale>
                                        ))}
                                    </View>
                                </View>
                            ) : null}

                            <PressableScale
                                onPress={handleNo}
                                style={styles.noButton}
                                disabled={reaction !== 'idle'}
                            >
                                <Text style={styles.noText}>Not today</Text>
                            </PressableScale>
                        </View>
                    </Pressable>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: colors.background,
    },
    keyboard: {
        flex: 1,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
    },
    dismissArea: {
        flex: 1,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    petWrap: {
        width: 128,
        height: 128,
        marginBottom: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
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
