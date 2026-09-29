import { describe, expect, it } from 'vitest';

import {
    buildBalanceRows,
    formatTokenAmount,
    formatUsd,
    totalUsdValue,
} from '../balances';
import { SUPPORTED_TOKENS, USDC_MINT } from '../../../services/dca/types';

const TSLAX_MINT = SUPPORTED_TOKENS.find((t) => t.ticker === 'TSLAX')!.mint;
const SPYX_MINT = SUPPORTED_TOKENS.find((t) => t.ticker === 'SPYX')!.mint;

describe('buildBalanceRows', () => {
    it('keeps SOL and USDC on top and ranks stocks by value', () => {
        const amountByMint = new Map<string, number>([
            [USDC_MINT, 25],
            [TSLAX_MINT, 1],
            [SPYX_MINT, 10],
        ]);
        const rows = buildBalanceRows(0.5, amountByMint, {
            SOL: 200,
            USDC: 1,
            TSLAX: 400,
            SPYX: 600,
        });

        expect(rows.map((row) => row.ticker)).toEqual([
            'SOL',
            'USDC',
            'SPYX', // 10 × 600 > 1 × 400
            'TSLAX',
        ]);
        expect(rows[0].usdValue).toBe(100);
        expect(rows[1].usdValue).toBe(25);
    });

    it('omits stocks with a zero balance and leaves unpriced rows null', () => {
        const amountByMint = new Map<string, number>([
            [TSLAX_MINT, 0],
            [SPYX_MINT, 2],
        ]);
        const rows = buildBalanceRows(0, amountByMint, {});

        expect(rows.map((row) => row.ticker)).toEqual(['SOL', 'USDC', 'SPYX']);
        expect(rows.every((row) => row.usdValue === null)).toBe(true);
    });
});

describe('totalUsdValue', () => {
    it('sums priced rows and ignores unpriced ones', () => {
        expect(
            totalUsdValue([
                { ticker: 'SOL', name: 'Solana', amount: 1, usdValue: 200 },
                { ticker: 'SPYX', name: 'S&P', amount: 1, usdValue: null },
                { ticker: 'USDC', name: 'USD Coin', amount: 5, usdValue: 5 },
            ])
        ).toBe(205);
    });

    it('is null when nothing is priced', () => {
        expect(
            totalUsdValue([
                { ticker: 'SOL', name: 'Solana', amount: 1, usdValue: null },
            ])
        ).toBeNull();
    });
});

describe('formatUsd', () => {
    it('groups thousands and keeps two decimals', () => {
        expect(formatUsd(1234.5)).toBe('$1,234.50');
        expect(formatUsd(0)).toBe('$0.00');
        expect(formatUsd(99.999)).toBe('$100.00');
    });
});

describe('formatTokenAmount', () => {
    it('trims trailing zeros', () => {
        expect(formatTokenAmount(2.5)).toBe('2.5');
        expect(formatTokenAmount(0.25)).toBe('0.25');
        expect(formatTokenAmount(0)).toBe('0');
    });

    it('uses more precision below 1', () => {
        expect(formatTokenAmount(0.123456)).toBe('0.1235');
        expect(formatTokenAmount(1)).toBe('1');
    });
});
