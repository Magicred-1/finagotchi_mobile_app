import '../polyfills';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Buffer } from 'buffer';
import {
    PublicKey,
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
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { generateDemoMintAddress } from '../utils/generateDemoMintAddress';

import { dynamicClient } from './dynamicClient';
import { useWalletStore, type WalletConnectionType } from '../features/wallet/store';
import { observeOutgoingTx } from '../features/quest-engine/observe';
import { normalizeSignatureBytes } from '../features/quest-engine/signatureBytes';

const APP_URL = 'https://www.finagotchi.app';
const RAW_CLUSTER = process.env.EXPO_PUBLIC_SOLANA_CLUSTER ?? 'mainnet-beta';
// MWA chain ids are 'solana:mainnet' | 'solana:devnet' | 'solana:testnet' —
// 'solana:mainnet-beta' is invalid and makes wallets unable to simulate or
// sign correctly. Normalize the web3.js-style cluster name.
const CLUSTER = RAW_CLUSTER === 'mainnet-beta' ? 'mainnet' : RAW_CLUSTER;
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
    connectWithOwnWallet: () => Promise<void>;
    requestEmailOtp: (email: string) => Promise<void>;
    verifyEmailOtp: (otp: string) => Promise<void>;
    mintCreatureNft: (
        creatureName: string
    ) => Promise<{ signature: string; mintAddress: string; priceLamports: number }>;
    payReviveFee: () => Promise<string>;
    /** Signs and sends a transaction through the active connection (Dynamic or MWA). `chain` forces a chain-scoped MWA session for transactions on a different cluster (e.g. mainnet DCA while the app runs devnet). */
    signAndSendTransaction: (
        transaction: Transaction,
        chain?: `solana:${string}`
    ) => Promise<string>;
    /** Signs an arbitrary UTF-8 message; returns a bs58 ed25519 signature. */
    signMessage: (message: string) => Promise<string>;
    /** Signs (without sending) a base64 VersionedTransaction; returns base64. */
    signTransaction: (base64Tx: string) => Promise<string>;
    /** True only for Dynamic embedded wallets — the only connection whose key the app can export. MWA wallets hold their own keys. */
    canExportPrivateKey: boolean;
    /** Dynamic only: opens Dynamic's secure key-export modal. */
    exportPrivateKey: () => Promise<void>;
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
    // A JSON-RPC 403 from the wallet's RPC endpoint (e.g. a Helius key whose
    // origin allowlist doesn't cover Dynamic's webview origin). Checked BEFORE
    // the export branch: "access forbidden" is not a key-export failure.
    if (/access forbidden|"code":\s*403|\b403\b/.test(normalized)) {
        return friendly(
            'The wallet RPC refused the request (403) — the RPC API key likely has an origin restriction. Remove it or allow the wallet origin, then try again.'
        );
    }
    // Dynamic rejects key export with WalletApiError: Forbidden when the
    // dashboard's "Private Key Exports" toggle is off. Only reachable from
    // the export flow — a bare "forbidden" elsewhere is NOT this (see 403 above).
    if (/export (private )?keys? (is )?(disabled|not allowed)|revealembeddedwalletkey|wallet:export/.test(normalized)) {
        return friendly("Key export isn't available for this wallet right now.");
    }
    if (/invalid deposit transaction|accounts modified/.test(normalized)) {
        return friendly(
            "This wallet can't sign Jupiter DCA deposits — it alters the transaction before signing. Try Phantom, or connect with email/passkey instead."
        );
    }
    if (/not properly formed|cannot be signed|can't be signed|rewrote the deposit/.test(normalized)) {
        return friendly(
            "This wallet can't sign Jupiter DCA deposits — it rewrites transactions before signing. Try Phantom, or connect with email/passkey instead."
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
 *
 * A `chain` override forces a fresh authorize on that chain WITHOUT
 * persisting the token (the app's session stays on CLUSTER). Wallets scope
 * signing behaviour to the session chain: given a mainnet transaction inside
 * a devnet session, the Seeker wallet rewrites it — same wallet signs the
 * same deposit as-is when the session chain is mainnet.
 */
/** Chain-scoped token for mainnet signing sessions (kept out of the store so the app's CLUSTER session token is untouched). */
let mainnetAuthToken: string | null = null;

async function mwaAuthorize(
    wallet: Web3MobileWallet,
    chain?: `solana:${string}`
): Promise<void> {
    if (chain) {
        // NOTE: always do a full authorize for DCA signings instead of
        // reauthorizing the cached session. Evidence from the field: the
        // wallet signed the crafted deposit cleanly right after a FRESH
        // mainnet authorize, but injects a phantom fee account into the tx
        // on later signings that reused the cached session.
        const result = await wallet.authorize({ chain, identity: MWA_IDENTITY });
        mainnetAuthToken = result.auth_token;
        return;
    }
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

type Web3jsMwa = typeof import('@solana-mobile/mobile-wallet-adapter-protocol-web3js');

/**
 * Metro's dynamic import() interop for this package's CJS react-native entry
 * is inconsistent — the namespace sometimes lands on `default`. Resolve both
 * so a stale or reshuffled bundle fails with a useful message.
 */
async function loadMwaTransact(): Promise<Web3jsMwa['transact']> {
    const mod = (await import(
        '@solana-mobile/mobile-wallet-adapter-protocol-web3js'
    )) as Web3jsMwa & { default?: Web3jsMwa };
    const transact = mod.transact ?? mod.default?.transact;
    if (!transact) {
        throw new Error(
            'Wallet module failed to load — restart Metro with a cleared cache.'
        );
    }
    return transact;
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

/** LUTs for Jupiter-crafted deposits are mainnet accounts. */
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
 * Converts a crafted v0 message to a legacy Message preserving the CRAFTED
 * account order exactly (static keys, then lookup-writable, then
 * lookup-readonly). Never route this through Transaction.compileMessage():
 * web3.js canonical key order differs from Jupiter's. This exact byte shape
 * is what the jup.ag frontend's successful deposits look like on-chain, and
 * it passes Jupiter's validation (probe-verified against the live API).
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
 * Legacy wire format (shortvec sig count + 64-byte slots + message bytes)
 * with the wallet's signature in its slot; every other byte is the crafted
 * message. Built by hand because Transaction.serialize() can recompile.
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

interface AddedAccountInfo {
    key: string;
    signer: boolean;
    writable: boolean;
    /** Programs whose instructions reference this account. */
    usedBy: string[];
}

interface WalletTxDiff {
    added: string[];
    addedDetails: AddedAccountInfo[];
    removed: string[];
    craftedPrograms: string[];
    walletPrograms: string[];
}

/**
 * Compares a wallet's returned transaction against the crafted deposit:
 * accounts the wallet added or removed, and the program ids of both. Order
 * differences are ignored on purpose — Jupiter accepts any account order
 * (probe-verified); only set changes break validation.
 */
function diffWalletTx(
    crafted: VersionedTransaction,
    signed: Transaction | VersionedTransaction
): WalletTxDiff {
    const craftedKeys = crafted.message.staticAccountKeys.map((k) =>
        k.toBase58()
    );
    const rawMessage =
        'version' in signed ? signed.message : signed.compileMessage();
    const message: {
        accountKeys: PublicKey[];
        compiledInstructions: {
            programIdIndex: number;
            accountKeyIndexes: number[];
        }[];
    } =
        'version' in signed
            ? {
                  accountKeys: signed.message.staticAccountKeys,
                  compiledInstructions: signed.message.compiledInstructions,
              }
            : signed.compileMessage();
    const signedKeys = message.accountKeys.map((k) => k.toBase58());
    const craftedSet = new Set(craftedKeys);
    const signedSet = new Set(signedKeys);
    const programIds = (m: {
        accountKeys: PublicKey[];
        compiledInstructions: { programIdIndex: number }[];
    }) =>
        m.compiledInstructions.map(
            (ci) => m.accountKeys[ci.programIdIndex]?.toBase58() ?? '?'
        );
    const added = signedKeys.filter((k) => !craftedSet.has(k));
    const numSigners = rawMessage.header.numRequiredSignatures;
    const addedDetails: AddedAccountInfo[] = added.map((key) => {
        const index = signedKeys.indexOf(key);
        const usedBy = [
            ...new Set(
                message.compiledInstructions
                    .filter((ci) => ci.accountKeyIndexes.includes(index))
                    .map(
                        (ci) =>
                            message.accountKeys[ci.programIdIndex]?.toBase58() ??
                            '?'
                    )
            ),
        ];
        return {
            key,
            signer: index >= 0 && index < numSigners,
            writable: index >= 0 ? rawMessage.isAccountWritable(index) : false,
            usedBy,
        };
    });
    return {
        added,
        addedDetails,
        removed: craftedKeys.filter((k) => !signedSet.has(k)),
        craftedPrograms: programIds({
            accountKeys: crafted.message.staticAccountKeys,
            compiledInstructions: crafted.message.compiledInstructions,
        }),
        walletPrograms: programIds(message),
    };
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
        return bs58.encode(normalizeSignatureBytes(signature, 'Dynamic'));
    }

    if (session.connectionType === 'mwa') {
        const transact = await loadMwaTransact();
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
        // Present the deposit as a legacy transaction in the CRAFTED account
        // order — the exact byte shape jup.ag's own frontend lands on-chain
        // (probe-verified to pass Jupiter's validation). An already-legacy
        // payload gives the wallet nothing to convert, so even wallets that
        // rewrite v0 transactions (Seeker) sign it as-is.
        const legacyMessage = await toLegacyMessagePreservingOrder(transaction);
        const legacyBytes = legacyMessage.serialize();
        const legacyTx = Transaction.populate(
            legacyMessage,
            Array.from(
                { length: legacyMessage.header.numRequiredSignatures },
                () => EMPTY_SIGNATURE
            )
        );
        const transact = await loadMwaTransact();
        return transact(async (wallet: Web3MobileWallet) => {
            // Jupiter deposits are mainnet transactions; authorize a mainnet
            // session for this signing or the wallet "fixes" the cluster
            // mismatch by rewriting the transaction.
            await mwaAuthorize(wallet, 'solana:mainnet');

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
            const signedTx = signed as Transaction | VersionedTransaction;
            const signature = extractWalletSignature(signedTx, walletKey);
            if (!signature) {
                throw new Error('MWA did not return a signed transaction');
            }

            // Signed as-is: the signature verifies against our exact legacy
            // message — return the probe-verified byte shape.
            if (
                nacl.sign.detached.verify(
                    legacyBytes,
                    signature,
                    walletKey.toBytes()
                )
            ) {
                return serializeLegacyWithSignature(
                    legacyMessage,
                    walletKey,
                    signature
                );
            }

            // The wallet rewrote even the legacy payload. If it changed the
            // account SET, Jupiter will reject it — fail instantly with the
            // diff on screen instead of after a 33s landing attempt. If only
            // the order changed, forward the wallet's transaction: Jupiter
            // accepts any account order (probe-verified).
            const diff = diffWalletTx(transaction, signedTx);
            console.warn('dca: wallet rewrote the deposit tx', JSON.stringify(diff));
            if (diff.added.length > 0 || diff.removed.length > 0) {
                const detail = diff.addedDetails
                    .map(
                        (a) =>
                            `${a.key} (${[a.signer ? 'signer' : null, a.writable ? 'writable' : 'readonly', a.usedBy.length ? `used by ${a.usedBy.join(',')}` : 'unused by any instruction'].filter(Boolean).join(', ')})`
                    )
                    .join(' ');
                throw new Error(
                    `Wallet altered the deposit accounts (+${diff.added.length}/-${diff.removed.length}). ${detail || [...diff.added, ...diff.removed].join(', ')}`
                );
            }
            const bytes =
                'version' in signedTx
                    ? signedTx.serialize()
                    : signedTx.serialize({
                          requireAllSignatures: false,
                          verifySignatures: false,
                      });
            return Buffer.from(bytes).toString('base64');
        });
    }

    throw new Error('No active wallet connection');
    }
);

/**
 * Opens Dynamic's secure key-export modal for the embedded wallet
 * (`revealEmbeddedWalletKey`). The SDK's modal handles authentication and
 * shows the key only inside Dynamic's isolated view — the app never sees
 * it. MWA/external wallets hold their own keys and are not exportable here.
 *
 * Requires "Private Key Exports" enabled in the Dynamic dashboard
 * (Embedded Wallets → Security), otherwise the API rejects with
 * WalletApiError: Forbidden.
 */
/** v3 export ceremonies are guarded by the `wallet:export` token scope. The legacy client doesn't re-export TokenScope, so lift the scope type off the step-up method instead. */
type StepUpScope = Parameters<
    typeof dynamicClient.stepUpAuth.isStepUpRequired
>[0]['scope'];
const WALLET_EXPORT_SCOPE = 'wallet:export' as StepUpScope;

export const exportPrivateKeyWithWallet = withHumanReadableErrors(
    async (): Promise<void> => {
    try {
        const { session } = useWalletStore.getState();
        if (session.connectionType !== 'dynamic') {
            throw new Error(
                'Private key export is only available for embedded wallets'
            );
        }
        // Ensure the embedded Solana wallet exists before opening the export UI.
        findDynamicSolanaWallet();

        // A plain session token lacks the wallet:export scope and gets a
        // WalletApiError: Forbidden from the export API — elevate the session
        // with Dynamic's step-up prompt first when the SDK says it's required.
        if (
            await dynamicClient.stepUpAuth.isStepUpRequired({
                scope: WALLET_EXPORT_SCOPE,
            })
        ) {
            await dynamicClient.stepUpAuth.promptStepUpAuth({
                requestedScopes: [WALLET_EXPORT_SCOPE],
            });
        }

        await dynamicClient.ui.wallets.revealEmbeddedWalletKey({
            type: 'private-key',
        });
    } catch (error) {
        // Only this flow knows a "Forbidden" is about key export (dashboard's
        // "Private Key Exports" toggle off) — the global mapper can't tell it
        // apart from an RPC 403, so map it here.
        const message = error instanceof Error ? error.message : String(error);
        if (/forbidden|disabled|not allowed/i.test(message)) {
            throw new Error("Key export isn't available for this wallet right now.");
        }
        throw error;
    }
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
    const canExportPrivateKey = connectionType === 'dynamic';

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
            const transact = await loadMwaTransact();

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

    const connectWithOwnWallet = useCallback(
        withHumanReadableErrors(async () => {
            throw new Error("Connect your own wallet is not yet supported via this flow.");
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
            // Sign with Dynamic, but SEND through our own RPC: Dynamic's
            // signAndSendTransaction routes through the RPC configured in its
            // dashboard (a 403 there blocked every send), while the app's
            // Helius endpoint is under our control.
            // The Solana extension bundles its own @solana/web3.js copy, so
            // the Transaction types are structurally identical but not
            // nominally assignable. Runtime interop is fine.
            const signed = await signer.signTransaction(
                transaction as unknown as Parameters<
                    typeof signer.signTransaction
                >[0]
            );
            const connection = new Connection(SOLANA_RPC, 'confirmed');
            const signature = await connection.sendRawTransaction(
                signed.serialize()
            );
            const { recentBlockhash, lastValidBlockHeight } = transaction;
            if (recentBlockhash && lastValidBlockHeight) {
                await connection.confirmTransaction(
                    { signature, blockhash: recentBlockhash, lastValidBlockHeight },
                    'confirmed'
                );
            } else {
                await connection.confirmTransaction(signature, 'confirmed');
            }
            return signature;
        },
        []
    );

    const signAndSendWithMwa = useCallback(
        async (
            transaction: Transaction,
            chain?: `solana:${string}`
        ): Promise<string> => {
            const transact = await loadMwaTransact();

            return transact(async (wallet: Web3MobileWallet) => {
                // Mainnet transactions (e.g. on-chain DCA) need a mainnet
                // session: in a devnet session the wallet simulates the tx
                // against devnet, fails, and refuses to sign.
                await mwaAuthorize(wallet, chain);

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
            async (
                transaction: Transaction,
                chain?: `solana:${string}`
            ): Promise<string> => {
                if (!publicKey) {
                    throw new Error('Wallet not connected');
                }

                let signature: string;
                if (connectionType === 'dynamic') {
                    signature = await signAndSendWithDynamic(transaction);
                } else if (connectionType === 'mwa') {
                    signature = await signAndSendWithMwa(transaction, chain);
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
            ): Promise<{ signature: string; mintAddress: string; priceLamports: number }> => {
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
                const mintAddress = generateDemoMintAddress();

                return { signature, mintAddress, priceLamports: MINT_COST_LAMPORTS };
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
                const transact = await loadMwaTransact();

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
        connectWithOwnWallet,
            requestEmailOtp,
            verifyEmailOtp,
            mintCreatureNft,
            payReviveFee,
            signAndSendTransaction,
            signMessage: signMessageWithWallet,
            signTransaction: signTransactionWithWallet,
            canExportPrivateKey,
            exportPrivateKey: exportPrivateKeyWithWallet,
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
            canExportPrivateKey,
            disconnect,
        ]
    );
}

export function generateFakeMintAddress(): string {
    return generateDemoMintAddress();
}
