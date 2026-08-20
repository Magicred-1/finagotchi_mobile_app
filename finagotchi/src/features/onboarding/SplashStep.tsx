import React, { useEffect, useState } from 'react';
import {
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    View,
    Image,
    useWindowDimensions,
} from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

import { colors, spacing, typography } from '../../theme/tokens';

type Props = {
    onFinished?: () => void;
};

export default function SplashStep({ onFinished }: Props) {
    const scale = useSharedValue(0.72);
    const opacity = useSharedValue(0);
    const creatureY = useSharedValue(14);
    const textOpacity = useSharedValue(0);
    const hintOpacity = useSharedValue(0);
    const dotScale = useSharedValue(1);
    const reducedMotion = useReducedMotion();
    const [skipped, setSkipped] = useState(false);
    const { width } = useWindowDimensions();

    useEffect(() => {
        if (reducedMotion) {
            opacity.value = 1;
            scale.value = 1;
            creatureY.value = 0;
            textOpacity.value = 1;
            hintOpacity.value = 1;
            dotScale.value = 1;
            return;
        }

        opacity.value = withTiming(1, {
            duration: 450,
            easing: Easing.out(Easing.cubic),
        });

        scale.value = withSequence(
            withTiming(1.08, {
                duration: 550,
                easing: Easing.out(Easing.back(1.5)),
            }),
            withTiming(1, { duration: 220 })
        );

        creatureY.value = withSequence(
            withTiming(-7, {
                duration: 500,
                easing: Easing.out(Easing.cubic),
            }),
            withTiming(0, {
                duration: 420,
                easing: Easing.inOut(Easing.cubic),
            })
        );

        textOpacity.value = withDelay(
            450,
            withTiming(1, { duration: 500 })
        );

        hintOpacity.value = withDelay(
            1200,
            withTiming(1, { duration: 400 })
        );

        dotScale.value = withRepeat(
            withSequence(
                withTiming(1.5, { duration: 600, easing: Easing.out(Easing.cubic) }),
                withTiming(1, { duration: 600, easing: Easing.inOut(Easing.cubic) })
            ),
            -1,
            true
        );

        const timer = setTimeout(() => finish(), 1900);
        return () => clearTimeout(timer);
    }, [onFinished, creatureY, opacity, scale, textOpacity, hintOpacity, dotScale, reducedMotion]);

    const finish = () => {
        if (skipped) return;
        setSkipped(true);
        onFinished?.();
    };

    const creatureStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [
            { translateY: creatureY.value },
            { scale: scale.value },
        ],
    }));

    const textStyle = useAnimatedStyle(() => ({
        opacity: textOpacity.value,
        transform: [
            {
                translateY: (1 - textOpacity.value) * 8,
            },
        ],
    }));

    const hintStyle = useAnimatedStyle(() => ({
        opacity: hintOpacity.value,
    }));

    const dotStyle = useAnimatedStyle(() => ({
        transform: [{ scale: dotScale.value }],
        opacity: 0.6 + (dotScale.value - 1) * 0.4,
    }));

    const logoWidth = Math.min(Math.max(width * 0.32, 105), 145);
    const logoHeight = logoWidth * 0.28;

    return (
        <SafeAreaView style={styles.safe}>
            <Pressable style={styles.container} onPress={finish}>
                <Animated.View style={[styles.creatureWrap, creatureStyle]}>
                    <View style={styles.glow} />
                    <View style={styles.creatureCard}>
                        <Text style={styles.creature}>🐣</Text>
                    </View>
                </Animated.View>

                <Animated.View style={[styles.brand, textStyle]}>
                    <Image
                        source={require('../../../assets/logos/finagotchi_logo.png')}
                        style={{
                            width: logoWidth,
                            height: logoHeight,
                        }}
                        resizeMode="contain"
                    />
                    <Text style={styles.tagline}>
                        Your wallet. Your creature. Your journey.
                    </Text>
                </Animated.View>

                <View style={styles.bottom}>
                    <Animated.View style={[styles.dot, dotStyle]} />
                    <Text style={styles.loading}>GROWING YOUR WORLD</Text>
                    <Animated.View style={[styles.hintWrap, hintStyle]}>
                        <Text style={styles.hint}>Tap to continue</Text>
                    </Animated.View>
                </View>
            </Pressable>
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
    creatureWrap: {
        width: 154,
        height: 154,
        alignItems: 'center',
        justifyContent: 'center',
    },
    glow: {
        position: 'absolute',
        width: 142,
        height: 142,
        borderRadius: 71,
        backgroundColor: 'rgba(93,226,166,0.08)',
    },
    creatureCard: {
        width: 112,
        height: 112,
        borderRadius: 34,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: 'rgba(93,226,166,0.22)',
        shadowColor: colors.primary,
        shadowOpacity: 0.16,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 10 },
        elevation: 10,
    },
    creature: {
        fontSize: 64,
    },
    brand: {
        alignItems: 'center',
        marginTop: 14,
    },
    tagline: {
        maxWidth: 280,
        marginTop: 5,
        color: colors.textMuted,
        fontSize: 11,
        lineHeight: 17,
        textAlign: 'center',
        fontFamily: 'Poppins_500Medium',
    },
    bottom: {
        position: 'absolute',
        bottom: 28,
        alignItems: 'center',
    },
    dot: {
        width: 5,
        height: 5,
        borderRadius: 3,
        marginBottom: 8,
        backgroundColor: colors.primary,
    },
    loading: {
        color: colors.textMuted,
        fontSize: 8,
        letterSpacing: 1.2,
        fontFamily: 'Poppins_600SemiBold',
    },
    hintWrap: {
        marginTop: spacing.sm,
    },
    hint: {
        color: colors.textMuted,
        fontSize: 10,
        fontFamily: 'Poppins_500Medium',
    },
});
