import { describe, expect, it } from 'vitest';

import type { ActivityProfile, ProgramStats, Quest } from '../../../../../shared/quest-engine';
import { mergeProgress, seedProgressFromProfile, utcDay } from '../seedProgress';

const DAY = '2026-09-14';
const DAY_START_MS = Date.parse(`${DAY}T00:00:00.000Z`);
const DAY_MS = 86_400_000;
const PROGRAM = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

let questSeq = 0;
function makeQuest(kind: Quest['kind'], goal: number, programId = PROGRAM): Quest {
    questSeq += 1;
    return {
        id: `quest-${questSeq}`,
        day: DAY,
        kind,
        programId,
        goal,
        windowDays: 7,
        xp: 25,
        title: 't',
        description: 'd',
    };
}

function makeStats(lastSeen: number, activeDays7d: number): ProgramStats {
    return {
        txCount: 42,
        ewmaIntervalHours: 24,
        ewmaAmount: 0,
        maxAmount: 0,
        activeDays7d,
        lastSeen,
    };
}

function profileWith(stats?: ProgramStats): ActivityProfile {
    return {
        wallet: WALLET,
        programs: stats ? { [PROGRAM]: stats } : {},
        updatedAt: stats?.lastSeen ?? 0,
    };
}

describe('seedProgressFromProfile', () => {
    it('seeds exact active days when lastSeen is today (no bitmap shift)', () => {
        // bit 0 = lastSeen day (today), bit 2 = two days before lastSeen.
        const stats = makeStats(DAY_START_MS + 3_600_000, 0b0000101);
        const quest = makeQuest('streak', 2);
        const seeded = seedProgressFromProfile([quest], profileWith(stats), DAY);
        expect(seeded[quest.id]).toEqual({
            count: 2,
            activeDays: { [DAY]: true, [utcDay(DAY_START_MS - 2 * DAY_MS)]: true },
        });
    });

    it('aligns the bitmap to today when lastSeen was days ago', () => {
        // lastSeen 2 days ago at noon; bits 0/1 = that day and the one before.
        const lastSeen = DAY_START_MS - 2 * DAY_MS + 12 * 3_600_000;
        const stats = makeStats(lastSeen, 0b0000011);
        const quest = makeQuest('count', 5);
        const seeded = seedProgressFromProfile([quest], profileWith(stats), DAY);
        expect(seeded[quest.id]).toEqual({
            count: 2,
            activeDays: {
                [utcDay(DAY_START_MS - 2 * DAY_MS)]: true,
                [utcDay(DAY_START_MS - 3 * DAY_MS)]: true,
            },
        });
    });

    it('under-seeds volume quests by active days, never by all-time txCount', () => {
        // txCount is 42 all-time, but only 1 active day in the window.
        const stats = makeStats(DAY_START_MS + 3_600_000, 0b0000001);
        const quest = makeQuest('count', 6);
        const seeded = seedProgressFromProfile([quest], profileWith(stats), DAY);
        expect(seeded[quest.id]?.count).toBe(1);
    });

    it('skips programs last seen outside the quest window', () => {
        const stats = makeStats(DAY_START_MS - 8 * DAY_MS, 0b0000001);
        const quest = makeQuest('count', 1);
        expect(seedProgressFromProfile([quest], profileWith(stats), DAY)).toEqual({});
    });

    it('drops bitmap days that shifted out of the 7-day window', () => {
        // lastSeen 6 days ago, bit 6 = activity 12 days ago -> shifts off the mask.
        const stats = makeStats(DAY_START_MS - 6 * DAY_MS, 0b1000000);
        const quest = makeQuest('streak', 1);
        expect(seedProgressFromProfile([quest], profileWith(stats), DAY)).toEqual({});
    });

    it('seeds nothing for empty profiles or untracked programs', () => {
        const quest = makeQuest('explore', 1);
        expect(seedProgressFromProfile([quest], profileWith(), DAY)).toEqual({});
    });
});

describe('mergeProgress', () => {
    it('takes the max count and unions active days, never regressing', () => {
        const merged = mergeProgress(
            { count: 5, activeDays: { '2026-09-14': true, '2026-09-12': true } },
            { count: 3, activeDays: { '2026-09-13': true } },
        );
        expect(merged).toEqual({
            count: 5,
            activeDays: {
                '2026-09-14': true,
                '2026-09-13': true,
                '2026-09-12': true,
            },
        });
    });

    it('keeps the higher count when the server is ahead', () => {
        const merged = mergeProgress(
            { count: 1, activeDays: {} },
            { count: 6, activeDays: { '2026-09-10': true } },
        );
        expect(merged.count).toBe(6);
    });
});
