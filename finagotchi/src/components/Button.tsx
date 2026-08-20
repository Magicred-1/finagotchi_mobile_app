import React from 'react';
import {
    Pressable,
    StyleSheet,
    Text,
} from 'react-native';

import { colors, radius, spacing } from '../theme/tokens';

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
    return (
        <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[
            styles.button,
            variant === 'secondary' && styles.secondary,
            disabled && styles.disabled,
        ]}
        >
        <Text style={[styles.text, variant === 'secondary' && styles.textSecondary]}>
            {title}
        </Text>
        </Pressable>
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
        fontSize: 16,
        fontWeight: '800',
    },

    textSecondary: {
        color: colors.text,
    },
});