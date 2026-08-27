import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

function dateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

type FoodState = {
  usesToday: Record<string, number>;
  lastResetAt: string | null;

  /** Reset usage if the date rolled over. Called automatically by other getters. */
  resetIfNeeded: () => void;
  /** How many times a food item has been used today. */
  getUsesToday: (id: string) => number;
  /** Whether a food item is still available given its daily free-use limit. */
  canUse: (id: string, limit: number) => boolean;
  /** Record one use of a food item. */
  recordUse: (id: string) => void;
  /** Exposed for testing/debugging. */
  forceReset: () => void;
};

export const useFoodStore = create<FoodState>()(
  persist(
    (set, get) => ({
      usesToday: {},
      lastResetAt: null,

      resetIfNeeded: () => {
        const today = dateKey();
        if (get().lastResetAt !== today) {
          set({ usesToday: {}, lastResetAt: today });
        }
      },

      getUsesToday: (id) => {
        get().resetIfNeeded();
        return get().usesToday[id] ?? 0;
      },

      canUse: (id, limit) => {
        get().resetIfNeeded();
        return (get().usesToday[id] ?? 0) < limit;
      },

      recordUse: (id) => {
        get().resetIfNeeded();
        set({
          usesToday: {
            ...get().usesToday,
            [id]: (get().usesToday[id] ?? 0) + 1,
          },
        });
      },

      forceReset: () => {
        set({ usesToday: {}, lastResetAt: null });
      },
    }),
    {
      name: 'finagotchi-food',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
