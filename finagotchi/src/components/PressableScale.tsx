import React, { useCallback } from 'react';
import {
    Pressable,
    PressableProps,
    StyleProp,
    ViewStyle,
} from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';

import { press } from '../theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = PressableProps & {
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    activeScale?: number;
    activeOpacity?: number;
    springConfig?: typeof press.spring;
};

/**
 * A Pressable that responds to touch with a spring-driven scale/opacity pulse.
 * Feedback starts the instant the finger lands, and the return-to-rest is
 * interruptible so the interaction always feels directly connected to input.
 */
export function PressableScale({
    children,
    style,
    activeScale = press.scaleDown,
    activeOpacity = press.opacityDown,
    springConfig = press.spring,
    onPressIn,
    onPressOut,
    disabled,
    ...rest
}: Props) {
    const pressed = useSharedValue(0);

    const handlePressIn = useCallback(
        (event: Parameters<NonNullable<PressableProps['onPressIn']>>[0]) => {
            pressed.value = withSpring(1, springConfig);
            onPressIn?.(event);
        },
        [pressed, springConfig, onPressIn]
    );

    const handlePressOut = useCallback(
        (event: Parameters<NonNullable<PressableProps['onPressOut']>>[0]) => {
            pressed.value = withSpring(0, springConfig);
            onPressOut?.(event);
        },
        [pressed, springConfig, onPressOut]
    );

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            {
                scale: 1 - pressed.value * (1 - activeScale),
            },
        ],
        opacity: disabled ? 0.4 : 1 - pressed.value * (1 - activeOpacity),
    }));

    return (
        <AnimatedPressable
            {...rest}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={disabled}
            style={[style, animatedStyle]}
        >
            {children}
        </AnimatedPressable>
    );
}
