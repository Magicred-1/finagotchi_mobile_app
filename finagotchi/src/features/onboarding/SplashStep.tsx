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

export default function SplashStep({ onFinished }: Props) {
    const opacity = useSharedValue(0);
    const scale = useSharedValue(0.6);
    const floatY = useSharedValue(0);
    const textOpacity = useSharedValue(0);
    const hintOpacity = useSharedValue(0);
    const reducedMotion = useReducedMotion();
    const [skipped, setSkipped] = useState(false);
    const { width } = useWindowDimensions();
    const revealFinished = useRef(false);

    useEffect(() => {
        if (reducedMotion) {
            opacity.value = 1;
            scale.value = 1;
            floatY.value = 0;
            textOpacity.value = 1;
            hintOpacity.value = 1;
            return;
        }

        opacity.value = withTiming(1, {
            duration: 500,
            easing: Easing.out(Easing.cubic),
        });

        scale.value = withSequence(
            withTiming(1.12, {
                duration: 650,
                easing: Easing.out(Easing.back(1.7)),
            }),
            withTiming(1, {
                duration: 300,
                easing: Easing.out(Easing.cubic),
            })
        );

        floatY.value = withDelay(
            700,
            withRepeat(
                withSequence(
                    withTiming(-8, {
                        duration: 1600,
                        easing: Easing.inOut(Easing.sin),
                    }),
                    withTiming(8, {
                        duration: 1600,
                        easing: Easing.inOut(Easing.sin),
                    })
                ),
                -1,
                true
            )
        );

        textOpacity.value = withDelay(500, withTiming(1, { duration: 600 }));
        hintOpacity.value = withDelay(1100, withTiming(1, { duration: 400 }));

        const timer = setTimeout(() => finish(), 1200);
        return () => clearTimeout(timer);
    }, [onFinished, opacity, scale, floatY, textOpacity, hintOpacity, reducedMotion]);

    const finish = () => {
        if (skipped || revealFinished.current) return;
        revealFinished.current = true;
        setSkipped(true);
        onFinished?.();
    };

    const creatureStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateY: floatY.value }, { scale: scale.value }],
    }));

    const textStyle = useAnimatedStyle(() => ({
        opacity: textOpacity.value,
        transform: [{ translateY: (1 - textOpacity.value) * 10 }],
    }));

    const hintStyle = useAnimatedStyle(() => ({
        opacity: hintOpacity.value,
    }));

    const logoWidth = Math.min(Math.max(width * 0.34, 110), 155);
    const logoHeight = logoWidth * 0.28;

    return (
        <SafeAreaView style={styles.safe}>
            <Pressable style={styles.container} onPress={finish}>
                <Animated.View style={[styles.creatureWrap, creatureStyle]}>
                    <GifImage
                        source={require('../../../assets/logos/ghost-animated.gif')}
                        style={styles.ghost}
                        resizeMode="contain"
                    />
                </Animated.View>

                <Animated.View style={[styles.brand, textStyle]}>
                    <RNImage
                        source={require('../../../assets/logos/finagotchi_logo.png')}
                        style={{ width: logoWidth, height: logoHeight }}
                        resizeMode="contain"
                    />
                    <Text style={styles.tagline}>
                        Your wallet. Your creature. Your journey.
                    </Text>
                </Animated.View>

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
