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

import { colors, fonts, landing, press, spacing, typography } from '../theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
    icon: React.ReactNode;
    label: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
    /**
     * Color story: 'landing' (default, the app-wide identity) uses a
     * frosted surface; 'dark' is the legacy near-black glass look.
     */
    tone?: 'dark' | 'landing';
};

export function IconButton({
    icon,
    label,
    onPress,
    disabled = false,
    loading = false,
    tone = 'landing',
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
    const isLanding = tone === 'landing';

    return (
        <AnimatedPressable
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            disabled={isDisabled}
            style={[styles.button, isDisabled && styles.disabled, animatedStyle]}
            accessibilityLabel={label}
        >
            <View style={[styles.content, isLanding && styles.contentLanding]}>
                {loading ? (
                    <ActivityIndicator
                        size="small"
                        color={isLanding ? landing.ink : colors.text}
                    />
                ) : (
                    icon
                )}
            </View>
            <Text style={[styles.label, isLanding && styles.labelLanding]}>
                {label}
            </Text>
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
        borderRadius: 23,
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: colors.borderSoft,
        alignItems: 'center',
        justifyContent: 'center',
    },
    /** Landing identity: frosted light surface (site `.app-download`). */
    contentLanding: {
        backgroundColor: landing.frostSurface,
        borderColor: landing.frostBorder,
    },
    label: {
        color: colors.text,
        fontSize: typography.micro,
        fontFamily: fonts.medium,
    },
    labelLanding: {
        color: landing.ink,
    },
});
