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
import { backfill } from './client';
import { useClaimQueue } from './claimQueue';
import { useProfileStore } from './profileStore';
import { seedProgressFromProfile, utcDay, type QuestProgress } from './seedProgress';

export { utcDay } from './seedProgress';
export type { QuestProgress } from './seedProgress';

export interface QuestWithProgress extends Quest {
    current: number;
    complete: boolean;
}

type QuestsState = {
    /** Generated quest lists, keyed `${wallet}:${day}` — re-renders stay free. */
    questsByKey: Record<string, Quest[]>;
    /** Progress per day key, then per quest id. */
    progressByKey: Record<string, Record<string, QuestProgress>>;
    refreshInFlight: boolean;

    /**
     * Resolve today's quest list for a wallet. Cached per (wallet, day) so the
     * list cannot drift mid-day; cold start backfills from the server when
     * online, otherwise falls back to the engine's cohort-default quests.
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
            refreshInFlight: false,

            refreshQuests: async (wallet, now = Date.now()) => {
                const day = utcDay(now);
                const key = cacheKey(wallet, day);
                const cached = get().questsByKey[key];
                if (cached) return cached;
                if (get().refreshInFlight) return [];
                set({ refreshInFlight: true });
                try {
                    const profileStore = useProfileStore.getState();
                    let profile = profileStore.getProfile(wallet);

                    // Cold start: an empty profile produces only cohort-default
                    // explorer quests, so seed real history first when we can.
                    if (Object.keys(profile.programs).length === 0) {
                        const net = await NetInfo.fetch();
                        if (net.isConnected) {
                            try {
                                const res = await backfill(wallet);
                                profileStore.hydrateFromBackfill(res.profile);
                                profile = res.profile;
                            } catch {
                                // Server unreachable mid-call: deterministic
                                // defaults from the empty profile still render.
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

                    // Seed the 7-day window from the profile, then auto-enqueue
                    // claims for quests the seed already completes. Live
                    // progress (recordTx) always wins over the seed.
                    const existing = get().progressByKey[key] ?? {};
                    const merged = {
                        ...seedProgressFromProfile(quests, profile, day),
                        ...existing,
                    };
                    set({ progressByKey: { ...get().progressByKey, [key]: merged } });

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
            }),
        },
    ),
);
