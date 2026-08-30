import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
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

/** Orbit sized to circle the 150px pet with a comfortable margin. */
const ORBIT_RADIUS = 104;
/** One full comet revolution, matching the device's waiting scene. */
const REVOLUTION_MS = 3000;
const TAIL_DOTS = 5;
const BREATH_MS = 2400;

function Comet({ delay }: { delay: number }) {
    const rotation = useSharedValue(0);

    useEffect(() => {
        rotation.value = withDelay(
            delay,
            withRepeat(
                withTiming(360, {
                    duration: REVOLUTION_MS,
                    easing: Easing.linear,
                    reduceMotion: ReduceMotion.System,
                }),
                -1,
                false
            )
        );
    }, [delay, rotation]);

    const style = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }));

    return (
        <Animated.View style={[styles.orbit, style]}>
            <View style={styles.head} />
            {Array.from({ length: TAIL_DOTS }, (_, i) => {
                // Dots trail the head along the orbit and fade out.
                const angle = (-(i + 1) * 14 * Math.PI) / 180;
                const size = Math.max(2, 5 - i * 0.8);
                return (
                    <View
                        key={i}
                        style={[
                            styles.tail,
                            {
                                width: size,
                                height: size,
                                borderRadius: size / 2,
                                opacity: Math.max(0.06, 0.5 - i * 0.11),
                                transform: [
                                    { translateX: Math.cos(angle) * ORBIT_RADIUS },
                                    { translateY: Math.sin(angle) * ORBIT_RADIUS },
                                ],
                            },
                        ]}
                    />
                );
            })}
        </Animated.View>
    );
}

/**
 * Waiting-for-sync scene, mirroring the device's own: two cyan comets orbit
 * the pet half a revolution apart over a slowly breathing orbit ring. Shown
 * while the app is scanning/connecting; cleared by the parent as soon as the
 * first state notification arrives.
 */
export function WaitingForSync() {
    const breath = useSharedValue(0);

    useEffect(() => {
        breath.value = withRepeat(
            withTiming(1, {
                duration: BREATH_MS,
                easing: Easing.inOut(Easing.quad),
                reduceMotion: ReduceMotion.System,
            }),
            -1,
            true
        );
    }, [breath]);

    const ringStyle = useAnimatedStyle(() => ({
        opacity: 0.18 + breath.value * 0.22,
        transform: [{ scale: 0.97 + breath.value * 0.05 }],
    }));

    return (
        <View pointerEvents="none" style={styles.container}>
            <Animated.View style={[styles.ring, ringStyle]} />
            <Comet delay={0} />
            {/* Second comet starts half a revolution behind the first. */}
            <Comet delay={REVOLUTION_MS / 2} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3,
    },
    ring: {
        position: 'absolute',
        width: ORBIT_RADIUS * 2,
        height: ORBIT_RADIUS * 2,
        borderRadius: ORBIT_RADIUS,
        borderWidth: 1,
        borderColor: colors.primary,
    },
    orbit: {
        position: 'absolute',
        width: 0,
        height: 0,
        alignItems: 'center',
        justifyContent: 'center',
    },
    head: {
        position: 'absolute',
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.primary,
        transform: [{ translateX: ORBIT_RADIUS }],
        shadowColor: colors.primary,
        shadowOpacity: 0.9,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 0 },
    },
    tail: {
        position: 'absolute',
        backgroundColor: colors.primary,
    },
});
