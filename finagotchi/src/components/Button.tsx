import React, { useCallback } from 'react';
import {
    Pressable,
    StyleSheet,
    Text,
} from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';

import { colors, press, radius, spacing, typography } from '../theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
    title: string;
    onPress: () => void;
    disabled?: boolean;
    variant?: 'primary' | 'secondary';
};

export function Button({
    title,
    onPress,
    disabled = false,
    variant = 'primary',
}: Props) {
    const pressed = useSharedValue(0);

    const onPressIn = useCallback(() => {
        pressed.value = withSpring(1, press.spring);
    }, [pressed]);

    const onPressOut = useCallback(() => {
        pressed.value = withSpring(0, press.spring);
    }, [pressed]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            {
                scale:
                    1 -
                    pressed.value * (1 - press.scaleDown),
            },
        ],
        opacity: 1 - pressed.value * (1 - press.opacityDown),
    }));

    return (
        <AnimatedPressable
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            disabled={disabled}
            style={[
                styles.button,
                variant === 'secondary' && styles.secondary,
                disabled && styles.disabled,
                animatedStyle,
            ]}
        >
            <Text style={[styles.text, variant === 'secondary' && styles.textSecondary]}>
                {title}
            </Text>
        </AnimatedPressable>
    );
}

const styles = StyleSheet.create({
    button: {
        backgroundColor: colors.primary,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.md,
        alignItems: 'center',
    },

    secondary: {
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: colors.border,
    },

    disabled: {
        opacity: 0.4,
    },

    text: {
        color: '#07111F',
        fontSize: typography.body,
        fontFamily: 'Poppins_800ExtraBold',
    },

    textSecondary: {
        color: colors.text,
    },
});
