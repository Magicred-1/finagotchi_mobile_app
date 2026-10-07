import NetInfo from '@react-native-community/netinfo';
import { Buffer } from 'buffer';
import type { Device } from 'react-native-ble-plx';
import { create } from 'zustand';

import { FINAGOTCHI_SERVICE_UUID, PROVISIONING_CHAR_UUID } from './types';
import { hasLocationPermission } from './locationPermission';
import { getWifiCredentials } from './wifiCredentials';

export type WifiAutoSyncResult =
    | 'synced'
    | 'unknown-network'
    | 'no-permission'
    | 'write-failed';

type WifiAutoSyncState = {
    lastSsid: string | null;
    lastResult: WifiAutoSyncResult | null;
    lastAt: number | null;
    record: (result: WifiAutoSyncResult, ssid: string | null) => void;
};

/** Last auto-sync outcome, surfaced on the hardware binding screen. */
export const useWifiAutoSyncStore = create<WifiAutoSyncState>()((set) => ({
    lastSsid: null,
    lastResult: null,
    lastAt: null,
    record: (lastResult, lastSsid) =>
        set({ lastResult, lastSsid, lastAt: Date.now() }),
}));

/**
 * Successfully pushed "<deviceId>:<ssid>" pairs. Both the pet screen and the
 * hardware binding screen run openConnection per physical connect; without
 * this the firmware would get the same credentials written twice.
 */
const syncedKeys = new Set<string>();

/**
 * Apple Watch-style Wi-Fi handoff: after a BLE connect, push the password of
 * the network the phone is currently on, replayed from the SecureStore vault
 * (mobile OSes expose the SSID but never the password, so first-time networks
 * still need one manual provision). Never requests location permission —
 * without it the SSID is unavailable and we simply record 'no-permission'.
 *
 * Location goes through locationPermission.ts, which resolves the ExpoLocation
 * native module without evaluating expo-location's JS: that package throws at
 * module scope when the native module is missing (older dev clients), and
 * Metro evaluates imports eagerly, so a dynamic import in try/catch still
 * crashed the whole BLE import chain at bundle load.
 */
export async function autoSyncWifiToDevice(device: Device): Promise<void> {
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
        // NetInfo native module unavailable — bail silently.
        return;
    }
    if (!ssid || ssid === '<unknown ssid>') return;

    const password = await getWifiCredentials(ssid);
    if (password === null) {
        record('unknown-network', ssid);
        return;
    }

    const key = `${device.id}:${ssid}`;
    if (syncedKeys.has(key)) return;
    syncedKeys.add(key);

    // Contract §2: two-field "<ssid>\n<pass>" replaces the Wi-Fi credentials
    // and keeps the device token already stored on the firmware.
    const payload = Buffer.from(`${ssid}\n${password}`, 'utf8').toString('base64');
    try {
        await device.writeCharacteristicWithResponseForService(
            FINAGOTCHI_SERVICE_UUID,
            PROVISIONING_CHAR_UUID,
            payload,
        );
        record('synced', ssid);
    } catch (e) {
        // Allow a retry on the next connect.
        syncedKeys.delete(key);
        record('write-failed', ssid);
        console.warn('[BLE] Wi-Fi auto-sync write failed:', e);
    }
}
