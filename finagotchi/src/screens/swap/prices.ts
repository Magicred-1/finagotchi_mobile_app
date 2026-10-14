import { useEffect, useState } from 'react';

import { SWAP_TOKENS } from '../../services/swap';

import type { TokenQuote } from '../dca/prices';

const MINTS = SWAP_TOKENS.map((token) => token.mint).join(',');

/**
 * USD quotes for every swappable token (SOL, USDC, xStocks) — same keyless
 * Jupiter lite price API the DCA screens use, just over the wider swap set.
 * Informational only: failures leave the map empty and callers render "–".
 */
export function useSwapPrices(enabled = true): Record<string, TokenQuote> {
    const [quotes, setQuotes] = useState<Record<string, TokenQuote>>({});

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        fetch(`https://lite-api.jup.ag/price/v3?ids=${MINTS}`)
            .then((res) => res.json())
            .then((json) => {
                if (cancelled || !json || typeof json !== 'object') return;
                const next: Record<string, TokenQuote> = {};
                for (const [mint, entry] of Object.entries(json)) {
                    const price = Number((entry as { usdPrice?: unknown })?.usdPrice);
                    const change24h = Number(
                        (entry as { priceChange24h?: unknown })?.priceChange24h
                    );
                    if (Number.isFinite(price)) {
                        next[mint] = {
                            price,
                            change24h: Number.isFinite(change24h) ? change24h : 0,
                        };
                    }
                }
                setQuotes(next);
            })
            .catch(() => {
                // Quotes stay "–"; they are informational only.
            });
        return () => {
            cancelled = true;
        };
    }, [enabled]);

    return quotes;
}

/** Compact USD figure for amount fields: 12.5 → "$12.50". */
export function formatUsdEstimate(value: number): string {
    return `$${value >= 1 ? value.toFixed(2) : value.toFixed(4)}`;
}
