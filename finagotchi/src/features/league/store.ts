import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useWalletStore } from '../wallet/store';
import { fetchLeague } from '../dbs/client';

/** League score awarded for a successful daily check-in. */
export const CHECKIN_SCORE = 10;
/** League score awarded per stage gained on evolution. */
export const EVOLUTION_SCORE = 50;

export const LEAGUE_TIERS = [
    { name: 'Bronze', rank: 1, color: '#CD7F32', minScore: 0, promotion: 100, demotion: 0 },
    { name: 'Silver', rank: 2, color: '#C0C0C0', minScore: 100, promotion: 250, demotion: 50 },
    { name: 'Gold', rank: 3, color: '#E9B846', minScore: 250, promotion: 500, demotion: 150 },
    { name: 'Platinum', rank: 4, color: '#7ED6A7', minScore: 500, promotion: 750, demotion: 300 },
    { name: 'Diamond', rank: 5, color: '#8DC9F6', minScore: 750, promotion: 1000, demotion: 500 },
    { name: 'Whale', rank: 6, color: '#F8B43C', minScore: 1000, promotion: 0, demotion: 800 },
] as const;

export type LeagueTierName = (typeof LEAGUE_TIERS)[number]['name'];

export type LeaderboardEntry = {
    userId: string;
    name: string;
    avatar?: string;
    score: number;
    tier: LeagueTierName;
    isFriend?: boolean;
};

type LeagueState = {
    currentTier: LeagueTierName;
    score: number;
    seasonId: string;
    seasonEndsAt: string;
    leaderboardScope: 'global' | 'friends';
    addScore: (amount: number) => void;
    syncFromServer: () => Promise<void>;
    setScope: (scope: 'global' | 'friends') => void;
    getTier: () => (typeof LEAGUE_TIERS)[number];
    getProgress: () => { current: number; target: number; percent: number };
};

export function getTierByName(name: LeagueTierName) {
    return LEAGUE_TIERS.find((t) => t.name === name) ?? LEAGUE_TIERS[0];
}

export function computeTier(score: number): LeagueTierName {
    for (let i = LEAGUE_TIERS.length - 1; i >= 0; i--) {
        if (score >= LEAGUE_TIERS[i].minScore) {
            return LEAGUE_TIERS[i].name;
        }
    }
    return 'Bronze';
}

export const useLeagueStore = create<LeagueState>()(
    persist(
        (set, get) => ({
            currentTier: 'Bronze',
            score: 0,
            seasonId: 'season-1',
            seasonEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            leaderboardScope: 'global',
            addScore: (amount) => {
                // Score is credited SERVER-SIDE now (+10 on checkin insert,
                // +50 per stage gained on pet-state push, quest XP on
                // verified claims) — POST /dbs/league/add is gone. This is
                // only an optimistic local bump so the UI reacts instantly;
                // the next syncFromServer() overwrites it with the
                // authoritative server total, so no double-count is possible.
                const nextScore = Math.max(0, get().score + amount);
                set({
                    score: nextScore,
                    currentTier: computeTier(nextScore),
                });
            },
            syncFromServer: async () => {
                const wallet = useWalletStore.getState().address;
                if (!wallet) return;
                try {
                    const res = await fetchLeague(wallet);
                    if (res.score !== get().score) {
                        set({
                            score: res.score,
                            currentTier: computeTier(res.score),
                        });
                    }
                } catch {
                    // Offline or not authenticated yet; keep local state.
                }
            },
            setScope: (scope) => set({ leaderboardScope: scope }),
            getTier: () => getTierByName(get().currentTier),
            getProgress: () => {
                const tier = getTierByName(get().currentTier);
                const nextTier = LEAGUE_TIERS.find((t) => t.rank === tier.rank + 1);
                const target = nextTier ? nextTier.minScore : tier.minScore + 1000;
                const current = get().score - tier.minScore;
                const range = target - tier.minScore;
                return {
                    current: Math.max(0, current),
                    target: Math.max(1, range),
                    percent: Math.min(100, Math.max(0, (current / range) * 100)),
                };
            },
        }),
        {
            name: 'finagotchi-league',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);

