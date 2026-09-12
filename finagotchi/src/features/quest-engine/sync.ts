import NetInfo from '@react-native-community/netinfo';

import { useClaimQueue } from './claimQueue';
import { useQuestsStore } from './questsStore';

/**
 * Run one sync pass: refresh today's quests (backfills on cold start), then
 * flush the offline claim queue. Each half is failure-isolated so a dead
 * server never blocks local quest rendering.
 */
export async function syncQuests(wallet: string): Promise<void> {
    try {
        await useQuestsStore.getState().refreshQuests(wallet);
    } catch {
        // Offline or server down — cached quests already render.
    }
    try {
        await useClaimQueue.getState().flush();
    } catch {
        // flush() already keeps undeliverable claims queued.
    }
}

/**
 * Wire sync triggers: once at app open, then on NetInfo offline -> online
 * transitions only. NO polling loops — quest lists are per-day deterministic,
 * so there is nothing to poll for.
 *
 * Returns an unsubscribe function for teardown (e.g. root layout unmount).
 */
export function startQuestSync(getWallet: () => string | null): () => void {
    const run = () => {
        const wallet = getWallet();
        if (wallet) void syncQuests(wallet);
    };

    run();

    let wasConnected: boolean | null = null;
    const unsubscribe = NetInfo.addEventListener((state) => {
        const connected = state.isConnected ?? false;
        if (connected && wasConnected === false) run();
        wasConnected = connected;
    });

    // TODO(daily-task): register a daily scheduled task (expo-background-task /
    // WorkManager) that calls syncQuests so the new UTC day's quest list is
    // generated and stale claims flush even when the app stays closed. Kept as
    // a seam to avoid adding a dependency in this pass.

    return unsubscribe;
}
