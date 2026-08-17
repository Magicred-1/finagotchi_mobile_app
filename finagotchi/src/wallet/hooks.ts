import { useCallback, useState } from 'react';
import { Platform, Linking } from 'react-native';
import { PublicKey, Transaction } from '@solana/web3.js';
import {
    transact,
    Web3MobileWallet,
} from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { Buffer } from 'buffer';

// Polyfill for Solana web3.js in React Native
(globalThis as any).Buffer = Buffer;

export type Wallet = {
    publicKey: PublicKey | null;
    connected: boolean;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    signTransaction: (tx: Transaction) => Promise<Transaction>;
    signMessage: (message: Uint8Array) => Promise<Uint8Array>;
};

export function useWallet(): Wallet {
    const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
    const [authToken, setAuthToken] = useState<string | null>(null);

    // ANDROID: MWA via native IPC
    const connectAndroid = useCallback(async () => {
        await transact(async (wallet: Web3MobileWallet) => {
        const authorizationResult = await wallet.authorize({
            cluster: 'devnet',
            identity: {
            name: 'Finagotchi',
            uri: 'https://finagotchi.app',
            icon: 'favicon.ico',
            },
        });
        
        setAuthToken(authorizationResult.auth_token);
        setPublicKey(new PublicKey(authorizationResult.accounts[0].address));
        });
    }, []);

    // iOS: Deep link to Phantom (or Solflare, Backpack)
    const connectIOS = useCallback(async () => {
        // Step 1: Generate ephemeral keypair for encryption
        // Step 2: Build Phantom connect URL
        const params = new URLSearchParams({
        app_url: 'https://finagotchi.app',
        dapp_encryption_public_key: '...', // Your ephemeral pubkey
        redirect_link: 'finagotchi://onConnect',
        cluster: 'devnet',
        });
        
        const url = `https://phantom.app/ul/v1/connect?${params.toString()}`;
        await Linking.openURL(url);
        
        // Phantom will redirect back to finagotchi://onConnect?... 
        // Handle in app/_layout.tsx via Linking.addEventListener
    }, []);

    const connect = useCallback(async () => {
        if (Platform.OS === 'android') {
        await connectAndroid();
        } else {
        await connectIOS();
        }
    }, [connectAndroid, connectIOS]);

    const disconnect = useCallback(async () => {
        if (Platform.OS === 'android' && authToken) {
        await transact(async (wallet) => {
            await wallet.deauthorize({ auth_token: authToken });
        });
        }
        setPublicKey(null);
        setAuthToken(null);
    }, [authToken]);

    const signTransaction = useCallback(async (tx: Transaction) => {
        if (Platform.OS === 'android') {
        return transact(async (wallet) => {
            const signed = await wallet.signTransactions({
            transactions: [tx],
            });
            return signed[0];
        });
        }
        // iOS: Deep link to Phantom sign endpoint
        throw new Error('iOS signing not implemented');
    }, []);

    const signMessage = useCallback(async (message: Uint8Array) => {
        if (Platform.OS === 'android') {
        return transact(async (wallet) => {
            const signed = await wallet.signMessages({
            addresses: [publicKey!.toBase58()],
            payloads: [message],
            });
            return signed[0];
        });
        }
        throw new Error('iOS message signing not implemented');
    }, [publicKey]);

    return {
        publicKey,
        connected: !!publicKey,
        connect,
        disconnect,
        signTransaction,
        signMessage,
    };
}