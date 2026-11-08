import NetInfo from '@react-native-community/netinfo';
import type { Device } from 'react-native-ble-plx';
import { create } from 'zustand';

import type { WifiResult } from './types';
import { hasLocationPermission } from './locationPermission';
import { getWifiCredentials } from './wifiCredentials';
import { writeWifiCredentialsToDevice } from './wifiProvision';

export type WifiAutoSyncResult =
    | 'sent'
    | 'synced'
    | 'join-failed'
    | 'unknown-network'
    | 'no-permission'
    | 'write-failed';

type WifiAutoSyncState = {
    lastSsid: string | null;
    lastResult: WifiAutoSyncResult | null;
    lastAt: number | null;
    record: (result: WifiAutoSyncResult, ssid: string | null) => void;
};

export const useWifiAutoSyncStore = create<WifiAutoSyncState>()((set) => ({
    lastSsid: null,
    lastResult: null,
    lastAt: null,
    record: (lastResult, lastSsid) =>
        set({ lastResult, lastSsid, lastAt: Date.now() }),
}));

/** Deduplicates hook instances while a write or join attempt is in flight. */
const sentKeys = new Set<string>();

export function noteWifiJoinResult(result: WifiResult): void {
    const { lastSsid, lastResult, lastAt, record } = useWifiAutoSyncStore.getState();
    if (lastResult !== 'sent' || lastAt === null || result.at < lastAt) return;
    if (result.ok && result.ssid !== lastSsid) return;
    if (!result.ok) sentKeys.clear();
    record(result.ok ? 'synced' : 'join-failed', lastSsid);
}

/**
 * Apple Watch-style Wi-Fi handoff: after encrypted BLE access is available,
 * push the password of the network the phone is currently on, replayed from
 * SecureStore. Mobile OSes expose the SSID but never its password, so new
 * networks still need one manual provision.
 */
export async function autoSyncWifiToDevice(
    device: Device,
    maxPayloadBytes?: number
): Promise<void> {
    const { record } = useWifiAutoSyncStore.getState();

    if (!(await hasLocationPermission())) {
        record('no-permission', null);
        return;
    }

    let ssid: string | null = null;
    try {
        const state = await NetInfo.fetch();
        ssid = state.type === 'wifi' ? (state.details?.ssid ?? null) : null;
    } catch {
        return;
    }
    if (!ssid || ssid === '<unknown ssid>') return;

    const password = await getWifiCredentials(ssid);
    if (password === null) {
        record('unknown-network', ssid);
        return;
    }

    const key = `${device.id}:${ssid}`;
    if (sentKeys.has(key)) return;
    sentKeys.add(key);
    record('sent', ssid);

    try {
        await writeWifiCredentialsToDevice(
            device,
            ssid,
            password,
            null,
            maxPayloadBytes
        );
    } catch (e) {
        sentKeys.delete(key);
        record('write-failed', ssid);
        console.warn('[BLE] Wi-Fi auto-sync write failed:', e);
    }
}
