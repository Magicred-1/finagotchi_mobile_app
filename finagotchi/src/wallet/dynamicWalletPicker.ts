import {
    getWalletOptionsCatalogue,
    connectWalletOption,
    isMobile,
    type WalletOption,
    type WalletAccount,
} from '@dynamic-labs-sdk/client';
import * as Linking from 'expo-linking';

export type { WalletOption };

export async function getWalletOptions(): Promise<WalletOption[]> {
    const options = await getWalletOptionsCatalogue({ includeMobileOptions: true });
    return options;
}

export async function connectDynamicWallet(
    walletKey: string
): Promise<WalletAccount> {
    const appUrl = await Linking.getInitialURL().then(
        (url) => url ?? 'https://www.finagotchi.app'
    );

    const walletAccount = await connectWalletOption({
        walletKey,
        handleWalletBrowserRedirect: ({ chain, walletKey }) => {
            // React Native: open in-app browser is not used here.
            // Wallet deep links are handled by onConnectionUri.
            console.warn('Wallet browser redirect not implemented', { chain, walletKey });
        },
        onConnectionUri: async ({ uri }) => {
            if (isMobile()) {
                await Linking.openURL(uri);
            }
        },
    });

    return walletAccount;
}
