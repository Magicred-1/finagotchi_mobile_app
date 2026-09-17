import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useWalletStore } from '../wallet/store';
import { addStreakFreezes as addStreakFreezesOnServer } from '../dbs/client';

const STREAK_FREEZE_PRICE = 200;
const STREAK_FREEZE_DAILY_LIMIT = 3;

export type StreakFreezeState = {
    streakFreezes: number;
    dailyUses: { date: string; count: number };
    useStreakFreeze: () => boolean;
    addStreakFreezes: (amount: number) => void;
    canUseStreakFreeze: () => boolean;
    getPrice: () => number;
};

function todayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const useStreakFreezeStore = create<StreakFreezeState>()(
    persist(
        (set, get) => ({
            streakFreezes: 0,
            dailyUses: { date: todayKey(), count: 0 },
            useStreakFreeze: () => {
                const state = get();
                if (!state.canUseStreakFreeze()) return false;
                const key = todayKey();
                set({
                    streakFreezes: state.streakFreezes - 1,
                    dailyUses:
                        state.dailyUses.date === key
                            ? { date: key, count: state.dailyUses.count + 1 }
                            : { date: key, count: 1 },
                });
                return true;
            },
            addStreakFreezes: (amount) => {
                set({ streakFreezes: get().streakFreezes + amount });
                // Optimistic server sync; idempotent add is best-effort.
                const wallet = useWalletStore.getState().address;
                if (wallet) {
                    addStreakFreezesOnServer(wallet, amount).catch(() => {});
                }
            },
            canUseStreakFreeze: () => {
                const state = get();
                const key = todayKey();
                const dailyCount = state.dailyUses.date === key ? state.dailyUses.count : 0;
                return state.streakFreezes > 0 && dailyCount < STREAK_FREEZE_DAILY_LIMIT;
            },
            getPrice: () => STREAK_FREEZE_PRICE,
        }),
        {
            name: 'finagotchi-streak-freeze',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
