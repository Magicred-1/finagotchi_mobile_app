import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    AppState,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';

import { Button } from '../components/Button';
import { PressableScale } from '../components/PressableScale';
import { ScreenGradient } from '../components/ScreenGradient';
import { SearchingRadar } from '../components/SearchingRadar';
import { colors, fonts, landing, radius, spacing, tracking, typography } from '../theme/tokens';
import {
    FINAGOTCHI_CHARACTERISTIC_UUID,
    FINAGOTCHI_SERVICE_UUID,
    hasLocationPermission,
    isPairingRequiredError,
    listSavedSsids,
    requestLocationPermission,
    saveWifiCredentials,
    useFinagotchiDevice,
    useWifiAutoSyncStore,
    writeWifiCredentialsToDevice,
} from '../features/ble';
import { useDcaSyncEngine } from '../services/ble/SyncEngine';
import { requestDeviceToken } from '../features/dbs/client';
import { useWalletStore } from '../features/wallet/store';
import { useOnboardingStore } from '../features/onboarding/store';

const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : 'height';

/** Re-probe the encrypted link while the OS pairing dialog is up. */
const PROBE_INTERVAL_MS = 2_000;
/** Give up waiting for pairing after this; the retry button re-arms it. */
const PROBE_TIMEOUT_MS = 60_000;

type Step = 'scan' | 'pair' | 'provision' | 'done';

type PairState = 'probing' | 'waiting' | 'error';

const STEPS: Step[] = ['scan', 'pair', 'provision', 'done'];

function StepIndicator({ step }: { step: Step }) {
    const currentIndex = STEPS.indexOf(step);
    return (
        <View style={styles.stepIndicator}>
            {STEPS.map((id, index) => (
                <View
                    key={id}
                    style={[
                        styles.stepSegment,
                        index <= currentIndex && styles.stepSegmentActive,
                    ]}
                />
            ))}
        </View>
    );
}

export default function HardwareBinding() {
    const ble = useFinagotchiDevice();
    const syncStatus = useDcaSyncEngine(ble);

    const {
        status,
        devices,
        connectedDevice,
        error,
        startScan,
        connect,
        reconnect,
    } = ble;

    const [step, setStep] = useState<Step>('scan');
    const [pairState, setPairState] = useState<PairState>('probing');
    const [pairError, setPairError] = useState<string | null>(null);
    // Bumped by the retry button to re-run the probe effect.
    const [pairNonce, setPairNonce] = useState(0);
    const probingRef = useRef(false);
    const [ssid, setSsid] = useState('');
    const [password, setPassword] = useState('');
    const [rememberNetwork, setRememberNetwork] = useState(true);
    const [provisioning, setProvisioning] = useState(false);
    const [provisionError, setProvisionError] = useState<string | null>(null);
    const [cloudLinked, setCloudLinked] = useState(false);

    const autoSync = useWifiAutoSyncStore();

    const scanning = status === 'scanning';
    const connecting = status === 'connecting';
    const reconnecting = status === 'reconnecting';

    useEffect(() => {
        if (connectedDevice && step === 'scan') setStep('pair');
    }, [connectedDevice, step]);

    // Link lost mid-flow: back to scanning. After 'done' the result stays.
    useEffect(() => {
        if (!connectedDevice && (step === 'pair' || step === 'provision')) {
            setStep('scan');
        }
    }, [connectedDevice, step]);

    // Seamless pairing: no in-app code entry (the OS owns the passkey dialog).
    // Probe the encrypted state characteristic — on an unbonded link the
    // probe itself raises the system pairing dialog; on a bonded one it just
    // succeeds and we move straight to provisioning.
    useEffect(() => {
        if (step !== 'pair' || !connectedDevice) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const deadline = Date.now() + PROBE_TIMEOUT_MS;

        const probe = async () => {
            if (cancelled || probingRef.current) return;
            probingRef.current = true;
            try {
                await connectedDevice.readCharacteristicForService(
                    FINAGOTCHI_SERVICE_UUID,
                    FINAGOTCHI_CHARACTERISTIC_UUID
                );
                if (!cancelled) setStep('provision');
            } catch (e) {
                if (cancelled) return;
                if (isPairingRequiredError(e)) {
                    setPairState('waiting');
                    if (Date.now() < deadline) {
                        timer = setTimeout(probe, PROBE_INTERVAL_MS);
                    } else {
                        setPairState('error');
                        setPairError(
                            'Pairing timed out — tap retry to try again.'
                        );
                    }
                } else {
                    setPairState('error');
                    setPairError(
                        e instanceof Error ? e.message : 'Verification failed.'
                    );
                }
            } finally {
                probingRef.current = false;
            }
        };

        setPairState('probing');
        setPairError(null);
        void probe();

        // Returning from the system pairing dialog re-probes immediately.
        const appStateSub = AppState.addEventListener('change', (next) => {
            if (next === 'active') void probe();
        });

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
            appStateSub.remove();
        };
    }, [step, connectedDevice, pairNonce]);

    // Auto-sync reads the current Wi-Fi name, which requires location
    // permission on both platforms. Ask for it up front only when there is at
    // least one remembered network worth syncing.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const saved = await listSavedSsids();
            if (cancelled || saved.length === 0) return;
            await requestLocationPermission();
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // Pre-fill the SSID with the current network when permitted.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!(await hasLocationPermission())) return;
                const state = await NetInfo.fetch();
                const current = state.type === 'wifi' ? state.details?.ssid : null;
                if (!cancelled && current && current !== '<unknown ssid>') {
                    setSsid((existing) => (existing ? existing : current));
                }
            } catch {
                // Location/NetInfo unavailable — leave the field empty.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    function handleRememberToggle(value: boolean) {
        setRememberNetwork(value);
        if (value) {
            // Needed to detect the current Wi-Fi name for auto-sync.
            void requestLocationPermission();
        }
    }

    async function handleProvision() {
        if (!connectedDevice) return;
        setProvisioning(true);
        setProvisionError(null);
        try {
            // When the wallet is server-authed, also issue a device token so
            // the hardware can pull pet state from the API while standalone.
            // Without it, fall back to Wi-Fi-only provisioning.
            let deviceToken: string | null = null;
            const wallet = useWalletStore.getState().address;
            const consent = useOnboardingStore.getState().serverAuthConsentAt;
            if (wallet && consent) {
                try {
                    deviceToken = await requestDeviceToken(wallet);
                } catch {
                    deviceToken = null;
                }
            }

            // Contract §2: "<ssid>\n<pass>" (optional third field carries the
            // device token), one separator, no trailing newline. Firmware
            // rejects writes on an unencrypted link.
            await writeWifiCredentialsToDevice(
                connectedDevice,
                ssid,
                password,
                deviceToken
            );

            setCloudLinked(deviceToken !== null);
            if (rememberNetwork) {
                await saveWifiCredentials(ssid, password);
            }
            setStep('done');
        } catch (e) {
            setProvisionError(
                e instanceof Error ? e.message : 'Provisioning write failed.'
            );
        } finally {
            setProvisioning(false);
        }
    }

    const scanStatusText = scanning
        ? 'Searching for nearby Finagotchi…'
        : connecting
          ? 'Connecting…'
          : reconnecting
            ? 'Connection lost — reconnecting…'
            : (error ?? 'No Finagotchi found nearby.');

    return (
        <SafeAreaView style={styles.safe}>
            <ScreenGradient />
            <KeyboardAvoidingView
                behavior={KEYBOARD_BEHAVIOR}
                style={styles.keyboard}
            >
                <ScrollView
                    style={styles.scroll}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                >
                    <Text style={styles.title}>Connect your Finagotchi</Text>
                    <Text style={styles.subtitle}>
                        {step === 'scan' &&
                            'Find your device over Bluetooth to get started.'}
                        {step === 'pair' &&
                            'Securing the connection — no code to type here.'}
                        {step === 'provision' &&
                            'Give your device Wi-Fi so it can sync on its own.'}
                        {step === 'done' && 'Your Finagotchi is ready.'}
                    </Text>

                    <StepIndicator step={step} />

                    {!syncStatus.connected && syncStatus.offlineLabel && (
                        <Text style={styles.syncLabel}>
                            {syncStatus.offlineLabel}
                        </Text>
                    )}

                    {step === 'scan' && (
                        <View style={styles.section}>
                            {scanning && <SearchingRadar />}
                            <Text
                                style={[
                                    styles.statusText,
                                    scanning && styles.statusTextCentered,
                                ]}
                            >
                                {scanStatusText}
                            </Text>

                            {devices.map((device) => (
                                <PressableScale
                                    key={device.id}
                                    onPress={() => connect(device)}
                                    disabled={connecting}
                                    style={[
                                        styles.deviceRow,
                                        connecting && styles.deviceRowDisabled,
                                    ]}
                                >
                                    <Ionicons
                                        name="hardware-chip-outline"
                                        size={18}
                                        color={landing.accent}
                                    />
                                    <View style={styles.deviceRowInfo}>
                                        <Text style={styles.deviceName}>
                                            {device.name ?? 'Finagotchi'}
                                        </Text>
                                        <Text style={styles.deviceMeta}>
                                            {device.rssi != null
                                                ? `${device.rssi} dBm`
                                                : ''}
                                        </Text>
                                    </View>
                                    <Text style={styles.connectLabel}>
                                        Connect
                                    </Text>
                                </PressableScale>
                            ))}

                            <Button
                                title={scanning ? 'Scanning…' : 'Connect device'}
                                loading={connecting}
                                disabled={scanning || reconnecting}
                                onPress={startScan}
                            />

                            {!scanning && !connecting && status === 'error' && (
                                <Button
                                    title="Reconnect"
                                    variant="secondary"
                                    onPress={reconnect}
                                />
                            )}
                        </View>
                    )}

                    {step === 'pair' && (
                        <View style={styles.section}>
                            <View style={styles.pairRow}>
                                <ActivityIndicator
                                    size="small"
                                    color={landing.accent}
                                />
                                <Text style={styles.prompt}>
                                    {pairState === 'waiting'
                                        ? 'Your Finagotchi is showing a 6-digit code — enter it in the pairing dialog.'
                                        : pairState === 'error'
                                          ? (pairError ?? 'Verification failed.')
                                          : 'Securing the connection…'}
                                </Text>
                            </View>
                            {pairState !== 'probing' && (
                                <Button
                                    title="Not seeing the dialog? Tap to retry"
                                    variant="secondary"
                                    onPress={() =>
                                        setPairNonce((nonce) => nonce + 1)
                                    }
                                />
                            )}
                        </View>
                    )}

                    {step === 'provision' && (
                        <View style={styles.section}>
                            <TextInput
                                value={ssid}
                                onChangeText={setSsid}
                                placeholder="Wi-Fi name (SSID)"
                                placeholderTextColor={landing.placeholder}
                                style={styles.input}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            <TextInput
                                value={password}
                                onChangeText={setPassword}
                                placeholder="Wi-Fi password"
                                placeholderTextColor={landing.placeholder}
                                style={styles.input}
                                autoCapitalize="none"
                                autoCorrect={false}
                                secureTextEntry
                            />
                            {provisionError && (
                                <Text style={styles.errorText}>
                                    {provisionError}
                                </Text>
                            )}
                            <View style={styles.rememberRow}>
                                <View style={styles.rememberInfo}>
                                    <Text style={styles.rememberLabel}>
                                        Remember network for auto-sync
                                    </Text>
                                    <Text style={styles.rememberHint}>
                                        Sends these credentials automatically
                                        on future connects. Location permission
                                        is used to detect the Wi-Fi name.
                                    </Text>
                                </View>
                                <Switch
                                    value={rememberNetwork}
                                    onValueChange={handleRememberToggle}
                                    trackColor={{
                                        false: landing.glassBorderStrong,
                                        true: landing.accent,
                                    }}
                                />
                            </View>
                            {autoSync.lastResult === 'synced' && (
                                <Text style={styles.syncLabel}>
                                    Auto-sync: pushed '{autoSync.lastSsid}' on
                                    connect
                                </Text>
                            )}
                            {autoSync.lastResult === 'unknown-network' && (
                                <Text style={styles.syncLabel}>
                                    '{autoSync.lastSsid}' not known yet —
                                    provision once to remember it
                                </Text>
                            )}
                            {autoSync.lastResult === 'no-permission' && (
                                <Text style={styles.syncLabel}>
                                    Auto-sync needs location permission to
                                    detect the Wi-Fi name
                                </Text>
                            )}
                            {autoSync.lastResult === 'write-failed' && (
                                <Text style={styles.syncLabel}>
                                    Auto-sync of '{autoSync.lastSsid}' failed —
                                    will retry on next connect
                                </Text>
                            )}
                            <Button
                                title="Provision Wi-Fi"
                                loading={provisioning}
                                disabled={!ssid.trim() || provisioning}
                                onPress={handleProvision}
                            />
                        </View>
                    )}

                    {step === 'done' && (
                        <View style={styles.section}>
                            <View style={styles.successCard}>
                                <View style={styles.successIconWrap}>
                                    <Ionicons
                                        name="checkmark"
                                        size={24}
                                        color={colors.success}
                                    />
                                </View>
                                <View style={styles.successInfo}>
                                    <Text style={styles.deviceName}>
                                        {connectedDevice?.name ?? 'Finagotchi'}
                                    </Text>
                                    <Text style={styles.successLabel}>
                                        {cloudLinked
                                            ? 'Wi-Fi + cloud sync provisioned'
                                            : 'Wi-Fi provisioned'}
                                    </Text>
                                </View>
                            </View>
                            {!cloudLinked && (
                                <Text style={styles.syncLabel}>
                                    Cloud sync not linked — connect your wallet
                                    before pairing to let the device sync on its
                                    own.
                                </Text>
                            )}
                            <Text style={styles.syncLabel}>
                                {syncStatus.connected
                                    ? 'Connected and syncing'
                                    : (syncStatus.offlineLabel ??
                                      'Device offline')}
                            </Text>
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    keyboard: {
        flex: 1,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        padding: spacing.lg,
        gap: spacing.md,
    },
    title: {
        color: landing.text,
        fontSize: typography.heading,
        fontFamily: fonts.medium,
        letterSpacing: tracking.heading,
        marginTop: spacing.lg,
    },
    subtitle: {
        color: landing.textMuted,
        fontSize: typography.body,
        fontFamily: fonts.regular,
        lineHeight: 24,
    },
    stepIndicator: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    stepSegment: {
        flex: 1,
        height: 3,
        borderRadius: radius.pill,
        backgroundColor: landing.glassBorder,
    },
    stepSegmentActive: {
        backgroundColor: landing.accent,
    },
    syncLabel: {
        color: landing.textMuted,
        fontSize: typography.small,
        fontFamily: fonts.mono,
    },
    section: {
        gap: spacing.md,
        marginTop: spacing.sm,
    },
    statusText: {
        color: landing.textMuted,
        fontSize: typography.small,
        fontFamily: fonts.mono,
    },
    statusTextCentered: {
        textAlign: 'center',
    },
    prompt: {
        flex: 1,
        color: landing.text,
        fontSize: typography.body,
        fontFamily: fonts.medium,
    },
    pairRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    input: {
        backgroundColor: landing.frostSurface,
        color: landing.ink,
        borderWidth: 1,
        borderColor: landing.frostBorder,
        borderRadius: radius.sm,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        fontSize: typography.body,
        fontFamily: fonts.mono,
    },
    errorText: {
        color: colors.heart,
        fontSize: typography.small,
        fontFamily: fonts.semiBold,
    },
    rememberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: landing.glass,
        borderWidth: 1,
        borderColor: landing.glassBorder,
    },
    rememberInfo: {
        flex: 1,
        gap: spacing.xs,
    },
    rememberLabel: {
        color: landing.text,
        fontSize: typography.small,
        fontFamily: fonts.semiBold,
    },
    rememberHint: {
        color: landing.textMuted,
        fontSize: typography.small,
        fontFamily: fonts.regular,
        lineHeight: 18,
    },
    deviceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: landing.glass,
        borderWidth: 1,
        borderColor: landing.glassBorder,
    },
    deviceRowDisabled: {
        opacity: 0.5,
    },
    deviceRowInfo: {
        flex: 1,
    },
    deviceName: {
        color: landing.text,
        fontSize: typography.body,
        fontFamily: fonts.semiBold,
    },
    deviceMeta: {
        color: landing.textMuted,
        fontSize: typography.small,
        fontFamily: fonts.mono,
    },
    connectLabel: {
        color: landing.accent,
        fontSize: typography.small,
        fontFamily: fonts.semiBold,
    },
    successCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: landing.glass,
        borderWidth: 1,
        borderColor: 'rgba(126,214,167,0.35)',
    },
    successIconWrap: {
        width: 40,
        height: 40,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(126,214,167,0.12)',
    },
    successInfo: {
        flex: 1,
    },
    successLabel: {
        color: colors.success,
        fontSize: typography.small,
        fontFamily: fonts.medium,
    },
});
