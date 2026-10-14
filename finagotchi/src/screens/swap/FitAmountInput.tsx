import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, spacing } from '../../theme/tokens';

/** Hero size for short amounts; shrinks toward MIN as the number grows. */
const BASE_FONT_SIZE = 56;
const MIN_FONT_SIZE = 30;

/**
 * Hero amount field: the amount is always rendered on one line, with the
 * font size computed from the text's natural width (measured by an
 * offscreen probe at the hero size) so long amounts shrink to fit and
 * short ones grow back.
 */
export function FitAmountInput({
    value,
    onChangeText,
    editable = true,
    error = false,
    accessibilityLabel,
}: {
    value: string;
    onChangeText: (text: string) => void;
    editable?: boolean;
    error?: boolean;
    accessibilityLabel?: string;
}) {
    const [boxWidth, setBoxWidth] = useState(0);
    const [naturalWidth, setNaturalWidth] = useState(0);

    const fontSize =
        boxWidth > 0 && naturalWidth > boxWidth
            ? Math.max(
                  MIN_FONT_SIZE,
                  Math.floor(BASE_FONT_SIZE * (boxWidth / naturalWidth))
              )
            : BASE_FONT_SIZE;

    return (
        <View
            style={styles.wrap}
            onLayout={(event) => setBoxWidth(event.nativeEvent.layout.width)}
        >
            {/* Offscreen probe: natural width of the amount at hero size. */}
            <Text
                style={styles.probe}
                numberOfLines={1}
                pointerEvents="none"
                onTextLayout={(event) =>
                    setNaturalWidth(event.nativeEvent.lines[0]?.width ?? 0)
                }
            >
                {value === '' ? '0' : value}
            </Text>
            <TextInput
                style={[styles.input, { fontSize }, error && styles.inputError]}
                value={value}
                onChangeText={onChangeText}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                editable={editable}
                textAlign="center"
                accessibilityLabel={accessibilityLabel}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        alignSelf: 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
    },
    probe: {
        position: 'absolute',
        top: 0,
        left: 0,
        opacity: 0,
        fontSize: BASE_FONT_SIZE,
        fontFamily: fonts.extraBold,
        fontVariant: ['tabular-nums'],
    },
    input: {
        alignSelf: 'stretch',
        color: colors.textStrong,
        fontFamily: fonts.extraBold,
        fontVariant: ['tabular-nums'],
        paddingVertical: spacing.xs,
    },
    inputError: {
        color: colors.danger,
    },
});
