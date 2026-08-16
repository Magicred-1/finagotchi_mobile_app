import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { updatePetStage } from '../pet/store';

type CheckinState = {
    streak: number;
    longestStreak: number;
    totalCheckins: number;
    lastCheckin: string | null;

    checkIn: (saved: boolean) => boolean;
    hasCheckedInToday: () => boolean;
};

function todayKey() {
    const date = new Date();

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        '0'
    )}-${String(date.getDate()).padStart(2, '0')}`;
}

function yesterdayKey() {
    const date = new Date();
    date.setDate(date.getDate() - 1);

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        '0'
    )}-${String(date.getDate()).padStart(2, '0')}`;
}

export const useCheckinStore = create<CheckinState>()(
    persist(
        (set, get) => ({
        streak: 0,
        longestStreak: 0,
        totalCheckins: 0,
        lastCheckin: null,

        hasCheckedInToday: () => {
            return get().lastCheckin === todayKey();
        },

        checkIn: (saved: boolean) => {
            const state = get();

            if (state.lastCheckin === todayKey()) {
            return false;
            }

            let newStreak = 0;

            if (saved) {
            if (state.lastCheckin === yesterdayKey()) {
                newStreak = state.streak + 1;
            } else {
                newStreak = 1;
            }
            }

            const totalCheckins = state.totalCheckins + 1;

            set({
            streak: newStreak,
            longestStreak: Math.max(
                state.longestStreak,
                newStreak
            ),
            totalCheckins,
            lastCheckin: todayKey(),
            });

            updatePetStage(newStreak);

            return true;
        },
        }),
        {
        name: 'finagotchi-checkins',
        storage: createJSONStorage(() => AsyncStorage),
        }
    )
);