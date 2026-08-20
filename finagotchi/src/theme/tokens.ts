export const colors = {
    background: '#07111F',
    surface: '#0E1B2E',
    surfaceLight: '#162640',

    primary: '#35D7FF',
    primaryDark: '#16caf7',

    cyan: '#35D7FF',
    purple: '#9945FF',

    text: '#FFFFFF',
    textMuted: '#8FA2B8',

    danger: '#FF647C',
    warning: '#FFD166',

    border: '#243651',
};

export const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
};

export const radius = {
    sm: 8,
    md: 14,
    lg: 22,
    pill: 999,
};

export const typography = {
    title: 32,
    heading: 22,
    body: 16,
    small: 13,
};

/**
 * Apple-style tracking: large/dense text reads better pulled tighter,
 * small text needs slightly positive tracking for legibility.
 */
export const tracking = {
    title: -0.02,
    heading: -0.01,
    body: 0,
    small: 0.01,
    eyebrow: 0.04,
};

/**
 * Apple Design spring mappings.
 *
 * Apple frames springs by damping ratio and response (not duration).
 * - Damping ratio 1.0 = critically damped, no overshoot.
 * - Damping ratio ~0.8 = slight overshoot, good for momentum-driven gestures.
 * - Response is roughly how quickly the spring settles, in seconds.
 *
 * Reanimated uses mass/stiffness/damping. With mass = 1:
 *   stiffness ≈ (2π / response)²
 *   damping   ≈ 2 × dampingRatio × √stiffness
 */
export const springs = {
    /** Default UI motions: smooth, no bounce. */
    default: {
        damping: 35,
        stiffness: 280,
        mass: 1,
    },
    /** Slightly snappier settle for small controls. */
    snappy: {
        damping: 38,
        stiffness: 420,
        mass: 1,
    },
    /** Momentum-driven gestures (sheet flick, swipe): subtle bounce. */
    momentum: {
        damping: 18,
        stiffness: 280,
        mass: 1,
    },
    /** Gentle, low-energy motion for reduced-motion alternatives. */
    gentle: {
        damping: 40,
        stiffness: 180,
        mass: 1,
    },
};

/** Press feedback values tuned for a direct, physical tap feel. */
export const press = {
    /** Scale applied while a pressable is held. */
    scaleDown: 0.97,
    /** Opacity applied while a pressable is held. */
    opacityDown: 0.85,
    /** Spring used to return to rest after a press. */
    spring: springs.snappy,
};

/** Shared shadow values that keep surfaces feeling layered. */
export const shadows = {
    small: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
        elevation: 3,
    },
    medium: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 24,
        elevation: 8,
    },
    large: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.2,
        shadowRadius: 40,
        elevation: 12,
    },
    glow: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
        elevation: 8,
    },
};
