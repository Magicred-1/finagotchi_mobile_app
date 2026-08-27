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
    title: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
    variant?: 'primary' | 'secondary';
    icon?: React.ReactNode;
};

export function Button({
    title,
    onPress,
    disabled = false,
    loading = false,
    variant = 'primary',
    icon,
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
    const spinnerColor = variant === 'primary' ? '#07111F' : colors.text;

    return (
        <AnimatedPressable
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            disabled={isDisabled}
            style={[
                styles.button,
                variant === 'secondary' && styles.secondary,
                isDisabled && styles.disabled,
                animatedStyle,
            ]}
        >
            <View style={styles.content}>
                {loading ? (
                    <ActivityIndicator
                        size="small"
                        color={spinnerColor}
                        style={styles.lead}
                    />
                ) : (
                    icon && <View style={styles.lead}>{icon}</View>
                )}
                <Text
                    style={[
                        styles.text,
                        variant === 'secondary' && styles.textSecondary,
                    ]}
                >
                    {title}
                </Text>
            </View>
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
        minHeight: 48,
    },

    secondary: {
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: colors.border,
    },

    disabled: {
        opacity: 0.4,
    },

    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },

    lead: {
        marginRight: spacing.sm,
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
