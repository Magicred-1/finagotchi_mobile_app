import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    Easing,
    ReduceMotion,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';

import { colors } from '../theme/tokens';

const RING_COUNT = 3;
const RING_DURATION = 2400;
const RING_SIZE = 56;
/** How far past the center circle the rings expand before fading out. */
const RING_MAX_SCALE = 3.2;

function PulseRing({ delay }: { delay: number }) {
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.value = withDelay(
            delay,
            withRepeat(
                withTiming(1, {
                    duration: RING_DURATION,
                    easing: Easing.out(Easing.cubic),
                    reduceMotion: ReduceMotion.System,
                }),
                -1,
                false
            )
        );
    }, [delay, progress]);

    const style = useAnimatedStyle(() => ({
        opacity: 0.6 * (1 - progress.value),
        transform: [{ scale: 1 + (RING_MAX_SCALE - 1) * progress.value }],
    }));

    return <Animated.View style={[styles.ring, style]} />;
}

/**
 * Radar-style pulse shown while scanning for nearby Finagotchi hardware:
 * rings expand outward from a Bluetooth badge.
 */
export function SearchingRadar() {
    return (
        <View style={styles.container}>
            {Array.from({ length: RING_COUNT }, (_, i) => (
                <PulseRing key={i} delay={(RING_DURATION / RING_COUNT) * i} />
            ))}
            <View style={styles.badge}>
                <Ionicons name="bluetooth" size={24} color={colors.primary} />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        height: RING_SIZE * RING_MAX_SCALE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ring: {
        position: 'absolute',
        width: RING_SIZE,
        height: RING_SIZE,
        borderRadius: RING_SIZE / 2,
        borderWidth: 2,
        borderColor: colors.primary,
    },
    badge: {
        width: RING_SIZE,
        height: RING_SIZE,
        borderRadius: RING_SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(53,215,255,0.12)',
        borderWidth: 1,
        borderColor: colors.primary,
    },
});
