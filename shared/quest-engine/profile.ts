import type { ActivityProfile, ProgramStats, TxEvent } from './types';

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
export const EWMA_ALPHA = 0.1;
/** Neutral starting interval EWMA for a newly seen program (1 week). */
export const DEFAULT_EWMA_INTERVAL_HOURS = 168;
export const ACTIVE_DAYS_MASK = 0x7f; // 7 bits
export const HABIT_RECENCY_MS = 10 * DAY_MS;
export const HABIT_MIN_ACTIVE_DAYS = 2;
export const HABIT_MAX_INTERVAL_HOURS = 168;

export function emptyProgramStats(): ProgramStats {
  return {
    txCount: 0,
    ewmaIntervalHours: DEFAULT_EWMA_INTERVAL_HOURS,
    ewmaAmount: 0,
    maxAmount: 0,
    activeDays7d: 0,
    lastSeen: 0,
  };
}

export function emptyProfile(wallet: string): ActivityProfile {
  return { wallet, programs: {}, updatedAt: 0 };
}

export function dayIndex(nowMs: number): number {
  return Math.floor(nowMs / DAY_MS);
}

/**
 * Roll the active-days bitmap forward by `dayDiff` days.
 * Bit 0 always represents the most recent activity day, so moving the
 * reference day forward shifts existing bits LEFT (bit k -> bit k+dayDiff).
 */
export function shiftActiveDays(bitmap: number, dayDiff: number): number {
  if (dayDiff <= 0) return bitmap & ACTIVE_DAYS_MASK;
  if (dayDiff >= 7) return 0;
  return (bitmap << dayDiff) & ACTIVE_DAYS_MASK;
}

export function popcount7(bitmap: number): number {
  let n = bitmap & ACTIVE_DAYS_MASK;
  let c = 0;
  while (n) {
    n &= n - 1;
    c++;
  }
  return c;
}

/**
 * Fold one confirmed transaction into the activity profile. O(1), no I/O.
 * MUTATES and returns `profile`.
 *
 * Callers MUST pass `now = tx.blockTime` (not wall-clock time) so that
 * backfilled history produces the same EWMAs as live ingestion, and so the
 * server reproduces the exact profile the app computed.
 */
export function onNewTx(profile: ActivityProfile, tx: TxEvent, now: number): ActivityProfile {
  const stats = profile.programs[tx.programId] ?? emptyProgramStats();

  if (stats.lastSeen > 0 && now > stats.lastSeen) {
    const gapHours = (now - stats.lastSeen) / HOUR_MS;
    stats.ewmaIntervalHours =
      (1 - EWMA_ALPHA) * stats.ewmaIntervalHours + EWMA_ALPHA * gapHours;
  }

  stats.txCount += 1;

  if (tx.amount !== undefined) {
    stats.ewmaAmount =
      stats.txCount === 1
        ? tx.amount
        : (1 - EWMA_ALPHA) * stats.ewmaAmount + EWMA_ALPHA * tx.amount;
    if (tx.amount > stats.maxAmount) stats.maxAmount = tx.amount;
  }

  const dayDiff = stats.lastSeen > 0 ? dayIndex(now) - dayIndex(stats.lastSeen) : 0;
  stats.activeDays7d = stats.lastSeen > 0 ? shiftActiveDays(stats.activeDays7d, dayDiff) | 1 : 1;
  stats.lastSeen = Math.max(stats.lastSeen, now);

  profile.programs[tx.programId] = stats;
  profile.updatedAt = Math.max(profile.updatedAt, now);
  return profile;
}

/**
 * A program is a "habit" when the wallet used it recently, on multiple days,
 * and at least weekly on average. Popcount is shift-invariant, so callers do
 * not need to roll the bitmap to `now` first.
 */
export function isHabit(stats: ProgramStats, now: number): boolean {
  if (stats.lastSeen <= 0) return false;
  if (now - stats.lastSeen >= HABIT_RECENCY_MS) return false;
  if (popcount7(stats.activeDays7d) < HABIT_MIN_ACTIVE_DAYS) return false;
  return stats.ewmaIntervalHours < HABIT_MAX_INTERVAL_HOURS;
}
