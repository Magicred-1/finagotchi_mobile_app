/**
 * DCA fill watcher — dependency-injected, transport-agnostic core.
 *
 * Polls Jupiter Trigger DCA orders (via the REST history API), records fills
 * into the PlanStore, feeds the pet loop, and emits events (pet dance / BLE
 * dca:hit writes are downstream subscribers). Network, wallet, and clock
 * dependencies are injectable or lazily imported so vitest can drive the
 * core without React Native.
 */

import { useEffect } from 'react';

import { usePlanStore } from './PlanStore';
import type { PlanOrderSnapshot } from './JupiterDcaClient';
import { tokenByMint, type DcaPlan, type DcaPlanStatus } from './types';

export interface DcaHitEvent {
    planId: string;
    ticker: string;
    /** Total buys on the plan after this fill. */
    buys: number;
    /** Output tokens attributed to this fill. */
    holdingsDelta: number;
}

export interface OverdueChangeEvent {
    planId: string;
    overdue: boolean;
}

type DcaEventMap = {
    dcaHit: DcaHitEvent;
    overdueChange: OverdueChangeEvent;
};

export type DcaEventName = keyof DcaEventMap;

export interface DcaEmitter {
    on<E extends DcaEventName>(
        event: E,
        cb: (payload: DcaEventMap[E]) => void
    ): () => void;
    emit<E extends DcaEventName>(event: E, payload: DcaEventMap[E]): void;
}

export function createDcaEmitter(): DcaEmitter {
    const listeners = new Map<DcaEventName, Set<(payload: never) => void>>();
    return {
        on(event, cb) {
            let set = listeners.get(event);
            if (!set) {
                set = new Set();
                listeners.set(event, set);
            }
            set.add(cb as (payload: never) => void);
            return () => {
                set.delete(cb as (payload: never) => void);
            };
        },
        emit(event, payload) {
            listeners.get(event)?.forEach((cb) => {
                (cb as (p: typeof payload) => void)(payload);
            });
        },
    };
}

export const dcaEvents = createDcaEmitter();

export interface DcaFill {
    planId: string;
    ticker: string;
    /** USDC spent in this fill. */
    amountUsdc: number;
    /** Total buys on the plan after this fill. */
    buys: number;
    /** Output tokens attributed to this fill. */
    holdingsDelta: number;
}

/**
 * A DCA fill is a verified on-chain action feeding the existing pet loop:
 * points bump + XP + happiness + Care Clock refill. The pet store is imported
 * lazily so this module stays loadable without React Native.
 */
export function defaultFeed(_fill: DcaFill): void {
    void import('../../features/pet/store').then(({ usePetStore }) => {
        const pet = usePetStore.getState();
        pet.addBalance(25);
        pet.addXp(10);
        pet.boostHappiness(10);
        pet.resetLifeTimer();
    });
}

/** Consecutive misses at which a plan is considered overdue. */
export const OVERDUE_THRESHOLD = 3;

/** Retry backoff per consecutive miss: 5 min, 30 min, 2 h (then stays at 2 h). */
const MISS_BACKOFF_MS = [5 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000];

/** Overdue is derived from missedCount; plan status is never auto-changed. */
export function isOverdue(plan: DcaPlan): boolean {
    return plan.status === 'active' && plan.missedCount >= OVERDUE_THRESHOLD;
}

/**
 * Trigger order states that end a plan's active polling. 'cancelled' maps to
 * 'paused' (the unfilled remainder was returned to the wallet — the Pause
 * UX); 'deposit_failed' is the only state that may mark a plan 'failed'.
 */
const TERMINAL_PLAN_STATUS: Record<string, DcaPlanStatus> = {
    completed: 'complete',
    cancelled: 'paused',
    deposit_failed: 'failed',
};

export type FetchAccount = (plan: DcaPlan) => Promise<PlanOrderSnapshot | null>;

const defaultFetchAccount: FetchAccount = async (plan) => {
    if (!plan.dcaAccountPubkey) return null;
    const [{ fetchPlanOrder }, { useWalletStore }, { signMessageWithWallet }] =
        await Promise.all([
            import('./JupiterDcaClient'),
            import('../../features/wallet/store'),
            import('../../wallet/useWallet'),
        ]);
    const walletPubkey = useWalletStore.getState().address;
    if (!walletPubkey) {
        throw new Error('dca: wallet not connected');
    }
    return fetchPlanOrder({
        walletPubkey,
        orderId: plan.dcaAccountPubkey,
        signMessage: signMessageWithWallet,
    });
};

export interface FillWatcherDeps {
    fetchAccount?: FetchAccount;
    feed?: (fill: DcaFill) => void;
    emit?: DcaEmitter;
    /** Wall clock in ms. */
    now?: () => number;
}

export interface FillWatcher {
    poll: () => Promise<void>;
    /** Earliest time (ms) the plan may be polled again; null when not backing off. */
    nextRetryAt: (planId: string) => number | null;
}

export function createFillWatcher(deps: FillWatcherDeps = {}): FillWatcher {
    const fetchAccount = deps.fetchAccount ?? defaultFetchAccount;
    const feed = deps.feed ?? defaultFeed;
    const emit = deps.emit ?? dcaEvents;
    const now = deps.now ?? Date.now;

    const retryAtByPlan = new Map<string, number>();

    function registerMiss(plan: DcaPlan): void {
        const missedCount = plan.missedCount + 1;
        usePlanStore.getState().setMissed(plan.id, missedCount);
        const backoff =
            MISS_BACKOFF_MS[Math.min(missedCount - 1, MISS_BACKOFF_MS.length - 1)];
        retryAtByPlan.set(plan.id, now() + backoff);
        if (missedCount >= OVERDUE_THRESHOLD && plan.missedCount < OVERDUE_THRESHOLD) {
            emit.emit('overdueChange', { planId: plan.id, overdue: true });
        }
    }

    function resolveMisses(plan: DcaPlan): void {
        retryAtByPlan.delete(plan.id);
        if (plan.missedCount === 0) return;
        const wasOverdue = plan.missedCount >= OVERDUE_THRESHOLD;
        usePlanStore.getState().setMissed(plan.id, 0);
        if (wasOverdue) {
            emit.emit('overdueChange', { planId: plan.id, overdue: false });
        }
    }

    async function pollPlan(plan: DcaPlan): Promise<void> {
        let order: PlanOrderSnapshot | null;
        try {
            order = await fetchAccount(plan);
        } catch {
            // Network/auth failure: never changes plan status, just backs off.
            registerMiss(plan);
            return;
        }

        if (order === null) {
            // Order not found / not owned. Unlike a closed on-chain account
            // this says nothing about completion — treat it as a miss.
            registerMiss(plan);
            return;
        }

        const terminal = TERMINAL_PLAN_STATUS[order.state] ?? null;
        const decimals = tokenByMint(plan.outputMint)?.decimals ?? 8;
        const spentTotal = order.inputAmountUsed;
        const holdingsTotal = order.outputAmountTotal / 10 ** decimals;
        const nextExecutionAt = terminal ? null : order.nextFillAt;
        // Buys come straight from the API's roundsFilled counter, so refills
        // or partial rounds can never double-count a fill.
        const onChainBuys = order.roundsFilled;

        const hadFills = onChainBuys > plan.buys;
        if (hadFills) {
            const newFills = onChainBuys - plan.buys;
            // Order totals can't attribute output per round; split the
            // observed delta evenly across the fills we missed.
            const perFillDelta = (holdingsTotal - plan.holdingsHeld) / newFills;
            for (let i = 0; i < newFills; i++) {
                usePlanStore.getState().recordFill(plan.id, {
                    spentTotal,
                    holdingsTotal,
                    nextExecutionAt,
                });
                const buys = plan.buys + i + 1;
                const fill: DcaFill = {
                    planId: plan.id,
                    ticker: plan.ticker,
                    amountUsdc: order.amountPerRound,
                    buys,
                    holdingsDelta: perFillDelta,
                };
                feed(fill);
                emit.emit('dcaHit', {
                    planId: plan.id,
                    ticker: plan.ticker,
                    buys,
                    holdingsDelta: perFillDelta,
                });
            }
        } else {
            usePlanStore.getState().updatePlan(plan.id, { nextExecutionAt });
        }

        if (terminal) {
            usePlanStore.getState().setStatus(plan.id, terminal);
        }

        // A round a full interval past its deadline with no observed fill
        // counts as a miss; any fresh successful poll clears the count.
        const stale =
            !terminal &&
            nextExecutionAt !== null &&
            now() / 1000 > nextExecutionAt + plan.intervalSec;
        if (!hadFills && stale) {
            registerMiss(plan);
        } else {
            resolveMisses(plan);
        }
    }

    return {
        async poll() {
            const plans = usePlanStore
                .getState()
                .getActivePlans()
                .filter((plan) => plan.dcaAccountPubkey !== null);
            for (const plan of plans) {
                const retryAt = retryAtByPlan.get(plan.id);
                if (retryAt !== undefined && now() < retryAt) continue;
                // Re-read after each await: earlier polls mutate the store.
                const fresh = usePlanStore
                    .getState()
                    .plans.find((p) => p.id === plan.id);
                if (fresh && fresh.status === 'active' && fresh.dcaAccountPubkey) {
                    await pollPlan(fresh);
                }
            }
        },

        nextRetryAt(planId) {
            return retryAtByPlan.get(planId) ?? null;
        },
    };
}

let defaultWatcher: FillWatcher | null = null;

export function getDefaultFillWatcher(): FillWatcher {
    if (!defaultWatcher) {
        defaultWatcher = createFillWatcher();
    }
    return defaultWatcher;
}

export const FILL_POLL_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Polls once on mount, again whenever the app returns to the foreground, and
 * on a 15-minute interval. Per-plan backoff is honored inside poll(). The
 * default fetcher reads the wallet address from the wallet store and signs
 * JWT challenges with signMessageWithWallet. Mount once at the app root.
 */
export function useFillWatcher(): void {
    useEffect(() => {
        const watcher = getDefaultFillWatcher();
        void watcher.poll();

        let cancelled = false;
        let subscription: { remove: () => void } | null = null;

        const interval = setInterval(() => {
            void watcher.poll();
        }, FILL_POLL_INTERVAL_MS);

        // Lazy import keeps the core module loadable without react-native.
        void import('react-native').then(({ AppState }) => {
            if (cancelled) return;
            subscription = AppState.addEventListener('change', (state) => {
                if (state === 'active') {
                    void watcher.poll();
                }
            });
        });

        return () => {
            cancelled = true;
            clearInterval(interval);
            subscription?.remove();
        };
    }, []);
}
