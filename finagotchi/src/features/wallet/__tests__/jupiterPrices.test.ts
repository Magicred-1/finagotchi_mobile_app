import { describe, expect, it } from 'vitest';

import { jupiterMintForTicker } from '../jupiterPrices';
import { SUPPORTED_TOKENS, USDC_MINT } from '../../../services/dca/types';

describe('jupiterMintForTicker', () => {
    it('prices SOL via the wrapped-SOL mint', () => {
        expect(jupiterMintForTicker('SOL')).toBe(
            'So11111111111111111111111111111111111111112'
        );
    });

    it('maps USDC and every supported xStock to its mint', () => {
        expect(jupiterMintForTicker('USDC')).toBe(USDC_MINT);
        for (const token of SUPPORTED_TOKENS) {
            expect(jupiterMintForTicker(token.ticker)).toBe(token.mint);
        }
    });

    it('returns null for unknown tickers', () => {
        expect(jupiterMintForTicker('BONK')).toBeNull();
        expect(jupiterMintForTicker('')).toBeNull();
    });
});
