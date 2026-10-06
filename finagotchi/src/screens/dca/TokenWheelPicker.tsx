import React, { useMemo } from 'react';

import type { SupportedToken } from '../../services/dca';
import { WheelPicker, type WheelItem } from './WheelPicker';
import { formatChange, formatPrice, type TokenQuote } from './prices';
import { TokenLogo } from './TokenLogo';

type Props = {
    tokens: SupportedToken[];
    /** Currently selected ticker (null = nothing chosen yet). */
    selectedTicker: string | null;
    /** Live quotes keyed by mint, from useTokenPrices. */
    quotes: Record<string, TokenQuote>;
    /** Centered row changed (scroll settle or tap-to-center). */
    onSelect: (ticker: string) => void;
    /** The already-selected center row was tapped — confirm the pick. */
    onConfirm: (ticker: string) => void;
    /**
     * Explicit drum height (fills the wizard step). Defaults to the 5-row
     * window. See WheelPicker.
     */
    height?: number;
};

/**
 * Token drum for the wizard's pick step: maps tokens + live quotes onto the
 * generic WheelPicker (logo leading, price + 24h change trailing).
 */
export function TokenWheelPicker({
    tokens,
    selectedTicker,
    quotes,
    onSelect,
    onConfirm,
    height,
}: Props) {
    const items = useMemo<WheelItem[]>(
        () =>
            tokens.map((token) => {
                const quote = quotes[token.mint];
                return {
                    id: token.ticker,
                    title: token.ticker,
                    subtitle: token.name,
                    leading: <TokenLogo ticker={token.ticker} size={32} />,
                    trailingTitle: quote ? formatPrice(quote.price) : '–',
                    trailingSubtitle: quote
                        ? formatChange(quote.change24h)
                        : undefined,
                    trailingUp: (quote?.change24h ?? 0) >= 0,
                };
            }),
        [tokens, quotes]
    );

    return (
        <WheelPicker
            items={items}
            selectedId={selectedTicker}
            onSelect={onSelect}
            onConfirm={onConfirm}
            height={height}
        />
    );
}
