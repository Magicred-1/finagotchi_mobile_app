import { beforeEach, describe, expect, it, vi } from 'vitest';

import NetInfo from '@react-native-community/netinfo';
import * as Location from 'expo-location';
import type { Device } from 'react-native-ble-plx';

import { FINAGOTCHI_SERVICE_UUID, PROVISIONING_CHAR_UUID } from '../types';
import { autoSyncWifiToDevice, useWifiAutoSyncStore } from '../wifiAutoSync';
import { saveWifiCredentials } from '../wifiCredentials';

vi.mock('@react-native-community/netinfo', () => ({
    default: { fetch: vi.fn() },
}));

vi.mock('expo-location', () => ({
    getForegroundPermissionsAsync: vi.fn(),
}));

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
        __clear: () => store.clear(),
    };
});

const fetchMock = vi.mocked(NetInfo.fetch);
const permissionMock = vi.mocked(Location.getForegroundPermissionsAsync);

function makeDevice(id: string) {
    const write = vi.fn().mockResolvedValue({});
    return {
        device: { id, writeCharacteristicWithResponseForService: write } as unknown as Device,
        write,
    };
}

function onWifi(ssid: string | null) {
    fetchMock.mockResolvedValue({
        type: 'wifi',
        isConnected: true,
        details: ssid === null ? null : { ssid },
    } as never);
}

beforeEach(async () => {
    const SecureStore = await import('expo-secure-store');
    (SecureStore as unknown as { __clear: () => void }).__clear();
    vi.clearAllMocks();
    permissionMock.mockResolvedValue({ granted: true } as never);
    useWifiAutoSyncStore.setState({ lastSsid: null, lastResult: null, lastAt: null });
});

describe('autoSyncWifiToDevice', () => {
    it('pushes saved credentials for the current network and dedupes repeats', async () => {
        await saveWifiCredentials('HomeWifi', 'hunter2');
        onWifi('HomeWifi');
        const { device, write } = makeDevice('dev-sync');

        await autoSyncWifiToDevice(device);

        expect(write).toHaveBeenCalledTimes(1);
        expect(write).toHaveBeenCalledWith(
            FINAGOTCHI_SERVICE_UUID,
            PROVISIONING_CHAR_UUID,
            Buffer.from('HomeWifi\nhunter2', 'utf8').toString('base64'),
        );
        expect(useWifiAutoSyncStore.getState()).toMatchObject({
            lastSsid: 'HomeWifi',
            lastResult: 'synced',
        });

        // Double openConnection for the same physical connect: no second write.
        await autoSyncWifiToDevice(device);
        expect(write).toHaveBeenCalledTimes(1);
    });

    it('records unknown-network and writes nothing for an unsaved SSID', async () => {
        onWifi('CafeWifi');
        const { device, write } = makeDevice('dev-unknown');

        await autoSyncWifiToDevice(device);

        expect(write).not.toHaveBeenCalled();
        expect(useWifiAutoSyncStore.getState().lastResult).toBe('unknown-network');
        expect(useWifiAutoSyncStore.getState().lastSsid).toBe('CafeWifi');
    });

    it('records no-permission without touching NetInfo when location is denied', async () => {
        permissionMock.mockResolvedValue({ granted: false } as never);
        const { device, write } = makeDevice('dev-noperm');

        await autoSyncWifiToDevice(device);

        expect(fetchMock).not.toHaveBeenCalled();
        expect(write).not.toHaveBeenCalled();
        expect(useWifiAutoSyncStore.getState().lastResult).toBe('no-permission');
    });

    it('bails silently when not on wifi or the SSID is unknown', async () => {
        const { device, write } = makeDevice('dev-cell');
        fetchMock.mockResolvedValue({
            type: 'cellular',
            isConnected: true,
            details: null,
        } as never);

        await autoSyncWifiToDevice(device);
        expect(write).not.toHaveBeenCalled();
        expect(useWifiAutoSyncStore.getState().lastResult).toBeNull();

        onWifi('<unknown ssid>');
        await autoSyncWifiToDevice(device);
        expect(write).not.toHaveBeenCalled();
        expect(useWifiAutoSyncStore.getState().lastResult).toBeNull();
    });

    it('records write-failed and retries on the next connect', async () => {
        await saveWifiCredentials('HomeWifi', 'hunter2');
        onWifi('HomeWifi');
        const { device, write } = makeDevice('dev-fail');
        write.mockRejectedValueOnce(new Error('link not encrypted'));

        await autoSyncWifiToDevice(device);

        expect(useWifiAutoSyncStore.getState().lastResult).toBe('write-failed');
        expect(write).toHaveBeenCalledTimes(1);

        await autoSyncWifiToDevice(device);
        expect(write).toHaveBeenCalledTimes(2);
        expect(useWifiAutoSyncStore.getState().lastResult).toBe('synced');
    });
});
