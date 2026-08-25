import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { StateId } from '../engine/engine';
import type { PetMood } from '../engine/expressions';

export interface PetState {
  stage: StateId;
  mood: PetMood;
  streak: number;
  wellnessScore: number;
  isEvolving: boolean;
  lastCheckIn: string | null;

  checkIn: (amount?: number) => void;
  evolve: () => void;
  setMood: (mood: PetMood) => void;
  completeEvolution: () => void;
}

const STAGE_ORDER: StateId[] = ['egg', 'coinling', 'hodler', 'whale'];

const THRESHOLDS: Record<StateId, number> = {
  egg: 7,
  coinling: 30,
  hodler: 90,
  whale: Number.POSITIVE_INFINITY,
};

function nextStage(stage: StateId): StateId {
  const index = STAGE_ORDER.indexOf(stage);
  return STAGE_ORDER[Math.min(index + 1, STAGE_ORDER.length - 1)];
}

export const usePetStore = create<PetState>()(
  persist(
    (set, get) => ({
      stage: 'egg',
      mood: 'waiting',
      streak: 0,
      wellnessScore: 0,
      isEvolving: false,
      lastCheckIn: null,

      checkIn: (amount) => {
        const state = get();
        const newStreak = state.streak + 1;
        const addedWellness = amount ? Math.max(0, amount) : 1;
        const newWellness = Math.min(100, state.wellnessScore + addedWellness);

        set({
          streak: newStreak,
          wellnessScore: newWellness,
          lastCheckIn: new Date().toISOString(),
        });

        get().evolve();
      },

      evolve: () => {
        const state = get();
        const threshold = THRESHOLDS[state.stage];
        if (state.stage !== 'whale' && state.streak >= threshold) {
          set({ isEvolving: true, mood: 'happy' });
        }
      },

      setMood: (mood) => {
        set({ mood });
      },

      completeEvolution: () => {
        set((state) => ({
          stage: nextStage(state.stage),
          isEvolving: false,
          mood: 'happy',
        }));
      },
    }),
    {
      name: 'finagotchi-radial-pet',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
