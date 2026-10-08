/**
 * Expo Router native-intent filter: deep links into this app are wallet
 * callbacks, not navigation. Phantom's connect/sign responses arrive as
 * finagotchi://phantom?…, WalletConnect wallets return via finagotchi://…
 * (or the https universal link) with their own params — all consumed by the
 * Linking listener in _layout.tsx / the WC relay. Returning null stops
 * expo-router from trying to route them (the "Unmatched route" screen).
 * No in-app route is deep-link driven today, so the whole custom scheme is
 * swallowed; https links still route normally.
 */
export function redirectSystemPath({
    path,
}: {
    path: string | null;
    initial: boolean;
}): string | null {
    if (!path) return path;
    if (path.startsWith('finagotchi://')) return null;
    if (path.includes('phantom_encryption_public_key=')) return null;
    return path;
}
