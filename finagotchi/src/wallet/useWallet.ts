import '../polyfills';

import { useCallback, useEffect, useMemo } from 'react';
import { Platform, Linking } from 'react-native';
import { Buffer } from 'buffer';
import { PublicKey, Keypair } from '@solana/web3.js';
import type { Web3MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import {
    useConnect,
    useAccounts,
    useDisconnect,
} from '@phantom/react-native-sdk';
import bs58 from 'bs58';

import { useWalletStore } from '../features/wallet/store';

const APP_URL = 'https://finagotchi.app';
const CLUSTER = 'devnet';

export type Wallet = {
    publicKey: PublicKey | null;
    connected: boolean;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    handleDeepLink: (url: string) => boolean;
};

/**
 * MWA account addresses are returned as base64 strings by some wallets.
 * Normalize to a base58 Solana public key address.
 */
function normalizeMwaAddress(address: string): string {
    const trimmed = address.trim();

    try {
        new PublicKey(trimmed);
        return trimmed;
    } catch {
        // MWA wallets sometimes return the address as a base64-encoded
        // 32-byte public key. Decode and re-encode to base58.
        const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/');
        const bytes = Buffer.from(normalized, 'base64');
        if (bytes.length !== 32) {
            throw new Error('Unexpected account address format from wallet');
        }
        return bs58.encode(bytes);
    }
}

export function useWallet(): Wallet {
    const address = useWalletStore((state) => state.address);
    const connectStore = useWalletStore((state) => state.connect);
    const setSession = useWalletStore((state) => state.setSession);
    const disconnectStore = useWalletStore((state) => state.disconnect);
    const authToken = useWalletStore((state) => state.session.authToken);

    const { connect: phantomConnect } = useConnect();
    const { isConnected: phantomConnected, addresses: phantomAddresses } =
        useAccounts();
    const { disconnect: phantomDisconnect } = useDisconnect();

    const publicKey = useMemo(() => {
        if (!address) return null;
        try {
            return new PublicKey(address);
        } catch {
            return null;
        }
    }, [address]);

    const connected = !!publicKey;

    // Sync Phantom SDK connection state to our wallet store on iOS.
    useEffect(() => {
        if (Platform.OS !== 'ios') return;
        if (phantomConnected && phantomAddresses?.[0]?.address) {
            connectStore(phantomAddresses[0].address);
        }
    }, [phantomConnected, phantomAddresses, connectStore]);

    const connectAndroid = useCallback(async () => {
        // MWA is Android-only and its native module is not present on iOS.
        // Load it lazily so the import never runs on non-Android platforms.
        const { transact } = await import(
            '@solana-mobile/mobile-wallet-adapter-protocol-web3js'
        );

        await transact(async (wallet: Web3MobileWallet) => {
            const authorizationResult = await wallet.authorize({
                chain: `solana:${CLUSTER}`,
                identity: {
                    name: 'Finagotchi',
                    uri: APP_URL,
                    icon: 'favicon.ico',
                },
            });

            const firstAccount = authorizationResult.accounts[0];
            if (!firstAccount?.address) {
                throw new Error('No wallet account returned');
            }

            const walletAddress = normalizeMwaAddress(firstAccount.address);

            const success = connectStore(walletAddress);
            if (!success) {
                throw new Error('Invalid wallet address');
            }

            setSession({
                authToken: authorizationResult.auth_token,
            });
        });
    }, [connectStore, setSession]);

    const connectIOS = useCallback(async () => {
        if (typeof phantomConnect !== 'function') {
            throw new Error(
                `Phantom connect hook is not a function (got ${typeof phantomConnect}). Ensure PhantomProvider is mounted.`
            );
        }

        let result;
        try {
            result = await phantomConnect({ provider: 'google' });
        } catch (err) {
            console.error('[useWallet] phantomConnect error:', err);
            throw err;
        }

        if (!result?.addresses?.[0]?.address) {
            throw new Error('Phantom did not return a wallet address');
        }

        const walletAddress = result.addresses[0].address;
        const success = connectStore(walletAddress);
        if (!success) {
            throw new Error('Invalid wallet address from Phantom');
        }
    }, [phantomConnect, connectStore]);

    const connect = useCallback(async () => {
        if (Platform.OS === 'android') {
            await connectAndroid();
        } else {
            await connectIOS();
        }
    }, [connectAndroid, connectIOS]);

    const disconnect = useCallback(async () => {
        if (Platform.OS === 'android' && authToken) {
            try {
                const { transact } = await import(
                    '@solana-mobile/mobile-wallet-adapter-protocol-web3js'
                );

                await transact(async (wallet) => {
                    await wallet.deauthorize({ auth_token: authToken });
                });
            } catch {
                // Ignore deauthorize errors and clear local state anyway.
            }
        }

        if (Platform.OS === 'ios') {
            await phantomDisconnect();
        }

        disconnectStore();
    }, [authToken, disconnectStore, phantomDisconnect]);

    // Legacy deep-link handler. Kept for any future custom deep links;
    // Phantom SDK redirects are handled automatically by the SDK.
    const handleDeepLink = useCallback((_url: string): boolean => {
        return false;
    }, []);

    return useMemo(
        () => ({
            publicKey,
            connected,
            connect,
            disconnect,
            handleDeepLink,
        }),
        [publicKey, connected, connect, disconnect, handleDeepLink]
    );
}

export function generateFakeMintAddress(): string {
    return Keypair.generate().publicKey.toBase58();
}
