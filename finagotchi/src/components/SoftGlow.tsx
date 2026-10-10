import React, { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, {
    Defs,
    RadialGradient as SvgRadialGradient,
    Rect,
    Stop,
} from 'react-native-svg';

import { landing } from '../theme/tokens';

/**
 * Soft radial glow from the landing identity (`--page-soft-glow`: a blue
 * ellipse at ~95% opacity fading to 0 by 72%). Placed behind hero content
 * and glass panels to lift them off the gradient. OTA-safe react-native-svg.
 *
 * Size and position via `style` (the glow fills whatever box it is given,
 * fading at the edges, so it can safely overflow its parent).
 */
export function SoftGlow({
    color = landing.blue,
    style,
}: {
    color?: string;
    style?: StyleProp<ViewStyle>;
}) {
    const id = useId().replace(/[^a-zA-Z0-9]/g, '');
    return (
        <View style={style} pointerEvents="none">
            <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
                <Defs>
                    <SvgRadialGradient
                        id={id}
                        cx="50%"
                        cy="50%"
                        rx="50%"
                        ry="50%"
                    >
                        <Stop offset="0" stopColor={color} stopOpacity={0.95} />
                        <Stop offset="0.4" stopColor={color} stopOpacity={0.7} />
                        <Stop offset="0.72" stopColor={color} stopOpacity={0} />
                    </SvgRadialGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
            </Svg>
        </View>
    );
}
