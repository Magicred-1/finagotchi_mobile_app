/**
 * Swap token model — reuses the DCA SupportedToken shape and extends the
 * xStocks whitelist with the two majors every swap routes through.
 */

import { SUPPORTED_TOKENS, USDC_MINT, type SupportedToken } from '../dca/types';

/** Wrapped SOL mint (SOL is swapped through its SPL wrapper). */
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export const SOL_TOKEN: SupportedToken = {
    ticker: 'SOL',
    name: 'Solana',
    mint: WSOL_MINT,
    decimals: 9,
};

export const USDC_TOKEN: SupportedToken = {
    ticker: 'USDC',
    name: 'USD Coin',
    mint: USDC_MINT,
    decimals: 6,
};

/**
 * The only set the swap sheet may offer: SOL and USDC first (the funding
 * tokens), then the same Backed xStocks whitelist DCA uses. Arbitrary mints
 * are not accepted.
 */
export const SWAP_TOKENS: SupportedToken[] = [
    SOL_TOKEN,
    USDC_TOKEN,
    ...SUPPORTED_TOKENS,
];

/**
 * Jupiter aggregator program — swap quests watch it (it is in the quest
 * engine's EXPLORE_CANDIDATES, so swap txs are whitelisted for ingest and
 * verification on the server too).
 */
export const JUPITER_SWAP_PROGRAM_ID =
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';

export function swapTokenByMint(mint: string): SupportedToken | null {
    return SWAP_TOKENS.find((token) => token.mint === mint) ?? null;
}

export function swapTokenByTicker(ticker: string): SupportedToken | null {
    return SWAP_TOKENS.find((token) => token.ticker === ticker) ?? null;
}
