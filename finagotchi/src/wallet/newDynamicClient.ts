import { createDynamicClient } from '@dynamic-labs-sdk/client';
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
        universalLink: 'https://www.finagotchi.app',
        iconUrl: 'https://www.finagotchi.app/favicon.ico',
    },
});

addSolanaExtension();
addPhantomRedirectSolanaExtension({
    onCloseTab: () => {},
    url: new URL('https://www.finagotchi.app'),
});
addMetaMaskSolanaExtension();
addWalletConnectSolanaExtension();

export { newDynamicClient };
