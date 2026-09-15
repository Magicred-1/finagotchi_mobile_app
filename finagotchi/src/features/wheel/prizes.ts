import {
    COSMETIC_ACCESSORIES,
    COSMETIC_BACKGROUNDS,
} from '../pet/cosmetics';
import {
    usePetStore,
    type PetAccessory,
    type PetBackground,
} from '../pet/store';

export type WheelPrize =
    | { type: 'points'; amount: number }
    | { type: 'xp'; amount: number }
    | { type: 'background'; id: PetBackground }
    | { type: 'accessory'; id: PetAccessory };

export type WheelSegment = {
    prize: WheelPrize;
    weight: number;
    /** Milestone-day segment: always the winner regardless of weight. */
    guaranteed?: boolean;
};

export const WHEEL_SEGMENT_COUNT = 8;
export const WHEEL_RARE_SLOTS = 4;

/** Points payout used when a milestone spin has no cosmetic left to guarantee. */
export const MILESTONE_JACKPOT_POINTS = 300;

/** Weight that makes a segment effectively guaranteed. */
const GUARANTEED_WEIGHT = 100;

const POINTS_FILLER = [25, 50, 75] as const;
const XP_FILLER = 15;

const FILLER_WEIGHTS: Record<string, number> = {
    'points:25': 30,
    'points:50': 22,
    'points:75': 14,
    [`xp:${XP_FILLER}`]: 10,
};

/** Longer streaks tilt the wheel toward rare cosmetic segments. */
function rareWeightForStreak(streak: number): number {
    if (streak >= 30) return 14;
    if (streak >= 7) return 11;
    return 8;
}

function unownedPremiumPrizes(input: {
    ownedBackgrounds: readonly PetBackground[];
    ownedAccessories: readonly PetAccessory[];
}): WheelPrize[] {
    const backgrounds = COSMETIC_BACKGROUNDS.filter(
        (item) =>
            item.price > 0 && !input.ownedBackgrounds.includes(item.id)
    ).map((item) => ({ type: 'background', id: item.id }) as const);

    const accessories = COSMETIC_ACCESSORIES.filter(
        (item) =>
            item.price > 0 && !input.ownedAccessories.includes(item.id)
    ).map((item) => ({ type: 'accessory', id: item.id }) as const);

    return [...backgrounds, ...accessories];
}

function fillerPrize(index: number): WheelPrize {
    const cycle = index % (POINTS_FILLER.length + 1);
    if (cycle === POINTS_FILLER.length) {
        return { type: 'xp', amount: XP_FILLER };
    }
    return { type: 'points', amount: POINTS_FILLER[cycle] };
}

function fillerWeight(prize: WheelPrize): number {
    return FILLER_WEIGHTS[`${prize.type}:${(prize as { amount: number }).amount}`] ?? 10;
}

/**
 * Build the spin's segment list. Premium cosmetics the user does not own yet
 * fill up to WHEEL_RARE_SLOTS rare segments; the rest is points/XP filler so
 * every spin pays out. On a milestone day a rare segment (or a points jackpot
 * when no cosmetic is left) always wins.
 */
export function buildWheel(input: {
    ownedBackgrounds: readonly PetBackground[];
    ownedAccessories: readonly PetAccessory[];
    streak: number;
    isMilestoneDay: boolean;
    rng?: () => number;
}): WheelSegment[] {
    const rng = input.rng ?? Math.random;
    const pool = unownedPremiumPrizes(input);
    const rareCount = Math.min(WHEEL_RARE_SLOTS, pool.length);
    const rareWeight = rareWeightForStreak(input.streak);

    // Shuffle a copy so which rares are on the wheel varies per spin.
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const segments: WheelSegment[] = [];

    for (let i = 0; i < rareCount; i++) {
        segments.push({ prize: shuffled[i], weight: rareWeight });
    }

    const fillerCount = WHEEL_SEGMENT_COUNT - rareCount;
    for (let i = 0; i < fillerCount; i++) {
        const prize = fillerPrize(i);
        segments.push({ prize, weight: fillerWeight(prize) });
    }

    if (input.isMilestoneDay) {
        if (rareCount > 0) {
            const guaranteedIndex = Math.floor(rng() * rareCount);
            segments[guaranteedIndex] = {
                ...segments[guaranteedIndex],
                weight: GUARANTEED_WEIGHT,
                guaranteed: true,
            };
        } else {
            segments[0] = {
                prize: { type: 'points', amount: MILESTONE_JACKPOT_POINTS },
                weight: GUARANTEED_WEIGHT,
                guaranteed: true,
            };
        }
    }

    return segments;
}

/** Picks the winning segment; guaranteed segments always win. */
export function pickSegment(
    segments: readonly WheelSegment[],
    rng: () => number
): number {
    const guaranteed = segments.findIndex((s) => s.guaranteed);
    if (guaranteed !== -1) return guaranteed;

    const total = segments.reduce((sum, s) => sum + s.weight, 0);
    let roll = rng() * total;

    for (let i = 0; i < segments.length; i++) {
        roll -= segments[i].weight;
        if (roll < 0) return i;
    }

    return segments.length - 1;
}

/** Apply a won prize to the pet store (cosmetic ownership is local-only). */
export function awardPrize(prize: WheelPrize): void {
    const pet = usePetStore.getState();

    switch (prize.type) {
        case 'points':
            pet.addBalance(prize.amount);
            break;
        case 'xp':
            pet.addXp(prize.amount);
            break;
        case 'background':
            pet.ownBackground(prize.id);
            break;
        case 'accessory':
            pet.ownAccessory(prize.id);
            break;
    }
}

/** Display info for wheel segments and the result card. */
export function describePrize(prize: WheelPrize): {
    emoji: string;
    label: string;
    detail: string;
} {
    switch (prize.type) {
        case 'points':
            return {
                emoji: '💰',
                label: `${prize.amount} points`,
                detail: 'Spend them on treats, actions and styles.',
            };
        case 'xp':
            return {
                emoji: '⚡',
                label: `${prize.amount} XP`,
                detail: 'XP levels up your creature.',
            };
        case 'background': {
            const item = COSMETIC_BACKGROUNDS.find((b) => b.id === prize.id);
            return {
                emoji: '🖼️',
                label: item?.name ?? 'Background',
                detail: 'A new scene for your companion. Equip it from Collectibles.',
            };
        }
        case 'accessory': {
            const item = COSMETIC_ACCESSORIES.find((a) => a.id === prize.id);
            return {
                emoji: '✨',
                label: item?.name ?? 'Accessory',
                detail: 'A rare accessory. Equip it from Collectibles.',
            };
        }
    }
}
