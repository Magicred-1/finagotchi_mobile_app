/**
 * Detects Dynamic Test Accounts (used for App Store review).
 *
 * - Sandbox environments: any email with `+dynamic_test` before the "@"
 *   authenticates with a static OTP from the Dynamic dashboard.
 * - Live environments: a single specific email registered under
 *   Developer → Test Accounts; configure it via EXPO_PUBLIC_DEMO_EMAIL
 *   (comma-separated if several).
 *
 * Demo accounts get payment-gated actions (mint, revive) for free so a
 * reviewer never needs real SOL. Everything else — embedded wallet,
 * signing, server sync — works normally.
 */
export function isDemoAccountEmail(email: string | null | undefined): boolean {
    if (!email) return false;
    const normalized = email.trim().toLowerCase();
    if (!normalized) return false;

    if (normalized.includes('+dynamic_test@')) return true;

    const configured = (process.env.EXPO_PUBLIC_DEMO_EMAIL ?? '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);

    return configured.includes(normalized);
}
