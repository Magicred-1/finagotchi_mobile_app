import { Buffer } from 'buffer';
import bs58 from 'bs58';
import type { Web3MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import type { Wallet as DynamicWallet } from '@dynamic-labs/legacy-client';

import { dynamicClient } from '../../wallet/dynamicClient';
import type { AuthSigner } from './client';

// Same identity conventions as src/wallet/useWallet.ts.
const APP_URL = 'https://www.finagotchi.app';
const MWA_IDENTITY = {
    name: 'Finagotchi',
    uri: APP_URL,
    icon: 'favicon.ico',
};

/**
 * MWA `signMessages` wants Base64EncodedAddress, but the app stores account
 * addresses as base58 (see normalizeMwaAddress in useWallet). Convert back.
 */
function base58ToBase64Address(address: string): string {
    return Buffer.from(bs58.decode(address)).toString('base64');
}

/**
 * Auth signer for Seeker wallets over Mobile Wallet Adapter: reuses the
 * cached auth token from connect time, reauthorizes inside `transact`, and
 * signs the challenge message bytes. Wire it up after MWA connect:
 *
 *   setAuthSigner(createMwaAuthSigner(() => useWalletStore.getState().session.authToken));
 */
export function createMwaAuthSigner(getAuthToken: () => string | null): AuthSigner {
    return async (message, walletAddress) => {
        const authToken = getAuthToken();
        if (!authToken) {
            throw new Error('MWA session token missing — connect the wallet first');
        }

        const { transact } = await import(
            '@solana-mobile/mobile-wallet-adapter-protocol-web3js'
        );

        return transact(async (wallet: Web3MobileWallet) => {
            await wallet.reauthorize({
                auth_token: authToken,
                identity: MWA_IDENTITY,
            });

            const signatures = await wallet.signMessages({
                addresses: [base58ToBase64Address(walletAddress)],
                payloads: [message],
            });

            const first = signatures[0];
            if (!first || first.length !== 64) {
                throw new Error('MWA did not return an ed25519 signature');
            }
            return first;
        });
    };
}

function findSolanaWallet(wallets: DynamicWallet[]): DynamicWallet | undefined {
    return wallets.find((w) => w.chain?.toUpperCase() === 'SOL');
}

/**
 * Auth signer for Dynamic embedded wallets (email/social/passkey sign-ins).
 * Uses the same signer factory as useWallet's signAndSendWithDynamic.
 */
export function createDynamicAuthSigner(): AuthSigner {
    return async (message, walletAddress) => {
        const primary = dynamicClient.wallets.primary;
        const solWallet =
            primary && primary.chain?.toUpperCase() === 'SOL'
                ? primary
                : findSolanaWallet(dynamicClient.wallets.userWallets);
        if (!solWallet || solWallet.address !== walletAddress) {
            throw new Error('No Dynamic Solana wallet matches the connected address');
        }

        const signer = dynamicClient.solana.getSigner({ wallet: solWallet });
        const { signature } = await signer.signMessage(message);
        if (signature.length !== 64) {
            throw new Error('Dynamic did not return an ed25519 signature');
        }
        return signature;
    };
}

// TODO(auth): if a third connection type is ever added, implement the same
// AuthSigner interface — (message: Uint8Array, wallet: string) =>
// Promise<Uint8Array> returning a raw 64-byte ed25519 signature — and pick
// the factory from useWalletStore's session.connectionType where
// setAuthSigner is called.
