import { createClient } from '@dynamic-labs/legacy-client';
import { ReactNativeExtension } from '@dynamic-labs/legacy-react-native-extension';
import { SolanaExtension } from '@dynamic-labs/legacy-solana-extension';

declare const process: { env: Record<string, string | undefined> };

export const dynamicClient = createClient({
    environmentId: process.env.EXPO_PUBLIC_DYNAMIC_ENVIRONMENT_ID ?? '',
    appName: 'Finagotchi',
})
    .extend(
        ReactNativeExtension({
            appOrigin: 'https://www.finagotchi.app',
            // Host Dynamic's UI (signature prompts, key export, step-up auth)
            // in a native overlay window outside the RN view tree. Without
            // it, Dynamic renders in an in-tree WebView that sits UNDERNEATH
            // the app's RN Modals (our sheets) when they request a signature.
            // Keep <dynamicClient.reactNative.WebView /> mounted: it becomes
            // a no-op on this path, and is the required fallback on binaries
            // where the EmbeddedWebView native module isn't linked yet.
            embeddedWebView: true,
        })
    )
    .extend(SolanaExtension());
