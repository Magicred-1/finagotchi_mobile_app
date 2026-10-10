/**
 * Design tokens — ported from the finagotchi landing identity
 * (finagotchi_landing_page site/styles.css + the app-screen mock
 * public/images/finagotchi-app-screen.svg, shared with finagotchiFE).
 *
 * The landing-blue identity is app-wide: every screen sits on the 5-stop
 * `gradients.landing` background (via ScreenGradient) and uses the
 * `landing` token group. The `colors` dark palette survives as legacy
 * tokens for unmigrated sheet contents and semantic accents
 * (amber/gold/heart/success).
 */

export const colors = {
    background: '#11171E',
    backgroundTop: '#252A30',

    /** Solid base for cards and sheets. */
    surface: '#141B24',
    /** Raised controls (action buttons, inputs). */
    surfaceLight: '#1A2028',
    /** Active/hover surfaces. */
    surfaceHover: '#232B36',
    /** Deepest panel (actions dock). */
    panel: '#10151B',
    /** Alternate panel (stage card). */
    panelAlt: '#364359',
    /** Stat pills / chips. */
    chip: '#10161C',

    primary: '#8DC9F6',
    /** Pressed/hover state of accent controls (reference hovers lighter). */
    primaryDark: '#B6DCF9',
    /** Text/icons placed on top of the accent color. */
    onPrimary: '#102E55',

    accent: '#8DC9F6',
    /** Warm secondary accent (pet body color in the reference mock). */
    amber: '#F8B43C',
    gold: '#E9B846',
    heart: '#F36F7C',

    /** @deprecated legacy aliases kept for existing call sites. */
    cyan: '#8DC9F6',
    /** @deprecated legacy alias — purple is not part of the identity. */
    purple: '#F8B43C',

    text: '#D7E0EE',
    /** Headings and high-emphasis text. */
    textStrong: '#F6FAFF',
    textMuted: '#9CA9BB',

    danger: '#F36F7C',
    warning: '#E9B846',
    success: '#7ED6A7',

    /** 1px "glass" borders from the reference mock (#ffffff10). */
    border: 'rgba(255,255,255,0.10)',
    borderSoft: 'rgba(255,255,255,0.05)',

    streakPill: '#142A34',
    badgeFree: '#254859',
    badgeCost: '#242C37',
};

/**
 * Landing-blue palette — the marketing site's page identity
 * (finagotchi_landing_page site/styles.css `.app-root` / `--page-*`
 * variables), now the app-wide identity: onboarding, the main pet screen,
 * and all sheets/overlays use this group.
 */
export const landing = {
    /** Gradient stops, top → bottom. */
    navy: '#0B2858',
    deepBlue: '#123D77',
    blue: '#2668B8',
    lightBlue: '#91BEE9',
    frost: '#C2D9EF',

    /** Text on the gradient (darker upper region). */
    text: '#F6FAFF',
    textMuted: '#E0EBF8',
    /** Uppercase eyebrows (+1.2 tracking). */
    eyebrow: '#B2D8F8',

    /** Glass panels: #143766 at 22% (66% when active), 1px #9DCBFF30 border. */
    glass: '#14376638',
    glassActive: '#14376666',
    glassHover: '#8DC9F61A',
    glassBorder: '#9DCBFF30',
    glassBorderStrong: '#9DCBFF50',

    /** Primary button: light accent on dark blue. */
    accent: '#8DC9F6',
    accentPressed: '#B6DCF9',
    onAccent: '#102E55',

    /** Frosted secondary buttons and light input surfaces. */
    frostSurface: '#F3F8FF',
    frostBorder: '#D9E9FB',
    /** Ink for text/icons on the light lower gradient stops and frost surfaces. */
    ink: '#173D6A',
    inkMuted: '#4D6C91',
    placeholder: '#7087A3',

    /** Dialog backdrop and radial highlight (site `.popup-dialog`). */
    backdrop: '#061D3D80',
    dialogHighlight: '#377BCA',
    /** Deepest stop of the dialog gradient (site: #1d5592). */
    dialogDeep: '#1D5592',
    /** Error text on dark blue (site: #ffc9c9). */
    error: '#FFC9C9',
};

/** Vertical gradients (top → bottom). Render with GradientFill. */
export const gradients = {
    /** App screen background. */
    screen: ['#252A30', '#11171E'] as const,
    /** Pet portrait panel. */
    portrait: ['#263E49', '#2C3042'] as const,
    /** Sheet / dialog surface. */
    sheet: ['#182230', '#11181F'] as const,
    /**
     * Landing page background — the 5-stop vertical signature gradient
     * used across onboarding (site `.app-root`). Stops at 0/30/55/83/100%.
     */
    landing: [
        landing.navy,
        landing.deepBlue,
        landing.blue,
        landing.lightBlue,
        landing.frost,
    ] as const,
    /**
     * Landing dialog surface (site `.popup-dialog`): 155deg navy →
     * deepBlue → #1D5592. Stops at 0/65/100%.
     */
    landingDialog: [landing.navy, landing.deepBlue, landing.dialogDeep] as const,
};

/** Stop offsets for multi-stop gradients (match the arrays above). */
export const gradientStops = {
    landing: [0, 0.3, 0.55, 0.83, 1] as const,
    landingDialog: [0, 0.65, 1] as const,
};

export const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
};

export const radius = {
    sm: 10,
    md: 16,
    lg: 24,
    /** Large hero cards (reference mock uses 29px). */
    xl: 29,
    pill: 999,
};

export const typography = {
    title: 32,
    heading: 22,
    body: 16,
    small: 13,
    /** Uppercase micro-labels (eyebrows, badges). */
    micro: 11,
};

/** Font family names as registered in app/_layout.tsx. */
export const fonts = {
    regular: 'DMSans_400Regular',
    medium: 'DMSans_500Medium',
    semiBold: 'DMSans_600SemiBold',
    bold: 'DMSans_700Bold',
    extraBold: 'DMSans_800ExtraBold',
    black: 'DMSans_900Black',
    /** Numeric readouts; the identity is single-family, so these alias DM Sans. */
    mono: 'DMSans_500Medium',
    monoBold: 'DMSans_700Bold',
    /** Wordmark/hero headline. */
    hero: 'DMSans_700Bold',
};

/**
 * Tracking from the reference CSS, converted to RN's absolute letterSpacing.
 * Headings use -0.045em; uppercase micro-labels use +1.2px.
 */
export const tracking = {
    title: -1.4,
    heading: -0.9,
    body: 0,
    small: 0.1,
    eyebrow: 1.2,
};

/** Animation durations from the reference stylesheet (ms). */
export const durations = {
    /** Button color/press transitions. */
    press: 160,
    /** Dialog entry (cubic-bezier(0.2, 0.7, 0.2, 1) on web). */
    dialog: 240,
    /** Backdrop fade. */
    backdrop: 300,
    /** Breathing glow cycle. */
    breathe: 5500,
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
    /** Reference popup shadow: 0 32px 100px #03172f70. */
    popup: {
        shadowColor: '#03172F',
        shadowOffset: { width: 0, height: 32 },
        shadowOpacity: 0.44,
        shadowRadius: 100,
        elevation: 16,
    },
    glow: {
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 24,
        elevation: 8,
    },
};
