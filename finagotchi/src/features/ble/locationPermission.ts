import { requireOptionalNativeModule } from 'expo-modules-core';

type ExpoLocationModule = {
    getForegroundPermissionsAsync: () => Promise<{ granted: boolean }>;
    requestForegroundPermissionsAsync: () => Promise<{ granted: boolean }>;
};

let cached: ExpoLocationModule | null | undefined;

/**
 * The ExpoLocation native module, resolved WITHOUT evaluating expo-location's
 * JS. That package runs requireNativeModule('ExpoLocation') at module scope,
 * which throws on dev clients built before expo-location was added — and Metro
 * evaluates even dynamic `import('expo-location')` eagerly, so the try/catch
 * around it never fired and the whole BLE import chain crashed at bundle load.
 * requireOptionalNativeModule returns null instead of throwing, so SSID
 * auto-detection degrades to manual entry on those builds. expo-modules-core
 * itself is always present (the Expo runtime depends on it).
 */
export function getExpoLocation(): ExpoLocationModule | null {
    if (cached === undefined) {
        try {
            cached =
                requireOptionalNativeModule<ExpoLocationModule>('ExpoLocation');
        } catch {
            cached = null;
        }
    }
    return cached;
}

/** True when foreground location permission is granted; false when the native module is absent or permission is denied. */
export async function hasLocationPermission(): Promise<boolean> {
    const location = getExpoLocation();
    if (!location) return false;
    try {
        return (await location.getForegroundPermissionsAsync()).granted;
    } catch {
        return false;
    }
}

/** Ask for foreground location permission; false when unavailable or denied. */
export async function requestLocationPermission(): Promise<boolean> {
    const location = getExpoLocation();
    if (!location) return false;
    try {
        return (await location.requestForegroundPermissionsAsync()).granted;
    } catch {
        return false;
    }
}
