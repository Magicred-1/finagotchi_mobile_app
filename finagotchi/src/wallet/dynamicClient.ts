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
            // Deliberately NOT `embeddedWebView: true`. The native overlay
            // lives in its own UIWindow; on iOS it appears transparent yet
            // still grabs every touch at the native level whenever a
            // signature is requested — freezing the whole app (and never
            // showing the prompt). The default in-tree react-native-webview
            // hides with opacity 0 + zIndex -10000 (touch-transparent) and
            // only covers the app while Dynamic actually renders a prompt.
            // Sheets render through the in-tree SheetPortal (not RN Modals),
            // and app/_layout.tsx mounts the WebView LAST so prompts draw
            // above screens and sheets.
        })
    )
    .extend(SolanaExtension());
