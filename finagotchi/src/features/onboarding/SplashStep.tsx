import React, { useEffect, useRef, useState } from 'react';
import {
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
    Image as RNImage,
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
import GifImage from 'react-native-gif';

import { colors, spacing } from '../../theme/tokens';

type Props = {
    onFinished?: () => void;
};

const REVEAL_DURATION = 900;

export default function SplashStep({ onFinished }: Props) {
    const reducedMotion = useReducedMotion();
    const [skipped, setSkipped] = useState(false);
    const { width } = useWindowDimensions();
    const revealFinished = useRef(false);

    // Shared reveal values for the ghost icon
    const ghostOpacity = useSharedValue(0);
    const ghostScale = useSharedValue(0.4);
    const ghostY = useSharedValue(40);

    // Logo + tagline values
    const logoOpacity = useSharedValue(0);
    const logoY = useSharedValue(24);

    const taglineOpacity = useSharedValue(0);
    const taglineY = useSharedValue(16);

    const hintOpacity = useSharedValue(0);
    const floatY = useSharedValue(0);

    useEffect(() => {
        if (reducedMotion) {
            ghostOpacity.value = 1;
            ghostScale.value = 1;
            ghostY.value = 0;
            logoOpacity.value = 1;
            logoY.value = 0;
            taglineOpacity.value = 1;
            taglineY.value = 0;
            hintOpacity.value = 1;
            floatY.value = 0;
            return;
        }

        // Ghost icon: fade in, scale up from small, float up into place
        ghostOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
        ghostScale.value = withSequence(
            withTiming(1.15, { duration: REVEAL_DURATION, easing: Easing.out(Easing.back(1.6)) }),
            withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) })
        );
        ghostY.value = withTiming(0, { duration: REVEAL_DURATION, easing: Easing.out(Easing.cubic) });

        // Logo text fades and slides up
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

        // Gentle floating loop for the ghost after reveal
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
        ghostOpacity,
        ghostScale,
        ghostY,
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

    const ghostStyle = useAnimatedStyle(() => ({
        opacity: ghostOpacity.value,
        transform: [
            { translateY: ghostY.value + floatY.value },
            { scale: ghostScale.value },
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

    const logoWidth = Math.min(Math.max(width * 0.34, 110), 155);
    const logoHeight = logoWidth * 0.28;

    return (
        <SafeAreaView style={styles.safe}>
            <Pressable style={styles.container} onPress={finish}>
                <Animated.View style={[styles.creatureWrap, ghostStyle]}>
                    <GifImage
                        source={require('../../../assets/logos/ghost-animated.gif')}
                        style={styles.ghost}
                        resizeMode="contain"
                    />
                </Animated.View>

                <View style={styles.brand}>
                    <Animated.View style={logoStyle}>
                        <RNImage
                            source={require('../../../assets/logos/finagotchi_logo.png')}
                            style={{ width: logoWidth, height: logoHeight }}
                            resizeMode="contain"
                        />
                    </Animated.View>
                    <Animated.Text style={[styles.tagline, taglineStyle]}>
                        Your wallet. Your creature. Your journey.
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
        backgroundColor: colors.background,
    },
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
    },
    creatureWrap: {
        width: 200,
        height: 200,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ghost: {
        width: 160,
        height: 160,
    },
    brand: {
        alignItems: 'center',
        marginTop: spacing.lg,
    },
    tagline: {
        maxWidth: 280,
        marginTop: 6,
        color: colors.textMuted,
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
        fontFamily: 'Poppins_500Medium',
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
        color: colors.textMuted,
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
    },
});
