import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

type WheelState = {
    /** Local calendar day of the last completed spin (`YYYY-M-D`). */
    lastSpinDay: string | null;
    /** Record a completed spin for today. */
    markSpun: () => void;
};

/** Local calendar day key; matches the pet store's day format. */
export function localDayKey(date = new Date()): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export const useWheelStore = create<WheelState>()(
    persist(
        (set) => ({
            lastSpinDay: null,

            markSpun: () => {
                set({ lastSpinDay: localDayKey() });
            },
        }),
        {
            name: 'finagotchi-wheel',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
