import React, { useEffect } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withDelay,
    withTiming,
} from 'react-native-reanimated';

/**
 * Staggered fade/rise entrance from the landing hero motion (the web
 * `waitlist-in` keyframe: fade + 12px rise + 0.98 → 1 scale), extended to
 * the whole onboarding flow. Renders children in an Animated.View that
 * starts hidden and settles after `delay` ms. With reduced motion on, the
 * content renders in its final pose with no animation.
 */
export function FadeInUp({
    delay = 0,
    distance = 16,
    duration = 480,
    style,
    children,
}: {
    delay?: number;
    distance?: number;
    duration?: number;
    style?: StyleProp<ViewStyle>;
    children?: React.ReactNode;
}) {
    const reducedMotion = useReducedMotion();
    const progress = useSharedValue(reducedMotion ? 1 : 0);

    useEffect(() => {
        if (reducedMotion) {
            progress.value = 1;
            return;
        }
        progress.value = withDelay(
            delay,
            withTiming(1, { duration, easing: Easing.out(Easing.cubic) })
        );
    }, [reducedMotion, delay, duration, progress]);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: progress.value,
        transform: [
            { translateY: (1 - progress.value) * distance },
            { scale: 0.98 + progress.value * 0.02 },
        ],
    }));

    return (
        <Animated.View style={[style, animatedStyle]}>
            {children}
        </Animated.View>
    );
}
