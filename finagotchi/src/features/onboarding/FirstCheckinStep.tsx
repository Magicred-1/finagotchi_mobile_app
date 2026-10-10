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
import { LandingGradient } from '../../components/LandingGradient';
import { FadeInUp } from './FadeInUp';
import { fonts, landing, radius, spacing, tracking, typography } from '../../theme/tokens';

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
            <LandingGradient />
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
                        <FadeInUp style={[styles.content, { paddingHorizontal: horizontalPadding }]}>
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
                        </FadeInUp>

                        <FadeInUp delay={160} style={[styles.footer, { paddingHorizontal: horizontalPadding }]}>
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
                                        placeholderTextColor={landing.placeholder}
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
                        </FadeInUp>
                    </Pressable>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: landing.navy,
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
        color: landing.text,
        fontSize: typography.title,
        fontFamily: fonts.medium,
        letterSpacing: tracking.title,
        textAlign: 'center',
        marginBottom: spacing.md,
    },
    titleSmall: {
        fontSize: 28,
    },
    body: {
        color: landing.textMuted,
        fontSize: typography.body,
        fontFamily: fonts.regular,
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
        borderRadius: radius.sm,
        alignItems: 'center',
        minHeight: 48,
        backgroundColor: landing.accent,
    },
    yesText: {
        color: landing.onAccent,
        fontSize: typography.small,
        fontFamily: fonts.semiBold,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    detailsToggle: {
        paddingVertical: spacing.sm,
        minHeight: 44,
        justifyContent: 'center',
    },
    detailsToggleText: {
        color: landing.textMuted,
        fontSize: typography.small,
        fontFamily: fonts.medium,
    },
    detailsForm: {
        width: '100%',
        gap: spacing.md,
    },
    input: {
        backgroundColor: landing.frostSurface,
        color: landing.ink,
        borderWidth: 1,
        borderColor: landing.frostBorder,
        borderRadius: radius.sm,
        minHeight: 54,
        paddingVertical: 15,
        paddingHorizontal: 16,
        fontSize: typography.body,
        fontFamily: fonts.medium,
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
        backgroundColor: landing.frostSurface,
        borderWidth: 1,
        borderColor: landing.frostBorder,
        alignItems: 'center',
        minHeight: 44,
        justifyContent: 'center',
    },
    chipActive: {
        backgroundColor: landing.accent,
        borderColor: landing.accent,
    },
    chipText: {
        color: landing.ink,
        fontSize: typography.small,
        fontFamily: fonts.medium,
    },
    chipTextActive: {
        color: landing.onAccent,
    },
    noButton: {
        paddingVertical: spacing.md,
        minHeight: 44,
        justifyContent: 'center',
    },
    noText: {
        color: landing.ink,
        fontSize: typography.body,
        fontFamily: fonts.semiBold,
    },
});
