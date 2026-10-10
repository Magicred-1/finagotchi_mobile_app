import React, { useEffect, useRef, useState } from 'react';
import {
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    View,
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

import { BrandMark } from '../../components/BrandMark';
import { LandingGradient } from '../../components/LandingGradient';
import { fonts, landing, spacing, tracking, typography } from '../../theme/tokens';

type Props = {
    onFinished?: () => void;
};

const REVEAL_DURATION = 900;

export default function SplashStep({ onFinished }: Props) {
    const reducedMotion = useReducedMotion();
    const [skipped, setSkipped] = useState(false);
    const revealFinished = useRef(false);

    // Shared reveal values for the flower mark
    const markOpacity = useSharedValue(0);
    const markScale = useSharedValue(0.4);
    const markY = useSharedValue(40);

    // Wordmark + tagline values
    const logoOpacity = useSharedValue(0);
    const logoY = useSharedValue(24);

    const taglineOpacity = useSharedValue(0);
    const taglineY = useSharedValue(16);

    const hintOpacity = useSharedValue(0);
    const floatY = useSharedValue(0);

    useEffect(() => {
        if (reducedMotion) {
            markOpacity.value = 1;
            markScale.value = 1;
            markY.value = 0;
            logoOpacity.value = 1;
            logoY.value = 0;
            taglineOpacity.value = 1;
            taglineY.value = 0;
            hintOpacity.value = 1;
            floatY.value = 0;
            return;
        }

        // Flower mark: fade in, scale up from small, float up into place
        markOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
        markScale.value = withSequence(
            withTiming(1.15, { duration: REVEAL_DURATION, easing: Easing.out(Easing.back(1.6)) }),
            withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) })
        );
        markY.value = withTiming(0, { duration: REVEAL_DURATION, easing: Easing.out(Easing.cubic) });

        // Wordmark fades and slides up
        logoOpacity.value = withDelay(
            350,
            withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })
        );
        logoY.value = withDelay(
            350,
            withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) })
        );

        // Tagline fades and slides up
        taglineOpacity.value = withDelay(
            650,
            withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) })
        );
        taglineY.value = withDelay(
            650,
            withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) })
        );

        // Gentle floating loop for the mark after reveal
        floatY.value = withDelay(
            1000,
            withRepeat(
                withSequence(
                    withTiming(-8, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
                    withTiming(8, { duration: 1600, easing: Easing.inOut(Easing.sin) })
                ),
                -1,
                true
            )
        );

        hintOpacity.value = withDelay(1200, withTiming(1, { duration: 400 }));

        const timer = setTimeout(() => finish(), 1500);
        return () => clearTimeout(timer);
    }, [
        reducedMotion,
        markOpacity,
        markScale,
        markY,
        logoOpacity,
        logoY,
        taglineOpacity,
        taglineY,
        hintOpacity,
        floatY,
    ]);

    const finish = () => {
        if (skipped || revealFinished.current) return;
        revealFinished.current = true;
        setSkipped(true);
        onFinished?.();
    };

    const markStyle = useAnimatedStyle(() => ({
        opacity: markOpacity.value,
        transform: [
            { translateY: markY.value + floatY.value },
            { scale: markScale.value },
        ],
    }));

    const logoStyle = useAnimatedStyle(() => ({
        opacity: logoOpacity.value,
        transform: [{ translateY: logoY.value }],
    }));

    const taglineStyle = useAnimatedStyle(() => ({
        opacity: taglineOpacity.value,
        transform: [{ translateY: taglineY.value }],
    }));

    const hintStyle = useAnimatedStyle(() => ({
        opacity: hintOpacity.value,
    }));

    return (
        <SafeAreaView style={styles.safe}>
            <LandingGradient />
            <Pressable style={styles.container} onPress={finish}>
                <Animated.View style={[styles.markWrap, markStyle]}>
                    <BrandMark kind="flower" size={96} color={landing.accent} />
                </Animated.View>

                <View style={styles.brand}>
                    <Animated.Text style={[styles.wordmark, logoStyle]}>
                        finagotchi
                        <Text style={styles.wordmarkDot}>.</Text>
                    </Animated.Text>
                    <Animated.Text style={[styles.tagline, taglineStyle]}>
                        Better financial habits within reach.
                    </Animated.Text>
                    <Animated.Text style={[styles.subheadline, taglineStyle]}>
                        Meet the everyday companion that makes building better
                        money habits feel a little more human.
                    </Animated.Text>
                </View>

                <View style={styles.bottom}>
                    <Animated.View style={[styles.hintWrap, hintStyle]}>
                        <Text style={styles.hint}>Tap anywhere to continue</Text>
                    </Animated.View>
                </View>
            </Pressable>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: landing.navy,
    },
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
    },
    markWrap: {
        width: 120,
        height: 120,
        alignItems: 'center',
        justifyContent: 'center',
    },
    brand: {
        alignItems: 'center',
        marginTop: spacing.lg,
    },
    wordmark: {
        color: landing.text,
        fontSize: 28,
        fontFamily: fonts.hero,
        letterSpacing: -1.3,
        textAlign: 'center',
    },
    wordmarkDot: {
        color: landing.accent,
    },
    tagline: {
        maxWidth: 300,
        marginTop: spacing.md,
        color: landing.text,
        fontSize: typography.heading,
        lineHeight: 30,
        letterSpacing: tracking.heading,
        textAlign: 'center',
        fontFamily: fonts.medium,
    },
    subheadline: {
        maxWidth: 300,
        marginTop: spacing.sm,
        color: landing.textMuted,
        fontSize: typography.small,
        lineHeight: 20,
        textAlign: 'center',
        fontFamily: fonts.regular,
    },
    bottom: {
        position: 'absolute',
        bottom: 32,
        alignItems: 'center',
    },
    hintWrap: {
        marginTop: spacing.sm,
    },
    hint: {
        color: landing.ink,
        fontSize: typography.micro,
        fontFamily: fonts.medium,
    },
});
