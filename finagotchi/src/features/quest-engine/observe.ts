import type { Transaction } from '@solana/web3.js';

import { EXPLORE_CANDIDATES, type TxEvent } from '../../../../shared/quest-engine';
import { useClaimQueue } from './claimQueue';
import { useQuestsStore } from './questsStore';

/**
 * The server's default WATCHED_PROGRAMS is the engine's explore-candidate
 * list; only those programs can appear in the server-folded profile, so only
 * those are worth folding locally. Operators extending WATCHED_PROGRAMS
 * server-side should extend this set to match — events for programs missed
 * here still arrive via the next backfill, only local progress lags.
 */
const WATCHED_PROGRAM_IDS = new Set(EXPLORE_CANDIDATES.map((c) => c.programId));

/**
 * Fold an app-sent transaction into the local quest profile and progress,
 * mirroring the server's ingest rule: at most ONE event per tx — the first
 * instruction (in execution order) whose program is watched.
 *
 * blockTime is unknowable at send time, so the local clock stands in; the
 * next server backfill snapshot replaces the local profile wholesale. The
 * server remains the payout authority — this only drives display progress
 * and enqueues the claim for verification.
 */
export function observeOutgoingTx(
    signature: string,
    wallet: string,
    transaction: Transaction
): void {
    const hit = transaction.instructions.find((ix) =>
        WATCHED_PROGRAM_IDS.has(ix.programId.toBase58())
    );
    if (!hit) return;

    const tx: TxEvent = {
        signature,
        slot: 0,
        blockTime: Date.now(),
        wallet,
        programId: hit.programId.toBase58(),
        instruction: 'app_send',
    };
    useQuestsStore.getState().recordTx(tx);

    // recordTx enqueues a claim when a quest completes — try to cash it now.
    void useClaimQueue.getState().flush();
}
