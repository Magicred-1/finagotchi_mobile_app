import React, { useEffect } from 'react';
import {
    StyleSheet,
    type DimensionValue,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import Animated, {
    ReduceMotion,
    cancelAnimation,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';

import { radius } from '../theme/tokens';

/**
 * Loading placeholder: a soft glass bar that breathes until real content
 * replaces it. Holds a static mid-opacity under reduced motion.
 */
export function Skeleton({
    width,
    height = 14,
    borderRadius = radius.sm,
    style,
}: {
    width?: DimensionValue;
    height?: DimensionValue;
    borderRadius?: number;
    style?: StyleProp<ViewStyle>;
}) {
    const reduceMotion = useReducedMotion();
    const opacity = useSharedValue(0.45);

    useEffect(() => {
        if (reduceMotion) {
            opacity.value = 0.45;
            return;
        }
        opacity.value = withRepeat(
            withTiming(1, { duration: 650, reduceMotion: ReduceMotion.System }),
            -1,
            true,
            undefined,
            ReduceMotion.System
        );
        return () => cancelAnimation(opacity);
    }, [opacity, reduceMotion]);

    const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

    return (
        <Animated.View
            style={[
                styles.block,
                { width, height, borderRadius },
                style,
                animatedStyle,
            ]}
        />
    );
}

const styles = StyleSheet.create({
    block: {
        backgroundColor: 'rgba(157,203,255,0.18)',
    },
});
