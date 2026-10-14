/**
 * Wallet balance lookup for the swap sheet's quick-amount segments
 * (10% / 25% / MAX). Read-only RPC calls against mainnet — the same
 * EXPO_PUBLIC_JUPITER_RPC endpoint the DCA client uses. Failures return null
 * (the segments just stay disabled); they never block the swap flow.
 */

import type { SupportedToken } from '../dca/types';
import { WSOL_MINT } from './types';

const MAINNET_RPC =
    process.env.EXPO_PUBLIC_JUPITER_RPC ?? 'https://api.mainnet-beta.solana.com';

const RPC_TIMEOUT_MS = 10_000;

/**
 * Lamports kept back when MAX is picked with SOL as the input: network fee
 * plus rent for any token account the swap creates. Without the reserve a
 * MAX SOL swap always fails on-chain.
 */
export const SOL_MAX_RESERVE = 0.01;

async function rpcCall<T>(method: string, params: unknown[]): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
    try {
        const res = await fetch(MAINNET_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
            signal: controller.signal,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { result?: T } | null;
        return data?.result ?? null;
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * The wallet's spendable balance of a token, in token units (not base
 * units). SOL comes from getBalance; SPL tokens sum the mint's token
 * accounts. Returns null when the RPC is unreachable.
 */
export async function fetchTokenBalance(
    walletPubkey: string,
    token: SupportedToken
): Promise<number | null> {
    if (token.mint === WSOL_MINT) {
        const balance = await rpcCall<{ value?: number }>('getBalance', [
            walletPubkey,
        ]);
        const lamports = balance?.value;
        return typeof lamports === 'number' ? lamports / 1e9 : null;
    }

    const accounts = await rpcCall<{ value?: unknown[] }>(
        'getTokenAccountsByOwner',
        [walletPubkey, { mint: token.mint }, { encoding: 'jsonParsed' }]
    );
    if (accounts === null) return null;
    return (accounts.value ?? []).reduce<number>((sum, account) => {
        const info = (
            account as {
                account?: {
                    data?: { parsed?: { info?: { tokenAmount?: { uiAmount?: number } } } };
                }
            }
        )?.account?.data?.parsed?.info?.tokenAmount;
        return sum + Number(info?.uiAmount ?? 0);
    }, 0);
}

/**
 * Amount for a quick-pick segment, in token units, formatted to the token's
 * decimals (never in base-unit exponential notation). MAX on SOL subtracts
 * the fee/rent reserve.
 */
export function quickAmount(
    balance: number,
    fraction: number,
    token: SupportedToken
): string {
    let amount = balance * fraction;
    if (fraction >= 1 && token.mint === WSOL_MINT) {
        amount = Math.max(0, amount - SOL_MAX_RESERVE);
    }
    // Floor at the token's decimals so the input never overdraws the balance.
    const factor = 10 ** token.decimals;
    const floored = Math.floor(amount * factor) / factor;
    return String(floored);
}
