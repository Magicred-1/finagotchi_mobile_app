import React, { useEffect } from 'react';
import {
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
    useSharedValue,
    withDelay,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

import { colors } from '../../theme/tokens';

type Props = {
    onFinished?: () => void;
};

export default function SplashStep({ onFinished }: Props) {
    const scale = useSharedValue(0.72);
    const opacity = useSharedValue(0);
    const creatureY = useSharedValue(14);
    const textOpacity = useSharedValue(0);
    const { width } = useWindowDimensions();

    useEffect(() => {
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

        const timer = setTimeout(() => onFinished?.(), 1900);
        return () => clearTimeout(timer);
    }, [onFinished, creatureY, opacity, scale, textOpacity]);

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

    const logoWidth = Math.min(Math.max(width * 0.32, 105), 145);
    const logoHeight = logoWidth * 0.28;

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.container}>
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
                    <View style={styles.dot} />
                    <Text style={styles.loading}>GROWING YOUR WORLD</Text>
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
});
