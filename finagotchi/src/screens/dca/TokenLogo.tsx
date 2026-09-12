import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../theme/tokens';
import { tokenLogoUrl } from './format';

type Props = {
    ticker: string;
    size?: number;
};

/**
 * xStock logo with a permanent letter fallback: the muted circle renders
 * underneath (no spinner while loading), and a failed fetch just never
 * covers it.
 */
export function TokenLogo({ ticker, size = 28 }: Props) {
    const [failed, setFailed] = useState(false);

    return (
        <View
            style={[
                styles.circle,
                { width: size, height: size, borderRadius: size / 2 },
            ]}
        >
            <Text style={[styles.letter, { fontSize: size * 0.45 }]}>
                {ticker.charAt(0)}
            </Text>
            {!failed && (
                <Image
                    source={{ uri: tokenLogoUrl(ticker) }}
                    style={[
                        StyleSheet.absoluteFill,
                        { borderRadius: size / 2 },
                    ]}
                    onError={() => setFailed(true)}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    circle: {
        backgroundColor: colors.surfaceLight,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    letter: {
        color: colors.textMuted,
        fontFamily: 'Poppins_600SemiBold',
    },
});
