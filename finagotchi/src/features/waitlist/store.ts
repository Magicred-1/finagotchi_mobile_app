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
    addEntry: (email: string, name?: string) => boolean;
};

export const useWaitlistStore = create<WaitlistState>()(
    persist(
        (set, get) => ({
            entries: [],

            addEntry: (email, name) => {
                const normalized = email.trim().toLowerCase();

                if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
                    return false;
                }

                if (get().entries.some((e) => e.email === normalized)) {
                    return true;
                }

                set({
                    entries: [
                        ...get().entries,
                        {
                            email: normalized,
                            name: name?.trim() || undefined,
                            joinedAt: new Date().toISOString(),
                        },
                    ],
                });

                return true;
            },
        }),
        {
            name: 'finagotchi-waitlist',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
