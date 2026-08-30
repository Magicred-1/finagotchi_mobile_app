import type { Device } from 'react-native-ble-plx';

// Must match finagotchi_firmware (ESP32-S3).
export const FINAGOTCHI_DEVICE_NAME = 'Finagotchi';
export const FINAGOTCHI_SERVICE_UUID = '0000f1a0-0000-1000-8000-00805f9b34fb';
export const FINAGOTCHI_CHARACTERISTIC_UUID = '0000f1a1-0000-1000-8000-00805f9b34fb';

export type BleStatus =
    | 'idle'
    | 'off'
    | 'scanning'
    | 'connecting'
    | 'connected'
    | 'reconnecting'
    | 'error';

/** Parsed form of the "<stage>:<streak>:<mood>:<item>:<points>:<happy>" notification string. */
export type FinagotchiState = {
    stage: string;
    streak: number;
    mood: number;
    item: number;
    points: number;
    happy: number;
};

/**
 * Public surface of the BLE hook (react-native-ble-plx implementation).
 */
export interface FinagotchiBle {
    status: BleStatus;
    devices: Device[];
    connectedDevice: Device | null;
    deviceState: FinagotchiState | null;
    error: string | null;
    startScan: () => void;
    stopScan: () => void;
    connect: (device: Device) => void;
    disconnect: () => void;
    /** Reconnect to the last connected device, if any. */
    reconnect: () => void;
    /**
     * Queue a UTF-8 command write ("stage:3", "look:-15,8", ...).
     * Writes are serialized: a command is only sent once the previous one
     * completed. Failures are logged, never thrown.
     */
    sendCommand: (cmd: string) => void;
}

/** Parse "<stage>:<streak>:<mood>:<item>:<points>:<happy>" (already UTF-8 decoded). Older 4-field firmware strings default points/happy to 0. */
export function parseStateString(raw: string): FinagotchiState | null {
    const [stage, streak, mood, item, points, happy] = raw.trim().split(':');
    if (!stage) return null;
    return {
        stage,
        streak: Number(streak) || 0,
        mood: Number(mood) || 0,
        item: Number(item) || 0,
        points: Number(points) || 0,
        happy: Number(happy) || 0,
    };
}
