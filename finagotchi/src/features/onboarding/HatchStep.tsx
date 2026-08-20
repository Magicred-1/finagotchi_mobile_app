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
    useSharedValue,
    withSequence,
    withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { Stage1Egg, Stage2Coinling } from '../../components/PetSprites';
import { colors, spacing, typography } from '../../theme/tokens';

type Props = {
    creatureName: string;
    onFinished: () => void;
};

export default function HatchStep({ creatureName, onFinished }: Props) {
    const [hatched, setHatched] = useState(false);
    const scale = useSharedValue(1);
    const rotate = useSharedValue(0);
    const eggOpacity = useSharedValue(1);
    const creatureOpacity = useSharedValue(0);
    const welcomeOpacity = useSharedValue(0);
    const hatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const hatch = useCallback(() => {
        if (hatched) return;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        scale.value = withSequence(
            withTiming(1.15, { duration: 200, easing: Easing.out(Easing.cubic) }),
            withTiming(0.95, { duration: 200, easing: Easing.in(Easing.cubic) }),
            withTiming(1.08, { duration: 200, easing: Easing.out(Easing.cubic) }),
            withTiming(1, { duration: 200 })
        );

        rotate.value = withSequence(
            withTiming(-8, { duration: 120 }),
            withTiming(8, { duration: 120 }),
            withTiming(-6, { duration: 120 }),
            withTiming(6, { duration: 120 }),
            withTiming(0, { duration: 120 })
        );

        hatchTimerRef.current = setTimeout(() => {
            setHatched(true);
            eggOpacity.value = withTiming(0, { duration: 250 });
            creatureOpacity.value = withTiming(1, { duration: 400 });
            welcomeOpacity.value = withTiming(1, { duration: 400 });
        }, 800);
    }, [hatched, scale, rotate, eggOpacity, creatureOpacity, welcomeOpacity]);

    useEffect(() => {
        if (!hatched) return;

        const timer = setTimeout(() => {
            onFinished();
        }, 1500);

        return () => clearTimeout(timer);
    }, [hatched, onFinished]);

    useEffect(() => {
        return () => {
            if (hatchTimerRef.current) {
                clearTimeout(hatchTimerRef.current);
            }
        };
    }, []);

    const eggStyle = useAnimatedStyle(() => ({
        opacity: eggOpacity.value,
        transform: [
            { scale: scale.value },
            { rotate: `${rotate.value}deg` },
        ],
    }));

    const creatureStyle = useAnimatedStyle(() => ({
        opacity: creatureOpacity.value,
        transform: [
            {
                scale: creatureOpacity.value,
            },
        ],
    }));

    const welcomeStyle = useAnimatedStyle(() => ({
        opacity: welcomeOpacity.value,
        transform: [
            {
                translateY: (1 - welcomeOpacity.value) * 12,
            },
        ],
    }));

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.container}>
                <Pressable
                    onPress={hatch}
                    style={styles.stage}
                    disabled={hatched}
                >
                    <Animated.View style={[styles.petWrap, eggStyle]}>
                        <Stage1Egg size={180} />
                    </Animated.View>

                    <Animated.View
                        style={[
                            styles.petWrap,
                            styles.creatureWrap,
                            creatureStyle,
                        ]}
                        pointerEvents="none"
                    >
                        <Stage2Coinling size={180} />
                    </Animated.View>

                    {!hatched ? (
                        <View style={styles.textWrap}>
                            <Text style={styles.title}>Tap to hatch</Text>
                            <Text style={styles.subtitle}>
                                Your egg is ready, {creatureName}
                            </Text>
                        </View>
                    ) : null}
                </Pressable>

                {hatched ? (
                    <Animated.View style={[styles.welcomeWrap, welcomeStyle]}>
                        <Text style={styles.welcomeEmoji}>✨</Text>
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
        paddingHorizontal: 28,
    },
    stage: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    petWrap: {
        width: 200,
        height: 200,
        alignItems: 'center',
        justifyContent: 'center',
    },
    creatureWrap: {
        position: 'absolute',
    },
    textWrap: {
        alignItems: 'center',
        marginTop: spacing.lg,
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
        position: 'absolute',
        alignItems: 'center',
        paddingHorizontal: 28,
    },
    welcomeEmoji: {
        fontSize: 48,
        marginBottom: spacing.sm,
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
