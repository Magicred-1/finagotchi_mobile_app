import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
    generateDailyQuests,
    questWindow,
    type Quest,
    type TxEvent,
} from '../../../../shared/quest-engine';
import { backfill, type ServerQuestProgress } from './client';
import { useClaimQueue } from './claimQueue';
import { useProfileStore } from './profileStore';
import {
    mergeProgress,
    seedProgressFromProfile,
    utcDay,
    type QuestProgress,
} from './seedProgress';

export { utcDay } from './seedProgress';
export type { QuestProgress } from './seedProgress';

/**
 * Re-backfill when the last server sync is older than this — webhook-ingested
 * activity (txs sent outside the app, other devices) otherwise never reaches
 * the local profile. Cheap after the first scan: the server paginates
 * incrementally and stops at the first already-ingested page.
 */
const BACKFILL_STALE_MS = 6 * 3_600_000;

export interface QuestWithProgress extends Quest {
    current: number;
    complete: boolean;
}

type QuestsState = {
    /** Generated quest lists, keyed `${wallet}:${day}` — re-renders stay free. */
    questsByKey: Record<string, Quest[]>;
    /** Progress per day key, then per quest id. */
    progressByKey: Record<string, Record<string, QuestProgress>>;
    /** Last successful server backfill per wallet (ms) — drives the stale gate. */
    lastBackfillAt: Record<string, number>;
    refreshInFlight: boolean;

    /**
     * Resolve today's quest list for a wallet. Backfills from the server on
     * cold start and whenever the last sync is stale, regenerates the list
     * from the freshest profile, and merges progress from all three sources
     * (profile seed, server-exact, live recordTx) without ever regressing.
     * Quests the merged progress completes are auto-enqueued for verification.
     */
    refreshQuests: (wallet: string, now?: number) => Promise<Quest[]>;
    /**
     * Fold a confirmed tx into the profile and advance progress for every
     * cached quest whose window covers it. Auto-enqueues a claim on the
     * transition to complete (the server remains the payout authority).
     */
    recordTx: (tx: TxEvent) => void;
    /** Today's quests with live progress attached; instant from cache. */
    getQuestsWithProgress: (wallet: string, now?: number) => QuestWithProgress[];
};

function cacheKey(wallet: string, day: string): string {
    return `${wallet}:${day}`;
}

function isComplete(quest: Quest, progress: QuestProgress): boolean {
    if (quest.kind === 'streak') {
        return Object.keys(progress.activeDays).length >= quest.goal;
    }
    // 'count' and 'explore' are volume-based (explore goal is 1).
    return progress.count >= quest.goal;
}

export const useQuestsStore = create<QuestsState>()(
    persist(
        (set, get) => ({
            questsByKey: {},
            progressByKey: {},
            lastBackfillAt: {},
            refreshInFlight: false,

            refreshQuests: async (wallet, now = Date.now()) => {
                const day = utcDay(now);
                const key = cacheKey(wallet, day);
                if (get().refreshInFlight) return get().questsByKey[key] ?? [];
                set({ refreshInFlight: true });
                try {
                    const profileStore = useProfileStore.getState();
                    let profile = profileStore.getProfile(wallet);
                    let serverQuests: ServerQuestProgress[] | undefined;

                    // Cold start (empty profile) and stale syncs both pull the
                    // server's event-folded profile + exact quest progress.
                    const lastBackfill = get().lastBackfillAt[wallet] ?? 0;
                    if (
                        Object.keys(profile.programs).length === 0 ||
                        now - lastBackfill > BACKFILL_STALE_MS
                    ) {
                        const net = await NetInfo.fetch();
                        if (net.isConnected) {
                            try {
                                const res = await backfill(wallet);
                                profileStore.hydrateFromBackfill(res.profile);
                                profile = res.profile;
                                serverQuests = res.quests;
                                set({
                                    lastBackfillAt: {
                                        ...get().lastBackfillAt,
                                        [wallet]: now,
                                    },
                                });
                            } catch {
                                // Server unreachable mid-call: deterministic
                                // generation from the local profile still renders.
                            }
                        }
                    }

                    const quests = generateDailyQuests(
                        wallet,
                        profile,
                        day,
                        profileStore.getHistory(wallet, day),
                    );
                    set({ questsByKey: { ...get().questsByKey, [key]: quests } });

                    // Merge progress from three sources, never regressing:
                    // profile seed (lower bound) -> server-exact -> live recordTx.
                    const merged: Record<string, QuestProgress> =
                        seedProgressFromProfile(quests, profile, day);
                    for (const sq of serverQuests ?? []) {
                        const fromServer: QuestProgress = {
                            count: sq.current,
                            activeDays: Object.fromEntries(
                                sq.days.map((d) => [d, true as const])
                            ),
                        };
                        merged[sq.id] = merged[sq.id]
                            ? mergeProgress(merged[sq.id], fromServer)
                            : fromServer;
                    }
                    const existing = get().progressByKey[key] ?? {};
                    for (const [id, p] of Object.entries(existing)) {
                        merged[id] = merged[id] ? mergeProgress(merged[id], p) : p;
                    }
                    set({ progressByKey: { ...get().progressByKey, [key]: merged } });

                    // Auto-enqueue claims for quests the merged progress
                    // completes — the server remains the payout authority.
                    const creditedToday = profileStore.credited[wallet] ?? [];
                    const failedClaims = useClaimQueue.getState().failed;
                    for (const quest of quests) {
                        const p = merged[quest.id];
                        if (!p || !isComplete(quest, p)) continue;
                        // Same-day credits and definitive rejections stay quiet.
                        if (
                            creditedToday.some(
                                (e) =>
                                    e.day === day &&
                                    e.programId === quest.programId &&
                                    e.kind === quest.kind,
                            )
                        ) {
                            continue;
                        }
                        if (
                            failedClaims.some(
                                (f) => f.wallet === wallet && f.questId === quest.id,
                            )
                        ) {
                            continue;
                        }
                        useClaimQueue.getState().enqueue({
                            wallet,
                            day,
                            questId: quest.id,
                            programId: quest.programId,
                            kind: quest.kind,
                        });
                    }
                    return quests;
                } finally {
                    set({ refreshInFlight: false });
                }
            },

            recordTx: (tx) => {
                useProfileStore.getState().applyTx(tx);

                const day = utcDay(tx.blockTime);
                // Advance progress on any cached day whose quests this tx hits;
                // usually just today, but a late-arriving tx can hit yesterday's
                // window too (windowDays > 1).
                for (const [key, quests] of Object.entries(get().questsByKey)) {
                    if (!key.startsWith(`${tx.wallet}:`)) continue;
                    const dayProgress = { ...(get().progressByKey[key] ?? {}) };
                    let changed = false;

                    for (const quest of quests) {
                        if (quest.programId !== tx.programId) continue;
                        const { fromMs, toMs } = questWindow(quest.day, quest.windowDays);
                        if (tx.blockTime < fromMs || tx.blockTime >= toMs) continue;

                        const prev = dayProgress[quest.id] ?? { count: 0, activeDays: {} };
                        const next: QuestProgress = {
                            count: prev.count + 1,
                            activeDays: { ...prev.activeDays, [day]: true },
                        };
                        dayProgress[quest.id] = next;
                        changed = true;

                        if (!isComplete(quest, prev) && isComplete(quest, next)) {
                            useClaimQueue.getState().enqueue({
                                wallet: tx.wallet,
                                day: quest.day,
                                questId: quest.id,
                                signature: tx.signature,
                                programId: quest.programId,
                                kind: quest.kind,
                            });
                        }
                    }

                    if (changed) {
                        set({
                            progressByKey: { ...get().progressByKey, [key]: dayProgress },
                        });
                    }
                }
            },

            getQuestsWithProgress: (wallet, now = Date.now()) => {
                const key = cacheKey(wallet, utcDay(now));
                const quests = get().questsByKey[key] ?? [];
                const progress = get().progressByKey[key] ?? {};
                return quests.map((quest) => {
                    const p = progress[quest.id] ?? { count: 0, activeDays: {} };
                    return {
                        ...quest,
                        current:
                            quest.kind === 'streak'
                                ? Object.keys(p.activeDays).length
                                : p.count,
                        complete: isComplete(quest, p),
                    };
                });
            },
        }),
        {
            name: 'finagotchi-quest-engine-quests',
            storage: createJSONStorage(() => AsyncStorage),
            // refreshInFlight is runtime-only.
            partialize: (state) => ({
                questsByKey: state.questsByKey,
                progressByKey: state.progressByKey,
                lastBackfillAt: state.lastBackfillAt,
            }),
        },
    ),
);
