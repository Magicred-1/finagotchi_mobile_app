import type { Device } from 'react-native-ble-plx';

// Must match finagotchi_firmware (ESP32-S3).
export const FINAGOTCHI_DEVICE_NAME = 'Finagotchi';
export const FINAGOTCHI_SERVICE_UUID = '0000f1a0-0000-1000-8000-00805f9b34fb';
export const FINAGOTCHI_CHARACTERISTIC_UUID = '0000f1a1-0000-1000-8000-00805f9b34fb';
/** Provisioning characteristic (contract §1); encrypted writes only. */
export const PROVISIONING_CHAR_UUID = '0000f1a2-0000-1000-8000-00805f9b34fb';

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
 * Device-initiated request notification (instead of a state snapshot): the
 * user picked an action in the on-device menu. Known commands:
 * `sync` / `feed` / `dca` (from `<name>:req`), `dca:pause` (args: slot
 * index), `dca:new` (args: ticker, amountSol, freqSec). Unknown names are
 * surfaced too — consumers ignore what they don't handle.
 */
export type DeviceRequest = {
    /** Request name, e.g. 'sync' | 'feed' | 'dca' | 'dca:pause' | 'dca:new'. */
    command: string;
    /** Arguments after the command (['2'] for "dca:pause:2"); empty for `<name>:req`. */
    args: string[];
    /** Monotonic id so repeated identical requests retrigger effects. */
    seq: number;
};

/** Matches the exact `<name>:req` form; a state snapshot never does (`req` is not numeric). */
const DEVICE_REQUEST_RE = /^([a-z]+):req$/;
/** `dca:<verb>:<args...>` menu actions (dca:pause:<i>, dca:new:<ticker>:<amt>:<freq>). */
const DCA_ACTION_VERBS = new Set(['pause', 'new']);

/**
 * Parses a device-request notification into command + args, or returns null
 * when `raw` is a state snapshot (or anything else) and should go to the
 * state parser. Argument-carrying commands are matched here so they never
 * reach `parseStateString`.
 */
export function parseDeviceRequest(
    raw: string
): { command: string; args: string[] } | null {
    const trimmed = raw.trim();
    const reqMatch = DEVICE_REQUEST_RE.exec(trimmed);
    if (reqMatch) {
        return { command: reqMatch[1], args: [] };
    }
    const parts = trimmed.split(':');
    if (
        parts.length >= 3 &&
        parts[0] === 'dca' &&
        DCA_ACTION_VERBS.has(parts[1])
    ) {
        return { command: `dca:${parts[1]}`, args: parts.slice(2) };
    }
    return null;
}

/**
 * Public surface of the BLE hook (react-native-ble-plx implementation).
 */
export interface FinagotchiBle {
    status: BleStatus;
    devices: Device[];
    connectedDevice: Device | null;
    deviceState: FinagotchiState | null;
    /** Last `<name>:req` notification (sync/feed/dca), or null since connect. */
    deviceRequest: DeviceRequest | null;
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
