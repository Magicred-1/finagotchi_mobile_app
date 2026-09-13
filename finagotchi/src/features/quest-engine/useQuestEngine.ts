import { useEffect } from 'react';

import { useWalletStore } from '../wallet/store';
import { useOnboardingStore } from '../onboarding/store';
import { createDynamicAuthSigner, createMwaAuthSigner } from './authSigner';
import { clearAuthSession, ensureAuthToken, setAuthSigner } from './client';
import { startQuestSync } from './sync';

/**
 * Wires the verified quest engine into the app lifecycle. Mount once at the
 * root (next to useWallet):
 *
 * - Registers the wallet auth signer matching the active connection (Dynamic
 *   embedded or MWA) so the server login can sign its challenge; clears it
 *   on disconnect.
 * - Proactively refreshes the server session JWT once the user has consented
 *   (onboarding auth step) — subsequent sync calls ride the cached token
 *   instead of prompting the wallet per request.
 * - Starts quest sync: generates today's quest list (server backfill on cold
 *   start) and flushes the claim queue on app open and on offline -> online
 *   transitions.
 */
export function useQuestEngine(): void {
    const address = useWalletStore((state) => state.address);
    const connectionType = useWalletStore(
        (state) => state.session.connectionType
    );
    const serverAuthConsentAt = useOnboardingStore(
        (state) => state.serverAuthConsentAt
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

    // Session lifecycle: drop the cached JWT on disconnect; sign in eagerly
    // when a consented wallet is connected without a live token.
    useEffect(() => {
        if (!address) {
            void clearAuthSession();
            return;
        }
        if (!serverAuthConsentAt) return;
        // Signing/network failures are fine here — the first authed sync
        // call retries the login on demand.
        ensureAuthToken(address).catch(() => {});
    }, [address, serverAuthConsentAt]);

    useEffect(() => {
        if (!address) return;
        return startQuestSync(() => useWalletStore.getState().address);
    }, [address]);
}
