import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSyncEngine, type SyncEngine } from '../SyncEngine';
import {
    TOAST_SPACING_MS,
    buildEpoch,
    buildPlanPush,
    buildSnapshot,
    buildSnapshotWrites,
    type DcaPlanSnapshot,
    type PetSnapshot,
} from '../protocol';

const KEY_PENDING_FILLS = 'finagotchi-dca-sync:pending-fills';

const NOW_MS = 1_780_000_000_000; // epoch 1780000000

const PET: PetSnapshot = {
    stage: 'egg',
    streak: 5,
    mood: 2,
    item: 0,
    points: 750,
    happy: 100,
    subStage: 1,
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
];

interface Harness {
    engine: SyncEngine;
    writes: { cmd: string; at: number }[];
    storage: Map<string, string>;
    commands: () => string[];
}

function makeHarness(now: () => number): Harness {
    const writes: { cmd: string; at: number }[] = [];
    const storage = new Map<string, string>();
    const engine = createSyncEngine({
        write: async (cmd) => {
            writes.push({ cmd, at: now() });
        },
        storage: {
            getItem: async (key) => storage.get(key) ?? null,
            setItem: async (key, value) => {
                storage.set(key, value);
            },
        },
        now,
    });
    return { engine, writes, storage, commands: () => writes.map((w) => w.cmd) };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('onConnect write sequence', () => {
    it('writes snapshot → epoch → dca:count → dca:plan, byte-for-byte vs the builders', async () => {
        const { engine, commands } = makeHarness(() => NOW_MS);

        await engine.onConnect({ pet: PET, plans: PLANS, mtuPayload: 125 });

        expect(commands()).toEqual([
            buildSnapshot(PET),
            buildEpoch(1_780_000_000),
            ...buildPlanPush(PLANS),
        ]);
        // Pinned payload strings (frozen contract).
        expect(commands()).toEqual([
            'egg:5:2:0:750:100:1',
            'epoch:1780000000',
            'dca:count:1',
            'dca:plan:0:1:1780086400:0.25:SPYX:3:1.5',
        ]);
    });

    it('hash-skips the plan push when plans are unchanged, rewrites on change', async () => {
        const { engine, writes, commands } = makeHarness(() => NOW_MS);

        await engine.onConnect({ pet: PET, plans: PLANS, mtuPayload: 125 });
        writes.length = 0;

        // Unchanged plans: snapshot + epoch are re-written, no dca: lines.
        await engine.onConnect({ pet: PET, plans: PLANS, mtuPayload: 125 });
        expect(commands()).toEqual([buildSnapshot(PET), buildEpoch(1_780_000_000)]);
        expect(commands().some((cmd) => cmd.startsWith('dca:'))).toBe(false);

        // Changed plans: full dca:count + dca:plan rewrite.
        writes.length = 0;
        const changed: DcaPlanSnapshot[] = [{ ...PLANS[0], buys: 4, holdings: 1.75 }];
        await engine.onConnect({ pet: PET, plans: changed, mtuPayload: 125 });
        expect(commands()).toEqual([
            buildSnapshot(PET),
            buildEpoch(1_780_000_000),
            ...buildPlanPush(changed),
        ]);
    });

    it('falls back to split writes on the 20-byte ATT payload, never truncating', async () => {
        const pet: PetSnapshot = { ...PET, stage: 'coinling' }; // 22-byte snapshot
        const { engine, commands } = makeHarness(() => NOW_MS);

        await engine.onConnect({ pet, plans: [], mtuPayload: 20 });

        expect(buildSnapshot(pet)).toBe('coinling:5:2:0:750:100:1');
        expect(commands().slice(0, 4)).toEqual([
            'coinling:5:2:0',
            'points:750',
            'happy:100',
            'substage:1',
        ]);
        expect(commands().slice(0, 4)).toEqual(buildSnapshotWrites(pet, 20));
        // No truncated full snapshot ever reaches the device.
        expect(commands()).not.toContain('coinling:5:2:0:750:100:1');
        expect(commands().every((cmd) => cmd.length <= 20 || cmd.startsWith('dca:'))).toBe(
            true
        );
    });
});

describe('missed fill replay', () => {
    it('queues fills while disconnected and replays them spaced ≥ 800ms on reconnect', async () => {
        vi.useFakeTimers();
        try {
            vi.setSystemTime(NOW_MS);
            const { engine, writes, storage, commands } = makeHarness(() => Date.now());

            await engine.onFill({ ticker: 'SPYX', buys: 1 });
            await engine.onFill({ ticker: 'QQQX', buys: 2 });
            expect(writes).toEqual([]); // nothing written while offline

            const connect = engine.onConnect({ pet: PET, plans: PLANS, mtuPayload: 125 });
            await vi.advanceTimersByTimeAsync(TOAST_SPACING_MS * 2 + 100);
            await connect;

            const hits = writes.filter((w) => w.cmd.startsWith('dca:hit:'));
            expect(hits.map((w) => w.cmd)).toEqual(['dca:hit:1:SPYX', 'dca:hit:2:QQQX']);
            expect(hits[1].at - hits[0].at).toBeGreaterThanOrEqual(TOAST_SPACING_MS);

            // Queue drained; a second connect does not re-replay.
            expect(storage.get(KEY_PENDING_FILLS)).toBe('[]');
            writes.length = 0;
            await engine.onConnect({ pet: PET, plans: PLANS, mtuPayload: 125 });
            expect(commands().some((cmd) => cmd.startsWith('dca:hit:'))).toBe(false);
        } finally {
            vi.useRealTimers();
        }
    });

    it('writes immediately and queues nothing when connected', async () => {
        const { engine, writes, storage, commands } = makeHarness(() => NOW_MS);
        await engine.onConnect({ pet: PET, plans: PLANS, mtuPayload: 125 });
        writes.length = 0;

        await engine.onFill({ ticker: 'SPYX', buys: 4 });

        expect(commands()).toEqual(['dca:hit:4:SPYX']);
        expect(storage.has(KEY_PENDING_FILLS)).toBe(false);
    });
});

describe('plan rewrites and device-state reconciliation', () => {
    it('onPlansChanged always rewrites in full, even when identical', async () => {
        const { engine, writes, commands } = makeHarness(() => NOW_MS);
        await engine.onConnect({ pet: PET, plans: PLANS, mtuPayload: 125 });
        writes.length = 0;

        await engine.onPlansChanged(PLANS);

        expect(commands()).toEqual(buildPlanPush(PLANS));
    });

    it('onDeviceState ignores echoes, re-pushes on divergence exactly once', async () => {
        const { engine, writes, commands } = makeHarness(() => NOW_MS);
        await engine.onConnect({ pet: PET, plans: PLANS, mtuPayload: 125 });
        writes.length = 0;

        // Echo of the last pushed snapshot: no writes.
        await engine.onDeviceState('egg:5:2:0:750:100:1');
        expect(commands()).toEqual([]);

        // Genuine device-side change: the app (authoritative) re-pushes once.
        await engine.onDeviceState('egg:5:1:0:750:100');
        expect(commands()).toEqual([buildSnapshot(PET)]);

        // The device echoing the re-push must not start a loop.
        writes.length = 0;
        await engine.onDeviceState('egg:5:2:0:750:100:1');
        expect(commands()).toEqual([]);
    });
});

describe('validation', () => {
    it('skips invalid plan pushes without throwing; surrounding writes land', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { engine, commands } = makeHarness(() => NOW_MS);

        await engine.onConnect({
            pet: PET,
            plans: [{ ...PLANS[0], ticker: 'TOOLONG' }],
            mtuPayload: 125,
        });

        expect(commands()).toEqual([buildSnapshot(PET), buildEpoch(1_780_000_000)]);
        expect(commands().some((cmd) => cmd.startsWith('dca:'))).toBe(false);

        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const lower = makeHarness(() => NOW_MS);
        await lower.engine.onConnect({
            pet: PET,
            plans: [{ ...PLANS[0], ticker: 'spyx' }],
            mtuPayload: 125,
        });
        expect(lower.commands()).toEqual([buildSnapshot(PET), buildEpoch(1_780_000_000)]);
    });

    it('skips an invalid fill toast without throwing', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { engine, writes, commands } = makeHarness(() => NOW_MS);
        await engine.onConnect({ pet: PET, plans: PLANS, mtuPayload: 125 });
        writes.length = 0;

        await engine.onFill({ ticker: 'toolong', buys: 1 });

        expect(commands()).toEqual([]);
    });
});

describe('disconnect and sync status', () => {
    it('sends nothing on disconnect and reports the offline label from the last sync', async () => {
        let nowMs = NOW_MS;
        const { engine, writes } = makeHarness(() => nowMs);

        await engine.onConnect({ pet: PET, plans: PLANS, mtuPayload: 125 });
        writes.length = 0;

        engine.onDisconnect();
        expect(writes).toEqual([]);

        const status = engine.getSyncStatus();
        expect(status.connected).toBe(false);
        expect(status.lastSyncedAt).toBe(NOW_MS);

        nowMs += 30 * 1000; // 30s ago
        expect(engine.getSyncStatus().offlineLabel).toBe(
            'device offline, last synced just now'
        );

        nowMs += 12 * 60 * 1000; // 12m30s ago
        expect(engine.getSyncStatus().offlineLabel).toBe(
            'device offline, last synced 12m ago'
        );
    });
});
