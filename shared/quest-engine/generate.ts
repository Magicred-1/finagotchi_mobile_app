import { createRng } from './rng';
import { sha256Hex } from './sha256';
import { DAY_MS, isHabit } from './profile';
import type { ActivityProfile, Quest, QuestHistoryEntry, QuestKind } from './types';

export const QUEST_WINDOW_DAYS = 7;
export const MAX_HABIT_QUESTS = 3;
/** Programs used more often than one tx per 30h get a streak quest. */
export const STREAK_INTERVAL_THRESHOLD_HOURS = 30;
export const STRETCH_MIN = 1.25;
/** stretch = STRETCH_MIN + next() * STRETCH_SPAN, i.e. uniform in [1.25, 1.75). */
export const STRETCH_SPAN = 0.5;
export const EXPLORE_PROBABILITY = 0.2;
export const EXPLORE_XP = 25;

/** xp = clamp(10 * goal, 10, 200). */
export function xpForGoal(goal: number): number {
  return Math.min(200, Math.max(10, 10 * goal));
}

export interface ExploreCandidate {
  programId: string;
  name: string;
  sponsor: string;
}

/** Well-known mainnet programs offered as explore/sponsored quests. Fixed order matters. */
export const EXPLORE_CANDIDATES: readonly ExploreCandidate[] = [
  { programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', name: 'Jupiter', sponsor: 'Jupiter' },
  { programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', name: 'Raydium', sponsor: 'Raydium' },
  { programId: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', name: 'Orca', sponsor: 'Orca' },
  { programId: 'MarBmsSgKXdrN1egZf5sqG1W9CasPJmPsoCJokbpEpq', name: 'Marinade', sponsor: 'Marinade' },
];

const PROGRAM_NAMES: Record<string, string> = Object.fromEntries(
  EXPLORE_CANDIDATES.map((c) => [c.programId, c.name]),
);

function displayName(programId: string): string {
  return PROGRAM_NAMES[programId] ?? `${programId.slice(0, 4)}…${programId.slice(-4)}`;
}

/** Inclusive/exclusive ms window a quest is evaluated over: the trailing `windowDays` UTC days ending at end of `day`. */
export function questWindow(day: string, windowDays: number): { fromMs: number; toMs: number } {
  const dayStart = Date.parse(`${day}T00:00:00.000Z`);
  return { fromMs: dayStart - (windowDays - 1) * DAY_MS, toMs: dayStart + DAY_MS };
}

export function questId(day: string, kind: QuestKind, programId: string, index: number): string {
  return sha256Hex(`${day}:${kind}:${programId}:${index}`).slice(0, 16);
}

function assertDay(day: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00.000Z`))) {
    throw new Error(`invalid day, expected UTC YYYY-MM-DD: ${day}`);
  }
}

/**
 * Deterministically generate the daily quest list for (wallet, day).
 *
 * This function is PURE and is the single source of truth run by BOTH the
 * app (to display quests) and the server (to verify claims). Same inputs ->
 * identical output. The RNG draw order is part of the contract:
 *
 *   1. Habit selection is RNG-free: programs where isHabit() at day start,
 *      sorted by txCount desc, ties by programId asc, top 3.
 *   2. For each selected habit, IN ORDER: exactly ONE draw (stretch), taken
 *      unconditionally — even if the quest is later skipped by history dedupe.
 *   3. Exactly ONE draw: explore roll. If roll < EXPLORE_PROBABILITY:
 *   4. Exactly ONE more draw: candidate start index into EXPLORE_CANDIDATES,
 *      then a deterministic forward scan for the first candidate not already
 *      a habit and not deduped by history.
 *
 * Cold start (no habits): NO RNG draws; the fixed COHORT_DEFAULT_QUESTS list
 * (minus history-deduped entries) is returned.
 *
 * `questHistory` should contain only quests credited on PRIOR days
 * (programId + kind); matching candidates are skipped.
 */
export function generateDailyQuests(
  wallet: string,
  profile: ActivityProfile,
  day: string,
  questHistory: readonly QuestHistoryEntry[] = [],
): Quest[] {
  assertDay(day);
  const dayStartMs = Date.parse(`${day}T00:00:00.000Z`);
  const historySet = new Set(questHistory.map((h) => `${h.kind}:${h.programId}`));

  const habits = Object.entries(profile.programs)
    .filter(([, stats]) => isHabit(stats, dayStartMs))
    .sort((a, b) => b[1].txCount - a[1].txCount || (a[0] < b[0] ? -1 : 1))
    .slice(0, MAX_HABIT_QUESTS);

  if (habits.length === 0) {
    return COHORT_DEFAULT_QUESTS.filter(
      (c) => !historySet.has(`explore:${c.programId}`),
    ).map((c, i) => ({
      id: questId(day, 'explore', c.programId, i),
      day,
      kind: 'explore',
      programId: c.programId,
      goal: 1,
      windowDays: QUEST_WINDOW_DAYS,
      xp: EXPLORE_XP,
      title: `Try ${c.name}`,
      description: `Make your first transaction on ${c.name}.`,
      sponsor: c.sponsor,
    }));
  }

  const rng = createRng(`${wallet}|${day}`);
  const quests: Quest[] = [];
  const habitProgramIds = new Set(habits.map(([programId]) => programId));

  for (const [programId, stats] of habits) {
    // Draw 2/3a: one stretch draw per selected habit, unconditionally.
    const stretch = STRETCH_MIN + rng.next() * STRETCH_SPAN;
    const kind: QuestKind =
      stats.ewmaIntervalHours < STREAK_INTERVAL_THRESHOLD_HOURS ? 'streak' : 'count';
    if (historySet.has(`${kind}:${programId}`)) continue;

    // Typical frequency is derived from the interval EWMA:
    //   typicalPerWindow = (windowDays * 24) / ewmaIntervalHours
    // goal = ceil(typical * stretch), clamped to [1, windowDays] so a quest
    // never demands more units than there are days in its window.
    const typicalPerWindow = (QUEST_WINDOW_DAYS * 24) / stats.ewmaIntervalHours;
    const goal = Math.min(
      QUEST_WINDOW_DAYS,
      Math.max(1, Math.ceil(typicalPerWindow * stretch)),
    );
    const name = displayName(programId);
    const xp = xpForGoal(goal);

    quests.push({
      id: questId(day, kind, programId, quests.length),
      day,
      kind,
      programId,
      goal,
      windowDays: QUEST_WINDOW_DAYS,
      xp,
      title:
        kind === 'streak' ? `Use ${name} on ${goal} days` : `Make ${goal} ${name} transactions`,
      description:
        kind === 'streak'
          ? `Be active on ${name} on at least ${goal} distinct days within ${QUEST_WINDOW_DAYS} days.`
          : `Complete at least ${goal} transactions on ${name} within ${QUEST_WINDOW_DAYS} days.`,
    });
  }

  // Draw 3: explore roll — always consumed when the RNG stream exists.
  const exploreRoll = rng.next();
  if (exploreRoll < EXPLORE_PROBABILITY) {
    // Draw 4: candidate start index, then deterministic forward scan.
    const startIdx = Math.floor(rng.next() * EXPLORE_CANDIDATES.length);
    for (let k = 0; k < EXPLORE_CANDIDATES.length; k++) {
      const candidate = EXPLORE_CANDIDATES[(startIdx + k) % EXPLORE_CANDIDATES.length];
      if (habitProgramIds.has(candidate.programId)) continue;
      if (historySet.has(`explore:${candidate.programId}`)) continue;
      quests.push({
        id: questId(day, 'explore', candidate.programId, quests.length),
        day,
        kind: 'explore',
        programId: candidate.programId,
        goal: 1,
        windowDays: QUEST_WINDOW_DAYS,
        xp: EXPLORE_XP,
        title: `Explore ${candidate.name}`,
        description: `Step out of your routine: make a transaction on ${candidate.name}.`,
        sponsor: candidate.sponsor,
      });
      break;
    }
  }

  return quests;
}

/** Fixed cold-start list (Jupiter, Raydium, Orca) shown to wallets with no habits yet. */
const COHORT_DEFAULT_QUESTS: readonly ExploreCandidate[] = EXPLORE_CANDIDATES.slice(0, 3);
