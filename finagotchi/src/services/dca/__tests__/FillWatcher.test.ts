import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    OVERDUE_THRESHOLD,
    createDcaEmitter,
    createFillWatcher,
    dcaEvents,
    isOverdue,
    type DcaFill,
    type DcaHitEvent,
    type OverdueChangeEvent,
} from '../FillWatcher';
import type { PlanOrderSnapshot } from '../JupiterDcaClient';
import { usePlanStore } from '../PlanStore';
import { SUPPORTED_TOKENS, type DcaPlan } from '../types';

const SPYX = SUPPORTED_TOKENS.find((t) => t.ticker === 'SPYX')!; // 8 decimals

/** Fresh clock: below nextFillAt + intervalSec so polls never read stale. */
const NOW_MS = 1_780_000_000_000;
const NEXT_FILL_AT = 1_780_172_800;

function seedPlan(overrides: Partial<DcaPlan> = {}): DcaPlan {
    const plan: DcaPlan = {
        id: 'plan-1',
        outputMint: SPYX.mint,
        ticker: 'SPYX',
        amountPerTick: 10,
        intervalSec: 604_800,
        totalBudget: 50,
        spent: 0,
        buys: 0,
        holdingsHeld: 0,
        nextExecutionAt: 1_780_000_000,
        status: 'active',
        dcaAccountPubkey: 'order-uuid-1',
        missedCount: 0,
        createdAt: new Date(0).toISOString(),
        ...overrides,
    };
    usePlanStore.setState({ plans: [plan], fills: [] });
    return plan;
}

function getPlan(id = 'plan-1'): DcaPlan {
    return usePlanStore.getState().plans.find((p) => p.id === id)!;
}

function orderSnapshot(overrides: Partial<PlanOrderSnapshot> = {}): PlanOrderSnapshot {
    return {
        state: 'active',
        roundsFilled: 1,
        numberOfRounds: 5,
        inputAmountUsed: 10,
        inputAmountInitial: 50,
        // 0.0004 SPYX in base units (8 decimals).
        outputAmountTotal: 40_000,
        amountPerRound: 10,
        nextFillAt: NEXT_FILL_AT,
        lastFillAt: 1_780_000_000,
        ...overrides,
    };
}

beforeEach(() => {
    usePlanStore.setState({ plans: [], fills: [] });
});

describe('fill detection', () => {
    it('maps the first fill onto the plan and emits one dcaHit', async () => {
        seedPlan();
        const feed = vi.fn();
        const emit = createDcaEmitter();
        const hits: DcaHitEvent[] = [];
        emit.on('dcaHit', (e) => hits.push(e));
        const fetchAccount = vi.fn(async () => orderSnapshot());

        const watcher = createFillWatcher({
            fetchAccount,
            feed,
            emit,
            now: () => NOW_MS,
        });
        await watcher.poll();

        const plan = getPlan();
        expect(plan.buys).toBe(1);
        expect(plan.spent).toBe(10);
        // 40000 base units / 10^8.
        expect(plan.holdingsHeld).toBeCloseTo(0.0004, 10);
        expect(plan.nextExecutionAt).toBe(NEXT_FILL_AT);
        expect(plan.status).toBe('active');

        expect(feed).toHaveBeenCalledTimes(1);
        expect(feed.mock.calls[0][0]).toMatchObject({
            planId: 'plan-1',
            ticker: 'SPYX',
            amountUsdc: 10,
            buys: 1,
        });
        expect(feed.mock.calls[0][0].holdingsDelta).toBeCloseTo(0.0004, 10);

        expect(hits).toHaveLength(1);
        expect(hits[0]).toMatchObject({ planId: 'plan-1', ticker: 'SPYX', buys: 1 });

        expect(usePlanStore.getState().fills).toHaveLength(1);
        expect(usePlanStore.getState().fills[0].buysAfter).toBe(1);
    });

    it('counts a second fill once and never double-counts a re-poll', async () => {
        seedPlan();
        const feed = vi.fn();
        let snapshot = orderSnapshot({ roundsFilled: 1, inputAmountUsed: 10 });
        const watcher = createFillWatcher({
            fetchAccount: async () => snapshot,
            feed,
            emit: createDcaEmitter(),
            now: () => NOW_MS,
        });

        await watcher.poll();
        expect(getPlan().buys).toBe(1);

        snapshot = orderSnapshot({
            roundsFilled: 2,
            inputAmountUsed: 20,
            outputAmountTotal: 80_000,
        });
        await watcher.poll();
        expect(getPlan().buys).toBe(2);
        expect(getPlan().spent).toBe(20);
        expect(feed).toHaveBeenCalledTimes(2);

        // Same data again: no new fill, no feed, no extra history record.
        await watcher.poll();
        expect(getPlan().buys).toBe(2);
        expect(feed).toHaveBeenCalledTimes(2);
        expect(usePlanStore.getState().fills).toHaveLength(2);
    });

    it('catches up multi-fill gaps in recordFill → feed → emit order per fill', async () => {
        seedPlan();
        const sequence: string[] = [];
        const feed = vi.fn((fill: DcaFill) => {
            // recordFill must already be applied when the pet loop is fed.
            expect(getPlan(fill.planId).buys).toBe(fill.buys);
            sequence.push(`feed:${fill.buys}`);
        });
        const emit = createDcaEmitter();
        emit.on('dcaHit', ({ buys }) => sequence.push(`emit:${buys}`));

        const watcher = createFillWatcher({
            fetchAccount: async () =>
                orderSnapshot({
                    roundsFilled: 3,
                    inputAmountUsed: 30,
                    // 0.0012 SPYX total → 0.0004 attributed per missed fill.
                    outputAmountTotal: 120_000,
                }),
            feed,
            emit,
            now: () => NOW_MS,
        });
        await watcher.poll();

        expect(sequence).toEqual([
            'feed:1',
            'emit:1',
            'feed:2',
            'emit:2',
            'feed:3',
            'emit:3',
        ]);
        expect(getPlan().buys).toBe(3);
        expect(getPlan().spent).toBe(30);
        expect(getPlan().holdingsHeld).toBeCloseTo(0.0012, 10);
        for (const call of feed.mock.calls) {
            expect(call[0].holdingsDelta).toBeCloseTo(0.0004, 10);
        }
        expect(usePlanStore.getState().fills).toHaveLength(3);
    });

    it.each([
        ['completed', 'complete'],
        ['cancelled', 'paused'],
        ['deposit_failed', 'failed'],
    ] as const)('maps terminal order state %s → plan status %s', async (state, status) => {
        seedPlan();
        const watcher = createFillWatcher({
            fetchAccount: async () =>
                orderSnapshot({
                    state,
                    roundsFilled: 5,
                    inputAmountUsed: 50,
                    outputAmountTotal: 200_000,
                    nextFillAt: null,
                }),
            feed: vi.fn(),
            emit: createDcaEmitter(),
            now: () => NOW_MS,
        });
        await watcher.poll();

        const plan = getPlan();
        expect(plan.status).toBe(status);
        expect(plan.nextExecutionAt).toBeNull();
        expect(plan.buys).toBe(5);

        // Terminal plans leave the active set: a later poll refetches nothing.
        const fetchAccount = vi.fn(async () => orderSnapshot());
        const second = createFillWatcher({
            fetchAccount,
            feed: vi.fn(),
            emit: createDcaEmitter(),
            now: () => NOW_MS,
        });
        await second.poll();
        expect(fetchAccount).not.toHaveBeenCalled();
    });
});

describe('miss accounting', () => {
    it('null/throw polls increment missedCount, trip overdue at the threshold, and recover', async () => {
        seedPlan();
        let nowMs = NOW_MS;
        const emit = createDcaEmitter();
        const overdueEvents: OverdueChangeEvent[] = [];
        emit.on('overdueChange', (e) => overdueEvents.push(e));
        const fetchAccount = vi.fn(async (): Promise<PlanOrderSnapshot | null> => null);
        const watcher = createFillWatcher({
            fetchAccount,
            feed: vi.fn(),
            emit,
            now: () => nowMs,
        });

        await watcher.poll();
        expect(getPlan().missedCount).toBe(1);
        expect(watcher.nextRetryAt('plan-1')).toBeGreaterThan(nowMs);

        // A throwing fetcher is the same kind of miss.
        fetchAccount.mockRejectedValueOnce(new Error('network down'));
        nowMs += 6 * 60 * 1000; // past the 5-minute backoff
        await watcher.poll();
        expect(getPlan().missedCount).toBe(2);
        expect(isOverdue(getPlan())).toBe(false);

        nowMs += 31 * 60 * 1000; // past the 30-minute backoff
        await watcher.poll();
        expect(getPlan().missedCount).toBe(OVERDUE_THRESHOLD);
        expect(isOverdue(getPlan())).toBe(true);
        expect(overdueEvents).toEqual([{ planId: 'plan-1', overdue: true }]);
        // Fetch failures NEVER change plan status.
        expect(getPlan().status).toBe('active');

        // A fresh successful poll clears the count and emits the recovery.
        fetchAccount.mockResolvedValue(orderSnapshot({ roundsFilled: 0 }));
        nowMs += 3 * 60 * 60 * 1000; // past the 2-hour backoff
        await watcher.poll();
        expect(getPlan().missedCount).toBe(0);
        expect(isOverdue(getPlan())).toBe(false);
        expect(overdueEvents).toEqual([
            { planId: 'plan-1', overdue: true },
            { planId: 'plan-1', overdue: false },
        ]);
        expect(getPlan().status).toBe('active');
    });

    it('a stale round with no new fill counts as a miss; a fresh poll clears it', async () => {
        seedPlan();
        let nowMs = (1_780_000_000 + 604_800 + 1) * 1000; // 1s past the deadline
        const emit = createDcaEmitter();
        const feed = vi.fn();
        // Second poll returns a rescheduled (future) nextFillAt, as the keeper
        // would once the round lands back on track.
        let nextFillAt = 1_780_000_000;
        const watcher = createFillWatcher({
            fetchAccount: async () =>
                orderSnapshot({ roundsFilled: 0, nextFillAt }),
            feed,
            emit,
            now: () => nowMs,
        });

        await watcher.poll();
        expect(feed).not.toHaveBeenCalled();
        expect(getPlan().missedCount).toBe(1);

        nextFillAt = 1_780_700_000;
        nowMs += 6 * 60 * 1000; // past the 5-minute backoff, inside the new window
        await watcher.poll();
        expect(getPlan().missedCount).toBe(0);
        expect(getPlan().status).toBe('active');
    });
});

describe('event ordering contract', () => {
    it('a fill produces feed → dance → dca:hit-write in app subscription order', async () => {
        seedPlan();
        const order: string[] = [];
        // Mirrors app/(tabs)/index.tsx: the dance subscriber is registered
        // first, the SyncEngine BLE write second.
        const offDance = dcaEvents.on('dcaHit', () => order.push('dance'));
        const offBleWrite = dcaEvents.on('dcaHit', () => order.push('dca:hit-write'));
        try {
            const watcher = createFillWatcher({
                fetchAccount: async () => orderSnapshot(),
                feed: () => order.push('feed'),
                emit: dcaEvents,
                now: () => NOW_MS,
            });
            await watcher.poll();
            expect(order).toEqual(['feed', 'dance', 'dca:hit-write']);
        } finally {
            offDance();
            offBleWrite();
        }
    });
});
