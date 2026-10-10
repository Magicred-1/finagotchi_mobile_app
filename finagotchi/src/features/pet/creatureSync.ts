import { useEffect, useRef } from 'react';

import {
    calculateStage,
    LIFE_DURATION_MS,
    usePetStore,
    type PetStage,
} from './store';
import { useCheckinStore } from '../checkin/store';
import { useLeagueStore } from '../league/store';
import { useWalletStore } from '../wallet/store';
import { useOnboardingStore } from '../onboarding/store';
import {
    fetchNftCreature,
    fetchNftCreatures,
    registerNftCreature,
} from '../nft/client';
import { fetchCheckins, fetchPetState } from '../dbs/client';
import { setLastServerPetStateAt } from './usePetStateSync';
import { QuestClientError } from '../quest-engine/client';

function dateKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Consecutive-day streak ending at the most recent check-in date. */
function computeStreak(sortedDates: string[]): number {
    if (sortedDates.length === 0) return 0;
    const set = new Set(sortedDates);
    const last = sortedDates[sortedDates.length - 1];
    const [y, m, d] = last.split('-').map(Number);
    const cursor = new Date(y, m - 1, d);
    let streak = 0;
    while (set.has(dateKey(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}

function clampStage(stage: number): PetStage {
    return Math.min(12, Math.max(1, Math.round(stage))) as PetStage;
}

/**
 * Restore the creature + progress for a wallet from the server after a
 * reinstall / new device / wiped storage. Returns true when a creature was
 * found and applied; false when the wallet has nothing server-side.
 *
 * Only call this when the local pet store has no mintAddress — it overwrites
 * creature identity and live state without merging.
 */
export async function restoreCreatureFromServer(wallet: string): Promise<boolean> {
    const creatures = await fetchNftCreatures(wallet);
    if (creatures.length === 0) return false;

    // Server orders by minted_at DESC — the newest creature is the live one.
    const creature = creatures[0];
    const [checkins, petState] = await Promise.all([
        fetchCheckins(wallet).catch(() => []),
        fetchPetState(wallet).catch(() => null),
    ]);

    const sortedDates = checkins.map((c) => c.checkinDate).sort();
    const history: Record<string, boolean> = {};
    for (const date of sortedDates) history[date] = true;
    const streak = computeStreak(sortedDates);

    // CAS watermark: the restored row is the server's current truth.
    setLastServerPetStateAt(petState?.updatedAt ?? null);

    // Stage derives from streak (same rule as check-in); fall back to the
    // coarse server mirrors when the wallet has no check-in history.
    const stage =
        sortedDates.length > 0
            ? calculateStage(streak)
            : clampStage(petState?.stage ?? creature.stage);

    if (sortedDates.length > 0) {
        const checkin = useCheckinStore.getState();
        useCheckinStore.setState({
            history,
            totalCheckins: sortedDates.length,
            lastCheckin: sortedDates[sortedDates.length - 1],
            streak,
            longestStreak: Math.max(streak, checkin.longestStreak),
        });
    }

    const now = new Date();
    usePetStore.setState({
        name: creature.name,
        mintAddress: creature.mintAddress,
        ownerAddress: wallet,
        mintTxSignature: creature.mintTxSignature || null,
        mintedAt: new Date(creature.mintedAt).toISOString(),
        totalCheckins: sortedDates.length,
        stage,
        // Already evolved long ago — don't replay the ceremony on first render.
        lastCelebratedStage: stage,
        evolvedAt: null,
        balance: petState?.points ?? 0,
        happiness: petState?.happy ?? 80,
        lastInteractionAt: now.toISOString(),
        lastHappinessDecayAt: now.toISOString(),
        lifeTimerEndsAt: new Date(now.getTime() + LIFE_DURATION_MS).toISOString(),
        isDead: false,
        isSpectral: false,
        deathCount: 0,
        deathAt: null,
        causeOfDeath: null,
        reviveWindowEndsAt: null,
    });
    return true;
}

/**
 * Heal the server-side registry when the local mint was never registered
 * (the mint-time registration is fire-and-forget, so it can be lost to a
 * network failure). Legacy mints without a persisted signature cannot be
 * re-registered (server requires it) and are skipped.
 */
export async function healServerCreatureRegistration(
    wallet: string
): Promise<void> {
    const pet = usePetStore.getState();
    if (!pet.mintAddress || !pet.name) return;

    try {
        const existing = await fetchNftCreature(wallet, pet.mintAddress);
        if (existing) return;
    } catch (err) {
        // 404 means "missing, heal it below"; anything else (network, auth)
        // should not trigger a blind re-registration.
        if (!(err instanceof QuestClientError && err.status === 404)) return;
    }

    if (!pet.mintTxSignature) return;
    await registerNftCreature(
        wallet,
        pet.mintAddress,
        pet.name,
        pet.stage,
        pet.mintTxSignature,
        0
    ).catch(() => {});
}

/**
 * Drop all local per-wallet state when the connected wallet changes, so a
 * different wallet never inherits the previous wallet's creature, streak,
 * or league score. Server state is untouched; the new wallet's data is
 * restored (or re-minted through onboarding) right after.
 */
function resetPerWalletState(): void {
    usePetStore.getState().resetCreature();
    useCheckinStore.setState({
        history: {},
        streak: 0,
        longestStreak: 0,
        totalCheckins: 0,
        lastCheckin: null,
    });
    useLeagueStore.setState({ score: 0, currentTier: 'Bronze' });
}

/**
 * Keeps creature identity in sync with the server on wallet connect:
 * restores when local mint data is missing, heals the registry otherwise.
 * Restore during onboarding is handled by OnboardingFlow itself (it needs
 * to reroute the step flow); both paths are idempotent.
 *
 * Wallet switching: when the connected wallet differs from the creature's
 * ownerAddress, local per-wallet state is reset and the new wallet's
 * creature is restored from the server (or onboarding mints a fresh one).
 * Legacy installs have no ownerAddress; ownership is verified once against
 * the server registry before adopting the current wallet as owner.
 */
export function useCreatureSync() {
    const wallet = useWalletStore((state) => state.address);
    const consent = useOnboardingStore((state) => state.serverAuthConsentAt);
    const ranFor = useRef<string | null>(null);

    useEffect(() => {
        if (!wallet || !consent) return;
        const pet = usePetStore.getState();

        // The connected wallet is not the creature's owner: reset and
        // restore for the new wallet.
        if (pet.ownerAddress && pet.ownerAddress !== wallet) {
            ranFor.current = wallet;
            resetPerWalletState();
            restoreCreatureFromServer(wallet).catch(() => {});
            return;
        }

        if (ranFor.current === wallet) return;
        ranFor.current = wallet;

        // Legacy install with a mint but no recorded owner: adopt the
        // current wallet only if the server registry confirms ownership;
        // otherwise this wallet switched and local state must be reset.
        if (pet.mintAddress && !pet.ownerAddress) {
            fetchNftCreature(wallet, pet.mintAddress)
                .then(() => {
                    usePetStore.setState({ ownerAddress: wallet });
                    healServerCreatureRegistration(wallet).catch(() => {});
                })
                .catch((err) => {
                    if (err instanceof QuestClientError && err.status === 404) {
                        resetPerWalletState();
                        restoreCreatureFromServer(wallet).catch(() => {});
                    }
                    // Other errors (network): keep current state; the next
                    // app launch retries the verification.
                });
            return;
        }

        if (pet.mintAddress) {
            healServerCreatureRegistration(wallet).catch(() => {});
        } else {
            restoreCreatureFromServer(wallet).catch(() => {
                // Leave ranFor set: a failed restore must not loop; the
                // onboarding flow retries on its own path anyway.
            });
        }
    }, [wallet, consent]);
}
