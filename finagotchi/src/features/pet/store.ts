import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type PetStage = 1 | 2 | 3 | 4 | 5;

export type PetBackground = 'default' | 'aurora' | 'sunset' | 'midnight';
export type PetAccessory = 'none' | 'crown' | 'glasses' | 'bowtie';

export const BACKGROUND_COLORS: Record<PetBackground, readonly [string, string]> = {
    default: ['rgba(93,226,166,0.06)', 'rgba(93,226,166,0.12)'],
    aurora: ['rgba(53,215,255,0.08)', 'rgba(192,140,255,0.14)'],
    sunset: ['rgba(255,142,158,0.08)', 'rgba(255,193,94,0.14)'],
    midnight: ['rgba(30,41,59,0.5)', 'rgba(53,215,255,0.10)'],
};

export const ACCESSORY_EMOJI: Record<PetAccessory, string> = {
    none: '',
    crown: '👑',
    glasses: '🕶️',
    bowtie: '🎀',
};

export const STAGE_NAMES: Record<PetStage, string> = {
    1: 'Egg',
    2: 'Hatchling • Newborn',
    3: 'Coinling • Saver',
    4: 'HODLer • Disciplined',
    5: 'Whale • Legend',
};

export const STAGE_THRESHOLDS = [0, 1, 7, 30, 90];

type PetState = {
    stage: PetStage;
    totalCheckins: number;
    name: string | null;
    mintAddress: string | null;
    mintedAt: string | null;
    lastCelebratedStage: PetStage;
    evolvedAt: string | null;
    background: PetBackground;
    accessory: PetAccessory;

    getStage: () => PetStage;
    setCreatureName: (name: string) => void;
    mintCreature: (name: string, mintAddress: string) => void;
    setLastCelebratedStage: (stage: PetStage) => void;
    setCosmetic: (patch: Partial<Pick<PetState, 'background' | 'accessory'>>) => void;
};

export const usePetStore = create<PetState>()(
    persist(
        (set, get) => ({
            stage: 1,
            totalCheckins: 0,
            name: null,
            mintAddress: null,
            mintedAt: null,
            lastCelebratedStage: 1,
            evolvedAt: null,
            background: 'default',
            accessory: 'none',

            getStage: () => get().stage,

            setCreatureName: (name) => {
                set({ name: name.trim() || null });
            },

            mintCreature: (name, mintAddress) => {
                set({
                    name: name.trim() || null,
                    mintAddress,
                    mintedAt: new Date().toISOString(),
                    stage: 1,
                    lastCelebratedStage: 1,
                    evolvedAt: new Date().toISOString(),
                });
            },

            setLastCelebratedStage: (stage) => {
                set({ lastCelebratedStage: stage });
            },

            setCosmetic: (patch) => {
                set(patch);
            },
        }),
        {
            name: 'finagotchi-pet',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);

export function calculateStage(streak: number): PetStage {
    if (streak >= 90) return 5;
    if (streak >= 30) return 4;
    if (streak >= 7) return 3;
    if (streak >= 1) return 2;
    return 1;
}

export function updatePetStage(streak: number) {
    const stage = calculateStage(streak);

    usePetStore.setState({
        stage,
        evolvedAt: new Date().toISOString(),
    });
}
