/**
 * A completed swap is a verified on-chain action feeding the existing pet
 * loop — same reward shape as a DCA fill (FillWatcher.defaultFeed): points
 * bump + XP + happiness + Care Clock refill. The pet store is imported lazily
 * so this module stays loadable without React Native.
 */

/** Reward for one completed swap — keep in sync with the wizard's FACTS copy. */
export const SWAP_REWARD = { points: 25, xp: 10, happiness: 10 } as const;

export function rewardSwap(): void {
    void import('../../features/pet/store').then(({ usePetStore }) => {
        const pet = usePetStore.getState();
        pet.addBalance(SWAP_REWARD.points);
        pet.addXp(SWAP_REWARD.xp);
        pet.boostHappiness(SWAP_REWARD.happiness);
        pet.resetLifeTimer();
    });
}
