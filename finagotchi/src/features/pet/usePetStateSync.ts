import { useEffect, useRef } from 'react';

import { usePetStore } from './store';
import { useCheckinStore } from '../checkin/store';
import { useWalletStore } from '../wallet/store';
import { useOnboardingStore } from '../onboarding/store';
import { useDeviceControlStore } from '../ble/sync';
import { pushPetState } from '../dbs/client';

/** Debounce window so rapid local changes collapse into one push. */
const PUSH_DEBOUNCE_MS = 2000;

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
            const streak = useCheckinStore.getState().streak;
            const mood = useDeviceControlStore.getState().deviceMood ?? '';
            pushPetState(wallet, {
                stage: pet.stage,
                substage: pet.stage,
                streak,
                mood,
                points: Math.round(pet.balance),
                happy: Math.round(pet.happiness),
            }).catch(() => {});
        };

        const schedule = () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(flush, PUSH_DEBOUNCE_MS);
        };

        const unsubPet = usePetStore.subscribe(schedule);
        const unsubCheckin = useCheckinStore.subscribe(schedule);
        schedule();

        return () => {
            unsubPet();
            unsubCheckin();
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [wallet, consent]);
}
