import { Buffer } from 'buffer';
import type { Device } from 'react-native-ble-plx';

import { FINAGOTCHI_SERVICE_UUID, PROVISIONING_CHAR_UUID } from './types';

/** Bound on a single provisioning write so the UI never hangs on a stuck link. */
const WRITE_TIMEOUT_MS = 10_000;

export class WifiProvisionTimeoutError extends Error {
    constructor() {
        super('Provisioning timed out.');
        this.name = 'WifiProvisionTimeoutError';
    }
}

/**
 * Contract §2: write "<ssid>\n<pass>" (optional third field carries the cloud
 * device token) to the provisioning characteristic. The firmware rejects the
 * write unless the link is encrypted, which is what raises the OS pairing
 * dialog (iOS shows its own passkey prompt — no in-app code entry possible).
 */
export async function writeWifiCredentialsToDevice(
    device: Device,
    ssid: string,
    password: string,
    deviceToken?: string | null
): Promise<void> {
    const raw = deviceToken
        ? `${ssid}\n${password}\n${deviceToken}`
        : `${ssid}\n${password}`;
    const payload = Buffer.from(raw, 'utf8').toString('base64');
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
        await Promise.race([
            device.writeCharacteristicWithResponseForService(
                FINAGOTCHI_SERVICE_UUID,
                PROVISIONING_CHAR_UUID,
                payload
            ),
            new Promise<never>((_, reject) => {
                timeout = setTimeout(
                    () => reject(new WifiProvisionTimeoutError()),
                    WRITE_TIMEOUT_MS
                );
            }),
        ]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

/**
 * True when a provisioning write failed because the link needs (re-)pairing:
 * the firmware requires encryption, and both stacks report it as an
 * authentication/permission error. Heuristic over the ble-plx message text —
 * the ATT "insufficient authentication" code surfaces differently per platform.
 */
export function isPairingRequiredError(error: unknown): boolean {
    const message = (
        error instanceof Error ? error.message : String(error)
    ).toLowerCase();
    return /encrypt|authenticat|permission|permitted|bond|pair|security/.test(
        message
    );
}
