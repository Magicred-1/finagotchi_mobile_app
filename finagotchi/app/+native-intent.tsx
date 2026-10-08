/**
 * Expo Router native-intent filter: some deep links are wallet callbacks, not
 * navigation. Phantom's connect/sign responses arrive as
 * finagotchi://phantom?… (or the https universal link with Phantom params)
 * and are consumed by the Linking listener in _layout.tsx, which completes
 * the handshake with the Dynamic SDK. Returning null stops expo-router from
 * trying to navigate to a "phantom" route ("Unmatched route" screen).
 */
export function redirectSystemPath({
    path,
}: {
    path: string | null;
    initial: boolean;
}): string | null {
    if (!path) return path;
    if (
        path.startsWith('finagotchi://phantom') ||
        path.includes('phantom_encryption_public_key=')
    ) {
        return null;
    }
    return path;
}
