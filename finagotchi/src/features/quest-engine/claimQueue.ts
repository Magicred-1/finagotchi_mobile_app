import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { QuestKind } from '../../../../shared/quest-engine';
import { QuestClientError, verifyClaim, type VerifyClaimRequest } from './client';
import { useProfileStore } from './profileStore';
import { usePetStore } from '../pet/store';

/**
 * programId/kind ride along so a credit can be recorded into the local quest
 * history without re-deriving the quest; they are stripped from the wire body.
 */
export interface QueuedClaim extends VerifyClaimRequest {
    programId?: string;
    kind?: QuestKind;
    /** Transient-rejection retries so far; reset when a failed claim is retried. */
    attempts: number;
    /** Epoch ms the claim first entered the queue. */
    firstSeenAt: number;
    /** Earliest epoch ms the next verify attempt may run (exponential backoff). */
    nextAttemptAt?: number;
}

/** enqueue input: retry metadata is stamped queue-side, callers may omit it. */
export type NewClaim = Omit<QueuedClaim, 'attempts' | 'firstSeenAt'> &
    Partial<Pick<QueuedClaim, 'attempts' | 'firstSeenAt' | 'nextAttemptAt'>>;

export interface FailedClaim extends QueuedClaim {
    reason: string;
    failedAt: number;
}

/**
 * Rejection reasons the server will never flip on retry. Currently empty:
 * `conditions_not_met` and `unknown_quest` are routinely transient (Helius
 * webhook ingest lag, the 6h backfill staleness gate, profile drift between
 * generation and verification) and resolve on retry, so they ride the
 * bounded-retry path in flush(). Add genuinely permanent reasons here.
 */
const DEFINITIVE_REJECTIONS = new Set<string>();

/** Give up on a transient rejection after this many attempts... */
const MAX_ATTEMPTS = 20;
/** ...or once the claim has been queued longer than this. */
const MAX_AGE_MS = 48 * 3_600_000;
/** Backoff between retries: 2^attempts minutes, never more than this. */
const MAX_BACKOFF_MS = 6 * 3_600_000;

type ClaimQueueState = {
    pending: QueuedClaim[];
    failed: FailedClaim[];

    enqueue: (claim: NewClaim) => void;
    /**
     * Move failed claims back to pending with a fresh retry budget — all of
     * a wallet's, or just one quest's. Returns the number requeued.
     */
    retryFailed: (wallet: string, questId?: string) => number;
    /**
     * Send due pending claims sequentially (claims inside their backoff
     * window are skipped). Removes a claim on credit, on a definitive server
     * rejection, or on an auth-impossible state (bad_signature /
     * wallet_mismatch / malformed, or a bare 401 from the optional bearer
     * gate) — all recorded under `failed`. Transient rejections
     * (conditions_not_met, unknown_quest, signature_not_found) stay queued
     * with an incremented attempt counter and exponential backoff, and move
     * to `failed` only after MAX_ATTEMPTS tries or MAX_AGE_MS in the queue.
     * Network, timeout, 5xx, nonce races that survive the client's built-in
     * retry, and signing failures keep the claim queued with no attempt
     * consumed (user can approve next flush).
     */
    flush: () => Promise<{ credited: number; failed: number; remaining: number }>;
    pendingCount: () => number;
};

let flushing = false;

export const useClaimQueue = create<ClaimQueueState>()(
    persist(
        (set, get) => ({
            pending: [],
            failed: [],

            enqueue: (claim) => {
                const dup = get().pending.some(
                    (c) => c.wallet === claim.wallet && c.questId === claim.questId,
                );
                if (dup) return;
                set({
                    pending: [
                        ...get().pending,
                        {
                            ...claim,
                            attempts: claim.attempts ?? 0,
                            firstSeenAt: claim.firstSeenAt ?? Date.now(),
                        },
                    ],
                });
            },

            retryFailed: (wallet, questId) => {
                const retrying = get().failed.filter(
                    (f) =>
                        f.wallet === wallet &&
                        (questId === undefined || f.questId === questId),
                );
                if (retrying.length === 0) return 0;
                set({
                    failed: get().failed.filter((f) => !retrying.includes(f)),
                });
                for (const {
                    reason: _r,
                    failedAt: _f,
                    attempts: _a,
                    firstSeenAt: _fs,
                    nextAttemptAt: _n,
                    ...claim
                } of retrying) {
                    // Fresh retry budget: enqueue re-stamps firstSeenAt.
                    get().enqueue({ ...claim, attempts: 0 });
                }
                return retrying.length;
            },

            flush: async () => {
                if (flushing) {
                    return { credited: 0, failed: 0, remaining: get().pending.length };
                }
                flushing = true;
                let credited = 0;
                let failedCount = 0;
                try {
                    // Drain due claims; anything still in `pending` stays queued.
                    for (;;) {
                        const now = Date.now();
                        const claim = get().pending.find(
                            (c) => (c.nextAttemptAt ?? 0) <= now,
                        );
                        if (!claim) break;
                        const drop = () =>
                            set({ pending: get().pending.filter((c) => c !== claim) });
                        const fail = (reason: string) => {
                            failedCount += 1;
                            set({
                                failed: [
                                    ...get().failed,
                                    { ...claim, reason, failedAt: Date.now() },
                                ],
                            });
                            drop();
                        };

                        let res;
                        try {
                            const {
                                programId: _p,
                                kind: _k,
                                attempts: _a,
                                firstSeenAt: _f,
                                nextAttemptAt: _n,
                                ...wire
                            } = claim;
                            res = await verifyClaim(wire);
                        } catch (err) {
                            if (err instanceof QuestClientError) {
                                if (err.code === 'signer') {
                                    // Signing was declined or no signer/session is
                                    // configured. NOT definitive: the user may approve
                                    // next time — keep queued, retry next flush.
                                    break;
                                }
                                if (err.code === 'auth') {
                                    if (
                                        err.authReason === 'bad_signature' ||
                                        err.authReason === 'wallet_mismatch' ||
                                        err.authReason === 'malformed'
                                    ) {
                                        // True auth-impossible states: the client
                                        // already retried expired/unknown_nonce once
                                        // inside verifyClaim, and these reasons mean
                                        // a signer/config bug no retry can fix.
                                        fail(err.authReason);
                                        continue;
                                    }
                                    // expired/unknown_nonce surviving the built-in
                                    // retry (e.g. clock skew): keep queued.
                                    break;
                                }
                                if (err.status === 401) {
                                    // Bare 401 = the optional bearer gate rejected
                                    // us — retrying cannot fix config.
                                    fail('unauthorized');
                                    continue;
                                }
                            }
                            // Network, timeout, 5xx: stop here, retry next flush.
                            break;
                        }

                        if (res.credited) {
                            credited += 1;
                            // The server verified this claim — apply the reward
                            // locally. Duplicate replays were already granted on
                            // the first flush, so only fresh credits pay out.
                            if (!res.duplicate) {
                                const pet = usePetStore.getState();
                                pet.applyServerGrant({
                                    xp: res.xp,
                                    points: res.xp,
                                });
                                // Quests support the creature: a happiness bump
                                // plus the quest life bonus (capped inside).
                                pet.boostHappiness(10);
                                pet.extendLifeTimer();
                            }
                            if (claim.programId && claim.kind) {
                                useProfileStore
                                    .getState()
                                    .markCredited(
                                        claim.wallet,
                                        { programId: claim.programId, kind: claim.kind },
                                        claim.day,
                                    );
                            }
                            drop();
                        } else if (DEFINITIVE_REJECTIONS.has(res.reason)) {
                            fail(res.reason);
                        } else {
                            // Transient server-side rejections: conditions_not_met
                            // while ingest catches up, unknown_quest before the
                            // server backfills, signature_not_found, etc. Retry
                            // with backoff until the attempt/age budget runs out.
                            const attempts = claim.attempts + 1;
                            if (
                                attempts >= MAX_ATTEMPTS ||
                                now - claim.firstSeenAt > MAX_AGE_MS
                            ) {
                                fail(res.reason);
                                continue;
                            }
                            const backoff = Math.min(
                                2 ** attempts * 60_000,
                                MAX_BACKOFF_MS,
                            );
                            set({
                                pending: get().pending.map((c) =>
                                    c === claim
                                        ? { ...c, attempts, nextAttemptAt: now + backoff }
                                        : c,
                                ),
                            });
                            // Stop this flush; a later app-open/reconnect/tap
                            // pass retries once the backoff window elapses.
                            break;
                        }
                    }
                } finally {
                    flushing = false;
                }
                return { credited, failed: failedCount, remaining: get().pending.length };
            },

            pendingCount: () => get().pending.length,
        }),
        {
            name: 'finagotchi-quest-claim-queue',
            storage: createJSONStorage(() => AsyncStorage),
            // Transient flush guard is module-level, not persisted.
            partialize: (state) => ({ pending: state.pending, failed: state.failed }),
            // Entries persisted before the retry fields existed get defaults
            // on rehydrate instead of crashing flush.
            merge: (persisted, current) => {
                const state = persisted as
                    | Partial<Pick<ClaimQueueState, 'pending' | 'failed'>>
                    | undefined;
                const normalize = <T extends QueuedClaim>(claim: T): T => ({
                    ...claim,
                    attempts: claim.attempts ?? 0,
                    firstSeenAt: claim.firstSeenAt ?? Date.now(),
                });
                return {
                    ...current,
                    pending: (state?.pending ?? []).map(normalize),
                    failed: (state?.failed ?? []).map(normalize),
                };
            },
        },
    ),
);
