import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { getMood } from './mood';
import { usePetStore, type PetStage } from './store';
import { useCheckinStore } from '../checkin/store';
import { useWalletStore } from '../wallet/store';
import { useOnboardingStore } from '../onboarding/store';
import { pushPetState, type DbsPetState } from '../dbs/client';

/** Debounce window so rapid local changes collapse into one push. */
const PUSH_DEBOUNCE_MS = 2000;

/**
 * Server watermark for the CAS handshake: the updatedAt of the last
 * successful push response (or of the restored server row). Sent as
 * clientUpdatedAt; the server answers 409 + the current row when it is stale.
 */
let lastServerUpdatedAt: number | null = null;

/** Seed the CAS watermark (server restore path, see creatureSync). */
export function setLastServerPetStateAt(at: number | null): void {
    lastServerUpdatedAt = at;
}

/** Conflict resolution: the server wins — apply its row locally, no retry. */
function applyServerRow(row: DbsPetState): void {
    lastServerUpdatedAt = row.updatedAt;
    usePetStore.setState({
        stage: Math.min(12, Math.max(1, Math.round(row.stage))) as PetStage,
        balance: row.points,
        happiness: row.happy,
    });
    useCheckinStore.setState({ streak: row.streak });
}

/**
 * Keeps the server's copy of the pet state fresh so paired hardware can
 * pull it while standalone (no BLE connection). The app stays the source
 * of truth; pushes are fire-and-forget, matching the check-in sync pattern.
 */
export function usePetStateSync() {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wallet = useWalletStore((state) => state.address);
    const consent = useOnboardingStore((state) => state.serverAuthConsentAt);

    useEffect(() => {
        if (!wallet || !consent) return;

        const flush = () => {
            const pet = usePetStore.getState();
            const checkin = useCheckinStore.getState();
            const mood = getMood(
                new Date().getHours(),
                checkin.hasCheckedInToday(),
                checkin.streak,
                pet.happiness
            );
            pushPetState(
                wallet,
                {
                    stage: pet.stage,
                    streak: checkin.streak,
                    mood,
                    points: Math.round(pet.balance),
                    happy: Math.round(pet.happiness),
                },
                lastServerUpdatedAt
            )
                .then((result) => {
                    if (result.applied) {
                        lastServerUpdatedAt = result.state.updatedAt;
                    } else {
                        applyServerRow(result.conflict);
                    }
                })
                .catch(() => {});
        };

        const schedule = () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(flush, PUSH_DEBOUNCE_MS);
        };

        // Unmount/background must not silently drop a pending push.
        const flushPending = () => {
            if (!timerRef.current) return;
            clearTimeout(timerRef.current);
            timerRef.current = null;
            flush();
        };

        const unsubPet = usePetStore.subscribe(schedule);
        const unsubCheckin = useCheckinStore.subscribe(schedule);
        const appStateSub = AppState.addEventListener('change', (next) => {
            if (next !== 'active') flushPending();
        });
        schedule();

        return () => {
            unsubPet();
            unsubCheckin();
            appStateSub.remove();
            flushPending();
        };
    }, [wallet, consent]);
}
