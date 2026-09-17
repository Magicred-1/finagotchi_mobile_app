import {
    getWalletOptionsCatalogue,
    connectWalletOption,
    isMobile,
    type WalletOption,
    type WalletAccount,
} from '@dynamic-labs-sdk/client';
import * as Linking from 'expo-linking';
import { newDynamicClient } from './newDynamicClient';

export type { WalletOption };

export async function getWalletOptions(): Promise<WalletOption[]> {
    const options = await getWalletOptionsCatalogue({ includeMobileOptions: true }, newDynamicClient);
    return options;
}

export async function connectDynamicWallet(
    walletKey: string
): Promise<WalletAccount> {
    const walletAccount = await connectWalletOption({
        walletKey,
        handleWalletBrowserRedirect: ({ chain, walletKey }) => {
            console.warn('Wallet browser redirect not implemented', { chain, walletKey });
        },
        onConnectionUri: async ({ uri }) => {
            if (isMobile()) {
                await Linking.openURL(uri);
            }
        },
    }, newDynamicClient);

    return walletAccount;
}
