import React, { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, {
    Defs,
    LinearGradient as SvgLinearGradient,
    Rect,
    Stop,
} from 'react-native-svg';

/**
 * Vertical gradient fill rendered with react-native-svg.
 *
 * Used instead of expo-linear-gradient on purpose: that package is a native
 * module, and adding it would require a new native build and would make the
 * new frontend impossible to ship as an EAS Update to existing installs.
 * react-native-svg is already bundled with the app, so gradients stay an
 * OTA-safe, JavaScript-only change.
 *
 * Supports 2+ color stops; pass `locations` (same length as `colors`,
 * ascending 0–1) for multi-stop gradients like the landing background, and
 * `start`/`end` to change the gradient vector (default straight down).
 *
 * Renders as an absolute-fill layer behind `children`; put it inside a
 * relatively positioned parent with `overflow: 'hidden'`.
 */
export function GradientFill({
    colors,
    locations,
    start,
    end,
    borderRadius = 0,
    children,
    style,
}: {
    colors: readonly string[];
    locations?: readonly number[];
    /** Gradient vector in unit coordinates; defaults to (0,0) → (0,1). */
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    borderRadius?: number;
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
}) {
    const id = useId().replace(/[^a-zA-Z0-9]/g, '');
    return (
        <View style={[styles.container, { borderRadius }, style]}>
            <Svg
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
                width="100%"
                height="100%"
            >
                <Defs>
                    <SvgLinearGradient
                        id={id}
                        x1={start?.x ?? 0}
                        y1={start?.y ?? 0}
                        x2={end?.x ?? 0}
                        y2={end?.y ?? 1}
                    >
                        {colors.map((color, index) => (
                            <Stop
                                key={`${color}-${index}`}
                                offset={
                                    locations?.[index] ??
                                    index / (colors.length - 1)
                                }
                                stopColor={color}
                            />
                        ))}
                    </SvgLinearGradient>
                </Defs>
                <Rect
                    x="0"
                    y="0"
                    width="100%"
                    height="100%"
                    rx={borderRadius}
                    fill={`url(#${id})`}
                />
            </Svg>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
    },
});
