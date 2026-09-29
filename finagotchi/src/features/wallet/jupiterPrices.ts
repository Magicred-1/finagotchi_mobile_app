/**
 * Keyless price source: Jupiter's lite price API — the same endpoint the DCA
 * screens use (screens/dca/prices.ts). One request prices everything the
 * sidebar shows, since SOL, USDC and all xStocks are Solana mints.
 *
 * This is the automatic fallback when EXPO_PUBLIC_PYTH_API_KEY is not set:
 * Pyth Hermes has required a key on its price routes since the Pyth Core
 * upgrade (Aug 2026) — every route (v1/v2, both hosts, benchmarks) answers
 * 401 anonymously.
 */

import { SUPPORTED_TOKENS, USDC_MINT } from '../../services/dca/types';

const JUPITER_PRICE_URL = 'https://lite-api.jup.ag/price/v3';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const FEED_TIMEOUT_MS = 10_000;

/** Ticker → Solana mint (SOL priced via wrapped SOL). */
const MINT_BY_TICKER: Record<string, string> = {
    SOL: WSOL_MINT,
    USDC: USDC_MINT,
    ...Object.fromEntries(
        SUPPORTED_TOKENS.map((token) => [token.ticker, token.mint])
    ),
};

/** The mint a ticker is priced through; null for unknown tickers. */
export function jupiterMintForTicker(ticker: string): string | null {
    return MINT_BY_TICKER[ticker] ?? null;
}

/**
 * Latest USD price per ticker. Unknown tickers and missing entries are
 * absent from the result. Throws on network/HTTP failure (caller decides).
 */
export async function fetchJupiterPrices(
    tickers: string[]
): Promise<Record<string, number>> {
    const mintByTicker = new Map<string, string>();
    for (const ticker of tickers) {
        const mint = jupiterMintForTicker(ticker);
        if (mint) mintByTicker.set(ticker, mint);
    }
    if (mintByTicker.size === 0) return {};

    const query = [...mintByTicker.values()].join(',');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
    try {
        const res = await fetch(`${JUPITER_PRICE_URL}?ids=${query}`, {
            signal: controller.signal,
        });
        if (!res.ok) {
            throw new Error(`jupiter: price API returned HTTP ${res.status}`);
        }
        const json = (await res.json()) as Record<
            string,
            { usdPrice?: unknown }
        >;
        const prices: Record<string, number> = {};
        for (const [ticker, mint] of mintByTicker) {
            const price = Number(json?.[mint]?.usdPrice);
            if (Number.isFinite(price) && price > 0) {
                prices[ticker] = price;
            }
        }
        return prices;
    } finally {
        clearTimeout(timer);
    }
}
