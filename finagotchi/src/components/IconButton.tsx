import React, { useCallback } from 'react';
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';

import { colors, press, radius, spacing, typography } from '../theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
    icon: React.ReactNode;
    label: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
};

export function IconButton({
    icon,
    label,
    onPress,
    disabled = false,
    loading = false,
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

    const isDisabled = disabled || loading;

    return (
        <AnimatedPressable
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            disabled={isDisabled}
            style={[styles.button, isDisabled && styles.disabled, animatedStyle]}
            accessibilityLabel={label}
        >
            <View style={styles.content}>
                {loading ? (
                    <ActivityIndicator size="small" color={colors.text} />
                ) : (
                    icon
                )}
            </View>
            <Text style={styles.label}>{label}</Text>
        </AnimatedPressable>
    );
}

const styles = StyleSheet.create({
    button: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
    },
    disabled: {
        opacity: 0.4,
    },
    content: {
        width: 56,
        height: 56,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    label: {
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
    },
});
