import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { BleManager, State, type Device, type Subscription } from 'react-native-ble-plx';
import { Buffer } from 'buffer';

import {
    FINAGOTCHI_CHARACTERISTIC_UUID,
    FINAGOTCHI_SERVICE_UUID,
    parseStateString,
    type BleStatus,
    type FinagotchiBle,
    type FinagotchiState,
} from './types';

export {
    FINAGOTCHI_CHARACTERISTIC_UUID,
    FINAGOTCHI_DEVICE_NAME,
    FINAGOTCHI_SERVICE_UUID,
} from './types';
export type { BleStatus, FinagotchiBle, FinagotchiState } from './types';

const SCAN_TIMEOUT_MS = 15000;
/** Default ATT payload (MTU 23 minus 3 header bytes) before negotiation. */
const DEFAULT_WRITE_PAYLOAD = 20;
const REQUESTED_MTU = 256;
/** Delays between auto-reconnect attempts; gives up after the last one. */
const RECONNECT_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000];

// One manager for the app lifetime: the connection should survive the sheet
// closing, and creating multiple BleManager instances is not supported.
let manager: BleManager | null = null;
function getManager(): BleManager {
    if (!manager) {
        manager = new BleManager();
    }
    return manager;
}

async function requestBlePermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    const api =
        typeof Platform.Version === 'number'
            ? Platform.Version
            : parseInt(String(Platform.Version), 10);

    if (api >= 31) {
        const result = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);
        return (
            result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
                PermissionsAndroid.RESULTS.GRANTED &&
            result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
                PermissionsAndroid.RESULTS.GRANTED
        );
    }

    const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
}

export function useFinagotchiBle(): FinagotchiBle {    const [status, setStatus] = useState<BleStatus>('idle');
    const [devices, setDevices] = useState<Device[]>([]);
    const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
    const [deviceState, setDeviceState] = useState<FinagotchiState | null>(null);
    const [error, setError] = useState<string | null>(null);

    const monitorSub = useRef<Subscription | null>(null);
    const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reconnectAttempt = useRef(0);
    const intentionalDisconnect = useRef(false);
    const lastDeviceId = useRef<string | null>(null);
    const connectedDeviceRef = useRef<Device | null>(null);
    const disconnectSub = useRef<Subscription | null>(null);
    const writePayload = useRef(DEFAULT_WRITE_PAYLOAD);
    // Serializes characteristic writes: firmware must never see overlapping writes.
    const writeQueue = useRef<Promise<void>>(Promise.resolve());

    // Bumped to re-run the auto-reconnect effect for the next attempt.
    const [reconnectTick, setReconnectTick] = useState(0);

    const clearReconnectTimer = useCallback(() => {
        if (reconnectTimer.current) {
            clearTimeout(reconnectTimer.current);
            reconnectTimer.current = null;
        }
    }, []);

    const stopScan = useCallback(() => {
        getManager().stopDeviceScan();
        if (scanTimer.current) {
            clearTimeout(scanTimer.current);
            scanTimer.current = null;
        }
        setStatus((s) => (s === 'scanning' ? 'idle' : s));
    }, []);

    const handleDisconnect = useCallback(() => {
        monitorSub.current?.remove();
        monitorSub.current = null;
        disconnectSub.current?.remove();
        disconnectSub.current = null;
        connectedDeviceRef.current = null;
        setConnectedDevice(null);
        setDeviceState(null);

        if (intentionalDisconnect.current || !lastDeviceId.current) {
            setStatus('idle');
            return;
        }

        // Unexpected drop: retry with backoff, the firmware is advertising again.
        reconnectAttempt.current = 0;
        setStatus('reconnecting');
    }, []);

    // Bluetooth killed at the OS level: tear down and wait for PoweredOn.
    const handleBluetoothOff = useCallback(() => {
        if (scanTimer.current) clearTimeout(scanTimer.current);
        getManager().stopDeviceScan();
        clearReconnectTimer();
        monitorSub.current?.remove();
        monitorSub.current = null;
        disconnectSub.current?.remove();
        disconnectSub.current = null;
        connectedDeviceRef.current = null;
        setConnectedDevice(null);
        setDeviceState(null);
        setStatus('off');
    }, [clearReconnectTimer]);

    // Track adapter state: PoweredOff kills everything, PoweredOn resumes
    // auto-reconnect when a device was previously linked.
    useEffect(() => {
        const sub = getManager().onStateChange((btState) => {
            if (btState === State.PoweredOff) {
                intentionalDisconnect.current = false;
                handleBluetoothOff();
            } else if (btState === State.PoweredOn) {
                setStatus((s) =>
                    s === 'off' && lastDeviceId.current && !connectedDeviceRef.current
                        ? 'reconnecting'
                        : s
                );
            }
        }, true);
        return () => sub.remove();
    }, [handleBluetoothOff]);

    // Battery-friendly: stop scanning/reconnect retries while backgrounded,
    // resume reconnect when the app comes back to the foreground.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') {
                if (lastDeviceId.current && !connectedDeviceRef.current) {
                    // Resume reconnecting with a fresh backoff schedule.
                    reconnectAttempt.current = 0;
                    setStatus((s) =>
                        s === 'reconnecting' || s === 'error'
                            ? 'reconnecting'
                            : s
                    );
                    setReconnectTick((t) => t + 1);
                }
            } else {
                getManager().stopDeviceScan();
                clearReconnectTimer();
            }
        });
        return () => sub.remove();
    }, [clearReconnectTimer]);

    const openConnection = useCallback(
        async (device: Device): Promise<boolean> => {
            try {
                await device.discoverAllServicesAndCharacteristics();

                if (Platform.OS === 'android') {
                    try {
                        // Resolves with the Device on success; Android grants the
                        // requested MTU or rejects, so the payload is known.
                        await device.requestMTU(REQUESTED_MTU);
                        writePayload.current = REQUESTED_MTU - 3;
                    } catch (e) {
                        console.warn('[BLE] MTU negotiation failed, using default:', e);
                        writePayload.current = DEFAULT_WRITE_PAYLOAD;
                    }
                }

                const initial = await device.readCharacteristicForService(
                    FINAGOTCHI_SERVICE_UUID,
                    FINAGOTCHI_CHARACTERISTIC_UUID
                );
                if (initial.value) {
                    setDeviceState(
                        parseStateString(
                            Buffer.from(initial.value, 'base64').toString('utf8')
                        )
                    );
                }

                monitorSub.current?.remove();
                monitorSub.current = device.monitorCharacteristicForService(
                    FINAGOTCHI_SERVICE_UUID,
                    FINAGOTCHI_CHARACTERISTIC_UUID,
                    (monError, characteristic) => {
                        if (monError) {
                            // Fires on disconnect too; handled by onDeviceDisconnected.
                            return;
                        }
                        if (characteristic?.value) {
                            setDeviceState(
                                parseStateString(
                                    Buffer.from(characteristic.value, 'base64').toString(
                                        'utf8'
                                    )
                                )
                            );
                        }
                    }
                );

                disconnectSub.current?.remove();
                disconnectSub.current = getManager().onDeviceDisconnected(
                    device.id,
                    handleDisconnect
                );

                lastDeviceId.current = device.id;
                connectedDeviceRef.current = device;
                setConnectedDevice(device);
                setStatus('connected');
                return true;
            } catch (e) {
                console.warn('[BLE] connection setup failed:', e);
                try {
                    await device.cancelConnection();
                } catch {
                    // already gone
                }
                return false;
            }
        },
        [handleDisconnect]
    );

    const connect = useCallback(
        async (device: Device) => {
            stopScan();
            clearReconnectTimer();
            intentionalDisconnect.current = false;
            setStatus('connecting');
            setError(null);
            try {
                const connected = await device.connect({ timeout: 10000 });
                const ok = await openConnection(connected);
                if (!ok) {
                    setError('Connection setup failed.');
                    setStatus('error');
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Connection failed.');
                setStatus('error');
            }
        },
        [stopScan, clearReconnectTimer, openConnection]
    );

    // Auto-reconnect with backoff while status is 'reconnecting'. Each failed
    // attempt bumps reconnectTick so the effect re-runs for the next attempt.
    useEffect(() => {
        if (status !== 'reconnecting' || !lastDeviceId.current) return;

        const attempt = reconnectAttempt.current;
        if (attempt >= RECONNECT_BACKOFF_MS.length) {
            setError('Lost connection to your Finagotchi.');
            setStatus('error');
            return;
        }

        reconnectTimer.current = setTimeout(async () => {
            reconnectAttempt.current = attempt + 1;
            try {
                const device = await getManager().connectToDevice(
                    lastDeviceId.current as string,
                    { timeout: 10000 }
                );
                await openConnection(device);
            } catch {
                // Device not reachable yet; fall through to the next attempt.
            } finally {
                // If the attempt did not restore the connection, schedule the
                // next one; openConnection flips status to 'connected' on success.
                if (!connectedDeviceRef.current) {
                    setReconnectTick((t) => t + 1);
                }
            }
        }, RECONNECT_BACKOFF_MS[attempt]);

        return clearReconnectTimer;
    }, [status, reconnectTick, clearReconnectTimer, openConnection]);

    const startScan = useCallback(async () => {
        const granted = await requestBlePermissions();
        if (!granted) {
            setError('Bluetooth permission denied.');
            setStatus('error');
            return;
        }

        const m = getManager();
        if ((await m.state()) !== State.PoweredOn) {
            setError('Turn on Bluetooth to find your Finagotchi.');
            setStatus('off');
            return;
        }

        setDevices([]);
        setError(null);
        setStatus('scanning');

        m.startDeviceScan([FINAGOTCHI_SERVICE_UUID], null, (scanError, device) => {
            if (scanError) {
                setError(scanError.message);
                m.stopDeviceScan();
                setStatus('error');
                return;
            }
            if (!device) return;
            setDevices((prev) =>
                prev.some((d) => d.id === device.id) ? prev : [...prev, device]
            );
        });

        scanTimer.current = setTimeout(stopScan, SCAN_TIMEOUT_MS);
    }, [stopScan]);

    const reconnect = useCallback(async () => {
        if (!lastDeviceId.current) {
            // Nothing linked before: fall back to a fresh scan.
            startScan();
            return;
        }
        clearReconnectTimer();
        intentionalDisconnect.current = false;
        reconnectAttempt.current = 0;
        setError(null);
        setStatus('connecting');
        try {
            const device = await getManager().connectToDevice(lastDeviceId.current, {
                timeout: 10000,
            });
            const ok = await openConnection(device);
            if (!ok) {
                setError('Reconnection failed.');
                setStatus('error');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Reconnection failed.');
            setStatus('error');
        }
    }, [clearReconnectTimer, openConnection, startScan]);

    const disconnect = useCallback(async () => {
        intentionalDisconnect.current = true;
        clearReconnectTimer();
        monitorSub.current?.remove();
        monitorSub.current = null;
        disconnectSub.current?.remove();
        disconnectSub.current = null;
        const device = connectedDeviceRef.current;
        connectedDeviceRef.current = null;
        if (device) {
            try {
                await device.cancelConnection();
            } catch {
                // already gone
            }
        }
        setConnectedDevice(null);
        setDeviceState(null);
        setStatus('idle');
    }, [clearReconnectTimer]);

    const sendCommand = useCallback((cmd: string) => {
        const device = connectedDeviceRef.current;
        if (!device) {
            console.warn('[BLE] sendCommand while disconnected, dropped:', cmd);
            return;
        }

        writeQueue.current = writeQueue.current.then(async () => {
            // "a;b" writes are sent as one write per command so no single
            // write ever risks exceeding the negotiated payload.
            for (const part of cmd.split(';')) {
                const trimmed = part.trim();
                if (!trimmed) continue;
                const bytes = Buffer.from(trimmed, 'utf8');
                if (bytes.length > writePayload.current) {
                    console.warn(
                        `[BLE] command exceeds write payload (${bytes.length} > ${writePayload.current}):`,
                        trimmed
                    );
                }
                try {
                    await device.writeCharacteristicWithResponseForService(
                        FINAGOTCHI_SERVICE_UUID,
                        FINAGOTCHI_CHARACTERISTIC_UUID,
                        bytes.toString('base64')
                    );
                } catch (e) {
                    console.warn('[BLE] write failed:', trimmed, e);
                }
            }
        });
    }, []);

    // Stop scanning and any pending reconnect when the screen unmounts;
    // keep the connection alive.
    useEffect(
        () => () => {
            if (scanTimer.current) clearTimeout(scanTimer.current);
            clearReconnectTimer();
            if (manager) manager.stopDeviceScan();
        },
        [clearReconnectTimer]
    );

    return {
        status,
        devices,
        connectedDevice,
        deviceState,
        error,
        startScan,
        stopScan,
        connect,
        disconnect,
        reconnect,
        sendCommand,
    };
}
