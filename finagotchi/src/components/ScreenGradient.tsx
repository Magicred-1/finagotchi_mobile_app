import React from 'react';
import { StyleSheet } from 'react-native';

import { gradients, gradientStops } from '../theme/tokens';
import { GradientFill } from './GradientFill';
import { SoftGlow } from './SoftGlow';

/**
 * Full-screen app background: the landing identity's signature 5-stop
 * vertical gradient (#0B2858 → #123D77 30% → #2668B8 55% → #91BEE9 83% →
 * #C2D9EF) with a soft radial blue glow behind the primary content area.
 * Render as the first child of a screen with absolute fill, or wrap
 * content in it.
 */
export function ScreenGradient({
    children,
    glow = true,
}: {
    children?: React.ReactNode;
    /** Set false for screens that provide their own glow placement. */
    glow?: boolean;
}) {
    if (children) {
        return (
            <GradientFill
                colors={gradients.landing}
                locations={gradientStops.landing}
                style={styles.wrapper}
            >
                {glow ? <SoftGlow style={styles.glow} /> : null}
                {children}
            </GradientFill>
        );
    }
    return (
        <>
            <GradientFill
                colors={gradients.landing}
                locations={gradientStops.landing}
                style={StyleSheet.absoluteFill}
            />
            {glow ? <SoftGlow style={styles.glow} /> : null}
        </>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        flex: 1,
    },
    glow: {
        position: 'absolute',
        top: '6%',
        left: '-35%',
        right: '-35%',
        height: '55%',
    },
});
