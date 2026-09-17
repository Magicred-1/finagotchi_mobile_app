import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useWalletStore } from '../wallet/store';
import { addLeagueScore as addLeagueScoreOnServer } from '../dbs/client';

export const LEAGUE_TIERS = [
    { name: 'Bronze', rank: 1, color: '#CD7F32', minScore: 0, promotion: 100, demotion: 0 },
    { name: 'Silver', rank: 2, color: '#C0C0C0', minScore: 100, promotion: 250, demotion: 50 },
    { name: 'Gold', rank: 3, color: '#FFD700', minScore: 250, promotion: 500, demotion: 150 },
    { name: 'Platinum', rank: 4, color: '#3EB489', minScore: 500, promotion: 750, demotion: 300 },
    { name: 'Diamond', rank: 5, color: '#B9F2FF', minScore: 750, promotion: 1000, demotion: 500 },
    { name: 'Whale', rank: 6, color: '#9945FF', minScore: 1000, promotion: 0, demotion: 800 },
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
                const nextScore = Math.max(0, get().score + amount);
                set({
                    score: nextScore,
                    currentTier: computeTier(nextScore),
                });
                // Optimistic server sync; the server recomputes the tier.
                const wallet = useWalletStore.getState().address;
                if (wallet) {
                    addLeagueScoreOnServer(wallet, amount).catch(() => {});
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

const MOCK_FRIENDS: LeaderboardEntry[] = [
    { userId: 'u1', name: 'You', score: 0, tier: 'Bronze' },
    { userId: 'u2', name: 'Alice', score: 340, tier: 'Silver' },
    { userId: 'u3', name: 'Bob', score: 120, tier: 'Bronze' },
    { userId: 'u4', name: 'Carol', score: 890, tier: 'Diamond' },
    { userId: 'u5', name: 'Dave', score: 560, tier: 'Platinum' },
];

const MOCK_GLOBAL: LeaderboardEntry[] = [
    { userId: 'g1', name: 'Finn', score: 1250, tier: 'Whale' },
    { userId: 'g2', name: 'Satoshi', score: 980, tier: 'Diamond' },
    { userId: 'g3', name: 'Vitalik', score: 760, tier: 'Diamond' },
    { userId: 'g4', name: 'HodlQueen', score: 520, tier: 'Platinum' },
    { userId: 'g5', name: 'DCA_King', score: 310, tier: 'Gold' },
];

export function getLeaderboard(scope: 'global' | 'friends', currentScore: number, currentTier: LeagueTierName): LeaderboardEntry[] {
    const me: LeaderboardEntry = { userId: 'me', name: 'You', score: currentScore, tier: currentTier };
    const base = scope === 'friends' ? [...MOCK_FRIENDS] : [...MOCK_GLOBAL];
    base.push(me);
    base.sort((a, b) => b.score - a.score);
    return base;
}
