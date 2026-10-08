import {
    createDynamicClient,
    onEvent,
    getWalletConnectCatalogWalletByWalletProviderKey,
} from '@dynamic-labs-sdk/client';
import {
    addSolanaExtension,
    addPhantomRedirectSolanaExtension,
} from '@dynamic-labs-sdk/solana';
import { addMetaMaskSolanaExtension } from '@dynamic-labs-sdk/solana/metamask';
import { addWalletConnectSolanaExtension } from '@dynamic-labs-sdk/solana/wallet-connect';
import * as Linking from 'expo-linking';

declare const process: { env: Record<string, string | undefined> };

const newDynamicClient = createDynamicClient({
    environmentId: process.env.EXPO_PUBLIC_DYNAMIC_ENVIRONMENT_ID ?? '',
    metadata: {
        name: 'Finagotchi',
        nativeLink: 'finagotchi://',
        // Must be a parseable https URL: unset, the SDK falls back to
        // `window.location.origin` (doesn't exist on RN — boot crash), and a
        // custom scheme breaks URL parsing elsewhere (same crash signature).
        // It feeds WalletConnect's `redirect.universal`, which wallets prefer
        // over the native scheme — so for redirects to land back in the app,
        // https://www.finagotchi.app must serve an apple-app-site-association
        // file (see .well-known in landing/).
        universalLink: 'https://www.finagotchi.app',
        iconUrl: 'https://www.finagotchi.app/favicon.ico',
    },
});

// Extension registration stays at module level per Dynamic's docs
// (javascript/reference/solana/adding-solana-extensions).
// - addSolanaExtension() bundles the wallet-standard + WaaS extensions. The
//   wallet-standard part calls @wallet-standard/app getWallets(), which is
//   browser-oriented — harmless on RN now that src/polyfills.ts installs
//   window/Event shims (verified: no injected wallets exist on RN, so
//   registration is a silent no-op).
// - initializeClient() is intentionally NOT called: createDynamicClient
//   defaults `autoInitialize: true` and only skips auto-init when SSR is
//   detected (`typeof window === 'undefined'` — false on RN). Callers await
//   waitForClientInitialized() instead; calling initializeClient() here would
//   throw ClientAlreadyInitializedError.
addSolanaExtension();
addPhantomRedirectSolanaExtension({
    onCloseTab: () => {},
    // Custom scheme, NOT the https universal link: Android App Links only
    // fire when the installed build's signing cert matches assetlinks.json —
    // dev/EAS builds fail domain verification and dump the user into a
    // browser, so the connection never completes. finagotchi:// always opens
    // the app. Phantom appends its response params to this URL; the Linking
    // handler in app/_layout.tsx detects and completes the redirect.
    // (This is the Phantom provider's redirect target — the metadata
    // universalLink above still feeds WalletConnect and must stay https.)
    url: new URL('finagotchi://phantom'),
});
addMetaMaskSolanaExtension();
addWalletConnectSolanaExtension();

let actionHandlerRegistered = false;

/**
 * Whenever the connected WalletConnect wallet needs the user to act (connect
 * approval, message/transaction signature), bounce them into the wallet app.
 * Registered lazily on first use (NOT at module scope): executing SDK calls
 * at bundle-evaluation time is what took the app down at boot.
 */
export function registerWalletConnectActionHandler(): void {
    if (actionHandlerRegistered) return;
    actionHandlerRegistered = true;
    onEvent(
        {
            event: 'walletConnectUserActionRequested',
            listener: async ({ walletProviderKey }) => {
                const wallet =
                    await getWalletConnectCatalogWalletByWalletProviderKey(
                        { walletProviderKey },
                        newDynamicClient
                    );
                const deepLink =
                    wallet?.deeplinks?.native ?? wallet?.deeplinks?.universal;
                if (deepLink) {
                    await Linking.openURL(deepLink);
                }
            },
        },
        newDynamicClient
    );
}

export { newDynamicClient };
