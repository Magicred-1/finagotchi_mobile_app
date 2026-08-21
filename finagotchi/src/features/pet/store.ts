import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type PetStage = 1 | 2 | 3 | 4 | 5;

export type PetBackground = 'default' | 'aurora' | 'sunset' | 'midnight' | 'galaxy' | 'gold';
export type PetAccessory = 'none' | 'crown' | 'glasses' | 'bowtie' | 'halo' | 'diamond';

export const BACKGROUND_COLORS: Record<PetBackground, readonly [string, string]> = {
    default: ['rgba(93,226,166,0.06)', 'rgba(93,226,166,0.12)'],
    aurora: ['rgba(53,215,255,0.08)', 'rgba(192,140,255,0.14)'],
    sunset: ['rgba(255,142,158,0.08)', 'rgba(255,193,94,0.14)'],
    midnight: ['rgba(30,41,59,0.5)', 'rgba(53,215,255,0.10)'],
    galaxy: ['rgba(99,50,180,0.18)', 'rgba(53,215,255,0.14)'],
    gold: ['rgba(255,193,94,0.14)', 'rgba(255,142,74,0.12)'],
};

export const ACCESSORY_EMOJI: Record<PetAccessory, string> = {
    none: '',
    crown: '👑',
    glasses: '🕶️',
    bowtie: '🎀',
    halo: '😇',
    diamond: '💎',
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
    /** Spendable points balance. Earned by caring for the creature; spent on actions and collectibles. */
    balance: number;
    ownedBackgrounds: PetBackground[];
    ownedAccessories: PetAccessory[];

    getStage: () => PetStage;
    setCreatureName: (name: string) => void;
    mintCreature: (name: string, mintAddress: string) => void;
    setLastCelebratedStage: (stage: PetStage) => void;
    setCosmetic: (patch: Partial<Pick<PetState, 'background' | 'accessory'>>) => void;
    /** Add to the spendable balance. */
    addBalance: (amount: number) => void;
    /** Spend balance if enough is available. Returns true on success. */
    spendBalance: (amount: number) => boolean;
    /** Purchase a background if affordable and not already owned. Returns true on success. */
    purchaseBackground: (id: PetBackground, price: number) => boolean;
    /** Purchase an accessory if affordable and not already owned. Returns true on success. */
    purchaseAccessory: (id: PetAccessory, price: number) => boolean;
    /** Own a background without spending (e.g. streak unlocks). */
    ownBackground: (id: PetBackground) => void;
    /** Own an accessory without spending (e.g. streak unlocks). */
    ownAccessory: (id: PetAccessory) => void;
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
            balance: 750,
            ownedBackgrounds: ['default'],
            ownedAccessories: ['none'],

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

            addBalance: (amount) => {
                set({ balance: get().balance + Math.max(0, amount) });
            },

            spendBalance: (amount) => {
                const current = get().balance;
                const cost = Math.max(0, amount);
                if (cost > current) return false;
                set({ balance: current - cost });
                return true;
            },

            purchaseBackground: (id, price) => {
                const state = get();
                if (state.ownedBackgrounds.includes(id)) return true;
                const cost = Math.max(0, price);
                if (cost > state.balance) return false;
                set({
                    balance: state.balance - cost,
                    ownedBackgrounds: [...state.ownedBackgrounds, id],
                });
                return true;
            },

            purchaseAccessory: (id, price) => {
                const state = get();
                if (state.ownedAccessories.includes(id)) return true;
                const cost = Math.max(0, price);
                if (cost > state.balance) return false;
                set({
                    balance: state.balance - cost,
                    ownedAccessories: [...state.ownedAccessories, id],
                });
                return true;
            },

            ownBackground: (id) => {
                const state = get();
                if (state.ownedBackgrounds.includes(id)) return;
                set({ ownedBackgrounds: [...state.ownedBackgrounds, id] });
            },

            ownAccessory: (id) => {
                const state = get();
                if (state.ownedAccessories.includes(id)) return;
                set({ ownedAccessories: [...state.ownedAccessories, id] });
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
