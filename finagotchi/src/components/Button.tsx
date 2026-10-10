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

import { colors, fonts, landing, press, radius, spacing, typography } from '../theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
    title: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
    variant?: 'primary' | 'secondary';
    /**
     * Color story: 'landing' (default, the app-wide identity) uses the
     * landing-blue recipe (frosted secondary); 'dark' is the legacy
     * near-black glass look.
     */
    tone?: 'dark' | 'landing';
    icon?: React.ReactNode;
};

export function Button({
    title,
    onPress,
    disabled = false,
    loading = false,
    variant = 'primary',
    tone = 'landing',
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
    const secondaryLanding = variant === 'secondary' && tone === 'landing';
    const spinnerColor =
        variant === 'primary'
            ? colors.onPrimary
            : secondaryLanding
              ? landing.ink
              : colors.text;

    return (
        <AnimatedPressable
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            disabled={isDisabled}
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityState={{ disabled: isDisabled, busy: loading }}
            style={[
                styles.button,
                variant === 'secondary' && styles.secondary,
                secondaryLanding && styles.secondaryLanding,
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
                        secondaryLanding && styles.textSecondaryLanding,
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
        borderRadius: radius.sm,
        alignItems: 'center',
        minHeight: 48,
    },

    secondary: {
        backgroundColor: colors.borderSoft,
        borderWidth: 1,
        borderColor: colors.border,
    },

    /** Landing identity: frosted light secondary (site `.waitlist-dialog` inputs/buttons). */
    secondaryLanding: {
        backgroundColor: landing.frostSurface,
        borderColor: landing.frostBorder,
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
        color: colors.onPrimary,
        fontSize: typography.small,
        fontFamily: fonts.semiBold,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },

    textSecondary: {
        color: colors.text,
    },

    textSecondaryLanding: {
        color: landing.ink,
    },
});
