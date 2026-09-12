import { useEffect, useState } from 'react';

import { SUPPORTED_TOKENS } from '../../services/dca/types';

export type TokenQuote = {
    price: number;
    /** 24h change in percent, e.g. 0.29 = +0.29%. */
    change24h: number;
};

const MINTS = SUPPORTED_TOKENS.map((token) => token.mint).join(',');

/**
 * Informational quotes for the xStocks grid/detail. Jupiter's lite price API
 * is keyless and returns usdPrice + priceChange24h per mint. Failures leave
 * the map empty; callers render "–" and never block on prices.
 */
export function useTokenPrices(enabled = true): Record<string, TokenQuote> {
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
                // Quotes stay "—"; they are informational only.
            });
        return () => {
            cancelled = true;
        };
    }, [enabled]);

    return quotes;
}

export function formatPrice(price: number): string {
    return `$${price >= 10 ? price.toFixed(2) : price.toFixed(4)}`;
}

export function formatChange(change24h: number): string {
    const sign = change24h > 0 ? '+' : '';
    return `${sign}${change24h.toFixed(2)}%`;
}
