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

/** Parsed form of the "<stage>:<streak>:<mood>:<item>" notification string. */
export type FinagotchiState = {
    stage: string;
    streak: number;
    mood: number;
    item: number;
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
    /** __DEV__ only: connect a fake device that logs writes and echoes state. */
    connectMock: () => void;
    /**
     * Queue a UTF-8 command write ("stage:3", "look:-15,8", ...).
     * Writes are serialized: a command is only sent once the previous one
     * completed. Failures are logged, never thrown.
     */
    sendCommand: (cmd: string) => void;
}

/** Parse "<stage>:<streak>:<mood>:<item>" (already UTF-8 decoded). */
export function parseStateString(raw: string): FinagotchiState | null {
    const [stage, streak, mood, item] = raw.trim().split(':');
    if (!stage) return null;
    return {
        stage,
        streak: Number(streak) || 0,
        mood: Number(mood) || 0,
        item: Number(item) || 0,
    };
}
