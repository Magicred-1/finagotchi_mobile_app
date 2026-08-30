import { createClient } from '@dynamic-labs/legacy-client';
import { ReactNativeExtension } from '@dynamic-labs/legacy-react-native-extension';
import { SolanaExtension } from '@dynamic-labs/legacy-solana-extension';

declare const process: { env: Record<string, string | undefined> };

export const dynamicClient = createClient({
    environmentId: process.env.EXPO_PUBLIC_DYNAMIC_ENVIRONMENT_ID ?? '',
    appName: 'Finagotchi',
})
    .extend(
        ReactNativeExtension({ appOrigin: 'https://www.finagotchi.app' })
    )
    .extend(SolanaExtension());
