import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { LIFE_DURATION_MS, updatePetStage, usePetStore } from '../pet/store';
import { useWaitlistStore } from '../waitlist/store';
import { useWalletStore } from '../wallet/store';
import { recordCheckin as recordCheckinOnServer } from '../dbs/client';

export type CheckinDetails = {
    amount?: number;
    category?: string;
};

export type CheckinResult = {
    success: boolean;
    streak: number;
    freezeUsed: boolean;
    milestone: number | null;
};

type CheckinState = {
    streak: number;
    longestStreak: number;
    totalCheckins: number;
    lastCheckin: string | null;
    todayDetails: CheckinDetails | null;
    freezeLastUsedAt: string | null;
    history: Record<string, boolean>;

    checkIn: (saved: boolean, details?: CheckinDetails) => CheckinResult;
    hasCheckedInToday: () => boolean;
    freezeAvailable: () => boolean;
    getWeekHistory: () => boolean[];
    resetStreak: () => void;
    useStreakFreeze: () => boolean;
};

export const MILESTONES = [3, 7, 14, 30, 60, 90];

function dateKey(offsetDays = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        '0'
    )}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayKey() {
    return dateKey(0);
}

function yesterdayKey() {
    return dateKey(-1);
}

function isWithinLastDays(key: string | null, days: number) {
    if (!key) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(key);
    target.setHours(0, 0, 0, 0);

    const diffMs = today.getTime() - target.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    return diffDays >= 0 && diffDays <= days;
}

export const useCheckinStore = create<CheckinState>()(
    persist(
        (set, get) => ({
            streak: 0,
            longestStreak: 0,
            totalCheckins: 0,
            lastCheckin: null,
            todayDetails: null,
            freezeLastUsedAt: null,
            history: {},

            hasCheckedInToday: () => {
                return get().lastCheckin === todayKey();
            },

            freezeAvailable: () => {
                const { freezeLastUsedAt } = get();
                return (
                    freezeLastUsedAt === null ||
                    !isWithinLastDays(freezeLastUsedAt, 6)
                );
            },

            getWeekHistory: () => {
                const { history } = get();
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const week: boolean[] = [];

                for (let i = 6; i >= 0; i--) {
                    const d = new Date(today);
                    d.setDate(d.getDate() - i);

                    const key = `${d.getFullYear()}-${String(
                        d.getMonth() + 1
                    ).padStart(2, '0')}-${String(d.getDate()).padStart(
                        2,
                        '0'
                    )}`;

                    week.push(history[key] ?? false);
                }

                return week;
            },

            checkIn: (saved: boolean, details?: CheckinDetails) => {
                const state = get();

                if (usePetStore.getState().isDead) {
                    return {
                        success: false,
                        streak: state.streak,
                        freezeUsed: false,
                        milestone: null,
                    };
                }

                if (state.lastCheckin === todayKey()) {
                    return {
                        success: false,
                        streak: state.streak,
                        freezeUsed: false,
                        milestone: null,
                    };
                }

                let newStreak = 0;
                let freezeUsed = false;

                if (saved) {
                    if (state.lastCheckin === yesterdayKey()) {
                        newStreak = state.streak + 1;
                    } else {
                        newStreak = 1;
                    }
                } else {
                    const hadActiveStreakYesterday =
                        state.streak > 0 && state.lastCheckin === yesterdayKey();

                    if (hadActiveStreakYesterday && state.freezeAvailable()) {
                        newStreak = state.streak;
                        freezeUsed = true;
                    } else {
                        newStreak = 0;
                    }
                }

                const totalCheckins = saved
                    ? state.totalCheckins + 1
                    : state.totalCheckins;

                const key = todayKey();
                const history = { ...state.history, [key]: saved };

                const updates: Partial<CheckinState> = {
                    streak: newStreak,
                    longestStreak: Math.max(state.longestStreak, newStreak),
                    totalCheckins,
                    lastCheckin: key,
                    todayDetails: saved ? details ?? null : null,
                    history,
                };

                if (freezeUsed) {
                    updates.freezeLastUsedAt = key;
                }

                set(updates);

                if (saved) {
                    const boost = useWaitlistStore.getState().getBoostMultiplier();
                    const now = new Date();
                    usePetStore.setState((pet) => ({
                        happiness: Math.min(100, pet.happiness + 50),
                        lastFedAt: now.toISOString(),
                        lastInteractionAt: now.toISOString(),
                        lifeTimerEndsAt: new Date(
                            now.getTime() + LIFE_DURATION_MS
                        ).toISOString(),
                        balance: pet.balance + 50 * boost,
                    }));
                    usePetStore.getState().addXp(20);

                // Optimistic server sync: fire and forget. The server is
                // idempotent on (wallet, checkinDate), so duplicates are safe.
                const wallet = useWalletStore.getState().address;
                if (wallet) {
                    recordCheckinOnServer(wallet).catch(() => {});
                }
                }

                updatePetStage(newStreak);

                const milestone = MILESTONES.includes(newStreak)
                    ? newStreak
                    : null;

                return {
                    success: true,
                    streak: newStreak,
                    freezeUsed,
                    milestone,
                };
            },

            resetStreak: () => {
                set({
                    streak: 0,
                    lastCheckin: null,
                    todayDetails: null,
                });
            },

            useStreakFreeze: () => {
                const state = get();
                const hadActiveStreakYesterday =
                    state.streak > 0 && state.lastCheckin === yesterdayKey();

                if (!hadActiveStreakYesterday || !state.freezeAvailable()) {
                    return false;
                }

                const key = todayKey();
                set({
                    streak: state.streak,
                    lastCheckin: key,
                    freezeLastUsedAt: key,
                    history: { ...state.history, [key]: false },
                });
                return true;
            },
        }),
        {
            name: 'finagotchi-checkins',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
