import React from 'react';

import { ScreenGradient } from './ScreenGradient';

/**
 * Onboarding background — kept for the onboarding flow's call sites.
 * The landing gradient + soft glow now lives in ScreenGradient (the
 * identity is app-wide); this is a thin alias so onboarding imports keep
 * working. New code should use ScreenGradient directly.
 */
export function LandingGradient({
    children,
    glow = true,
}: {
    children?: React.ReactNode;
    /** Set false for steps that provide their own glow placement. */
    glow?: boolean;
}) {
    return <ScreenGradient glow={glow}>{children}</ScreenGradient>;
}
