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

const ALLOWED_WALLETS = new Set(['phantom', 'solflare', 'metamask', 'backpack']);

function normalizeWallet(wallet: WalletOption): WalletOption {
    return {
        ...wallet,
        name: wallet.name || (wallet.key ? wallet.key.charAt(0).toUpperCase() + wallet.key.slice(1) : 'Wallet'),
        iconUrl: wallet.iconUrl || undefined,
    } as WalletOption;
}

export async function getWalletOptions(): Promise<WalletOption[]> {
    const options = await getWalletOptionsCatalogue({ includeMobileOptions: true }, newDynamicClient);
    const filtered = options
        .filter((wallet) => ALLOWED_WALLETS.has(wallet.key))
        .map(normalizeWallet);
    return filtered;
}

export async function connectDynamicWallet(
    walletKey: string
): Promise<WalletAccount> {
    const walletAccount = await connectWalletOption({
        walletKey,
        handleWalletBrowserRedirect: async ({ chain, walletKey }) => {
            console.warn('Wallet browser redirect', { chain, walletKey });
        },
        onConnectionUri: async ({ uri }) => {
            if (isMobile()) {
                await Linking.openURL(uri);
            }
        },
    }, newDynamicClient);

    return walletAccount;
}
