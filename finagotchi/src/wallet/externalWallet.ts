/**
 * Signing layer for 'external' (WalletConnect) wallets via the new Dynamic
 * SDK. The WC session lives in the SDK's own storage, so accounts stay
 * available across app restarts; when the wallet needs the user to act, the
 * walletConnectUserActionRequested listener in newDynamicClient.ts bounces
 * them into the wallet app.
 */

import {
    getWalletAccounts,
    removeWalletAccount,
    signMessage,
} from '@dynamic-labs-sdk/client';
import {
    isSolanaWalletAccount,
    signTransaction,
    signAndSendTransaction,
    type SolanaWalletAccount,
} from '@dynamic-labs-sdk/solana';
import type { Transaction, VersionedTransaction } from '@solana/web3.js';

import { newDynamicClient, registerWalletConnectActionHandler } from './newDynamicClient';
import { normalizeSignatureBytes } from '../features/quest-engine/signatureBytes';

/** The connected external Solana account matching the app wallet address. */
export function findExternalSolanaAccount(address: string): SolanaWalletAccount {
    // Signing requests fire walletConnectUserActionRequested — the handler
    // that bounces the user into their wallet app must be live by then.
    registerWalletConnectActionHandler();
    const account = getWalletAccounts(newDynamicClient).find(
        (candidate) =>
            isSolanaWalletAccount(candidate) && candidate.address === address
    );
    if (!account) {
        throw new Error(
            'External wallet session not found — reconnect your wallet'
        );
    }
    return account;
}

/** Signs an arbitrary UTF-8 message; returns the raw 64-byte ed25519 signature. */
export async function signMessageWithExternalWallet(
    address: string,
    message: Uint8Array
): Promise<Uint8Array> {
    const { signature } = await signMessage(
        {
            walletAccount: findExternalSolanaAccount(address),
            message: new TextDecoder().decode(message),
        },
        newDynamicClient
    );
    return normalizeSignatureBytes(signature, 'External wallet');
}

/** Signs (without sending); returns the wallet's signed transaction. */
export async function signTransactionWithExternalWallet(
    address: string,
    transaction: Transaction | VersionedTransaction
): Promise<Transaction | VersionedTransaction> {
    const { signedTransaction } = await signTransaction(
        {
            walletAccount: findExternalSolanaAccount(address),
            // The SDK bundles its own @solana/web3.js copy; the types are
            // structurally identical but not nominally assignable.
            transaction: transaction as unknown as Parameters<
                typeof signTransaction
            >[0]['transaction'],
        },
        newDynamicClient
    );
    return signedTransaction as unknown as Transaction | VersionedTransaction;
}

/** Signs and sends through the wallet; returns the transaction signature. */
export async function signAndSendWithExternalWallet(
    address: string,
    transaction: Transaction
): Promise<string> {
    const { signature } = await signAndSendTransaction(
        {
            walletAccount: findExternalSolanaAccount(address),
            transaction: transaction as unknown as Parameters<
                typeof signAndSendTransaction
            >[0]['transaction'],
            // Sponsorship only applies to Dynamic embedded wallets.
            sponsorshipMode: 'off',
        },
        newDynamicClient
    );
    return signature;
}

/** Ends the WalletConnect session and drops the account from the SDK. */
export async function disconnectExternalWallet(address: string): Promise<void> {
    try {
        await removeWalletAccount(
            { walletAccount: findExternalSolanaAccount(address) },
            newDynamicClient
        );
    } catch {
        // Session already gone — the local store clears regardless.
    }
}
