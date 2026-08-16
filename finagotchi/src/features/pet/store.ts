import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type PetStage = 1 | 2 | 3;

type PetState = {
    stage: PetStage;
    totalCheckins: number;

    getStage: () => PetStage;
};

export const usePetStore = create<PetState>()(
    persist(
        (set, get) => ({
        stage: 1,
        totalCheckins: 0,

        getStage: () => get().stage,
        }),
        {
        name: 'finagotchi-pet',
        storage: createJSONStorage(() => AsyncStorage),
        }
    )
);

export function calculateStage(streak: number): PetStage {
    if (streak >= 30) return 3;
    if (streak >= 7) return 2;
    return 1;
}

export function updatePetStage(streak: number) {
    const stage = calculateStage(streak);

    usePetStore.setState({
        stage,
    });
}