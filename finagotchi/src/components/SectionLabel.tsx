import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { colors, fonts, tracking, typography } from '../theme/tokens';

/**
 * Uppercase micro-label from the reference identity
 * (11px, medium, +1.2px tracking, muted).
 */
export function SectionLabel({
    children,
    color = colors.textMuted,
}: {
    children: React.ReactNode;
    color?: string;
}) {
    return <Text style={[styles.label, { color }]}>{children}</Text>;
}

const styles = StyleSheet.create({
    label: {
        fontSize: typography.micro,
        fontFamily: fonts.medium,
        letterSpacing: tracking.eyebrow,
        textTransform: 'uppercase',
    },
});
