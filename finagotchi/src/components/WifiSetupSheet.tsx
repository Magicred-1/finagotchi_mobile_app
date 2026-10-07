import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import * as Haptics from 'expo-haptics';
// RNGH's ScrollView so the drum/sheet pan gestures negotiate instead of the
// native scroll view cancelling them.
import { ScrollView } from 'react-native-gesture-handler';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { PressableScale } from './PressableScale';
import { colors, radius, spacing, typography } from '../theme/tokens';
import {
    getExpoLocation,
    hasLocationPermission,
    isPairingRequiredError,
    requestLocationPermission,
    saveWifiCredentials,
    useWifiAutoSyncStore,
    writeWifiCredentialsToDevice,
    WifiProvisionTimeoutError,
    type FinagotchiBle,
    type WifiFailureCode,
} from '../features/ble';
import { requestDeviceToken } from '../features/dbs/client';
import { useWalletStore } from '../features/wallet/store';
import { useOnboardingStore } from '../features/onboarding/store';

/** Firmware contract: ssid 1–32 chars, passphrase 0 (open) or 8–63 chars. */
function validate(ssid: string, password: string): string | null {
    if (ssid.trim().length === 0 || ssid.length > 32) {
        return 'Wi-Fi name must be 1–32 characters.';
    }
    if (password.length > 0 && (password.length < 8 || password.length > 63)) {
        return 'Password must be 8–63 characters (or empty for an open network).';
    }
    return null;
}

/** The device takes ~10 s to attempt a join; verdicts arrive as wifi: lines. */
const JOIN_VERDICT_TIMEOUT_MS = 15_000;

/** Per-code failure copy for the device's join verdict. */
const WIFI_FAILURE_COPY: Record<WifiFailureCode, string> = {
    ssid: "Network not found — check the name exactly. iPhone hotspot names use a curly apostrophe (’), not a straight one (').",
    auth: 'Wrong password — try again.',
    ip: 'Joined but no internet address — try again in a moment.',
    off: "The device didn't attempt the join.",
};

type SendState =
    | 'idle'
    | 'sending'
    | 'joining'
    | 'pairing-required'
    | 'failed'
    | 'done';

/**
 * Wi-Fi provisioning as a sheet over the device connection UX: the SSID is
 * prefilled from the phone's current network when possible, so the flow is
 * type-the-password → one button → done. The write goes to the encrypted
 * provisioning characteristic; on an unpaired link the OS raises its own
 * passkey dialog (iOS: system sheet with the code shown on the device screen —
 * no in-app code entry is possible), and a guided retry state covers a
 * dismissed/failed pairing prompt.
 */
export function WifiSetupSheet({
    visible,
    onClose,
    ble,
}: {
    visible: boolean;
    onClose: () => void;
    ble: FinagotchiBle;
}) {
    const connectedDevice = ble.connectedDevice;
    const connected = connectedDevice !== null;

    const [ssid, setSsid] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberNetwork, setRememberNetwork] = useState(true);
    const [sendState, setSendState] = useState<SendState>('idle');
    const [sendError, setSendError] = useState<string | null>(null);
    /** SSID the device confirmed it joined (from the wifi:ok verdict). */
    const [joinedSsid, setJoinedSsid] = useState<string | null>(null);
    const [locationGranted, setLocationGranted] = useState<boolean | null>(null);

    // Verdict bookkeeping: ignore wifi: lines older than the current attempt.
    const joinStartRef = useRef(0);
    const joinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const autoSync = useWifiAutoSyncStore();

    // SSID detection capability: location permission + the ExpoLocation native
    // module (absent on older dev clients — then it's manual entry only).
    const detectionAvailable = getExpoLocation() !== null;

    // Fresh state on each open; prefill the SSID when permitted.
    useEffect(() => {
        if (!visible) return;
        setPassword('');
        setShowPassword(false);
        setSendState('idle');
        setSendError(null);
        setJoinedSsid(null);
        if (!detectionAvailable) return;
        let cancelled = false;
        void (async () => {
            const granted = await hasLocationPermission();
            if (cancelled) return;
            setLocationGranted(granted);
            if (!granted) return;
            try {
                const state = await NetInfo.fetch();
                const current =
                    state.type === 'wifi' ? state.details?.ssid : null;
                if (!cancelled && current && current !== '<unknown ssid>') {
                    setSsid((existing) => (existing ? existing : current));
                }
            } catch {
                // NetInfo unavailable — leave the field empty.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [visible, detectionAvailable]);

    async function handleUseCurrentNetwork() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const granted = await requestLocationPermission();
        setLocationGranted(granted);
        if (!granted) return;
        try {
            const state = await NetInfo.fetch();
            const current = state.type === 'wifi' ? state.details?.ssid : null;
            if (current && current !== '<unknown ssid>') setSsid(current);
        } catch {
            // Leave the field as-is.
        }
    }

    async function handleSend() {
        const device = connectedDevice;
        if (!device) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSendState('sending');
        setSendError(null);
        try {
            // When the wallet is server-authed, also issue a device token so
            // the hardware can pull pet state from the API while standalone.
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

            await writeWifiCredentialsToDevice(device, ssid, password, deviceToken);

            // The write being accepted is not the verdict: the join itself
            // takes ~10 s and the device reports back with a wifi: line.
            joinStartRef.current = Date.now();
            setSendState('joining');
            if (joinTimer.current) clearTimeout(joinTimer.current);
            joinTimer.current = setTimeout(() => {
                joinTimer.current = null;
                setSendState('failed');
                setSendError(
                    'No answer from the device — check its screen to see if it joined.'
                );
            }, JOIN_VERDICT_TIMEOUT_MS);
        } catch (e) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            if (isPairingRequiredError(e)) {
                // The write attempt itself raised the OS pairing dialog; if
                // the user dismissed or failed it, offer guided retry.
                setSendState('pairing-required');
                setSendError(null);
            } else if (e instanceof WifiProvisionTimeoutError) {
                setSendState('failed');
                setSendError(
                    'The device did not answer in time. Stay close and try again.'
                );
            } else {
                setSendState('failed');
                setSendError(
                    e instanceof Error ? e.message : 'Provisioning write failed.'
                );
            }
        }
    }

    // The device's join verdict arrives as a wifi: notification on the state
    // characteristic; only verdicts newer than the current attempt count.
    const wifiResult = ble.wifiResult;
    useEffect(() => {
        if (sendState !== 'joining' || !wifiResult) return;
        if (wifiResult.at < joinStartRef.current) return;
        if (joinTimer.current) {
            clearTimeout(joinTimer.current);
            joinTimer.current = null;
        }
        if (wifiResult.ok) {
            setJoinedSsid(wifiResult.ssid ?? null);
            setSendState('done');
            if (rememberNetwork) {
                void saveWifiCredentials(ssid, password);
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return;
        }
        setSendState('failed');
        setSendError(
            wifiResult.code
                ? WIFI_FAILURE_COPY[wifiResult.code]
                : 'The join failed — try again.'
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }, [wifiResult, sendState, rememberNetwork, ssid, password]);

    useEffect(
        () => () => {
            if (joinTimer.current) clearTimeout(joinTimer.current);
        },
        []
    );

    const validationError = validate(ssid, password);
    const sending = sendState === 'sending';

    return (
        <BottomSheet visible={visible} onClose={onClose} title="Wi-Fi Setup">
            <ScrollView
                style={styles.scroll}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.section}>
                    <Text style={styles.subtitle}>
                        Give your Finagotchi Wi-Fi once — it syncs on its own,
                        even when your phone is nowhere near.
                    </Text>

                    {!connected && (
                        <View style={styles.groupCard}>
                            <View style={styles.offlineRow}>
                                <Ionicons
                                    name="bluetooth"
                                    size={18}
                                    color={colors.textMuted}
                                />
                                <Text style={styles.offlineText}>
                                    {ble.status === 'connecting'
                                        ? 'Connecting…'
                                        : ble.status === 'reconnecting'
                                          ? 'Connection lost — reconnecting…'
                                          : 'Not connected — connect your Finagotchi to send.'}
                                </Text>
                            </View>
                        </View>
                    )}

                    {autoSync.lastResult === 'synced' && (
                        <Text style={styles.autoSyncNote}>
                            Auto-sync pushed '{autoSync.lastSsid}' on connect —
                            you're already set.
                        </Text>
                    )}
                    {autoSync.lastResult === 'unknown-network' && (
                        <Text style={styles.autoSyncNote}>
                            '{autoSync.lastSsid}' isn't remembered yet — send it
                            once and it syncs itself next time.
                        </Text>
                    )}

                    <View style={styles.groupCard}>
                        <View style={styles.formRow}>
                            <Text style={styles.formLabel}>Name</Text>
                            <TextInput
                                value={ssid}
                                onChangeText={setSsid}
                                placeholder="Wi-Fi name (SSID)"
                                placeholderTextColor={colors.textMuted}
                                style={styles.formInput}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                        </View>
                        <View style={styles.groupSeparator} />
                        <View style={styles.formRow}>
                            <Text style={styles.formLabel}>Password</Text>
                            <TextInput
                                value={password}
                                onChangeText={setPassword}
                                placeholder="Wi-Fi password"
                                placeholderTextColor={colors.textMuted}
                                style={styles.formInput}
                                autoCapitalize="none"
                                autoCorrect={false}
                                secureTextEntry={!showPassword}
                            />
                            <PressableScale
                                onPress={() => setShowPassword((show) => !show)}
                                hitSlop={8}
                                accessibilityLabel={
                                    showPassword
                                        ? 'Hide password'
                                        : 'Show password'
                                }
                            >
                                <Ionicons
                                    name={
                                        showPassword
                                            ? 'eye-off-outline'
                                            : 'eye-outline'
                                    }
                                    size={18}
                                    color={colors.textMuted}
                                />
                            </PressableScale>
                        </View>
                    </View>

                    {ssid.includes("'") && (
                        <PressableScale
                            onPress={() => {
                                Haptics.selectionAsync();
                                setSsid((value) => value.replace(/'/g, '’'));
                            }}
                            style={styles.apostropheHint}
                            accessibilityRole="button"
                        >
                            <Ionicons
                                name="bulb-outline"
                                size={13}
                                color={colors.warning}
                            />
                            <Text style={styles.apostropheHintText}>
                                iPhone hotspots spell this with a curly
                                apostrophe (’) — tap to fix
                            </Text>
                        </PressableScale>
                    )}

                    {detectionAvailable && locationGranted === false && (
                        <PressableScale
                            onPress={handleUseCurrentNetwork}
                            style={styles.detectRow}
                            accessibilityRole="button"
                        >
                            <Ionicons
                                name="wifi"
                                size={16}
                                color={colors.primary}
                            />
                            <View style={styles.detectTextCol}>
                                <Text style={styles.detectTitle}>
                                    Use this phone's current network
                                </Text>
                                <Text style={styles.detectHint}>
                                    iOS needs location permission to read the
                                    Wi-Fi name — it never leaves the phone.
                                </Text>
                            </View>
                        </PressableScale>
                    )}
                    {detectionAvailable && locationGranted === true && (
                        <PressableScale
                            onPress={handleUseCurrentNetwork}
                            style={styles.detectRow}
                            accessibilityRole="button"
                        >
                            <Ionicons
                                name="wifi"
                                size={16}
                                color={colors.primary}
                            />
                            <Text style={styles.detectTitle}>
                                Refresh current network name
                            </Text>
                        </PressableScale>
                    )}

                    <View style={styles.rememberRow}>
                        <View style={styles.rememberInfo}>
                            <Text style={styles.rememberLabel}>
                                Remember network for auto-sync
                            </Text>
                            <Text style={styles.rememberHint}>
                                Sends these credentials automatically on future
                                connects.
                            </Text>
                        </View>
                        <Switch
                            value={rememberNetwork}
                            onValueChange={setRememberNetwork}
                            trackColor={{
                                false: colors.border,
                                true: colors.primary,
                            }}
                        />
                    </View>

                    {sendState === 'pairing-required' && (
                        <View style={styles.pairingCard}>
                            <Ionicons
                                name="key-outline"
                                size={16}
                                color={colors.warning}
                            />
                            <Text style={styles.pairingText}>
                                Pairing required — when your phone asks, enter
                                the 6-digit code shown on your Finagotchi, then
                                send again.
                            </Text>
                        </View>
                    )}
                    {sendState === 'joining' && (
                        <View style={styles.joiningRow}>
                            <ActivityIndicator
                                size="small"
                                color={colors.primary}
                            />
                            <Text style={styles.joiningText}>
                                Finagotchi is joining {ssid}…
                            </Text>
                        </View>
                    )}
                    {sendState === 'failed' && sendError && (
                        <Text style={styles.errorText}>{sendError}</Text>
                    )}
                    {validationError && ssid.length > 0 && (
                        <Text style={styles.errorText}>{validationError}</Text>
                    )}

                    {sendState === 'done' ? (
                        <>
                            <View style={styles.groupCard}>
                                <View style={styles.connectedRow}>
                                    <View style={styles.connectedIconWrap}>
                                        <Ionicons
                                            name="checkmark"
                                            size={18}
                                            color={colors.success}
                                        />
                                    </View>
                                    <Text style={styles.connectedName}>
                                        Connected to {joinedSsid ?? ssid}
                                    </Text>
                                </View>
                                <View style={styles.groupSeparator} />
                                <Text style={styles.doneNote}>
                                    It syncs on its own now.
                                </Text>
                            </View>
                            <Button
                                title="Done"
                                variant="secondary"
                                onPress={onClose}
                            />
                        </>
                    ) : (
                        <Button
                            title={
                                sendState === 'pairing-required'
                                    ? 'Send again'
                                    : 'Send to Finagotchi'
                            }
                            loading={sending}
                            disabled={
                                !connected ||
                                Boolean(validationError) ||
                                sending ||
                                sendState === 'joining'
                            }
                            onPress={handleSend}
                        />
                    )}
                </View>
            </ScrollView>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    scroll: {
        flexShrink: 1,
        flexGrow: 0,
    },
    section: {
        gap: spacing.md,
        paddingBottom: spacing.md,
    },
    subtitle: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 20,
    },
    groupCard: {
        backgroundColor: colors.surfaceLight,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
    },
    groupSeparator: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginLeft: spacing.md,
    },
    offlineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.md,
    },
    offlineText: {
        flex: 1,
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
    },
    autoSyncNote: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
    },
    formRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: 4,
        paddingHorizontal: spacing.md,
        minHeight: 48,
    },
    formLabel: {
        width: 76,
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
    },
    formInput: {
        flex: 1,
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_500Medium',
        paddingVertical: 10,
    },
    detectRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: colors.border,
    },
    detectTextCol: {
        flex: 1,
        gap: 2,
    },
    detectTitle: {
        flex: 1,
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
    },
    detectHint: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 18,
    },
    rememberRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: colors.border,
    },
    rememberInfo: {
        flex: 1,
        gap: spacing.xs,
    },
    rememberLabel: {
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
    },
    rememberHint: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 18,
    },
    pairingCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: 'rgba(255,209,102,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,209,102,0.35)',
    },
    joiningRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.xs,
    },
    joiningText: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
    },
    apostropheHint: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        alignSelf: 'flex-start',
    },
    apostropheHintText: {
        flex: 1,
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
    },
    pairingText: {
        flex: 1,
        color: colors.warning,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
        lineHeight: 20,
    },
    errorText: {
        color: colors.danger,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
    },
    connectedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: 12,
        paddingHorizontal: spacing.md,
        minHeight: 48,
    },
    connectedIconWrap: {
        width: 32,
        height: 32,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(53,215,255,0.12)',
    },
    connectedName: {
        flex: 1,
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
    },
    doneNote: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        paddingVertical: 12,
        paddingHorizontal: spacing.md,
    },
});
