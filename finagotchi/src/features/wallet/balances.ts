/**
 * Wallet token balances for the sidebar: SOL + USDC + held xStocks, priced
 * in USD via Pyth Hermes (see pyth.ts). Balances come from raw mainnet
 * JSON-RPC — xStock ATAs live under Token-2022 while USDC is classic SPL,
 * so one owner query per program covers everything in two requests.
 */

import { useEffect, useState } from 'react';

import { SUPPORTED_TOKENS, USDC_MINT } from '../../services/dca/types';
import { fetchJupiterPrices } from './jupiterPrices';
import { fetchPythPrices } from './pyth';

const SOLANA_RPC =
    process.env.EXPO_PUBLIC_SOLANA_RPC ?? 'https://api.mainnet-beta.solana.com';
const LAMPORTS_PER_SOL = 1_000_000_000;
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const RPC_TIMEOUT_MS = 15_000;
const REFRESH_MS = 60_000;

export interface BalanceRow {
    ticker: string;
    name: string;
    amount: number;
    /** amount × price; null when the feed didn't deliver. */
    usdValue: number | null;
}

interface ParsedTokenAccount {
    account?: {
        data?: {
            parsed?: {
                info?: {
                    mint?: string;
                    tokenAmount?: { uiAmount?: number | null };
                };
            };
        };
    };
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
    try {
        const res = await fetch(SOLANA_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
            signal: controller.signal,
        });
        const json = (await res.json()) as { result?: T; error?: unknown };
        if (!res.ok || json.error || json.result === undefined) {
            throw new Error(`balances: RPC ${method} failed`);
        }
        return json.result;
    } finally {
        clearTimeout(timer);
    }
}

async function fetchOnChainBalances(
    owner: string
): Promise<{ sol: number; amountByMint: Map<string, number> }> {
    const [balance, classic, token2022] = await Promise.all([
        rpcCall<{ value: number }>('getBalance', [owner]),
        rpcCall<{ value: ParsedTokenAccount[] }>('getTokenAccountsByOwner', [
            owner,
            { programId: TOKEN_PROGRAM_ID },
            { encoding: 'jsonParsed' },
        ]),
        rpcCall<{ value: ParsedTokenAccount[] }>('getTokenAccountsByOwner', [
            owner,
            { programId: TOKEN_2022_PROGRAM_ID },
            { encoding: 'jsonParsed' },
        ]),
    ]);

    const amountByMint = new Map<string, number>();
    for (const account of [...classic.value, ...token2022.value]) {
        const info = account?.account?.data?.parsed?.info;
        if (!info?.mint) continue;
        const amount = info.tokenAmount?.uiAmount ?? 0;
        amountByMint.set(info.mint, (amountByMint.get(info.mint) ?? 0) + amount);
    }
    return { sol: balance.value / LAMPORTS_PER_SOL, amountByMint };
}

/**
 * SOL first, then USDC, then held xStocks by value. Pure so the layout rules
 * stay testable without RPC/Hermes.
 */
export function buildBalanceRows(
    sol: number,
    amountByMint: Map<string, number>,
    prices: Record<string, number>
): BalanceRow[] {
    const usdc = amountByMint.get(USDC_MINT) ?? 0;
    const heldStocks = SUPPORTED_TOKENS.map((token) => ({
        ...token,
        amount: amountByMint.get(token.mint) ?? 0,
    })).filter((token) => token.amount > 0);

    const value = (ticker: string, amount: number): number | null => {
        const price = prices[ticker];
        return price !== undefined ? amount * price : null;
    };

    const rows: BalanceRow[] = [
        { ticker: 'SOL', name: 'Solana', amount: sol, usdValue: value('SOL', sol) },
        { ticker: 'USDC', name: 'USD Coin', amount: usdc, usdValue: value('USDC', usdc) },
        ...heldStocks.map((token) => ({
            ticker: token.ticker,
            name: token.name,
            amount: token.amount,
            usdValue: value(token.ticker, token.amount),
        })),
    ];

    // Stocks rank by value; SOL/USDC keep their fixed slots on top.
    const [solRow, usdcRow, ...stockRows] = rows;
    stockRows.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
    return [solRow, usdcRow, ...stockRows];
}

/** Sum of the rows that HAVE a price; null when no feed delivered at all. */
export function totalUsdValue(rows: BalanceRow[]): number | null {
    const priced = rows.filter((row) => row.usdValue !== null);
    if (priced.length === 0) return null;
    return priced.reduce((sum, row) => sum + (row.usdValue ?? 0), 0);
}

/**
 * USD prices for the displayed tickers: Pyth Hermes when an API key is
 * configured (fetchPythPrices returns {} without one — Hermes 401s
 * anonymously since the Pyth Core upgrade), otherwise the keyless Jupiter
 * lite price API. Either source also backs up the other on failure.
 */
async function fetchPrices(tickers: string[]): Promise<Record<string, number>> {
    try {
        const prices = await fetchPythPrices(tickers);
        if (Object.keys(prices).length > 0) return prices;
        return await fetchJupiterPrices(tickers);
    } catch {
        try {
            return await fetchJupiterPrices(tickers);
        } catch {
            // Prices stay empty; rows render their USD value as "–".
            return {};
        }
    }
}

/**
 * Fetches on mount/when `enabled` flips true and every minute while open.
 * RPC or price failures keep the previous render; the first failure leaves
 * the empty state, which the sidebar renders as a single muted line.
 */
export function useWalletBalances(owner: string | null, enabled: boolean) {
    const [rows, setRows] = useState<BalanceRow[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!enabled || !owner) return;
        let cancelled = false;

        const refresh = async () => {
            setLoading(true);
            try {
                const { sol, amountByMint } = await fetchOnChainBalances(owner);
                const prices = await fetchPrices([
                    'SOL',
                    'USDC',
                    ...SUPPORTED_TOKENS.map((token) => token.ticker),
                ]);
                if (cancelled) return;
                setRows(buildBalanceRows(sol, amountByMint, prices));
            } catch {
                // Keep the previous render (empty on first failure).
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void refresh();
        const interval = setInterval(() => void refresh(), REFRESH_MS);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [owner, enabled]);

    return { rows, totalUsd: totalUsdValue(rows), loading };
}

/** "$1,234.56" — hand-rolled grouping (Hermes' Intl is minimal). */
export function formatUsd(value: number): string {
    const [int, frac] = value.toFixed(2).split('.');
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `$${grouped}.${frac}`;
}

/** Trailing-zero-trimmed amount: 2 dp at ≥1, 4 dp below. */
export function formatTokenAmount(amount: number): string {
    if (amount === 0) return '0';
    const fixed = amount >= 1 ? amount.toFixed(2) : amount.toFixed(4);
    return fixed.replace(/\.?0+$/, '');
}
