/**
 * @finagotchi/quest-engine — deterministic quest generation, shared by app + server.
 *
 * DETERMINISM CONTRACT (client and server MUST both follow it):
 *
 * - Time: all timestamps are unix ms; all day math is UTC; `day` is `YYYY-MM-DD`.
 * - Seed: seedBytes = SHA256(utf8(`${wallet}|${day}`)); PRNG state = uint32 from
 *   seedBytes[0..4] BIG-ENDIAN; PRNG is mulberry32 (see rng.ts).
 * - Draw order inside generateDailyQuests (fixed, in this exact order):
 *     1. habit selection — no draws (sort txCount desc, tie programId asc, top 3);
 *     2. one stretch draw per selected habit, always consumed, even when the
 *        quest is skipped by history dedupe;
 *     3. one explore-probability draw, always consumed when habits exist;
 *     4. one candidate-index draw, only when the explore roll succeeds.
 *   Cold start (no habits) consumes NO draws and returns the fixed cohort list.
 * - Quest id: first 16 hex chars of SHA256(`${day}:${kind}:${programId}:${index}`)
 *   where index is the quest's position in the emitted list.
 * - typical frequency = (windowDays * 24) / ewmaIntervalHours;
 *   goal = clamp(ceil(typical * stretch), 1, windowDays);
 *   xp   = clamp(10 * goal, 10, 200); explore quests are fixed at 25 xp.
 * - Event folding (onNewTx) uses `now = tx.blockTime`, EWMA alpha = 0.1, and the
 *   7-bit active-days bitmap with bit 0 = most recent activity day.
 *
 * Any change to the above is a BREAKING protocol change for quest verification.
 */

export * from './types';
export * from './sha256';
export * from './rng';
export * from './profile';
export * from './generate';
export * from './auth';
