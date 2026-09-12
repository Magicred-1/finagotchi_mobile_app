import { describe, expect, it } from 'vitest';

import { parseStateString } from '../../../features/ble/types';
import {
    buildDcaHit,
    buildDcaPlan,
    buildEpoch,
    buildPlanPush,
    buildSnapshot,
    buildSnapshotWrites,
    formatAmount,
    parseDcaHitLine,
    parseDcaPlanLine,
    type DcaPlanSnapshot,
    type PetSnapshot,
} from '../protocol';

const PET: PetSnapshot = {
    stage: 'whale',
    streak: 12,
    mood: 4,
    item: 3,
    points: 9000,
    happy: 87,
};

const PLANS: DcaPlanSnapshot[] = [
    {
        ticker: 'SPYX',
        amount: 0.25,
        nextBuyEpoch: 1_780_086_400,
        buys: 3,
        holdings: 1.5,
        enabled: true,
    },
    {
        ticker: 'QQQX',
        amount: 10,
        nextBuyEpoch: 1_780_000_000,
        buys: 0,
        holdings: 0,
        enabled: true,
    },
];

describe('pet snapshot round-trip (BLE notify parser)', () => {
    it('buildSnapshot → parseStateString returns the same fields', () => {
        const parsed = parseStateString(buildSnapshot(PET));
        expect(parsed).toEqual({
            stage: 'whale',
            streak: 12,
            mood: 4,
            item: 3,
            points: 9000,
            happy: 87,
        });
    });

    it('split-fallback parts stay parseable (4-field head + points:/happy: lines)', () => {
        const small: PetSnapshot = {
            stage: 'coinling',
            streak: 5,
            mood: 2,
            item: 0,
            points: 750,
            happy: 100,
        };
        const [head, pointsLine, happyLine] = buildSnapshotWrites(small, 20);
        expect(parseStateString(head)).toMatchObject({
            stage: 'coinling',
            streak: 5,
            mood: 2,
            item: 0,
        });
        expect(pointsLine).toBe('points:750');
        expect(happyLine).toBe('happy:100');
    });
});

describe('dca:plan round-trip', () => {
    it('buildPlanPush → parseDcaPlanLine deep-equals the originals', () => {
        const lines = buildPlanPush(PLANS);
        expect(lines[0]).toBe('dca:count:2');
        const parsed = lines.slice(1).map((line) => parseDcaPlanLine(line));
        expect(parsed[0]).toEqual({ index: 0, plan: PLANS[0] });
        expect(parsed[1]).toEqual({ index: 1, plan: PLANS[1] });
    });
});

describe('edge validation', () => {
    it('buildDcaPlan rejects bad tickers and exponent-requiring amounts', () => {
        expect(() => buildDcaPlan(0, { ...PLANS[0], ticker: 'TOOLONG' })).toThrow(/ticker/);
        expect(() => buildDcaPlan(0, { ...PLANS[0], ticker: 'spyx' })).toThrow(/ticker/);
        expect(() => buildDcaPlan(0, { ...PLANS[0], amount: 1e-7 })).toThrow(/plain float/);
        expect(() => buildDcaPlan(0, { ...PLANS[0], amount: 1e12 })).toThrow(/plain float/);
        expect(() => buildDcaPlan(0, { ...PLANS[0], holdings: -1 })).toThrow();
    });

    it('buildEpoch rejects values outside uint32', () => {
        expect(() => buildEpoch(0x1_00_00_00_00)).toThrow(/uint32/);
        expect(() => buildEpoch(-1)).toThrow(/uint32/);
        expect(() => buildEpoch(1.5)).toThrow(/uint32/);
        expect(buildEpoch(0xffffffff)).toBe('epoch:4294967295');
    });

    it('formatAmount renders plain floats and trims trailing zeros', () => {
        expect(formatAmount(0.25)).toBe('0.25');
        expect(formatAmount(10)).toBe('10');
        expect(formatAmount(0)).toBe('0');
        expect(formatAmount(0.5)).toBe('0.5');
        expect(formatAmount(1.23)).toBe('1.23');
        expect(formatAmount(2.1)).toBe('2.1');
    });
});

describe('dca:hit round-trip', () => {
    it('buildDcaHit → parseDcaHitLine returns the same fields', () => {
        expect(parseDcaHitLine(buildDcaHit(3, 'SPYX'))).toEqual({
            buys: 3,
            ticker: 'SPYX',
        });
        expect(buildDcaHit(3, 'SPYX')).toBe('dca:hit:3:SPYX');
        expect(parseDcaHitLine('dca:plan:0:1:2:3:SPYX:4:5')).toBeNull();
    });
});
