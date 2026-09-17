import { createDynamicClient } from '@dynamic-labs-sdk/client';
import { addSolanaExtension, addPhantomRedirectSolanaExtension } from '@dynamic-labs-sdk/solana';
import * as Linking from 'expo-linking';

declare const process: { env: Record<string, string | undefined> };

const newDynamicClient = createDynamicClient({
    environmentId: process.env.EXPO_PUBLIC_DYNAMIC_ENVIRONMENT_ID ?? '',
    metadata: {
        name: 'Finagotchi',
        nativeLink: 'finagotchi://',
        universalLink: 'https://www.finagotchi.app',
        iconUrl: 'https://www.finagotchi.app/favicon.ico',
    },
});

addSolanaExtension();

// Phantom mobile requires the redirect extension on React Native.
// The URL is rebuilt each time in case the deep link changes.
Linking.getInitialURL().then((url) => {
    addPhantomRedirectSolanaExtension({
        onCloseTab: () => {},
        url: new URL(url ?? 'https://www.finagotchi.app'),
    });
});

export { newDynamicClient };
