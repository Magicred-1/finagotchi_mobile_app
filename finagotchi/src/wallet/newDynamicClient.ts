import { createDynamicClient } from '@dynamic-labs-sdk/client';
import { addSolanaExtension } from '@dynamic-labs-sdk/solana';

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

export { newDynamicClient };
