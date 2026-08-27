import '../polyfills';

import { useCallback, useEffect, useMemo } from 'react';
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
import {
    useTurnkey,
    AuthState,
    OtpType,
    type WalletAccount,
} from '@turnkey/react-native-wallet-kit';
import bs58 from 'bs58';

import { useWalletStore, type WalletConnectionType } from '../features/wallet/store';

const APP_URL = 'https://www.finagotchi.app';
const CLUSTER = 'devnet';
const SOLANA_RPC =
    process.env.EXPO_PUBLIC_SOLANA_RPC ?? 'https://api.devnet.solana.com';
const MINT_TREASURY_ADDRESS = process.env.EXPO_PUBLIC_MINT_TREASURY_ADDRESS;

// Demo amounts until real Metaplex minting is wired.
const MINT_COST_LAMPORTS = 0.001 * 1_000_000_000;
const REVIVE_COST_LAMPORTS = 0.05 * 1_000_000_000;

export type Wallet = {
    publicKey: PublicKey | null;
    connected: boolean;
    connectionType: WalletConnectionType;
    isSeeker: boolean;
    connectWithMwa: () => Promise<void>;
    connectWithPasskey: () => Promise<string>;
    connectWithGoogle: () => Promise<string>;
    requestEmailOtp: (email: string) => Promise<{
        otpId: string;
        otpEncryptionTargetBundle: string;
    }>;
    verifyEmailOtp: (
        email: string,
        otp: string,
        otpId: string,
        otpEncryptionTargetBundle: string
    ) => Promise<string>;
    ensureTurnkeyWallet: () => Promise<string>;
    mintCreatureNft: (
        creatureName: string
    ) => Promise<{ signature: string; mintAddress: string }>;
    payReviveFee: () => Promise<string>;
    disconnect: () => Promise<void>;
    handleDeepLink: (_url: string) => boolean;
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
        const bytes = Buffer.from(normalized, 'base64');
        if (bytes.length !== 32) {
            throw new Error('Unexpected account address format from wallet');
        }
        return bs58.encode(bytes);
    }
}

function findSolanaAccount(
    walletAccounts: WalletAccount[]
): WalletAccount | undefined {
    return walletAccounts.find(
        (account) => account.addressFormat === 'ADDRESS_FORMAT_SOLANA'
    );
}

export function useWallet(): Wallet {
    const address = useWalletStore((state) => state.address);
    const connectStore = useWalletStore((state) => state.connect);
    const setSession = useWalletStore((state) => state.setSession);
    const disconnectStore = useWalletStore((state) => state.disconnect);
    const authToken = useWalletStore((state) => state.session.authToken);
    const connectionType = useWalletStore(
        (state) => state.session.connectionType
    );

    const turnkey = useTurnkey();

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

    // Sync an existing Turnkey session back to our store on app restart.
    useEffect(() => {
        if (connectionType !== 'turnkey') return;
        if (turnkey.authState !== AuthState.Authenticated) return;
        if (address) return;

        const solAccount = findSolanaAccount(
            turnkey.wallets.flatMap((wallet) => wallet.accounts)
        );
        if (solAccount?.address) {
            connectStore(solAccount.address, 'turnkey');
        }
    }, [
        connectionType,
        turnkey.authState,
        turnkey.wallets,
        address,
        connectStore,
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

    const ensureTurnkeyWallet = useCallback(async (): Promise<string> => {
        if (turnkey.authState !== AuthState.Authenticated) {
            throw new Error('Not authenticated with Turnkey');
        }

        // Refresh wallets so this helper is safe to call immediately after
        // login/sign-up before React has re-rendered with updated state.
        const wallets = await turnkey.refreshWallets();
        const existing = findSolanaAccount(
            wallets.flatMap((wallet) => wallet.accounts)
        );
        if (existing?.address) {
            const success = connectStore(existing.address, 'turnkey');
            if (!success) {
                throw new Error('Invalid address from Turnkey wallet');
            }
            return existing.address;
        }

        const walletId = await turnkey.createWallet({
            walletName: 'Finagotchi Wallet',
            accounts: ['ADDRESS_FORMAT_SOLANA'],
        });

        const refreshedWallets = await turnkey.refreshWallets();
        const solAccount = findSolanaAccount(
            refreshedWallets.flatMap((wallet) => wallet.accounts)
        );

        if (!solAccount?.address) {
            throw new Error('Turnkey wallet created but no Solana account found');
        }

        const success = connectStore(solAccount.address, 'turnkey');
        if (!success) {
            throw new Error('Invalid address from Turnkey wallet');
        }

        setSession({
            turnkeyWalletId: walletId,
            turnkeyUserId: turnkey.user?.userId ?? null,
        });

        return solAccount.address;
    }, [turnkey, connectStore, setSession]);

    function isNoPasskeyCredentialError(err: unknown): boolean {
        const message = err instanceof Error ? err.message.toLowerCase() : '';
        const code =
            err && typeof err === 'object' && 'code' in err
                ? String((err as { code: unknown }).code).toLowerCase()
                : '';
        return (
            message.includes('passkey') ||
            message.includes('credential') ||
            message.includes('not found') ||
            message.includes('no credentials') ||
            message.includes('user cancelled') ||
            message.includes('user canceled') ||
            message.includes('no matching credential') ||
            code.includes('credential') ||
            code.includes('not_found') ||
            code.includes('nocredentials')
        );
    }

    const connectWithPasskey = useCallback(async () => {
        try {
            await turnkey.loginWithPasskey();
        } catch (err) {
            // No existing credential -> sign the user up instead.
            if (isNoPasskeyCredentialError(err)) {
                await turnkey.signUpWithPasskey({
                    passkeyDisplayName: 'Finagotchi',
                });
            } else {
                throw err;
            }
        }

        setSession({ connectionType: 'turnkey' });
        return ensureTurnkeyWallet();
    }, [turnkey, setSession, ensureTurnkeyWallet]);

    const connectWithGoogle = useCallback(async () => {
        await turnkey.handleGoogleOauth();
        setSession({ connectionType: 'turnkey' });
        return ensureTurnkeyWallet();
    }, [turnkey, setSession, ensureTurnkeyWallet]);

    const requestEmailOtp = useCallback(
        async (email: string) => {
            return turnkey.initOtp({
                otpType: OtpType.Email,
                contact: email,
            });
        },
        [turnkey]
    );

    const verifyEmailOtp = useCallback(
        async (
            email: string,
            otp: string,
            otpId: string,
            otpEncryptionTargetBundle: string
        ) => {
            await turnkey.completeOtp({
                otpId,
                otpCode: otp,
                otpEncryptionTargetBundle,
                contact: email,
                otpType: OtpType.Email,
            });

            setSession({ connectionType: 'turnkey' });
            return ensureTurnkeyWallet();
        },
        [turnkey, setSession, ensureTurnkeyWallet]
    );

    const signAndSendWithTurnkey = useCallback(
        async (unsignedTransaction: Transaction): Promise<string> => {
            const solAccount = findSolanaAccount(
                turnkey.wallets.flatMap((wallet) => wallet.accounts)
            );
            if (!solAccount) {
                throw new Error('No Turnkey Solana account available');
            }

            const serialized = unsignedTransaction.serialize({
                requireAllSignatures: false,
            });
            const unsignedTransactionBase64 =
                Buffer.from(serialized).toString('base64');

            return turnkey.signAndSendTransaction({
                walletAccount: solAccount,
                unsignedTransaction: unsignedTransactionBase64,
                transactionType: 'TRANSACTION_TYPE_SOLANA',
                rpcUrl: SOLANA_RPC,
            });
        },
        [turnkey]
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
            if (connectionType === 'turnkey') {
                signature = await signAndSendWithTurnkey(transaction);
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
            signAndSendWithTurnkey,
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
            // NFT mint transaction built and signed through Turnkey.
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

        if (connectionType === 'turnkey') {
            try {
                await turnkey.clearSession();
            } catch {
                // Ignore and clear local state anyway.
            }
        }

        disconnectStore();
    }, [connectionType, authToken, disconnectStore, turnkey]);

    const handleDeepLink = useCallback((url: string): boolean => {
        // Turnkey OAuth flows use InAppBrowser.openAuth internally, so tokens are
        // already parsed there. We still claim finagotchi:// redirects so other
        // deep-link handlers don't try to route them.
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'finagotchi:';
        } catch {
            return url.startsWith('finagotchi://');
        }
    }, []);

    return useMemo(
        () => ({
            publicKey,
            connected,
            connectionType,
            isSeeker,
            connectWithMwa,
            connectWithPasskey,
            connectWithGoogle,
            requestEmailOtp,
            verifyEmailOtp,
            ensureTurnkeyWallet,
            mintCreatureNft,
            payReviveFee,
            disconnect,
            handleDeepLink,
        }),
        [
            publicKey,
            connected,
            connectionType,
            isSeeker,
            connectWithMwa,
            connectWithPasskey,
            connectWithGoogle,
            requestEmailOtp,
            verifyEmailOtp,
            ensureTurnkeyWallet,
            mintCreatureNft,
            payReviveFee,
            disconnect,
            handleDeepLink,
        ]
    );
}

export function generateFakeMintAddress(): string {
    return Keypair.generate().publicKey.toBase58();
}
