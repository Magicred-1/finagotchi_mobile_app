/**
 * Shared types for the Finagotchi quest engine.
 * All timestamps are unix MILLISECONDS everywhere in this package.
 */

export type QuestKind = 'count' | 'streak' | 'explore';

export interface ProgramStats {
  /** Transactions observed for this wallet+program within the tracked window (30d). */
  txCount: number;
  /** EWMA (alpha 0.1) of hours between consecutive txs. New programs start at 168. */
  ewmaIntervalHours: number;
  /** EWMA (alpha 0.1) of tx amount, in the event's native units. */
  ewmaAmount: number;
  maxAmount: number;
  /** 7-bit bitmap of recent active UTC days. Bit 0 = day of `lastSeen`, bit k = k days earlier. */
  activeDays7d: number;
  /** unix ms of the most recent tx; 0 = never seen. */
  lastSeen: number;
}

export interface ActivityProfile {
  wallet: string;
  programs: Record<string, ProgramStats>;
  /** unix ms of the last applied event. */
  updatedAt: number;
}

export interface TxEvent {
  signature: string;
  slot: number;
  /** unix ms. */
  blockTime: number;
  wallet: string;
  programId: string;
  instruction: string;
  tokenMint?: string;
  amount?: number;
}

export interface QuestTemplate {
  kind: QuestKind;
  programId: string;
  goal: number;
  windowDays: number;
  xp: number;
  title: string;
  description: string;
  sponsor?: string;
}

export interface Quest extends QuestTemplate {
  /** Deterministic id: first 16 hex chars of SHA256(`${day}:${kind}:${programId}:${index}`). */
  id: string;
  /** UTC day `YYYY-MM-DD` this quest list belongs to. */
  day: string;
}

/**
 * A previously credited quest, used to dedupe future generation.
 * The server derives these from quest_credits rows of PRIOR days;
 * the app derives them from its local credited-quest store.
 */
export interface QuestHistoryEntry {
  programId: string;
  kind: QuestKind;
}
