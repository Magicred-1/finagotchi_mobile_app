import { beforeEach, describe, expect, it } from 'vitest';

import {
    MILESTONE_JACKPOT_POINTS,
    WHEEL_SEGMENT_COUNT,
    awardPrize,
    buildWheel,
    pickSegment,
} from '../prizes';
import { localDayKey, useWheelStore } from '../store';
import { usePetStore, type PetAccessory, type PetBackground } from '../../pet/store';

const ALL_BACKGROUNDS: PetBackground[] = [
    'default',
    'aurora',
    'sunset',
    'midnight',
    'galaxy',
    'gold',
];
const ALL_ACCESSORIES: PetAccessory[] = [
    'none',
    'crown',
    'glasses',
    'bowtie',
    'halo',
    'diamond',
    'tshirt',
];

const ALL_PREMIUM_OWNED = {
    ownedBackgrounds: ALL_BACKGROUNDS,
    ownedAccessories: ALL_ACCESSORIES,
    streak: 0,
    isMilestoneDay: false,
};

const NOTHING_OWNED = {
    ownedBackgrounds: ['default'] as PetBackground[],
    ownedAccessories: ['none'] as PetAccessory[],
    streak: 0,
    isMilestoneDay: false,
};

function rareIndexes(segments: ReturnType<typeof buildWheel>): number[] {
    return segments
        .map((segment, index) =>
            segment.prize.type === 'background' ||
            segment.prize.type === 'accessory'
                ? index
                : -1
        )
        .filter((index) => index !== -1);
}

describe('buildWheel', () => {
    it('always fills the wheel with the fixed segment count', () => {
        const segments = buildWheel(NOTHING_OWNED);
        expect(segments).toHaveLength(WHEEL_SEGMENT_COUNT);
    });

    it('offers only unowned premium cosmetics as rare segments', () => {
        const segments = buildWheel({
            ...NOTHING_OWNED,
            ownedBackgrounds: ['default', 'galaxy'],
        });

        const rares = segments.filter(
            (s) => s.prize.type === 'background' || s.prize.type === 'accessory'
        );

        expect(rares.length).toBeGreaterThan(0);
        expect(
            rares.every((s) =>
                s.prize.type === 'background'
                    ? s.prize.id !== 'galaxy' && s.prize.id !== 'default'
                    : s.prize.type === 'accessory' && s.prize.id !== 'none'
            )
        ).toBe(true);
    });

    it('caps rare segments at four and fills the rest with points/XP', () => {
        const segments = buildWheel(NOTHING_OWNED);
        expect(rareIndexes(segments).length).toBeLessThanOrEqual(4);
        expect(rareIndexes(segments).length).toBeGreaterThan(0);
    });

    it('falls back to filler only when every premium cosmetic is owned', () => {
        const segments = buildWheel(ALL_PREMIUM_OWNED);
        expect(rareIndexes(segments)).toHaveLength(0);
        expect(
            segments.every((s) => s.prize.type === 'points' || s.prize.type === 'xp')
        ).toBe(true);
    });

    it('guarantees a rare segment on milestone days', () => {
        const segments = buildWheel({ ...NOTHING_OWNED, isMilestoneDay: true });
        const winning = pickSegment(segments, () => 0.999999);
        expect(rareIndexes(segments)).toContain(winning);
        expect(segments[winning].guaranteed).toBe(true);
    });

    it('falls back to a points jackpot on milestone days with nothing left to win', () => {
        const segments = buildWheel({
            ...ALL_PREMIUM_OWNED,
            isMilestoneDay: true,
        });
        const winning = pickSegment(segments, () => 0.999999);
        expect(segments[winning].prize).toEqual({
            type: 'points',
            amount: MILESTONE_JACKPOT_POINTS,
        });
    });

    it('tilts rare odds upward for long streaks', () => {
        const low = buildWheel({ ...NOTHING_OWNED, streak: 0 });
        const high = buildWheel({ ...NOTHING_OWNED, streak: 30 });

        const lowRareWeight = low[rareIndexes(low)[0]].weight;
        const highRareWeight = high[rareIndexes(high)[0]].weight;

        expect(highRareWeight).toBeGreaterThan(lowRareWeight);
    });

    it('is deterministic for a fixed rng', () => {
        const rng = () => 0.42;
        const a = buildWheel({ ...NOTHING_OWNED, rng });
        const b = buildWheel({ ...NOTHING_OWNED, rng });
        expect(a).toEqual(b);
    });
});

describe('pickSegment', () => {
    const segments = [
        { prize: { type: 'points', amount: 25 } as const, weight: 1 },
        { prize: { type: 'points', amount: 50 } as const, weight: 3 },
    ];

    it('returns the first segment for a zero roll', () => {
        expect(pickSegment(segments, () => 0)).toBe(0);
    });

    it('returns the last segment for a near-one roll', () => {
        expect(pickSegment(segments, () => 0.999999)).toBe(1);
    });

    it('respects cumulative weights', () => {
        // total = 4; roll 0.6 * 4 = 2.4 → skips segment 0 (weight 1), lands on 1.
        expect(pickSegment(segments, () => 0.6)).toBe(1);
    });
});

describe('wheel store', () => {
    beforeEach(() => {
        useWheelStore.setState({ lastSpinDay: null });
    });

    it('marks a spin for the current local day', () => {
        useWheelStore.getState().markSpun();
        expect(useWheelStore.getState().lastSpinDay).toBe(localDayKey());
    });
});

describe('awardPrize', () => {
    beforeEach(() => {
        usePetStore.setState({
            balance: 0,
            ownedBackgrounds: ['default'],
            ownedAccessories: ['none'],
        });
    });

    it('credits points and XP', () => {
        awardPrize({ type: 'points', amount: 25 });
        expect(usePetStore.getState().balance).toBe(25);

        awardPrize({ type: 'xp', amount: 15 });
        expect(usePetStore.getState().xp).toBeGreaterThanOrEqual(15);
    });

    it('grants cosmetic ownership without spending balance', () => {
        awardPrize({ type: 'background', id: 'galaxy' });
        awardPrize({ type: 'accessory', id: 'halo' });

        const pet = usePetStore.getState();
        expect(pet.ownedBackgrounds).toContain('galaxy');
        expect(pet.ownedAccessories).toContain('halo');
        expect(pet.balance).toBe(0);
    });
});
