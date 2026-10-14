import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '../theme/tokens';

/**
 * One-line hero text that always fits: an offscreen probe measures the
 * string's natural width at the base size, and the rendered size shrinks
 * toward the minimum (and grows back) so long values never wrap or clip.
 * The optional suffix renders smaller and muted after the hero text — the
 * probe measures it at full size, so the composite is guaranteed to fit.
 */
export function FitText({
    text,
    suffix,
    baseFontSize = 48,
    minFontSize = 24,
    fontFamily = fonts.extraBold,
    color = colors.textStrong,
}: {
    text: string;
    /** Muted tail rendered smaller after the hero text (e.g. "USDC"). */
    suffix?: string;
    baseFontSize?: number;
    minFontSize?: number;
    fontFamily?: string;
    color?: string;
}) {
    const [boxWidth, setBoxWidth] = useState(0);
    const [naturalWidth, setNaturalWidth] = useState(0);

    const fontSize =
        boxWidth > 0 && naturalWidth > boxWidth
            ? Math.max(
                  minFontSize,
                  Math.floor(baseFontSize * (boxWidth / naturalWidth))
              )
            : baseFontSize;

    return (
        <View
            style={styles.wrap}
            onLayout={(event) => setBoxWidth(event.nativeEvent.layout.width)}
        >
            {/* Offscreen probe: natural width at the base size. */}
            <Text
                style={[styles.probe, { fontSize: baseFontSize, fontFamily }]}
                numberOfLines={1}
                pointerEvents="none"
                onTextLayout={(event) =>
                    setNaturalWidth(event.nativeEvent.lines[0]?.width ?? 0)
                }
            >
                {suffix ? `${text} ${suffix}` : text}
            </Text>
            <Text
                style={{
                    color,
                    fontFamily,
                    fontSize,
                    fontVariant: ['tabular-nums'],
                    textAlign: 'center',
                    alignSelf: 'stretch',
                    paddingVertical: spacing.xs,
                }}
                numberOfLines={1}
            >
                {text}
                {suffix ? (
                    <Text
                        style={{
                            fontSize: Math.max(
                                13,
                                Math.round(fontSize * 0.38)
                            ),
                            fontFamily: fonts.semiBold,
                            color: colors.textMuted,
                        }}
                    >
                        {` ${suffix}`}
                    </Text>
                ) : null}
            </Text>
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
        fontVariant: ['tabular-nums'],
    },
});
