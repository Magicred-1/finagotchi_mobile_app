import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '../theme/tokens';

export type DeviceGlyphKind = 'teardrop' | 'flower' | 'star' | 'triangle';

const PATHS: Record<DeviceGlyphKind, string> = {
    teardrop: 'M24 6C18 6 8 24 8 32a16 16 0 0 0 32 0C40 24 30 6 24 6Z',
    flower: 'M24 5c8 0 7 10 12 12s12 2 10 10-10 7-11 13-10 7-14 2-10 3-15-3 3-11 0-17S4 14 12 14 17 5 24 5Z',
    star: 'M24 5c4 0 5 12 9 13s15-1 15 4-10 9-11 13 5 13 0 15-10-7-14-7S12 50 8 47s2-12 0-16S-2 21 2 18s13 1 16-3 2-10 6-10Z',
    triangle: 'M24 6c5 0 7 7 12 15l10 16c4 7 0 11-7 10-10-2-20-2-30 0-7 1-11-3-7-10l10-16C17 13 19 6 24 6Z',
};

/**
 * Brand glyph ported from the reference frontend's DeviceIcon
 * (finagotchiFE src/components/DeviceIcon.tsx). The flower is the
 * wordmark mark; all four shapes are the hardware device family.
 */
export function BrandMark({
    kind = 'flower',
    size = 36,
    color = colors.primary,
}: {
    kind?: DeviceGlyphKind;
    size?: number;
    color?: string;
}) {
    const d = PATHS[kind];
    return (
        <Svg width={size} height={size} viewBox="-3 0 54 54" fill="none">
            <Path d={d} fill={color} opacity={0.16} />
            <Path
                d={d}
                stroke={color}
                strokeWidth={1.7}
                strokeLinejoin="round"
            />
            <Circle
                cx={24}
                cy={kind === 'teardrop' ? 31 : 27}
                r={7.8}
                fill={color}
                opacity={0.85}
            />
        </Svg>
    );
}
