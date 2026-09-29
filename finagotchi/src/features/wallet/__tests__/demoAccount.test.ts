import { afterEach, describe, expect, it } from 'vitest';

import { isDemoAccountEmail } from '../demoAccount';
import { useWalletStore } from '../store';

describe('isDemoAccountEmail', () => {
    afterEach(() => {
        delete process.env.EXPO_PUBLIC_DEMO_EMAIL;
    });

    it('matches Dynamic sandbox test accounts', () => {
        expect(isDemoAccountEmail('review+dynamic_test@finagotchi.app')).toBe(
            true
        );
        expect(isDemoAccountEmail('REVIEW+DYNAMIC_TEST@finagotchi.app')).toBe(
            true
        );
    });

    it('matches the configured live test account email', () => {
        process.env.EXPO_PUBLIC_DEMO_EMAIL =
            'review@finagotchi.app, second@finagotchi.app';
        expect(isDemoAccountEmail('review@finagotchi.app')).toBe(true);
        expect(isDemoAccountEmail('Second@finagotchi.app')).toBe(true);
    });

    it('rejects normal users and missing emails', () => {
        process.env.EXPO_PUBLIC_DEMO_EMAIL = 'review@finagotchi.app';
        expect(isDemoAccountEmail('someone@gmail.com')).toBe(false);
        expect(isDemoAccountEmail('other+dynamic@finagotchi.app')).toBe(false);
        expect(isDemoAccountEmail(null)).toBe(false);
        expect(isDemoAccountEmail(undefined)).toBe(false);
        expect(isDemoAccountEmail('')).toBe(false);
    });
});

describe('demoAccount session flag', () => {
    it('defaults to false, can be set, and clears on disconnect', () => {
        expect(useWalletStore.getState().demoAccount).toBe(false);

        useWalletStore.getState().setDemoAccount(true);
        expect(useWalletStore.getState().demoAccount).toBe(true);

        useWalletStore.getState().disconnect();
        expect(useWalletStore.getState().demoAccount).toBe(false);
    });
});
