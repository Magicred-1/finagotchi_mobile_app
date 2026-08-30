import '../polyfills';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Buffer } from 'buffer';
import {
    PublicKey,
    Keypair,
    Transaction,
    SystemProgram,
    Connection,
} from '@solana/web3.js';
import type { Web3MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import type { Wallet as DynamicWallet } from '@dynamic-labs/legacy-client';
import { useReactiveClient } from '@dynamic-labs/legacy-react-hooks';
import bs58 from 'bs58';

import { dynamicClient } from './dynamicClient';
import { useWalletStore, type WalletConnectionType } from '../features/wallet/store';

const APP_URL = 'https://www.finagotchi.app';
const CLUSTER = 'devnet';
const SOLANA_RPC =
    process.env.EXPO_PUBLIC_SOLANA_RPC ?? 'https://api.devnet.solana.com';
const MINT_TREASURY_ADDRESS = process.env.EXPO_PUBLIC_MINT_TREASURY_ADDRESS;

// Demo amounts until real Metaplex minting is wired.
const MINT_COST_LAMPORTS = 0.001 * 1_000_000_000;
const REVIVE_COST_LAMPORTS = 0.05 * 1_000_000_000;

// Mint price plus a buffer for the network fee. Wallets below this cannot
// pay for the mint and should be offered funding first.
export const MIN_MINT_BALANCE_LAMPORTS = MINT_COST_LAMPORTS + 10_000;

// Devnet airdrop amount for the funding sheet — comfortably covers the mint
// plus fees while staying under devnet rate limits.
const DEVNET_AIRDROP_LAMPORTS = 0.1 * 1_000_000_000;

export type Wallet = {
    publicKey: PublicKey | null;
    connected: boolean;
    connectionType: WalletConnectionType;
    isSeeker: boolean;
    solBalance: number | null;
    /** True once the first balance fetch settled (success or failure). */
    solBalanceLoaded: boolean;
    refreshBalance: () => Promise<number | null>;
    /** Airdrops devnet test SOL to the connected wallet, then refreshes the balance. */
    requestDevnetAirdrop: () => Promise<void>;
    connectWithMwa: () => Promise<void>;
    connectWithPasskey: () => Promise<void>;
    connectWithGoogle: () => Promise<void>;
    connectWithApple: () => Promise<void>;
    requestEmailOtp: (email: string) => Promise<void>;
    verifyEmailOtp: (otp: string) => Promise<void>;
    mintCreatureNft: (
        creatureName: string
    ) => Promise<{ signature: string; mintAddress: string }>;
    payReviveFee: () => Promise<string>;
    disconnect: () => Promise<void>;
};

function getIsSeeker(): boolean {
    if (Platform.OS !== 'android') return false;
    // Use React Native's Platform constants per Solana Mobile docs.
    // https://docs.solanamobile.com/recipes/general/detecting-seeker-users
    const model = (Platform.constants as { Model?: string }).Model;
    return model === 'Seeker';
}

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
        const normalized = trimmed.replace(/-/g, '+').replace(/_/g, '/');
        const bytes = new Uint8Array(Buffer.from(normalized, 'base64'));
        if (bytes.length !== 32) {
            throw new Error('Unexpected account address format from wallet');
        }
        return bs58.encode(bytes);
    }
}

function isSolanaWallet(wallet: DynamicWallet): boolean {
    return wallet.chain?.toUpperCase() === 'SOL';
}

function findSolanaWallet(wallets: DynamicWallet[]): DynamicWallet | undefined {
    return wallets.find(isSolanaWallet);
}

export function useWallet(): Wallet {
    const address = useWalletStore((state) => state.address);
    const connectStore = useWalletStore((state) => state.connect);
    const setSession = useWalletStore((state) => state.setSession);
    const disconnectStore = useWalletStore((state) => state.disconnect);
    const passkeyRegistrationPrompted = useWalletStore(
        (state) => state.passkeyRegistrationPrompted
    );
    const setPasskeyRegistrationPrompted = useWalletStore(
        (state) => state.setPasskeyRegistrationPrompted
    );
    const authToken = useWalletStore((state) => state.session.authToken);
    const connectionType = useWalletStore(
        (state) => state.session.connectionType
    );

    // Reactive Dynamic state: re-renders when auth/wallet state changes inside
    // the SDK WebView.
    const { auth, wallets } = useReactiveClient(dynamicClient);
    const authenticatedUser = auth.authenticatedUser;
    const userWallets = wallets.userWallets;

    const walletCreationInFlight = useRef(false);

    const publicKey = useMemo(() => {
        if (!address) return null;
        try {
            return new PublicKey(address);
        } catch {
            return null;
        }
    }, [address]);

    const connected = !!publicKey;
    const isSeeker = useMemo(() => getIsSeeker(), []);

    const [solBalance, setSolBalance] = useState<number | null>(null);
    const [solBalanceLoaded, setSolBalanceLoaded] = useState(false);

    const refreshBalance = useCallback(async (): Promise<number | null> => {
        if (!publicKey) return null;
        try {
            const connection = new Connection(SOLANA_RPC);
            const balance = await connection.getBalance(publicKey);
            setSolBalance(balance);
            return balance;
        } catch {
            return null;
        } finally {
            setSolBalanceLoaded(true);
        }
    }, [publicKey]);

    // Fetch the SOL balance whenever the wallet changes.
    useEffect(() => {
        setSolBalance(null);
        setSolBalanceLoaded(false);
        if (publicKey) {
            refreshBalance();
        }
    }, [publicKey, refreshBalance]);

    const requestDevnetAirdrop = useCallback(async (): Promise<void> => {
        if (!publicKey) {
            throw new Error('Wallet not connected');
        }
        const connection = new Connection(SOLANA_RPC);
        const signature = await connection.requestAirdrop(
            publicKey,
            DEVNET_AIRDROP_LAMPORTS
        );
        await connection.confirmTransaction(signature, 'confirmed');
        await refreshBalance();
    }, [publicKey, refreshBalance]);

    // Create the embedded Solana wallet as soon as a Dynamic user signs in
    // (wallet creation is not automatic in headless flows), then sync the
    // address to our store. Also covers session restore on app restart.
    useEffect(() => {
        if (!authenticatedUser) return;

        const solWallet = findSolanaWallet(userWallets);

        if (solWallet?.address) {
            if (!address) {
                connectStore(solWallet.address, 'dynamic');
            }
            return;
        }

        if (walletCreationInFlight.current) return;
        walletCreationInFlight.current = true;
        dynamicClient.wallets.embedded
            .createWallet({ chains: ['Sol'] })
            .catch(() => {
                // Creation raced a wallet that already exists; userWallets
                // will populate and the effect above picks it up.
            })
            .finally(() => {
                walletCreationInFlight.current = false;
            });
    }, [authenticatedUser, userWallets, address, connectStore]);

    // Offer passkey registration once after the first Dynamic sign-in, so the
    // Passkey button becomes useful on subsequent logins.
    useEffect(() => {
        if (!authenticatedUser) return;
        if (passkeyRegistrationPrompted) return;

        setPasskeyRegistrationPrompted(true);
        dynamicClient.passkeys.register().catch(() => {
            // User cancelled or passkeys unavailable; ignore.
        });
    }, [
        authenticatedUser,
        passkeyRegistrationPrompted,
        setPasskeyRegistrationPrompted,
    ]);

    const connectWithMwa = useCallback(async () => {
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
            const success = connectStore(walletAddress, 'mwa');
            if (!success) {
                throw new Error('Invalid wallet address');
            }

            setSession({
                authToken: authorizationResult.auth_token,
            });
        });
    }, [connectStore, setSession]);

    const connectWithPasskey = useCallback(async () => {
        try {
            await dynamicClient.auth.passkey.signIn();
        } catch {
            throw new Error(
                'No passkey found on this device — sign in with email or Google first'
            );
        }
    }, []);

    const connectWithGoogle = useCallback(async () => {
        await dynamicClient.auth.social.connect({ provider: 'google' });
    }, []);

    const connectWithApple = useCallback(async () => {
        await dynamicClient.auth.social.connect({ provider: 'apple' });
    }, []);

    const requestEmailOtp = useCallback(async (email: string) => {
        await dynamicClient.auth.email.sendOTP(email);
    }, []);

    const verifyEmailOtp = useCallback(async (otp: string) => {
        await dynamicClient.auth.email.verifyOTP(otp);
    }, []);

    const signAndSendWithDynamic = useCallback(
        async (transaction: Transaction): Promise<string> => {
            const primary = dynamicClient.wallets.primary;
            const solWallet =
                primary && isSolanaWallet(primary)
                    ? primary
                    : findSolanaWallet(dynamicClient.wallets.userWallets);
            if (!solWallet) {
                throw new Error('No Dynamic Solana wallet available');
            }

            const signer = dynamicClient.solana.getSigner({
                wallet: solWallet,
            });
            // The Solana extension bundles its own @solana/web3.js copy, so
            // the Transaction types are structurally identical but not
            // nominally assignable. Runtime interop is fine.
            const { signature } = await signer.signAndSendTransaction(
                transaction as unknown as Parameters<
                    typeof signer.signAndSendTransaction
                >[0]
            );
            return signature;
        },
        []
    );

    const signAndSendWithMwa = useCallback(
        async (transaction: Transaction): Promise<string> => {
            const { transact } = await import(
                '@solana-mobile/mobile-wallet-adapter-protocol-web3js'
            );

            if (!authToken) {
                throw new Error('MWA session token missing');
            }

            return transact(async (wallet: Web3MobileWallet) => {
                await wallet.reauthorize({
                    auth_token: authToken,
                    identity: {
                        name: 'Finagotchi',
                        uri: APP_URL,
                        icon: 'favicon.ico',
                    },
                });

                const signatures = await wallet.signAndSendTransactions({
                    transactions: [transaction],
                });

                const first = signatures[0];
                if (!first) {
                    throw new Error('MWA did not return a transaction signature');
                }

                return first;
            });
        },
        [authToken]
    );

    const signAndSendTransaction = useCallback(
        async (transaction: Transaction): Promise<string> => {
            if (!publicKey) {
                throw new Error('Wallet not connected');
            }

            let signature: string;
            if (connectionType === 'dynamic') {
                signature = await signAndSendWithDynamic(transaction);
            } else if (connectionType === 'mwa') {
                signature = await signAndSendWithMwa(transaction);
            } else {
                throw new Error('No active wallet connection');
            }

            useWalletStore.getState().recordTransaction();
            return signature;
        },
        [
            publicKey,
            connectionType,
            signAndSendWithDynamic,
            signAndSendWithMwa,
        ]
    );

    const buildPaymentTransaction = useCallback(
        async (toAddress: string, lamports: number): Promise<Transaction> => {
            if (!publicKey) {
                throw new Error('Wallet not connected');
            }

            const connection = new Connection(SOLANA_RPC);
            const { blockhash, lastValidBlockHeight } =
                await connection.getLatestBlockhash();

            const transaction = new Transaction({
                feePayer: publicKey,
                blockhash,
                lastValidBlockHeight,
            }).add(
                SystemProgram.transfer({
                    fromPubkey: publicKey,
                    toPubkey: new PublicKey(toAddress),
                    lamports,
                })
            );

            return transaction;
        },
        [publicKey]
    );

    const mintCreatureNft = useCallback(
        async (
            _creatureName: string
        ): Promise<{ signature: string; mintAddress: string }> => {
            if (!MINT_TREASURY_ADDRESS) {
                throw new Error('Mint treasury address is not configured');
            }

            const transaction = await buildPaymentTransaction(
                MINT_TREASURY_ADDRESS,
                MINT_COST_LAMPORTS
            );
            const signature = await signAndSendTransaction(transaction);

            // TODO(phase-2): replace this demo placeholder with a real Metaplex
            // NFT mint transaction built and signed through Dynamic.
            const mintAddress = Keypair.generate().publicKey.toBase58();

            return { signature, mintAddress };
        },
        [buildPaymentTransaction, signAndSendTransaction]
    );

    const payReviveFee = useCallback(async (): Promise<string> => {
        if (!MINT_TREASURY_ADDRESS) {
            throw new Error('Mint treasury address is not configured');
        }

        const transaction = await buildPaymentTransaction(
            MINT_TREASURY_ADDRESS,
            REVIVE_COST_LAMPORTS
        );
        return signAndSendTransaction(transaction);
    }, [buildPaymentTransaction, signAndSendTransaction]);

    const disconnect = useCallback(async () => {
        if (connectionType === 'mwa' && authToken) {
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

        if (connectionType === 'dynamic') {
            try {
                await dynamicClient.auth.logout();
            } catch {
                // Ignore and clear local state anyway.
            }
        }

        disconnectStore();
    }, [connectionType, authToken, disconnectStore]);

    return useMemo(
        () => ({
            publicKey,
            connected,
            connectionType,
            isSeeker,
            solBalance,
            solBalanceLoaded,
            refreshBalance,
            requestDevnetAirdrop,
            connectWithMwa,
            connectWithPasskey,
            connectWithGoogle,
            connectWithApple,
            requestEmailOtp,
            verifyEmailOtp,
            mintCreatureNft,
            payReviveFee,
            disconnect,
        }),
        [
            publicKey,
            connected,
            connectionType,
            isSeeker,
            solBalance,
            solBalanceLoaded,
            refreshBalance,
            requestDevnetAirdrop,
            connectWithMwa,
            connectWithPasskey,
            connectWithGoogle,
            connectWithApple,
            requestEmailOtp,
            verifyEmailOtp,
            mintCreatureNft,
            payReviveFee,
            disconnect,
        ]
    );
}

export function generateFakeMintAddress(): string {
    return Keypair.generate().publicKey.toBase58();
}
