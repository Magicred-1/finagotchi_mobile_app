import {
    getWalletOptionsCatalogue,
    waitForClientInitialized,
    getWalletConnectCatalog,
    type WalletOption,
    type WalletAccount,
} from '@dynamic-labs-sdk/client';
import { connectWithWalletConnectSolana } from '@dynamic-labs-sdk/solana/wallet-connect';
import { appendWalletConnectUriToDeepLink } from '@dynamic-labs-sdk/wallet-connect';
import * as Linking from 'expo-linking';
import { newDynamicClient, registerWalletConnectActionHandler } from './newDynamicClient';
import { useWalletStore } from '../features/wallet/store';

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

/**
 * Connect an external Solana wallet over WalletConnect (per
 * https://www.dynamic.xyz/docs/javascript/reference/wallets/walletconnect-integration):
 * the SDK returns a WC URI, we deep-link the user into their wallet app with
 * it appended, and approval() resolves once they approve there. The wallet
 * redirects back via finagotchi:// (see newDynamicClient metadata).
 *
 * On success the address is synced into the app wallet store with the
 * 'external' connection type — signing then flows through the same SDK.
 */
export async function connectDynamicWallet(
    walletKey: string
): Promise<WalletAccount> {
    await waitForClientInitialized(newDynamicClient);
    registerWalletConnectActionHandler();

    const { uri, approval } = await connectWithWalletConnectSolana(
        { addToDynamicWalletAccounts: true },
        newDynamicClient
    );

    const catalog = await getWalletConnectCatalog(newDynamicClient);
    const wallet = catalog.wallets[walletKey];
    const base = wallet?.deeplinks?.native ?? wallet?.deeplinks?.universal;
    if (base) {
        await Linking.openURL(
            appendWalletConnectUriToDeepLink({
                deepLinkUrl: base,
                walletConnectUri: uri,
            })
        );
    }

    const { walletAccounts } = await approval();
    const account =
        walletAccounts.find((candidate) => candidate.chain === 'SOL') ??
        walletAccounts[0];
    if (!account?.address) {
        throw new Error('No wallet account returned');
    }

    const connected = useWalletStore
        .getState()
        .connect(account.address, 'external');
    if (!connected) {
        throw new Error('Invalid wallet address');
    }
    return account;
}
