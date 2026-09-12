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
}

export interface FailedClaim extends QueuedClaim {
    reason: string;
    failedAt: number;
}

/** Rejection reasons the server will never flip on retry. */
const DEFINITIVE_REJECTIONS = new Set(['unknown_quest', 'conditions_not_met']);

type ClaimQueueState = {
    pending: QueuedClaim[];
    failed: FailedClaim[];

    enqueue: (claim: QueuedClaim) => void;
    /**
     * Send pending claims sequentially. Removes a claim on credit, on a
     * definitive server rejection (recorded under `failed`), or on an
     * auth-impossible state (bad_signature / wallet_mismatch / malformed,
     * or a bare 401 from the optional bearer gate). Keeps it on network,
     * timeout, 5xx, nonce races that survive the client's built-in retry,
     * and signing failures (user can approve next flush).
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
                set({ pending: [...get().pending, claim] });
            },

            flush: async () => {
                if (flushing) {
                    return { credited: 0, failed: 0, remaining: get().pending.length };
                }
                flushing = true;
                let credited = 0;
                let failedCount = 0;
                try {
                    // Drain a snapshot; anything still in `pending` stays queued.
                    while (get().pending.length > 0) {
                        const claim = get().pending[0];
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
                            const { programId: _p, kind: _k, ...wire } = claim;
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
                            // Transient server-side rejections (e.g. signature_not_found
                            // before ingest catches up) stay queued for the next flush.
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
        },
    ),
);
