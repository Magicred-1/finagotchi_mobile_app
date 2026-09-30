import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as SecureStore from 'expo-secure-store';

import {
    getWifiCredentials,
    listSavedSsids,
    removeWifiCredentials,
    saveWifiCredentials,
} from '../wifiCredentials';

const VAULT_KEY = 'finagotchi_wifi_credentials';

vi.mock('expo-secure-store', () => {
    const store = new Map<string, string>();
    return {
        getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
        setItemAsync: vi.fn(async (key: string, value: string) => {
            store.set(key, value);
        }),
        deleteItemAsync: vi.fn(async (key: string) => {
            store.delete(key);
        }),
        __setRaw: (key: string, value: string) => store.set(key, value),
        __clear: () => store.clear(),
    };
});

type VaultMock = typeof SecureStore & {
    __setRaw: (key: string, value: string) => void;
    __clear: () => void;
};
const vaultMock = SecureStore as VaultMock;

beforeEach(() => {
    vaultMock.__clear();
    vi.clearAllMocks();
});

describe('wifiCredentials vault', () => {
    it('returns null for a network that was never saved', async () => {
        await expect(getWifiCredentials('HomeWifi')).resolves.toBeNull();
        await expect(listSavedSsids()).resolves.toEqual([]);
    });

    it('round-trips a saved network', async () => {
        await saveWifiCredentials('HomeWifi', 'hunter2');

        await expect(getWifiCredentials('HomeWifi')).resolves.toBe('hunter2');
        await expect(listSavedSsids()).resolves.toEqual(['HomeWifi']);
    });

    it('overwrites an existing entry', async () => {
        await saveWifiCredentials('HomeWifi', 'old-pass');
        await saveWifiCredentials('HomeWifi', 'new-pass');

        await expect(getWifiCredentials('HomeWifi')).resolves.toBe('new-pass');
        await expect(listSavedSsids()).resolves.toEqual(['HomeWifi']);
    });

    it('removes a network without touching others', async () => {
        await saveWifiCredentials('HomeWifi', 'home-pass');
        await saveWifiCredentials('OfficeWifi', 'office-pass');

        await removeWifiCredentials('HomeWifi');

        await expect(getWifiCredentials('HomeWifi')).resolves.toBeNull();
        await expect(getWifiCredentials('OfficeWifi')).resolves.toBe('office-pass');
        await expect(listSavedSsids()).resolves.toEqual(['OfficeWifi']);
    });

    it('treats corrupt JSON as an empty vault', async () => {
        vaultMock.__setRaw(VAULT_KEY, '{not valid json');

        await expect(getWifiCredentials('HomeWifi')).resolves.toBeNull();
        await expect(listSavedSsids()).resolves.toEqual([]);

        // A subsequent save recovers with a fresh vault.
        await saveWifiCredentials('HomeWifi', 'hunter2');
        await expect(getWifiCredentials('HomeWifi')).resolves.toBe('hunter2');
    });

    it('treats a non-object payload as an empty vault', async () => {
        vaultMock.__setRaw(VAULT_KEY, '"just a string"');

        await expect(listSavedSsids()).resolves.toEqual([]);
    });

    it('swallows storage errors instead of throwing', async () => {
        vi.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(
            new Error('secure store unavailable'),
        );
        await expect(getWifiCredentials('HomeWifi')).resolves.toBeNull();

        vi.mocked(SecureStore.getItemAsync).mockRejectedValueOnce(
            new Error('secure store unavailable'),
        );
        await expect(listSavedSsids()).resolves.toEqual([]);

        vi.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(
            new Error('secure store unavailable'),
        );
        await expect(saveWifiCredentials('HomeWifi', 'hunter2')).resolves.toBeUndefined();
    });
});
