import { useFinagotchiBle } from './useBle';
import type { FinagotchiBle } from './types';

/**
 * Entry point for the pet screen. BLE requires the native module, so this
 * only works in a dev-client/release build — not Expo Go.
 */
export const useFinagotchiDevice: () => FinagotchiBle = useFinagotchiBle;

export {
    FINAGOTCHI_CHARACTERISTIC_UUID,
    FINAGOTCHI_DEVICE_NAME,
    FINAGOTCHI_SERVICE_UUID,
    PROVISIONING_CHAR_UUID,
} from './types';
export type { BleStatus, FinagotchiBle, FinagotchiState } from './types';
export {
    getWifiCredentials,
    listSavedSsids,
    removeWifiCredentials,
    saveWifiCredentials,
} from './wifiCredentials';
export {
    autoSyncWifiToDevice,
    useWifiAutoSyncStore,
    type WifiAutoSyncResult,
} from './wifiAutoSync';
export {
    getExpoLocation,
    hasLocationPermission,
    requestLocationPermission,
} from './locationPermission';
export {
    isPairingRequiredError,
    writeWifiCredentialsToDevice,
    WifiProvisionTimeoutError,
} from './wifiProvision';
