import { Buffer } from 'buffer';
import type { Device } from 'react-native-ble-plx';

import { FINAGOTCHI_SERVICE_UUID, PROVISIONING_CHAR_UUID } from './types';

const WRITE_TIMEOUT_MS = 10_000;

export class WifiProvisionTimeoutError extends Error {
    constructor() {
        super('Provisioning timed out.');
        this.name = 'WifiProvisionTimeoutError';
    }
}

export class WifiProvisionMtuError extends Error {
    constructor(payloadBytes: number, maxPayloadBytes: number) {
        super(
            `Wi-Fi setup needs ${payloadBytes} bytes, but this BLE connection allows ${maxPayloadBytes}. Reconnect the Finagotchi and try again.`
        );
        this.name = 'WifiProvisionMtuError';
    }
}

export function validateWifiCredentials(
    ssid: string,
    password: string
): string | null {
    const ssidBytes = Buffer.byteLength(ssid, 'utf8');
    const passwordBytes = Buffer.byteLength(password, 'utf8');
    if (ssid.trim().length === 0 || ssidBytes > 32 || ssid.includes('\n')) {
        return 'Wi-Fi name must be 1–32 UTF-8 bytes and contain no newline.';
    }
    if (
        password.includes('\n') ||
        (passwordBytes > 0 && (passwordBytes < 8 || passwordBytes > 63))
    ) {
        return 'Password must be 8–63 bytes (or empty for an open network).';
    }
    return null;
}

export async function writeWifiCredentialsToDevice(
    device: Device,
    ssid: string,
    password: string,
    deviceToken?: string | null,
    maxPayloadBytes?: number
): Promise<void> {
    const validationError = validateWifiCredentials(ssid, password);
    if (validationError) throw new Error(validationError);
    if (
        deviceToken &&
        (deviceToken.includes('\n') || Buffer.byteLength(deviceToken, 'utf8') > 128)
    ) {
        throw new Error('Device token must be 1–128 bytes and contain no newline.');
    }

    const raw = deviceToken
        ? `${ssid}\n${password}\n${deviceToken}`
        : `${ssid}\n${password}`;
    const rawBytes = Buffer.byteLength(raw, 'utf8');
    if (maxPayloadBytes !== undefined && rawBytes > maxPayloadBytes) {
        throw new WifiProvisionMtuError(rawBytes, maxPayloadBytes);
    }
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
