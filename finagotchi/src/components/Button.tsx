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
};

export function Button({
    title,
    onPress,
    disabled = false,
}: Props) {
    return (
        <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[
            styles.button,
            disabled && styles.disabled,
        ]}
        >
        <Text style={styles.text}>
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

    disabled: {
        opacity: 0.4,
    },

    text: {
        color: '#07111F',
        fontSize: 16,
        fontWeight: '800',
    },
});