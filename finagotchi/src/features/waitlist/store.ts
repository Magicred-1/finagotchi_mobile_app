import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type WaitlistEntry = {
    email: string;
    name?: string;
    joinedAt: string;
};

type WaitlistState = {
    entries: WaitlistEntry[];
    boostExpiresAt: string | null;
    addEntry: (email: string, name?: string) => boolean;
    getBoostMultiplier: () => number;
};

const BOOST_DURATION_MS = 24 * 60 * 60 * 1000;

export const useWaitlistStore = create<WaitlistState>()(
    persist(
        (set, get) => ({
            entries: [],
            boostExpiresAt: null,

            addEntry: (email, name) => {
                const normalized = email.trim().toLowerCase();

                if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
                    return false;
                }

                if (get().entries.some((e) => e.email === normalized)) {
                    return true;
                }

                const now = Date.now();
                const expiresAt = get().boostExpiresAt;
                const currentBoost = expiresAt ? new Date(expiresAt).getTime() : 0;
                const newBoostExpiresAt = new Date(
                    Math.max(now, currentBoost) + BOOST_DURATION_MS
                ).toISOString();

                set({
                    entries: [
                        ...get().entries,
                        {
                            email: normalized,
                            name: name?.trim() || undefined,
                            joinedAt: new Date().toISOString(),
                        },
                    ],
                    boostExpiresAt: newBoostExpiresAt,
                });

                return true;
            },

            getBoostMultiplier: () => {
                const expires = get().boostExpiresAt;
                if (!expires) return 1;
                return new Date(expires).getTime() > Date.now() ? 2 : 1;
            },
        }),
        {
            name: 'finagotchi-waitlist',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
