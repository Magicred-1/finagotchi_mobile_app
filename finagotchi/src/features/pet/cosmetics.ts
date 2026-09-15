import type { PetAccessory, PetBackground } from './store';

export type CosmeticBackground = {
    id: PetBackground;
    name: string;
    /** Streak required to unlock the free copy. */
    unlock: number;
    /** Points price; 0 means the item is unlocked by streak instead. */
    price: number;
};

export type CosmeticAccessory = {
    id: PetAccessory;
    name: string;
    unlock: number;
    price: number;
};

export const COSMETIC_BACKGROUNDS: CosmeticBackground[] = [
    { id: 'default', name: 'Meadow', unlock: 0, price: 0 },
    { id: 'aurora', name: 'Aurora', unlock: 3, price: 0 },
    { id: 'sunset', name: 'Sunset', unlock: 7, price: 0 },
    { id: 'midnight', name: 'Midnight', unlock: 14, price: 0 },
    { id: 'galaxy', name: 'Galaxy', unlock: 0, price: 1200 },
    { id: 'gold', name: 'Golden', unlock: 0, price: 3000 },
];

export const COSMETIC_ACCESSORIES: CosmeticAccessory[] = [
    { id: 'none', name: 'None', unlock: 0, price: 0 },
    { id: 'glasses', name: 'Shades', unlock: 3, price: 0 },
    { id: 'bowtie', name: 'Bowtie', unlock: 7, price: 0 },
    { id: 'crown', name: 'Royal Crown', unlock: 14, price: 0 },
    { id: 'halo', name: 'Halo', unlock: 0, price: 800 },
    { id: 'tshirt', name: 'Coin Tee', unlock: 0, price: 1500 },
    { id: 'diamond', name: 'Diamond', unlock: 0, price: 2500 },
];

/** Premium items cost points — these are the prize pool for the daily wheel. */
export function premiumBackgrounds(): CosmeticBackground[] {
    return COSMETIC_BACKGROUNDS.filter((item) => item.price > 0);
}

export function premiumAccessories(): CosmeticAccessory[] {
    return COSMETIC_ACCESSORIES.filter((item) => item.price > 0);
}
