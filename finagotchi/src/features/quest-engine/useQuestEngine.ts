import { useEffect } from 'react';

import { useWalletStore } from '../wallet/store';
import { createDynamicAuthSigner, createMwaAuthSigner } from './authSigner';
import { setAuthSigner } from './client';
import { startQuestSync } from './sync';

/**
 * Wires the verified quest engine into the app lifecycle. Mount once at the
 * root (next to useWallet):
 *
 * - Registers the wallet auth signer matching the active connection (Dynamic
 *   embedded or MWA) so /backfill and /verify can run their challenge-response
 *   auth; clears it on disconnect.
 * - Starts quest sync: generates today's quest list (server backfill on cold
 *   start) and flushes the claim queue on app open and on offline -> online
 *   transitions.
 */
export function useQuestEngine(): void {
    const address = useWalletStore((state) => state.address);
    const connectionType = useWalletStore(
        (state) => state.session.connectionType
    );

    useEffect(() => {
        if (!address || !connectionType) {
            setAuthSigner(null);
            return;
        }
        setAuthSigner(
            connectionType === 'mwa'
                ? createMwaAuthSigner(
                      () => useWalletStore.getState().session.authToken
                  )
                : createDynamicAuthSigner()
        );
        return () => setAuthSigner(null);
    }, [address, connectionType]);

    useEffect(() => {
        if (!address) return;
        return startQuestSync(() => useWalletStore.getState().address);
    }, [address]);
}
