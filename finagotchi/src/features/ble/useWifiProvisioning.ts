import { useCallback, useEffect, useRef, useState } from 'react';

import {
    isPairingRequiredError,
    writeWifiCredentialsToDevice,
} from './wifiProvision';
import type { FinagotchiBle, WifiFailureCode } from './types';

export type WifiProvisionSendState =
    | 'idle'
    | 'sending'
    | 'joining'
    | 'pairing-required'
    | 'failed'
    | 'done';

const JOIN_VERDICT_TIMEOUT_MS = 15_000;

const WIFI_FAILURE_COPY: Record<WifiFailureCode, string> = {
    ssid: "Network not found — check the name exactly. iPhone hotspot names use a curly apostrophe (’), not a straight one (').",
    auth: 'Wrong password — try again.',
    ip: 'Joined but no internet address — try again in a moment.',
    off: "The device didn't attempt the join.",
};

export function useWifiProvisioning(ble: FinagotchiBle) {
    const [sendState, setSendState] = useState<WifiProvisionSendState>('idle');
    const [sendError, setSendError] = useState<string | null>(null);
    const [joinedSsid, setJoinedSsid] = useState<string | null>(null);
    const joinStartRef = useRef(0);
    const joinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wifiResult = ble.wifiResult;

    const clearJoinTimer = useCallback(() => {
        if (joinTimer.current) clearTimeout(joinTimer.current);
        joinTimer.current = null;
    }, []);

    const reset = useCallback(() => {
        clearJoinTimer();
        joinStartRef.current = 0;
        setSendState('idle');
        setSendError(null);
        setJoinedSsid(null);
    }, [clearJoinTimer]);

    const send = useCallback(
        async (ssid: string, password: string, deviceToken?: string | null) => {
            const device = ble.connectedDevice;
            if (!device) {
                setSendState('failed');
                setSendError('Connect your Finagotchi before sending Wi-Fi.');
                return;
            }

            clearJoinTimer();
            joinStartRef.current = Date.now();
            setJoinedSsid(null);
            setSendError(null);
            setSendState('sending');
            try {
                await writeWifiCredentialsToDevice(
                    device,
                    ssid,
                    password,
                    deviceToken,
                    ble.writePayloadBytes
                );
                setSendState('joining');
                joinTimer.current = setTimeout(() => {
                    joinTimer.current = null;
                    setSendState('failed');
                    setSendError(
                        'No answer from the device — check its screen to see if it joined.'
                    );
                }, JOIN_VERDICT_TIMEOUT_MS);
            } catch (error) {
                if (isPairingRequiredError(error)) {
                    setSendState('pairing-required');
                    setSendError(null);
                } else {
                    setSendState('failed');
                    setSendError(
                        error instanceof Error
                            ? error.message
                            : 'Provisioning write failed.'
                    );
                }
            }
        },
        [ble.connectedDevice, ble.writePayloadBytes, clearJoinTimer]
    );

    useEffect(() => {
        if (sendState !== 'joining' || !wifiResult) return;
        if (wifiResult.at < joinStartRef.current) return;
        clearJoinTimer();
        if (wifiResult.ok) {
            setJoinedSsid(wifiResult.ssid ?? null);
            setSendState('done');
            return;
        }
        setSendState('failed');
        setSendError(
            wifiResult.code
                ? WIFI_FAILURE_COPY[wifiResult.code]
                : 'The join failed — try again.'
        );
    }, [wifiResult, sendState, clearJoinTimer]);

    useEffect(() => clearJoinTimer, [clearJoinTimer]);

    return { sendState, sendError, joinedSsid, send, reset };
}
