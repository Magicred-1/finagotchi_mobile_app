import { describe, expect, it } from 'vitest';

import { shouldAdoptDeviceStreak } from '../streakMerge';

describe('shouldAdoptDeviceStreak', () => {
    it('adopts a strictly greater device streak (offline day tick)', () => {
        expect(shouldAdoptDeviceStreak(8, 7)).toBe(true);
        expect(shouldAdoptDeviceStreak(1, 0)).toBe(true);
    });

    it('ignores equal or lower device streaks (stale echoes)', () => {
        expect(shouldAdoptDeviceStreak(7, 7)).toBe(false);
        expect(shouldAdoptDeviceStreak(3, 7)).toBe(false);
        expect(shouldAdoptDeviceStreak(0, 7)).toBe(false);
    });
});
