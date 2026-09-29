/**
 * Pyth Network Hermes price client (REST, keyless).
 *
 * xStock tickers map to the UNDERLYING equity feeds (SPYX trades off
 * Equity.US.SPY/USD); feed ids are verified against
 * https://hermes.pyth.network/v2/price_feeds. Prices are informational only
 * — callers render "–" when a feed is missing and never block on this.
 */

const HERMES_LATEST_URL = 'https://hermes.pyth.network/v2/updates/price/latest';
const FEED_TIMEOUT_MS = 10_000;

/**
 * Hermes has required a Bearer key on price-update routes since the Pyth
 * Core upgrade (Aug 2026); anonymous calls get a 401. No key configured →
 * returns {} and the caller falls back to the keyless Jupiter price API
 * (see jupiterPrices.ts).
 */
const PYTH_API_KEY = process.env.EXPO_PUBLIC_PYTH_API_KEY;

/** Ticker → Pyth price feed id (hex, no 0x prefix). */
export const PYTH_FEED_IDS: Record<string, string> = {
    SOL: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
    USDC: 'eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
    SPYX: '19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5',
    QQQX: '9695e2b96ea7b3859da9ed25b7a46a920a776e2fdae19a7bcfdf2b219230452d',
    TSLAX: '16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1',
    NVDAX: 'b1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593',
    AAPLX: '49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688',
    COINX: 'fee33f2a978bf32dd6b662b65ba8083c6773b494f8401194ec1870c640860245',
    MSTRX: 'e1e80251e5f5184f2195008382538e847fafc36f751896889dd3d1b1f6111f09',
};

interface HermesLatestResponse {
    parsed?: {
        id?: string;
        price?: { price?: string; expo?: number };
    }[];
}

/**
 * Latest USD price per ticker. Unknown tickers and failed feeds are simply
 * absent from the result. Throws on network/HTTP failure (caller decides).
 */
export async function fetchPythPrices(
    tickers: string[]
): Promise<Record<string, number>> {
    const feedByTicker = new Map<string, string>();
    for (const ticker of tickers) {
        const feedId = PYTH_FEED_IDS[ticker];
        if (feedId) feedByTicker.set(ticker, feedId);
    }
    if (feedByTicker.size === 0) return {};
    if (!PYTH_API_KEY) {
        return {};
    }

    const query = [...feedByTicker.values()]
        .map((id) => `ids[]=0x${id}`)
        .join('&');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
    try {
        const res = await fetch(`${HERMES_LATEST_URL}?${query}`, {
            headers: { Authorization: `Bearer ${PYTH_API_KEY}` },
            signal: controller.signal,
        });
        if (!res.ok) {
            throw new Error(`hermes: latest price returned HTTP ${res.status}`);
        }
        const json = (await res.json()) as HermesLatestResponse;

        const priceByFeed = new Map<string, number>();
        for (const entry of json?.parsed ?? []) {
            const raw = Number(entry?.price?.price);
            const expo = Number(entry?.price?.expo);
            const value = raw * 10 ** expo;
            if (entry?.id && Number.isFinite(value) && value > 0) {
                priceByFeed.set(entry.id, value);
            }
        }

        const prices: Record<string, number> = {};
        for (const [ticker, feedId] of feedByTicker) {
            const price = priceByFeed.get(feedId);
            if (price !== undefined) prices[ticker] = price;
        }
        return prices;
    } finally {
        clearTimeout(timer);
    }
}
