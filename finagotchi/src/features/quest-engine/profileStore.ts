import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
    emptyProfile,
    onNewTx,
    type ActivityProfile,
    type Quest,
    type QuestHistoryEntry,
    type TxEvent,
} from '../../../../shared/quest-engine';

/** A locally-credited quest, kept so generation can dedupe like the server does. */
export interface CreditedQuestEntry extends QuestHistoryEntry {
    /** UTC `YYYY-MM-DD` the credit landed on. */
    day: string;
}

type ProfileState = {
    /** Latest activity snapshot per wallet (server backfill wins, then local folds). */
    profiles: Record<string, ActivityProfile>;
    /** Credited quest history per wallet; mirrors the server's quest_credits rows. */
    credited: Record<string, CreditedQuestEntry[]>;

    /** Fold one confirmed tx into the wallet's profile. O(1), no network. */
    applyTx: (tx: TxEvent) => void;
    /** Replace the wallet's profile with the server's backfill snapshot. */
    hydrateFromBackfill: (profile: ActivityProfile) => void;
    /** Record a server-credited quest so future days dedupe it. */
    markCredited: (wallet: string, quest: Pick<Quest, 'programId' | 'kind'>, day: string) => void;

    getProfile: (wallet: string) => ActivityProfile;
    /** History entries from days strictly before `day` — matches server getQuestHistory. */
    getHistory: (wallet: string, day: string) => QuestHistoryEntry[];
};

/** onNewTx mutates, so clone first to keep zustand state immutable. */
function cloneProfile(profile: ActivityProfile): ActivityProfile {
    const programs: ActivityProfile['programs'] = {};
    for (const [programId, stats] of Object.entries(profile.programs)) {
        programs[programId] = { ...stats };
    }
    return { ...profile, programs };
}

export const useProfileStore = create<ProfileState>()(
    persist(
        (set, get) => ({
            profiles: {},
            credited: {},

            applyTx: (tx) => {
                const current = get().profiles[tx.wallet] ?? emptyProfile(tx.wallet);
                // Engine contract: fold with now = tx.blockTime, never wall-clock.
                const next = onNewTx(cloneProfile(current), tx, tx.blockTime);
                set({ profiles: { ...get().profiles, [tx.wallet]: next } });
            },

            hydrateFromBackfill: (profile) => {
                // The server snapshot is folded from every ingested event, so it
                // replaces the local one; any newer local tx is seconds away from
                // ingest and will be re-folded by the next applyTx.
                set({ profiles: { ...get().profiles, [profile.wallet]: profile } });
            },

            markCredited: (wallet, quest, day) => {
                const list = get().credited[wallet] ?? [];
                const exists = list.some(
                    (e) =>
                        e.day === day &&
                        e.programId === quest.programId &&
                        e.kind === quest.kind,
                );
                if (exists) return;
                set({
                    credited: {
                        ...get().credited,
                        [wallet]: [
                            ...list,
                            { programId: quest.programId, kind: quest.kind, day },
                        ],
                    },
                });
            },

            getProfile: (wallet) => {
                return get().profiles[wallet] ?? emptyProfile(wallet);
            },

            getHistory: (wallet, day) => {
                return (get().credited[wallet] ?? [])
                    .filter((e) => e.day < day)
                    .map(({ programId, kind }) => ({ programId, kind }));
            },
        }),
        {
            name: 'finagotchi-quest-engine-profile',
            storage: createJSONStorage(() => AsyncStorage),
        },
    ),
);
