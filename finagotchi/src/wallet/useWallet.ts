import '../polyfills';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Buffer } from 'buffer';
import {
    PublicKey,
    Keypair,
    Transaction,
    Message,
    AddressLookupTableAccount,
    VersionedTransaction,
    SystemProgram,
    Connection,
} from '@solana/web3.js';
import type { Web3MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import type { Base64EncodedAddress } from '@solana-mobile/mobile-wallet-adapter-protocol';
import type { Wallet as DynamicWallet } from '@dynamic-labs/legacy-client';
import { useReactiveClient } from '@dynamic-labs/legacy-react-hooks';
import bs58 from 'bs58';

import { dynamicClient } from './dynamicClient';
import { useWalletStore, type WalletConnectionType } from '../features/wallet/store';
import { observeOutgoingTx } from '../features/quest-engine/observe';

const APP_URL = 'https://www.finagotchi.app';
const CLUSTER = 'mainnet-beta';
const SOLANA_RPC =
    process.env.EXPO_PUBLIC_SOLANA_RPC ??
    'https://api.mainnet-beta.solana.com';
const MINT_TREASURY_ADDRESS = process.env.EXPO_PUBLIC_MINT_TREASURY_ADDRESS;

// Demo amounts until real Metaplex minting is wired.
const MINT_COST_LAMPORTS = 0.001 * 1_000_000_000;
const REVIVE_COST_LAMPORTS = 0.05 * 1_000_000_000;

// Mint price plus a buffer for the network fee. Wallets below this cannot
// pay for the mint and should be offered funding first.
export const MIN_MINT_BALANCE_LAMPORTS = MINT_COST_LAMPORTS + 10_000;

export type Wallet = {
    publicKey: PublicKey | null;
    connected: boolean;
    connectionType: WalletConnectionType;
    isSeeker: boolean;
    solBalance: number | null;
    /** True once the first balance fetch settled (success or failure). */
    solBalanceLoaded: boolean;
    refreshBalance: () => Promise<number | null>;
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
    /** Signs and sends a transaction through the active connection (Dynamic or MWA). */
    signAndSendTransaction: (transaction: Transaction) => Promise<string>;
    /** Signs an arbitrary UTF-8 message; returns a bs58 ed25519 signature. */
    signMessage: (message: string) => Promise<string>;
    /** Signs (without sending) a base64 VersionedTransaction; returns base64. */
    signTransaction: (base64Tx: string) => Promise<string>;
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

/**
 * Maps raw wallet/chain errors (MWA Java exceptions, Dynamic SDK errors, RPC
 * failures) to messages a human can act on. Unknown errors pass through
 * unchanged so genuinely new failures aren't hidden behind a generic string.
 */
export function toHumanReadableWalletError(error: unknown): Error {
    const raw =
        error instanceof Error
            ? error.message
            : String(error ?? 'Unknown error');
    const normalized = raw.toLowerCase();
    const friendly = (message: string) => new Error(message);

    // User dismissed the wallet sheet/prompt (MWA surfaces this on Android as
    // "java.util.concurrent.CancellationException").
    if (
        /cancellationexception|cancelled|canceled|user rejected|rejected by (the )?user|user declined|user denied/.test(
            normalized
        )
    ) {
        return friendly('Cancelled in your wallet.');
    }
    if (
        /authorization request failed|reauthoriz|not authorized|not signed in|session expired|chain not supported/.test(
            normalized
        )
    ) {
        return friendly(
            'Wallet authorization failed — please reconnect your wallet.'
        );
    }
    if (
        /insufficient funds|insufficient lamports|insufficient balance|attempt to debit|exceeds balance/.test(
            normalized
        )
    ) {
        return friendly(
            'Not enough SOL to cover this transaction and its network fee.'
        );
    }
    if (/blockhash|block height exceeded|transaction expired|timed? out/.test(normalized)) {
        return friendly(
            'The transaction expired before it could confirm — please try again.'
        );
    }
    if (
        /network request failed|failed to fetch|fetch failed|econn|enotfound|etimedout|socket hang up/.test(
            normalized
        )
    ) {
        return friendly('Network error — check your connection and try again.');
    }
    if (/\botp\b|one.?time|verification code/.test(normalized)) {
        return friendly("That code doesn't look right — try again.");
    }
    if (
        /unexpected account address format|no wallet account returned|invalid wallet address/.test(
            normalized
        )
    ) {
        return friendly(
            "Your wallet returned an account we couldn't read — try reconnecting."
        );
    }
    if (
        /no dynamic solana wallet available|no active wallet connection|wallet not connected/.test(
            normalized
        )
    ) {
        return friendly('Wallet not connected — reconnect and try again.');
    }
    if (/transaction simulation failed|custom program error|instructionerror/.test(normalized)) {
        return friendly('Solana rejected the transaction — please try again.');
    }
    if (/missing signature|signature verification failed/.test(normalized)) {
        return friendly(
            "Your wallet's signature didn't make it onto the transaction — please try again."
        );
    }
    if (/invalid deposit transaction|accounts modified/.test(normalized)) {
        return friendly(
            'The deposit was rejected by Jupiter — please try again.'
        );
    }

    return error instanceof Error ? error : new Error(raw);
}

/**
 * Re-throws any error from `fn` as a human-readable wallet error, so every
 * screen that surfaces `error.message` gets copy the user can act on.
 */
function withHumanReadableErrors<A extends unknown[], R>(
    fn: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
    return async (...args: A) => {
        try {
            return await fn(...args);
        } catch (error) {
            throw toHumanReadableWalletError(error);
        }
    };
}

function isSolanaWallet(wallet: DynamicWallet): boolean {
    return wallet.chain?.toUpperCase() === 'SOL';
}

function findSolanaWallet(wallets: DynamicWallet[]): DynamicWallet | undefined {
    return wallets.find(isSolanaWallet);
}

function findDynamicSolanaWallet(): DynamicWallet {
    const primary = dynamicClient.wallets.primary;
    const solWallet =
        primary && isSolanaWallet(primary)
            ? primary
            : findSolanaWallet(dynamicClient.wallets.userWallets);
    if (!solWallet) {
        throw new Error('No Dynamic Solana wallet available');
    }
    return solWallet;
}

const MWA_IDENTITY = {
    name: 'Finagotchi',
    uri: APP_URL,
    icon: 'favicon.ico',
} as const;

/**
 * Reauthorize with the stored MWA token, falling back to a full authorize
 * when the token is stale or rejected (wallets return
 * "-1/authorization request failed" in that case). A fresh token from the
 * fallback is persisted so subsequent calls take the cheap path again.
 */
async function mwaAuthorize(wallet: Web3MobileWallet): Promise<void> {
    const authToken = useWalletStore.getState().session.authToken;
    if (authToken) {
        try {
            await wallet.reauthorize({
                auth_token: authToken,
                identity: MWA_IDENTITY,
            });
            return;
        } catch {
            // Stale/expired token — fall through to a full authorize.
        }
    }
    const result = await wallet.authorize({
        chain: `solana:${CLUSTER}`,
        identity: MWA_IDENTITY,
    });
    useWalletStore.getState().setSession({ authToken: result.auth_token });
}

function deserializeVersionedTx(base64Tx: string): VersionedTransaction {
    return VersionedTransaction.deserialize(
        new Uint8Array(Buffer.from(base64Tx, 'base64'))
    );
}

/**
 * Pulls the wallet's own signature out of a wallet-returned transaction,
 * whatever shape the wallet round-trip produced. Duck-typed (`'version' in`)
 * because Dynamic's extension can return an instance of its own bundled
 * web3.js copy — or a legacy rebuild of the versioned tx we sent.
 */
function extractWalletSignature(
    signed: Transaction | VersionedTransaction,
    wallet: PublicKey
): Uint8Array | null {
    if ('version' in signed) {
        const signerKeys = signed.message.staticAccountKeys.slice(
            0,
            signed.message.header.numRequiredSignatures
        );
        const index = signerKeys.findIndex((key) => key.equals(wallet));
        const sig = index >= 0 ? signed.signatures[index] : undefined;
        return sig && sig.some((byte) => byte !== 0) ? sig : null;
    }
    const entry = signed.signatures.find((sig) => sig.publicKey.equals(wallet));
    return entry?.signature != null && entry.signature.some((byte) => byte !== 0)
        ? entry.signature
        : null;
}

/**
 * Splices the wallet's signature into the ORIGINAL crafted transaction and
 * serializes that. Wallet round-trips can rebuild the message (Dynamic's
 * legacy conversion recompiles account keys) and Jupiter rejects those with
 * "Transaction accounts modified" — so the bytes returned must be Jupiter's
 * own, with only the signature slot changed.
 */
function applySignatureToCraftedTx(
    transaction: VersionedTransaction,
    wallet: PublicKey,
    signature: Uint8Array
): string {
    const signerKeys = transaction.message.staticAccountKeys.slice(
        0,
        transaction.message.header.numRequiredSignatures
    );
    const index = signerKeys.findIndex((key) => key.equals(wallet));
    if (index < 0) {
        throw new Error(
            'The crafted transaction has no signer slot for this wallet'
        );
    }
    transaction.signatures[index] = signature;
    return Buffer.from(transaction.serialize()).toString('base64');
}

/** LUTs are mainnet accounts for Jupiter-crafted deposits. */
const MAINNET_RPC =
    process.env.EXPO_PUBLIC_JUPITER_RPC ?? 'https://api.mainnet-beta.solana.com';

async function fetchLookupTableAddresses(
    tableKeys: PublicKey[]
): Promise<Map<string, PublicKey[]>> {
    const tables = new Map<string, PublicKey[]>();
    for (const key of tableKeys) {
        const res = await fetch(MAINNET_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getAccountInfo',
                params: [key.toBase58(), { encoding: 'base64' }],
            }),
        });
        const body = (await res.json()) as {
            result?: { value?: { data?: [string, string] } | null };
        };
        const raw = body.result?.value?.data?.[0];
        if (!raw) {
            throw new Error(
                `Address lookup table ${key.toBase58()} not found on mainnet`
            );
        }
        const table = AddressLookupTableAccount.deserialize(
            new Uint8Array(Buffer.from(raw, 'base64'))
        );
        tables.set(key.toBase58(), table.addresses);
    }
    return tables;
}

/**
 * Converts a crafted v0 message to a legacy Message that preserves the
 * CRAFTED account order exactly (static keys, then lookup-writable, then
 * lookup-readonly). Never route this through Transaction.compileMessage():
 * web3.js canonical key order differs from Jupiter's, and Jupiter rejects
 * reordered accounts with "Transaction accounts modified".
 */
async function toLegacyMessagePreservingOrder(
    transaction: VersionedTransaction
): Promise<Message> {
    const lookups = transaction.message.addressTableLookups;
    const accountKeys = [...transaction.message.staticAccountKeys];
    let lookupReadonly = 0;
    if (lookups.length > 0) {
        const tables = await fetchLookupTableAddresses(
            lookups.map((lookup) => lookup.accountKey)
        );
        for (const lookup of lookups) {
            const addresses = tables.get(lookup.accountKey.toBase58());
            if (!addresses) continue;
            accountKeys.push(
                ...lookup.writableIndexes.map((i) => addresses[i]),
                ...lookup.readonlyIndexes.map((i) => addresses[i])
            );
            lookupReadonly += lookup.readonlyIndexes.length;
        }
    }
    const header = transaction.message.header;
    return new Message({
        header: {
            numRequiredSignatures: header.numRequiredSignatures,
            numReadonlySignedAccounts: header.numReadonlySignedAccounts,
            numReadonlyUnsignedAccounts:
                header.numReadonlyUnsignedAccounts + lookupReadonly,
        },
        accountKeys: accountKeys.map((key) => key.toBase58()),
        recentBlockhash: transaction.message.recentBlockhash,
        instructions: transaction.message.compiledInstructions.map((ci) => ({
            programIdIndex: ci.programIdIndex,
            accounts: ci.accountKeyIndexes,
            data: bs58.encode(ci.data),
        })),
    });
}

const EMPTY_SIGNATURE = bs58.encode(new Uint8Array(64));

/**
 * Legacy wire format (shortvec sig count + 64-byte slots + message) with the
 * wallet's signature in its slot; every other byte is the crafted message.
 */
function serializeLegacyWithSignature(
    message: Message,
    wallet: PublicKey,
    signature: Uint8Array
): string {
    const numSigners = message.header.numRequiredSignatures;
    const index = message.accountKeys
        .slice(0, numSigners)
        .findIndex((key) => key.equals(wallet));
    if (index < 0) {
        throw new Error(
            'The crafted transaction has no signer slot for this wallet'
        );
    }
    const messageBytes = message.serialize();
    const wire = new Uint8Array(1 + 64 * numSigners + messageBytes.length);
    wire[0] = numSigners;
    wire.set(signature, 1 + 64 * index);
    wire.set(messageBytes, 1 + 64 * numSigners);
    return Buffer.from(wire).toString('base64');
}

/**
 * Signs an arbitrary UTF-8 message with the active wallet (Dynamic or MWA),
 * returning a bs58 ed25519 signature. Module-level (no hooks) so non-React
 * services such as the DCA fill watcher can use it for API auth challenges.
 */
export const signMessageWithWallet = withHumanReadableErrors(
    async (message: string): Promise<string> => {
    const { address, session } = useWalletStore.getState();
    if (!address) {
        throw new Error('Wallet not connected');
    }
    const payload = new Uint8Array(Buffer.from(message, 'utf8'));

    if (session.connectionType === 'dynamic') {
        const signer = dynamicClient.solana.getSigner({
            wallet: findDynamicSolanaWallet(),
        });
        const { signature } = await signer.signMessage(payload);
        return bs58.encode(signature);
    }

    if (session.connectionType === 'mwa') {
        const { transact } = await import(
            '@solana-mobile/mobile-wallet-adapter-protocol-web3js'
        );
        return transact(async (wallet: Web3MobileWallet) => {
            await mwaAuthorize(wallet);
            // MWA wants the base64 account address form; the store holds base58.
            const addresses = [
                Buffer.from(bs58.decode(address)).toString(
                    'base64'
                ) as Base64EncodedAddress,
            ];
            const [signature] = await wallet.signMessages({
                addresses,
                payloads: [payload],
            });
            if (!signature) {
                throw new Error('MWA did not return a message signature');
            }
            return bs58.encode(signature);
        });
    }

    throw new Error('No active wallet connection');
    }
);

/**
 * Signs (WITHOUT sending) a base64 VersionedTransaction with the active
 * wallet, returning the signed transaction as base64.
 */
export const signTransactionWithWallet = withHumanReadableErrors(
    async (base64Tx: string): Promise<string> => {
    const { session } = useWalletStore.getState();
    const transaction = deserializeVersionedTx(base64Tx);

    if (session.connectionType === 'dynamic') {
        const signer = dynamicClient.solana.getSigner({
            wallet: findDynamicSolanaWallet(),
        });
        // The Solana extension bundles its own @solana/web3.js copy; the
        // types are structurally identical but not nominally assignable.
        const signed = (await signer.signTransaction(
            transaction as unknown as Parameters<typeof signer.signTransaction>[0]
        )) as Transaction | VersionedTransaction;
        const walletKey = new PublicKey(findDynamicSolanaWallet().address);
        const signature = extractWalletSignature(signed, walletKey);
        if (!signature) {
            throw new Error(
                'Your wallet did not add its signature — please try again.'
            );
        }
        return applySignatureToCraftedTx(transaction, walletKey, signature);
    }

    if (session.connectionType === 'mwa') {
        const { address } = useWalletStore.getState();
        if (!address) {
            throw new Error('Wallet not connected');
        }
        const walletKey = new PublicKey(address);
        // MWA wallets convert v0 deposits to legacy before signing, and their
        // conversion recompiles account keys canonically — Jupiter's crafted
        // order is NOT canonical, so the wallet's own bytes are rejected.
        // Build the legacy form ourselves, preserving the crafted order
        // exactly; an already-legacy payload is signed as-is.
        const legacyMessage = await toLegacyMessagePreservingOrder(transaction);
        const legacyTx = Transaction.populate(
            legacyMessage,
            Array.from(
                { length: legacyMessage.header.numRequiredSignatures },
                () => EMPTY_SIGNATURE
            )
        );
        const { transact } = await import(
            '@solana-mobile/mobile-wallet-adapter-protocol-web3js'
        );
        return transact(async (wallet: Web3MobileWallet) => {
            await mwaAuthorize(wallet);
            const [signed] = await wallet.signTransactions({
                transactions: [
                    legacyTx as unknown as Parameters<
                        typeof wallet.signTransactions
                    >[0]['transactions'][number],
                ],
            });
            if (!signed) {
                throw new Error('MWA did not return a signed transaction');
            }
            const signature = extractWalletSignature(
                signed as Transaction | VersionedTransaction,
                walletKey
            );
            if (!signature) {
                throw new Error('MWA did not return a signed transaction');
            }
            return serializeLegacyWithSignature(
                legacyMessage,
                walletKey,
                signature
            );
        });
    }

    throw new Error('No active wallet connection');
    }
);

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

    const connectWithMwa = useCallback(
        withHumanReadableErrors(async () => {
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
        }),
        [connectStore, setSession]
    );

    const connectWithPasskey = useCallback(
        withHumanReadableErrors(async () => {
            try {
                await dynamicClient.auth.passkey.signIn();
            } catch {
                throw new Error(
                    'No passkey found on this device — sign in with email or Google first'
                );
            }
        }),
        []
    );

    const connectWithGoogle = useCallback(
        withHumanReadableErrors(async () => {
            await dynamicClient.auth.social.connect({ provider: 'google' });
        }),
        []
    );

    const connectWithApple = useCallback(
        withHumanReadableErrors(async () => {
            await dynamicClient.auth.social.connect({ provider: 'apple' });
        }),
        []
    );

    const requestEmailOtp = useCallback(
        withHumanReadableErrors(async (email: string) => {
            await dynamicClient.auth.email.sendOTP(email);
        }),
        []
    );

    const verifyEmailOtp = useCallback(
        withHumanReadableErrors(async (otp: string) => {
            await dynamicClient.auth.email.verifyOTP(otp);
        }),
        []
    );

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

            return transact(async (wallet: Web3MobileWallet) => {
                await mwaAuthorize(wallet);

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
        []
    );

    const signAndSendTransaction = useCallback(
        withHumanReadableErrors(
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
                // Fold the send into the local quest profile (watched
                // programs only); completed quests enqueue a server claim.
                observeOutgoingTx(signature, publicKey.toBase58(), transaction);
                return signature;
            }
        ),
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
        withHumanReadableErrors(
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
            }
        ),
        [buildPaymentTransaction, signAndSendTransaction]
    );

    const payReviveFee = useCallback(
        withHumanReadableErrors(async (): Promise<string> => {
            if (!MINT_TREASURY_ADDRESS) {
                throw new Error('Mint treasury address is not configured');
            }

            const transaction = await buildPaymentTransaction(
                MINT_TREASURY_ADDRESS,
                REVIVE_COST_LAMPORTS
            );
            return signAndSendTransaction(transaction);
        }),
        [buildPaymentTransaction, signAndSendTransaction]
    );

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
            connectWithMwa,
            connectWithPasskey,
            connectWithGoogle,
            connectWithApple,
            requestEmailOtp,
            verifyEmailOtp,
            mintCreatureNft,
            payReviveFee,
            signAndSendTransaction,
            signMessage: signMessageWithWallet,
            signTransaction: signTransactionWithWallet,
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
            connectWithMwa,
            connectWithPasskey,
            connectWithGoogle,
            connectWithApple,
            requestEmailOtp,
            verifyEmailOtp,
            mintCreatureNft,
            payReviveFee,
            signAndSendTransaction,
            disconnect,
        ]
    );
}

export function generateFakeMintAddress(): string {
    return Keypair.generate().publicKey.toBase58();
}
