import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { colors } from '../../theme/tokens';
import { BRAND_TOKEN_ICONS } from './brandTokenIcons';
import { tokenLogoUrl } from './format';

type Props = {
    ticker: string;
    size?: number;
};

/**
 * Token logo with a permanent letter fallback: branded web3icons SVGs for
 * SOL/USDC (bundled, crisp at any size), the Backed metadata host for
 * xStocks, and the muted circle underneath it all (no spinner while
 * loading, a failed fetch just never covers it).
 */
export function TokenLogo({ ticker, size = 28 }: Props) {
    const [failed, setFailed] = useState(false);
    const brandSvg = BRAND_TOKEN_ICONS[ticker];

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
            {brandSvg ? (
                <SvgXml
                    xml={brandSvg}
                    width={size}
                    height={size}
                    // Same overlay as the remote Image below: without this the
                    // SVG stacks under the letter instead of covering it.
                    style={StyleSheet.absoluteFill}
                />
            ) : (
                !failed && (
                    <Image
                        source={{ uri: tokenLogoUrl(ticker) }}
                        style={[
                            StyleSheet.absoluteFill,
                            { borderRadius: size / 2 },
                        ]}
                        onError={() => setFailed(true)}
                    />
                )
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    circle: {
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    letter: {
        color: colors.textMuted,
        fontFamily: 'DMSans_600SemiBold',
    },
});
