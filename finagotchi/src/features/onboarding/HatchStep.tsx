import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    SafeAreaView,
    StyleSheet,
    Text,
    View,
    Pressable,
} from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withSequence,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';

import { RadialPet } from '../../components/RadialPet';
import { colors, spacing, typography } from '../../theme/tokens';

type Props = {
    creatureName: string;
    onFinished: () => void;
};

export default function HatchStep({ creatureName, onFinished }: Props) {
    const [cracked, setCracked] = useState(false);
    const [showWelcome, setShowWelcome] = useState(false);
    const reducedMotion = useReducedMotion();
    const hatchingRef = useRef(false);
    const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

    const eggOpacity = useSharedValue(1);
    const eggScale = useSharedValue(1);
    const eggRotate = useSharedValue(0);

    const creatureOpacity = useSharedValue(0);
    const creatureScale = useSharedValue(0.4);
    const creatureRotate = useSharedValue(0);

    const crackOpacity = useSharedValue(0);
    const crackScale = useSharedValue(1);

    const burstOpacity = useSharedValue(0);
    const burstScale = useSharedValue(0.3);

    const welcomeOpacity = useSharedValue(0);
    const welcomeTranslateY = useSharedValue(24);

    const clearTimers = useCallback(() => {
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];
    }, []);

    const hatch = useCallback(() => {
        if (hatchingRef.current || cracked) return;
        hatchingRef.current = true;
        setCracked(true);

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        if (reducedMotion) {
            eggOpacity.value = 0;
            creatureOpacity.value = 1;
            creatureScale.value = 1;
            const t1 = setTimeout(() => {
                setShowWelcome(true);
                welcomeOpacity.value = withTiming(1, { duration: 300 });
                welcomeTranslateY.value = withTiming(0, { duration: 300 });
            }, 600);
            timersRef.current = [t1];
            return;
        }

        // Egg shakes and cracks.
        eggRotate.value = withSequence(
            withTiming(-14, { duration: 70, easing: Easing.out(Easing.cubic) }),
            withTiming(14, { duration: 70, easing: Easing.out(Easing.cubic) }),
            withTiming(-16, { duration: 70, easing: Easing.out(Easing.cubic) }),
            withTiming(16, { duration: 70, easing: Easing.out(Easing.cubic) }),
            withTiming(0, { duration: 90, easing: Easing.out(Easing.cubic) })
        );

        eggScale.value = withSequence(
            withTiming(1.08, { duration: 90, easing: Easing.out(Easing.cubic) }),
            withTiming(0.96, { duration: 90, easing: Easing.out(Easing.cubic) }),
            withTiming(1.12, { duration: 90, easing: Easing.out(Easing.cubic) }),
            withTiming(0.94, { duration: 90, easing: Easing.out(Easing.cubic) }),
            withTiming(1, { duration: 120, easing: Easing.out(Easing.cubic) })
        );

        crackOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) });
        crackScale.value = withSequence(
            withTiming(1.06, { duration: 120 }),
            withTiming(1, { duration: 150 })
        );

        // The shell bursts open and the creature springs out.
        const t1 = setTimeout(() => {
            eggOpacity.value = withTiming(0, { duration: 220 });
            eggScale.value = withTiming(0.78, { duration: 220, easing: Easing.out(Easing.cubic) });

            creatureOpacity.value = withTiming(1, { duration: 260 });
            creatureScale.value = withSpring(1, { damping: 10, stiffness: 120 });
            creatureRotate.value = withSequence(
                withTiming(-12, { duration: 160, easing: Easing.out(Easing.cubic) }),
                withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) })
            );

            burstOpacity.value = withTiming(1, { duration: 180 });
            burstScale.value = withSpring(1.8, { damping: 11, stiffness: 130 });
        }, 520);

        // Sparkle burst fades.
        const t2 = setTimeout(() => {
            burstOpacity.value = withTiming(0, { duration: 450 });
        }, 1300);

        // Welcome message slides in.
        const t3 = setTimeout(() => {
            setShowWelcome(true);
            welcomeOpacity.value = withTiming(1, { duration: 450 });
            welcomeTranslateY.value = withTiming(0, { duration: 450, easing: Easing.out(Easing.cubic) });
        }, 1650);

        timersRef.current = [t1, t2, t3];
    }, [cracked, reducedMotion, eggOpacity, eggScale, eggRotate, creatureOpacity, creatureScale, creatureRotate, crackOpacity, crackScale, burstOpacity, burstScale, welcomeOpacity, welcomeTranslateY]);

    useEffect(() => {
        if (!showWelcome) return;

        const timer = setTimeout(() => {
            onFinished();
        }, 1800);

        return () => clearTimeout(timer);
    }, [showWelcome, onFinished]);

    useEffect(() => {
        return () => clearTimers();
    }, [clearTimers]);

    const eggStyle = useAnimatedStyle(() => ({
        opacity: eggOpacity.value,
        transform: [
            { scale: eggScale.value },
            { rotate: `${eggRotate.value}deg` },
        ],
    }));

    const creatureStyle = useAnimatedStyle(() => ({
        opacity: creatureOpacity.value,
        transform: [
            { scale: creatureScale.value },
            { rotate: `${creatureRotate.value}deg` },
        ],
    }));

    const crackStyle = useAnimatedStyle(() => ({
        opacity: crackOpacity.value,
        transform: [{ scale: crackScale.value }],
    }));

    const burstStyle = useAnimatedStyle(() => ({
        opacity: burstOpacity.value,
        transform: [{ scale: burstScale.value }],
    }));

    const welcomeStyle = useAnimatedStyle(() => ({
        opacity: welcomeOpacity.value,
        transform: [{ translateY: welcomeTranslateY.value }],
    }));

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.container}>
                <View style={styles.stage}>
                    <Pressable
                        onPress={hatch}
                        style={StyleSheet.absoluteFill}
                        disabled={cracked}
                    />

                    <View style={styles.stageContent} pointerEvents="none">
                        <View style={styles.petWrap}>
                            <Animated.View style={[StyleSheet.absoluteFill, eggStyle]}>
                                <RadialPet stage="egg" mood="calm" size={200} active={!showWelcome} />
                            </Animated.View>

                            <Animated.View style={[StyleSheet.absoluteFill, creatureStyle]}>
                                <RadialPet stage="coinling" mood="excited" size={200} active={cracked} />
                            </Animated.View>

                            {cracked && (
                                <Animated.View style={[styles.crackOverlay, crackStyle]}>
                                    <Svg width={200} height={200} viewBox="0 0 200 200">
                                        <Path
                                            d="M60 55 L84 92 L64 104 L92 148"
                                            stroke="rgba(255,255,255,0.75)"
                                            strokeWidth="3"
                                            fill="none"
                                            strokeLinecap="round"
                                        />
                                        <Path
                                            d="M140 60 L116 96 L142 114 L108 152"
                                            stroke="rgba(255,255,255,0.75)"
                                            strokeWidth="3"
                                            fill="none"
                                            strokeLinecap="round"
                                        />
                                    </Svg>
                                </Animated.View>
                            )}

                            <Animated.View style={[styles.burst, burstStyle]}>
                                <Text style={styles.burstText}>✨</Text>
                            </Animated.View>
                        </View>

                        {!cracked ? (
                            <View style={styles.textWrap}>
                                <Text style={styles.title}>Tap to hatch</Text>
                                <Text style={styles.subtitle}>
                                    Your egg is ready, {creatureName}
                                </Text>
                            </View>
                        ) : null}
                    </View>
                </View>

                {showWelcome ? (
                    <Animated.View
                        style={[styles.welcomeWrap, welcomeStyle]}
                        pointerEvents="none"
                    >
                        <View style={styles.welcomePet}>
                            <RadialPet
                                stage="coinling"
                                mood="excited"
                                size={72}
                            />
                        </View>
                        <Text style={styles.welcomeTitle}>
                            Welcome, {creatureName}!
                        </Text>
                        <Text style={styles.welcomeBody}>
                            Your Hatchling has arrived.
                        </Text>
                    </Animated.View>
                ) : null}
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
    stage: {
        flex: 1,
        width: '100%',
    },
    stageContent: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    petWrap: {
        width: 220,
        height: 220,
        alignItems: 'center',
        justifyContent: 'center',
    },
    crackOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    burst: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    burstText: {
        fontSize: 90,
    },
    textWrap: {
        alignItems: 'center',
        marginTop: spacing.lg,
        paddingHorizontal: 28,
    },
    title: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
    },
    subtitle: {
        marginTop: spacing.sm,
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
    },
    welcomeWrap: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
    },
    welcomePet: {
        width: 72,
        height: 72,
        marginBottom: spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    welcomeTitle: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
    },
    welcomeBody: {
        marginTop: spacing.sm,
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
    },
});
