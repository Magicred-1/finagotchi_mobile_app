import { describe, expect, it } from 'vitest';

import {
    isWifiResultLine,
    parseDeviceRequest,
    parseStateString,
    parseWifiResult,
} from '../../../features/ble/types';
import {
    buildDcaHit,
    buildDcaPlan,
    buildEpoch,
    buildPlanPush,
    buildSnapshot,
    buildSnapshotWrites,
    buildSolUsd,
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
        priceUsd: 685.5,
    },
    {
        ticker: 'QQQX',
        amount: 10,
        nextBuyEpoch: 1_780_000_000,
        buys: 0,
        holdings: 0,
        enabled: true,
        priceUsd: 0,
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

    it('always sends the 8th price_usd field (0 when unknown)', () => {
        expect(buildDcaPlan(0, PLANS[0])).toBe(
            'dca:plan:0:1:1780086400:0.25:SPYX:3:1.5:685.5'
        );
        expect(buildDcaPlan(1, PLANS[1])).toBe(
            'dca:plan:1:1:1780000000:10:QQQX:0:0:0'
        );
    });

    it('parses legacy 8-field lines with priceUsd 0', () => {
        expect(parseDcaPlanLine('dca:plan:0:1:1780086400:0.25:SPYX:3:1.5')).toEqual({
            index: 0,
            plan: { ...PLANS[0], priceUsd: 0 },
        });
    });
});

describe('solusd builder', () => {
    it('renders the SOL/USD rate as a plain float', () => {
        expect(buildSolUsd(212.74)).toBe('solusd:212.74');
        expect(buildSolUsd(85)).toBe('solusd:85');
        expect(() => buildSolUsd(-1)).toThrow();
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

describe('device request parser (BLE notify)', () => {
    it('parses <name>:req exactly, and dca:pause/dca:new with args', () => {
        expect(parseDeviceRequest('sync:req')).toEqual({ command: 'sync', args: [] });
        expect(parseDeviceRequest('feed:req')).toEqual({ command: 'feed', args: [] });
        expect(parseDeviceRequest('dca:req')).toEqual({ command: 'dca', args: [] });
        expect(parseDeviceRequest('dca:pause:2')).toEqual({
            command: 'dca:pause',
            args: ['2'],
        });
        expect(parseDeviceRequest('dca:new:SPYX:0.5:86400')).toEqual({
            command: 'dca:new',
            args: ['SPYX', '0.5', '86400'],
        });
    });

    it('leaves state snapshots and app→device commands to the state parser', () => {
        expect(parseDeviceRequest('coinling:3:1:2:12500:87')).toBeNull();
        expect(parseDeviceRequest('dca:count:2')).toBeNull();
        expect(
            parseDeviceRequest('dca:plan:0:1:1780086400:0.25:SPYX:3:1.5:685.5')
        ).toBeNull();
        expect(parseDeviceRequest('sync:request')).toBeNull();
    });
});

describe('wifi: join verdict lines (BLE notify)', () => {
    it('parses wifi:ok with the SSID (colons in the name kept intact)', () => {
        expect(isWifiResultLine('wifi:ok:HomeWifi')).toBe(true);
        expect(parseWifiResult('wifi:ok:HomeWifi')).toEqual({
            ok: true,
            ssid: 'HomeWifi',
        });
        expect(parseWifiResult('wifi:ok:My:Network')).toEqual({
            ok: true,
            ssid: 'My:Network',
        });
    });

    it('parses every documented wifi:fail code', () => {
        for (const code of ['ssid', 'auth', 'ip', 'off'] as const) {
            expect(parseWifiResult(`wifi:fail:${code}`)).toEqual({
                ok: false,
                code,
            });
        }
    });

    it('ignores malformed wifi: lines and never misparses them as pet state', () => {
        for (const bad of [
            'wifi:',
            'wifi:ok:',
            'wifi:fail',
            'wifi:fail:bogus',
            'wifi:something:else',
        ]) {
            expect(isWifiResultLine(bad)).toBe(true);
            expect(parseWifiResult(bad)).toBeNull();
        }
        // Routing guard: wifi: lines are neither device requests nor valid
        // pet state for the notification handler's purposes.
        expect(parseDeviceRequest('wifi:ok:HomeWifi')).toBeNull();
        expect(parseStateString('wifi:ok:HomeWifi')).toMatchObject({
            stage: 'wifi',
        });
        // …which is exactly why useBle.handleNotification checks the wifi:
        // prefix first and never forwards these lines to parseStateString.
    });

    it('does not confuse pet state with wifi: lines', () => {
        expect(isWifiResultLine('coinling:3:1:2:12500:87')).toBe(false);
        expect(parseWifiResult('coinling:3:1:2:12500:87')).toBeNull();
    });
});
