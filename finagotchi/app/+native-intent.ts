/**
 * WalletConnect wallets bounce back into the app after approval/signing via
 * finagotchi://wc?... or the https://www.finagotchi.app universal link with
 * WalletConnect params appended. Those URLs are consumed by the
 * @walletconnect/react-native-compat shim's Linking listener — the router has
 * no /wc screen and must not navigate (it would replace the current screen
 * with the not-found route), so they are swallowed here.
 */
export function redirectSystemPath({
    path,
}: {
    path: string;
    initial: boolean;
}): string | null {
    if (
        /(^|\/)wc(\?|\/|$)/.test(path) ||
        path.includes('sessionTopic') ||
        path.includes('requestId') ||
        path.includes('symKey')
    ) {
        return null;
    }
    return path;
}
