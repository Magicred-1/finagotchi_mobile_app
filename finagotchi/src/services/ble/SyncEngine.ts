/**
 * DCA/epoch sync engine for the Finagotchi hardware contract.
 *
 * `createSyncEngine` is a dependency-injected core (no React Native, BLE, or
 * store imports) implementing contract §3 on top of the existing pet-state
 * sync: connect snapshot + clock sync + plan push (hash-skipped) + missed
 * fill replay, full plan rewrites on change, fill toasts, and device-state
 * reconciliation. All payloads go through protocol.ts builders — validation
 * errors are caught and logged, and the offending write is skipped so
 * invalid data never reaches the device.
 *
 * `useDcaSyncEngine` adapts the app stores and the BLE hook to the core;
 * RN/store imports are lazy so vitest can drive the core alone.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { FinagotchiBle } from '../../features/ble/types';
import type { DcaPlan } from '../dca/types';
import {
    DEFAULT_ATT_PAYLOAD,
    PROTOCOL_MTU,
    TOAST_SPACING_MS,
    buildDcaHit,
    buildEpoch,
    buildPlanPush,
    buildSnapshot,
    buildSnapshotWrites,
    buildSolUsd,
    planPushHash,
    type DcaPlanSnapshot,
    type PetSnapshot,
} from './protocol';

const KEY_PLAN_PUSH_HASH = 'finagotchi-dca-sync:plan-push-hash';
const KEY_PENDING_FILLS = 'finagotchi-dca-sync:pending-fills';
const KEY_LAST_SYNCED_AT = 'finagotchi-dca-sync:last-synced-at';

/** Minimum interval between price-driven plan-table rewrites while connected. */
const PRICE_REFRESH_MS = 60_000;

export interface SyncStorage {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
}

export interface SyncEngineDeps {
    /** One queued BLE write (ble.sendCommand adapter in prod, recorder in tests). */
    write: (cmd: string) => Promise<void>;
    storage: SyncStorage;
    /** Wall clock in ms. */
    now: () => number;
}

export interface PendingFill {
    ticker: string;
    buys: number;
}

export interface ConnectInput {
    pet: PetSnapshot;
    plans: DcaPlanSnapshot[];
    /** Negotiated ATT payload in bytes (MTU - 3). */
    mtuPayload: number;
}

export interface DcaSyncStatus {
    connected: boolean;
    lastSyncedAt: number | null;
    /** e.g. "device offline, last synced 12m ago"; null while connected. */
    offlineLabel: string | null;
}

export interface SyncEngine {
    onConnect: (input: ConnectInput) => Promise<void>;
    onPlansChanged: (plans: DcaPlanSnapshot[]) => Promise<void>;
    onFill: (fill: PendingFill) => Promise<void>;
    onDeviceState: (state: string) => Promise<void>;
    onDisconnect: () => void;
    getSyncStatus: () => DcaSyncStatus;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
    const { write, storage, now } = deps;

    let connected = false;
    let mtuPayload = DEFAULT_ATT_PAYLOAD;
    let lastPet: PetSnapshot | null = null;
    /** Full snapshot string last pushed — the only echo-loop guard. */
    let lastSentSnapshot: string | null = null;
    let lastSyncedAt: number | null = null;

    // Restore the watermark so the offline label survives restarts.
    void storage
        .getItem(KEY_LAST_SYNCED_AT)
        .then((raw) => {
            const parsed = raw ? Number(raw) : NaN;
            if (Number.isFinite(parsed)) lastSyncedAt = parsed;
        })
        .catch(() => {});

    async function safeWrite(cmd: string): Promise<void> {
        try {
            await write(cmd);
        } catch (e) {
            console.warn('[SyncEngine] write failed, skipped:', cmd, e);
        }
    }

    async function readPendingFills(): Promise<PendingFill[]> {
        try {
            const raw = await storage.getItem(KEY_PENDING_FILLS);
            const parsed: unknown = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? (parsed as PendingFill[]) : [];
        } catch {
            return [];
        }
    }

    async function pushSnapshot(pet: PetSnapshot): Promise<void> {
        let full: string;
        let lines: string[];
        try {
            full = buildSnapshot(pet);
            lines = buildSnapshotWrites(pet, mtuPayload);
        } catch (e) {
            console.warn('[SyncEngine] invalid pet snapshot, skipped:', e);
            return;
        }
        lastSentSnapshot = full;
        for (const line of lines) {
            await safeWrite(line);
        }
    }

    return {
        async onConnect({ pet, plans, mtuPayload: payload }) {
            connected = true;
            mtuPayload = payload;
            lastPet = pet;

            await pushSnapshot(pet);

            try {
                await write(buildEpoch(Math.floor(now() / 1000)));
            } catch (e) {
                console.warn('[SyncEngine] epoch write skipped:', e);
            }

            // Hash-skipped push: the device already holds this exact table.
            let planLines: string[] | null = null;
            try {
                planLines = buildPlanPush(plans);
            } catch (e) {
                console.warn('[SyncEngine] invalid plans, push skipped:', e);
            }
            if (planLines) {
                const hash = planPushHash(planLines);
                const lastHash = await storage.getItem(KEY_PLAN_PUSH_HASH);
                if (hash !== lastHash) {
                    for (const line of planLines) {
                        await safeWrite(line);
                    }
                    await storage.setItem(KEY_PLAN_PUSH_HASH, hash);
                }
            }

            // Missed fills replay, spaced so the 3-deep device toast queue
            // drains; invalid fills are dropped, never retried forever.
            const pending = await readPendingFills();
            for (let i = 0; i < pending.length; i++) {
                try {
                    await write(buildDcaHit(pending[i].buys, pending[i].ticker));
                } catch (e) {
                    console.warn('[SyncEngine] fill replay skipped:', e);
                }
                if (i < pending.length - 1) {
                    await delay(TOAST_SPACING_MS);
                }
            }
            if (pending.length > 0) {
                await storage.setItem(KEY_PENDING_FILLS, '[]');
            }

            lastSyncedAt = now();
            await storage.setItem(KEY_LAST_SYNCED_AT, String(lastSyncedAt));
        },

        async onPlansChanged(plans) {
            // Disconnected: leave the stored hash alone so the next connect
            // push covers the gap.
            if (!connected) return;
            let lines: string[];
            try {
                lines = buildPlanPush(plans);
            } catch (e) {
                console.warn('[SyncEngine] invalid plans, rewrite skipped:', e);
                return;
            }
            // Always a full rewrite: the device wipes on dca:count.
            for (const line of lines) {
                await safeWrite(line);
            }
            await storage.setItem(KEY_PLAN_PUSH_HASH, planPushHash(lines));
        },

        async onFill(fill) {
            if (connected) {
                try {
                    await write(buildDcaHit(fill.buys, fill.ticker));
                } catch (e) {
                    console.warn('[SyncEngine] fill toast skipped:', e);
                }
                return;
            }
            // Hardware runs standalone meanwhile; the toast replays on reconnect.
            const pending = await readPendingFills();
            pending.push(fill);
            await storage.setItem(KEY_PENDING_FILLS, JSON.stringify(pending));
        },

        async onDeviceState(state) {
            if (!connected || !lastPet) return;
            // App is authoritative: only a state that differs from what we
            // last pushed is a genuine device-side change. Echoes of our own
            // writes compare equal and stop here.
            if (state.trim() === lastSentSnapshot) return;
            await pushSnapshot(lastPet);
        },

        onDisconnect() {
            // Send nothing; the hardware continues standalone (contract §4).
            connected = false;
            lastPet = null;
            lastSentSnapshot = null;
        },

        getSyncStatus() {
            let offlineLabel: string | null = null;
            if (!connected) {
                if (lastSyncedAt === null) {
                    offlineLabel = 'device offline, not synced yet';
                } else {
                    const minutes = Math.floor((now() - lastSyncedAt) / 60000);
                    offlineLabel =
                        minutes < 1
                            ? 'device offline, last synced just now'
                            : `device offline, last synced ${minutes}m ago`;
                }
            }
            return { connected, lastSyncedAt, offlineLabel };
        },
    };
}

/** App plan → contract snapshot. Paused plans push nextExecutionAt ?? 0. */
export function planToSnapshot(plan: DcaPlan, priceUsd = 0): DcaPlanSnapshot {
    return {
        ticker: plan.ticker,
        amount: plan.amountPerTick,
        nextBuyEpoch: plan.nextExecutionAt ?? 0,
        buys: plan.buys,
        holdings: plan.holdingsHeld,
        enabled: plan.status === 'active',
        priceUsd,
    };
}

/**
 * Only live plans are pushed; the device wipes its table on dca:count.
 * `prices` maps ticker → USD unit price; unknown tickers push 0. The filter
 * order is the device slot order — `dca:pause:<i>` indexes into exactly this.
 */
export function plansToSnapshots(
    plans: DcaPlan[],
    prices?: Record<string, number>
): DcaPlanSnapshot[] {
    return plans
        .filter((plan) => plan.status === 'active' || plan.status === 'paused')
        .map((plan) => planToSnapshot(plan, prices?.[plan.ticker] ?? 0));
}

/**
 * Wires the core to the app: contract MTU re-negotiation on connect, pet/plan
 * store mapping, plan-change rewrites, dcaHit toasts, device-state
 * reconciliation, and the price feed — every plan rewrite carries the 8th
 * price_usd field, `solusd:` follows the SOL price, and a 60 s poll rewrites
 * the table when a price moves. Returns the engine's sync status for UI.
 */
export function useDcaSyncEngine(ble: FinagotchiBle): DcaSyncStatus {
    const [engine, setEngine] = useState<SyncEngine | null>(null);
    const engineRef = useRef<SyncEngine | null>(null);
    const [status, setStatus] = useState<DcaSyncStatus>({
        connected: false,
        lastSyncedAt: null,
        offlineLabel: null,
    });
    const sendCommandRef = useRef(ble.sendCommand);
    sendCommandRef.current = ble.sendCommand;

    const refresh = useCallback(() => {
        const current = engineRef.current;
        if (current) setStatus(current.getSyncStatus());
    }, []);

    // Ticker → USD unit price cache (plus 'SOL' for the solusd: rate). The
    // device can't price positions without Wi-Fi, so every plan-table
    // rewrite carries the cached price and a 60 s poll keeps it fresh.
    const pricesRef = useRef<Record<string, number>>({});
    const lastSentSolUsdRef = useRef<number | null>(null);

    // Fetch USD prices for the given tickers + SOL and merge into the cache.
    // Throws on network failure; callers decide (price 0 is always legal).
    const refreshPrices = useCallback(async (tickers: string[]) => {
        const { fetchJupiterPrices } = await import(
            '../../features/wallet/jupiterPrices'
        );
        const fetched = await fetchJupiterPrices([
            ...new Set([...tickers, 'SOL']),
        ]);
        pricesRef.current = { ...pricesRef.current, ...fetched };
    }, []);

    // Push solusd:<rate> once the SOL price is known and whenever it changes.
    const pushSolUsd = useCallback(() => {
        const rate = pricesRef.current.SOL;
        if (!rate || rate === lastSentSolUsdRef.current) return;
        try {
            sendCommandRef.current(buildSolUsd(rate));
            lastSentSolUsdRef.current = rate;
        } catch (e) {
            console.warn('[SyncEngine] solusd write skipped:', e);
        }
    }, []);

    // Full plan-table rewrite with fresh prices (plus solusd:). Plan changes
    // and sync:req go through here so every rewrite carries the 8th
    // price_usd field.
    const pushPlansWithPrices = useCallback(
        async (plans: DcaPlan[]) => {
            const current = engineRef.current;
            if (!current) return;
            try {
                await refreshPrices(plans.map((plan) => plan.ticker));
            } catch {
                // Price feed down: push with cached/zero prices anyway.
            }
            pushSolUsd();
            await current.onPlansChanged(
                plansToSnapshots(plans, pricesRef.current)
            );
            refresh();
        },
        [refreshPrices, pushSolUsd, refresh]
    );

    useEffect(() => {
        let cancelled = false;
        void import('@react-native-async-storage/async-storage').then(
            ({ default: AsyncStorage }) => {
                if (cancelled) return;
                const created = createSyncEngine({
                    // sendCommand resolves void but chains onto its internal
                    // write queue, so call order is the write order.
                    write: async (cmd) => {
                        sendCommandRef.current(cmd);
                    },
                    storage: AsyncStorage,
                    now: Date.now,
                });
                engineRef.current = created;
                setEngine(created);
            }
        );
        return () => {
            cancelled = true;
        };
    }, []);

    const connectedDevice = ble.connectedDevice;

    useEffect(() => {
        if (!engine) return;
        if (!connectedDevice) {
            engine.onDisconnect();
            refresh();
            return;
        }

        let cancelled = false;
        void (async () => {
            // Re-negotiate the contract MTU on Android (iOS negotiates
            // automatically). Failure falls back to the default 20-byte ATT
            // payload and snapshot writes split (§3.1).
            let mtuPayload = PROTOCOL_MTU - 3;
            // Deep path, not the 'react-native' barrel: dynamically importing
            // the barrel enumerates every lazy getter in RN's index (including
            // the removed PushNotificationIOS), which throws a fatal invariant
            // on iOS release builds.
            const { Platform } = await import(
                'react-native/Libraries/Utilities/Platform'
            );
            if (Platform.OS === 'android') {
                try {
                    await connectedDevice.requestMTU(PROTOCOL_MTU);
                } catch (e) {
                    console.warn(
                        '[SyncEngine] MTU request failed, using default ATT payload:',
                        e
                    );
                    mtuPayload = DEFAULT_ATT_PAYLOAD;
                }
            }

            const [petStore, checkinStore, bleSync, planStore] =
                await Promise.all([
                    import('../../features/pet/store'),
                    import('../../features/checkin/store'),
                    import('../../features/ble/sync'),
                    import('../dca/PlanStore'),
                ]);
            if (cancelled) return;

            const pet = petStore.usePetStore.getState();
            const deviceMood =
                bleSync.useDeviceControlStore.getState().deviceMood;
            const snapshot: PetSnapshot = {
                stage: bleSync.STAGE_TO_STATE_ID[pet.stage],
                streak: checkinStore.useCheckinStore.getState().streak,
                mood: bleSync.moodIndex(deviceMood ?? 'waiting'),
                item: bleSync.accessoryIndex(pet.accessory),
                points: Math.round(pet.balance),
                happy: Math.round(pet.happiness),
                subStage: pet.stage,
            };
            const plans = planStore.usePlanStore.getState().plans;
            try {
                await refreshPrices(plans.map((plan) => plan.ticker));
            } catch {
                // Prices are best-effort; 0 means "unknown" on the device.
            }
            if (cancelled) return;

            await engine.onConnect({
                pet: snapshot,
                plans: plansToSnapshots(plans, pricesRef.current),
                mtuPayload,
            });
            pushSolUsd();
            if (!cancelled) refresh();
        })();

        return () => {
            cancelled = true;
        };
    }, [engine, connectedDevice, refresh, refreshPrices, pushSolUsd]);

    // Any plan change → full rewrite while connected (fresh prices included).
    useEffect(() => {
        let cancelled = false;
        let unsubscribe: (() => void) | null = null;
        void import('../dca/PlanStore').then(({ usePlanStore }) => {
            if (cancelled) return;
            unsubscribe = usePlanStore.subscribe((state, prev) => {
                if (state.plans === prev.plans) return;
                void pushPlansWithPrices(state.plans);
            });
        });
        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }, [pushPlansWithPrices]);

    // Fill toasts: immediate while connected, queued while offline.
    useEffect(() => {
        let cancelled = false;
        let unsubscribe: (() => void) | null = null;
        void import('../dca/FillWatcher').then(({ dcaEvents }) => {
            if (cancelled) return;
            unsubscribe = dcaEvents.on('dcaHit', ({ ticker, buys }) => {
                const current = engineRef.current;
                if (!current) return;
                void current.onFill({ ticker, buys }).then(refresh);
            });
        });
        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }, [refresh]);

    // Device notifications → reconcile against the last pushed snapshot.
    const deviceState = ble.deviceState;
    useEffect(() => {
        if (!deviceState || !connectedDevice) return;
        const current = engineRef.current;
        if (!current) return;
        void current.onDeviceState(
            `${deviceState.stage}:${deviceState.streak}:${deviceState.mood}:${deviceState.item}:${deviceState.points}:${deviceState.happy}`
        );
    }, [deviceState, connectedDevice]);

    // `sync:req` (BTN1 on the device) → resend the full plan table too; the
    // pet snapshot re-push is handled by useDeviceSync. Always a full rewrite
    // (unlike the connect-time hash skip): the device asked because its table
    // may be gone (NVS wipe, dca:clear).
    const deviceRequest = ble.deviceRequest;
    useEffect(() => {
        if (!deviceRequest || deviceRequest.command !== 'sync') return;
        if (!connectedDevice) return;
        let cancelled = false;
        void import('../dca/PlanStore').then(({ usePlanStore }) => {
            if (cancelled) return;
            void pushPlansWithPrices(usePlanStore.getState().plans);
        });
        return () => {
            cancelled = true;
        };
    }, [deviceRequest, connectedDevice, pushPlansWithPrices]);

    // While connected, re-price the plan table every PRICE_REFRESH_MS and
    // rewrite it (plus solusd:) only when a price actually moved.
    useEffect(() => {
        if (!engine || !connectedDevice) return;
        let cancelled = false;
        const timer = setInterval(() => {
            void (async () => {
                const previous = pricesRef.current;
                try {
                    const { usePlanStore } = await import('../dca/PlanStore');
                    const plans = usePlanStore
                        .getState()
                        .plans.filter(
                            (plan) =>
                                plan.status === 'active' ||
                                plan.status === 'paused'
                        );
                    await refreshPrices(plans.map((plan) => plan.ticker));
                    if (cancelled) return;
                    const next = pricesRef.current;
                    const tickers = new Set([
                        ...plans.map((plan) => plan.ticker),
                        'SOL',
                    ]);
                    const changed = [...tickers].some(
                        (ticker) => previous[ticker] !== next[ticker]
                    );
                    if (!changed) return;
                    pushSolUsd();
                    await engine.onPlansChanged(plansToSnapshots(plans, next));
                    refresh();
                } catch {
                    // Feed unreachable; retry next interval.
                }
            })();
        }, PRICE_REFRESH_MS);
        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [engine, connectedDevice, refreshPrices, pushSolUsd, refresh]);

    return status;
}
