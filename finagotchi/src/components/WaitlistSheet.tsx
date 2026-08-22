import React, { useEffect, useRef, useState } from 'react';
import {
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    Easing,
    ReduceMotion,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { PressableScale } from './PressableScale';
import { useWaitlistStore } from '../features/waitlist/store';
import { colors, radius, shadows, spacing, springs, typography } from '../theme/tokens';

type Props = {
    visible: boolean;
    onClose: () => void;
};

const BULLETS = [
    {
        icon: 'paw-outline' as const,
        title: 'Your pet, in your pocket',
        body: 'A tiny physical Finagotchi that mirrors your streak and mood.',
    },
    {
        icon: 'finger-print-outline' as const,
        title: 'One-tap check-ins',
        body: 'Tap the device to mark your daily save — no phone required.',
    },
    {
        icon: 'color-wand-outline' as const,
        title: 'LED + haptic moods',
        body: 'It glows, pulses, and buzzes to celebrate milestones with you.',
    },
    {
        icon: 'shield-checkmark-outline' as const,
        title: 'No keys on the device',
        body: 'Your wallet stays on your phone; the companion only reads public data.',
    },
];

const STAGGER_DELAY = 55;

/**
 * Static fallback device placeholder shown when the live Spline scene cannot
 * be rendered inside the WebView.
 */
function StaticHardwarePlaceholder() {
    const { width } = useWindowDimensions();
    const float = useSharedValue(0);

    useEffect(() => {
        float.value = withRepeat(
            withTiming(-10, {
                duration: 2600,
                easing: Easing.inOut(Easing.cubic),
            }),
            -1,
            true
        );
    }, [float]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: float.value }],
    }));

    const size = Math.min(width * 0.5, 200);

    return (
        <View style={styles.placeholderStage}>
            <Animated.View style={[styles.hardwareImageWrap, animatedStyle]}>
                <Image
                    source={require('../../assets/hardware-companion.png')}
                    style={[
                        styles.hardwareImage,
                        { width: size, height: size },
                    ]}
                    resizeMode="contain"
                />
            </Animated.View>
            <View style={[styles.deviceShadow, { width: size * 0.6 }]} />
        </View>
    );
}

/**
 * Hardware placeholder showing the companion robot image.
 */
function HardwarePlaceholder() {
    return <StaticHardwarePlaceholder />;
}

export default function WaitlistSheet({ visible, onClose }: Props) {
    const addEntry = useWaitlistStore((state) => state.addEntry);
    const scrollRef = useRef<ScrollView>(null);

    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const placeholderOpacity = useSharedValue(0);
    const placeholderScale = useSharedValue(0.88);
    const headerOpacity = useSharedValue(0);
    const headerTranslate = useSharedValue(18);
    const formOpacity = useSharedValue(0);
    const formTranslate = useSharedValue(18);
    const bulletsOpacity = useSharedValue(0);
    const bulletsTranslate = useSharedValue(18);

    useEffect(() => {
        if (visible) {
            placeholderOpacity.value = 0;
            placeholderScale.value = 0.88;
            headerOpacity.value = 0;
            headerTranslate.value = 18;
            formOpacity.value = 0;
            formTranslate.value = 18;
            bulletsOpacity.value = 0;
            bulletsTranslate.value = 18;

            placeholderOpacity.value = withTiming(1, {
                duration: 500,
                reduceMotion: ReduceMotion.System,
            });
            placeholderScale.value = withSpring(1, {
                ...springs.default,
                reduceMotion: ReduceMotion.System,
            });

            headerOpacity.value = withDelay(
                STAGGER_DELAY,
                withTiming(1, {
                    duration: 400,
                    reduceMotion: ReduceMotion.System,
                })
            );
            headerTranslate.value = withDelay(
                STAGGER_DELAY,
                withSpring(0, {
                    ...springs.default,
                    reduceMotion: ReduceMotion.System,
                })
            );

            formOpacity.value = withDelay(
                STAGGER_DELAY * 3,
                withTiming(1, {
                    duration: 400,
                    reduceMotion: ReduceMotion.System,
                })
            );
            formTranslate.value = withDelay(
                STAGGER_DELAY * 3,
                withSpring(0, {
                    ...springs.default,
                    reduceMotion: ReduceMotion.System,
                })
            );

            bulletsOpacity.value = withDelay(
                STAGGER_DELAY * 5,
                withTiming(1, {
                    duration: 400,
                    reduceMotion: ReduceMotion.System,
                })
            );
            bulletsTranslate.value = withDelay(
                STAGGER_DELAY * 5,
                withSpring(0, {
                    ...springs.default,
                    reduceMotion: ReduceMotion.System,
                })
            );
        }
    }, [visible, placeholderOpacity, placeholderScale, headerOpacity, headerTranslate, formOpacity, formTranslate, bulletsOpacity, bulletsTranslate]);

    const placeholderStyle = useAnimatedStyle(() => ({
        opacity: placeholderOpacity.value,
        transform: [{ scale: placeholderScale.value }],
    }));

    const headerStyle = useAnimatedStyle(() => ({
        opacity: headerOpacity.value,
        transform: [{ translateY: headerTranslate.value }],
    }));

    const formStyle = useAnimatedStyle(() => ({
        opacity: formOpacity.value,
        transform: [{ translateY: formTranslate.value }],
    }));

    const bulletsStyle = useAnimatedStyle(() => ({
        opacity: bulletsOpacity.value,
        transform: [{ translateY: bulletsTranslate.value }],
    }));

    const scrollToInput = () => {
        // Wait for the keyboard to finish opening so the scroll view can
        // measure the new visible window correctly.
        setTimeout(() => {
            scrollRef.current?.scrollToEnd({ animated: true });
        }, 150);
    };

    const handleSubmit = async () => {
        const normalized = email.trim().toLowerCase();

        if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setStatus('error');
            setError('Please enter a valid email address.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch(
                'https://www.finagotchi.app/api/waitlist',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        email: normalized,
                        source: 'Mobile App',
                    }),
                }
            );

            const data = (await response.json()) as {
                ok: boolean;
                message?: string;
                error?: string;
            };

            if (data.ok) {
                addEntry(normalized);
                Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success
                );
                setStatus('success');
            } else {
                Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Error
                );
                setStatus('error');
                setError(
                    data.error || 'Could not submit your email. Try again.'
                );
            }
        } catch {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setStatus('error');
            setError('Network error. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setEmail('');
        setStatus('idle');
        setError(null);
        onClose();
    };

    return (
        <BottomSheet visible={visible} onClose={handleClose}>
            <PressableScale
                onPress={handleClose}
                style={styles.closeButton}
                hitSlop={8}
            >
                <Ionicons name="close" size={22} color={colors.text} />
            </PressableScale>

            <ScrollView
                ref={scrollRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.container}
                keyboardShouldPersistTaps="handled"
            >
                {status === 'success' ? (
                    <View style={styles.success}>
                        <Text style={styles.successEmoji}>🎉</Text>
                        <Text style={styles.successTitle}>
                            You're on the list!
                        </Text>
                        <Text style={styles.successBody}>
                            We'll reach out when the Finagotchi Hardware
                            Companion is ready for early supporters.
                        </Text>

                        <Button
                            title="Close"
                            onPress={handleClose}
                            variant="secondary"
                        />
                    </View>
                ) : (
                    <>
                        <Animated.View style={[styles.hero, headerStyle]}>
                            <Animated.View style={placeholderStyle}>
                                <HardwarePlaceholder />
                            </Animated.View>

                            <Text style={styles.eyebrow}>Hardware Companion</Text>
                            <Text style={styles.heroTitle}>
                                Take Finagotchi with you
                            </Text>
                            <Text style={styles.heroBody}>
                                A physical sidekick that brings your pet off the
                                screen and into your daily routine.
                            </Text>
                        </Animated.View>

                        <Animated.View style={[styles.form, formStyle]}>
                            <TextInput
                                value={email}
                                onChangeText={setEmail}
                                placeholder="Email address"
                                placeholderTextColor={colors.textMuted}
                                style={styles.input}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoCorrect={false}
                                onFocus={scrollToInput}
                                onSubmitEditing={handleSubmit}
                            />

                            {error ? (
                                <Text style={styles.error}>{error}</Text>
                            ) : null}

                            <Button
                                title={loading ? 'Joining…' : 'Join the waitlist'}
                                onPress={handleSubmit}
                                disabled={loading}
                            />

                            <PressableScale
                                onPress={handleClose}
                                style={styles.later}
                            >
                                <Text style={styles.laterText}>
                                    Maybe later
                                </Text>
                            </PressableScale>
                        </Animated.View>

                        <Animated.View style={[styles.bullets, bulletsStyle]}>
                            {BULLETS.map((bullet) => (
                                <View
                                    key={bullet.title}
                                    style={styles.bullet}
                                >
                                    <View style={styles.bulletIcon}>
                                        <Ionicons
                                            name={bullet.icon}
                                            size={16}
                                            color={colors.primary}
                                        />
                                    </View>
                                    <View style={styles.bulletText}>
                                        <Text style={styles.bulletTitle}>
                                            {bullet.title}
                                        </Text>
                                        <Text style={styles.bulletBody}>
                                            {bullet.body}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </Animated.View>
                    </>
                )}
            </ScrollView>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingBottom: 32,
    },
    closeButton: {
        position: 'absolute',
        top: 4,
        right: 0,
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        zIndex: 10,
    },
    hero: {
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    placeholderStage: {
        alignItems: 'center',
        justifyContent: 'flex-end',
        height: 220,
        marginBottom: spacing.md,
    },
    hardwareImageWrap: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    hardwareImage: {
        resizeMode: 'contain',
    },
    deviceShadow: {
        position: 'absolute',
        bottom: 6,
        height: 16,
        borderRadius: 8,
        backgroundColor: 'rgba(0,0,0,0.45)',
        transform: [{ scaleY: 0.35 }],
        zIndex: -1,
    },
    eyebrow: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        marginBottom: spacing.xs,
    },
    heroTitle: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_800ExtraBold',
        textAlign: 'center',
        marginBottom: spacing.xs,
    },
    heroBody: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 20,
        maxWidth: 300,
    },
    form: {
        gap: spacing.md,
        marginBottom: spacing.lg,
    },
    input: {
        backgroundColor: colors.background,
        color: colors.text,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        fontSize: typography.body,
        fontFamily: 'Poppins_500Medium',
    },
    error: {
        color: colors.danger,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
    },
    later: {
        alignItems: 'center',
        paddingVertical: spacing.sm,
    },
    laterText: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_600SemiBold',
    },
    bullets: {
        gap: spacing.sm,
    },
    bullet: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
    },
    bulletIcon: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        backgroundColor: 'rgba(93,226,166,0.08)',
    },
    bulletText: {
        flex: 1,
        gap: 1,
    },
    bulletTitle: {
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
    },
    bulletBody: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 18,
    },
    success: {
        alignItems: 'center',
        paddingVertical: spacing.xl,
    },
    successEmoji: {
        fontSize: 64,
        marginBottom: spacing.md,
    },
    successTitle: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
        marginBottom: spacing.sm,
    },
    successBody: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: spacing.xl,
        maxWidth: 300,
    },
});
