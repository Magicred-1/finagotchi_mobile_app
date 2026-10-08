import {
    getWalletOptionsCatalogue,
    waitForClientInitialized,
    getWalletConnectCatalog,
    connectWithWalletProvider,
    type WalletOption,
    type WalletAccount,
} from '@dynamic-labs-sdk/client';
import { connectWithWalletConnectSolana } from '@dynamic-labs-sdk/solana/wallet-connect';
import { appendWalletConnectUriToDeepLink } from '@dynamic-labs-sdk/wallet-connect';
import * as Linking from 'expo-linking';
import { newDynamicClient, registerWalletConnectActionHandler } from './newDynamicClient';
import { useWalletStore } from '../features/wallet/store';

export type { WalletOption };

// Solflare is deliberately absent: Dynamic's wallet book lists it with
// WalletConnect sign_v1 only (the WC catalog requires sign_v2) and no mobile
// deep link, so it can never connect this way. On Android, Solflare works
// through the MWA button (Solana Mobile Stack) instead.
const ALLOWED_WALLETS = new Set(['phantom', 'metamask', 'backpack']);

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
    // Stage markers: a silent hang is the failure mode users report, so the
    // console must show exactly where the flow stopped.
    console.warn(`wc: connect start (${walletKey})`);
    await waitForClientInitialized(newDynamicClient);
    registerWalletConnectActionHandler();

    // Phantom speaks its own deep-link protocol, not WalletConnect (wallet
    // book: walletConnect.sdks unset). addPhantomRedirectSolanaExtension
    // registers it as the 'phantomsol:deepLink' provider, which opens the
    // Phantom app itself and resolves when the redirect returns — handled by
    // the Linking listener in app/_layout.tsx.
    if (walletKey === 'phantom') {
        console.warn('wc: phantom via deep-link redirect provider');
        const account = await connectWithWalletProvider(
            { walletProviderKey: 'phantomsol:deepLink' },
            newDynamicClient
        );
        if (!account?.address) {
            throw new Error('No wallet account returned');
        }
        console.warn('wc: phantom connected');
        const phantomConnected = useWalletStore
            .getState()
            .connect(account.address, 'external');
        if (!phantomConnected) {
            throw new Error('Invalid wallet address');
        }
        return account;
    }

    const { uri, approval } = await connectWithWalletConnectSolana(
        { addToDynamicWalletAccounts: true },
        newDynamicClient
    );
    console.warn('wc: proposal created');

    const catalog = await getWalletConnectCatalog(newDynamicClient);
    // The options catalogue and the WC catalog don't always agree on keys —
    // exact key first, then a case-insensitive key/name match.
    const catalogWallet =
        catalog.wallets[walletKey] ??
        Object.entries(catalog.wallets).find(
            ([key, w]) =>
                key.toLowerCase() === walletKey.toLowerCase() ||
                w.name?.toLowerCase().includes(walletKey.toLowerCase())
        )?.[1];
    const base =
        catalogWallet?.deeplinks?.native ?? catalogWallet?.deeplinks?.universal;

    try {
        if (base) {
            await Linking.openURL(
                appendWalletConnectUriToDeepLink({
                    deepLinkUrl: base,
                    walletConnectUri: uri,
                })
            );
            console.warn(`wc: deep-linked into ${walletKey}`);
        } else {
            // No catalog deep link for this wallet — hand the raw WC URI to
            // the OS; any installed wallet registering the wc: scheme picks
            // it up (Android app chooser / iOS universal handler).
            console.warn(`wc: no deep link for '${walletKey}', opening raw wc: URI`);
            await Linking.openURL(uri);
        }
    } catch {
        throw new Error(
            `Couldn't open ${walletKey} — is the wallet app installed on this device?`
        );
    }

    console.warn('wc: awaiting in-wallet approval');
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
