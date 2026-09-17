import {
    getWalletOptionsCatalogue,
    connectWalletOption,
    isMobile,
    type WalletOption,
    type WalletAccount,
} from '@dynamic-labs-sdk/client';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { newDynamicClient } from './newDynamicClient';

export type { WalletOption };

export async function getWalletOptions(): Promise<WalletOption[]> {
    const options = await getWalletOptionsCatalogue({ includeMobileOptions: true }, newDynamicClient);
    return options;
}

export async function connectDynamicWallet(
    walletKey: string
): Promise<WalletAccount> {
    const appUrl = (await Linking.getInitialURL()) ?? 'https://www.finagotchi.app';

    const walletAccount = await connectWalletOption({
        walletKey,
        handleWalletBrowserRedirect: async ({ walletKey }) => {
            // Fallback: try to open the wallet's universal link / website.
            await WebBrowser.openBrowserAsync(`https://${walletKey}.com`);
        },
        onConnectionUri: async ({ uri }) => {
            if (isMobile()) {
                await Linking.openURL(uri);
            }
        },
    }, newDynamicClient);

    return walletAccount;
}
