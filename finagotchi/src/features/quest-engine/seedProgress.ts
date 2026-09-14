import {
    DAY_MS,
    dayIndex,
    questWindow,
    shiftActiveDays,
    type ActivityProfile,
    type Quest,
} from '../../../../shared/quest-engine';

/** Local evidence for one quest: qualifying tx count + distinct UTC days seen. */
export interface QuestProgress {
    count: number;
    activeDays: Record<string, true>;
}

export function utcDay(nowMs: number): string {
    return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * Merge two progress records for the same quest, never regressing: max
 * count, union of active days. Used to fold server-exact progress into
 * locally-seeded/live progress without losing a just-sent tx the server
 * hasn't ingested yet.
 */
export function mergeProgress(a: QuestProgress, b: QuestProgress): QuestProgress {
    return {
        count: Math.max(a.count, b.count),
        activeDays: { ...a.activeDays, ...b.activeDays },
    };
}

/**
 * Seed a fresh day's progress from the activity profile. Quest windows span
 * 7 days, so history that predates the app's first sync already counts
 * server-side — without seeding, a returning user starts every quest at 0
 * and never auto-claims. The active-days bitmap is EXACT for distinct days
 * (what streak quests measure); for volume quests it under-seeds (each
 * active day had >= 1 tx), which can never fire a claim the server would
 * reject — the server stays the payout authority either way.
 */
export function seedProgressFromProfile(
    quests: Quest[],
    profile: ActivityProfile,
    day: string,
): Record<string, QuestProgress> {
    const dayStartMs = Date.parse(`${day}T00:00:00.000Z`);
    const seeded: Record<string, QuestProgress> = {};
    for (const quest of quests) {
        const stats = profile.programs[quest.programId];
        if (!stats || stats.lastSeen <= 0) continue;
        const { fromMs, toMs } = questWindow(quest.day, quest.windowDays);
        if (stats.lastSeen < fromMs || stats.lastSeen >= toMs) continue;

        const bitmap = shiftActiveDays(
            stats.activeDays7d,
            dayIndex(dayStartMs) - dayIndex(stats.lastSeen),
        );
        const activeDays: Record<string, true> = {};
        for (let k = 0; k < 7; k++) {
            if ((bitmap >> k) & 1) activeDays[utcDay(dayStartMs - k * DAY_MS)] = true;
        }
        const days = Object.keys(activeDays).length;
        if (days === 0) continue;
        seeded[quest.id] = { count: days, activeDays };
    }
    return seeded;
}
