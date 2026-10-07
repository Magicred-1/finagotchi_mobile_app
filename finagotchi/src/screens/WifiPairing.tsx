import React, { useEffect, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { PressableScale } from '../components/PressableScale';
import { colors, radius, spacing, tracking, typography } from '../theme/tokens';
import {
    getExpoLocation,
    hasLocationPermission,
    isPairingRequiredError,
    requestLocationPermission,
    saveWifiCredentials,
    useFinagotchiDevice,
    useWifiAutoSyncStore,
    writeWifiCredentialsToDevice,
    WifiProvisionTimeoutError,
} from '../features/ble';
import { requestDeviceToken } from '../features/dbs/client';
import { useWalletStore } from '../features/wallet/store';
import { useOnboardingStore } from '../features/onboarding/store';

const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : 'height';

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

type SendState = 'idle' | 'sending' | 'pairing-required' | 'failed' | 'done';

/**
 * Manual Wi-Fi provisioning for the hardware companion. Requires an active
 * BLE link (the connect flow lives on the hardware binding screen); writes
 * the credentials to the encrypted provisioning characteristic — on an
 * unpaired link the OS raises its own passkey dialog (iOS: system sheet with
 * the code shown on the device screen; no in-app code entry is possible).
 */
export default function WifiPairing() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const ble = useFinagotchiDevice();
    const connected = ble.connectedDevice !== null;

    const [ssid, setSsid] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberNetwork, setRememberNetwork] = useState(true);
    const [sendState, setSendState] = useState<SendState>('idle');
    const [sendError, setSendError] = useState<string | null>(null);
    const [locationGranted, setLocationGranted] = useState<boolean | null>(null);

    const autoSync = useWifiAutoSyncStore();

    // SSID detection capability: location permission + the ExpoLocation native
    // module (absent on older dev clients — then it's manual entry only).
    const detectionAvailable = getExpoLocation() !== null;

    useEffect(() => {
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
    }, [detectionAvailable]);

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
        const device = ble.connectedDevice;
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

            if (rememberNetwork) {
                await saveWifiCredentials(ssid, password);
            }
            setSendState('done');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (e) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            if (isPairingRequiredError(e)) {
                // The write attempt itself raised the OS pairing dialog; if
                // the user dismissed or failed it, offer guided retry.
                setSendState('pairing-required');
                setSendError(null);
            } else if (e instanceof WifiProvisionTimeoutError) {
                setSendState('failed');
                setSendError('The device did not answer in time. Stay close and try again.');
            } else {
                setSendState('failed');
                setSendError(
                    e instanceof Error ? e.message : 'Provisioning write failed.'
                );
            }
        }
    }

    const validationError = validate(ssid, password);
    const sending = sendState === 'sending';

    const statusLine = ble.status === 'connecting'
        ? 'Connecting…'
        : ble.status === 'reconnecting'
          ? 'Connection lost — reconnecting…'
          : null;

    return (
        <View
            style={[
                styles.safe,
                { paddingTop: insets.top, paddingBottom: insets.bottom },
            ]}
        >
            <KeyboardAvoidingView
                behavior={KEYBOARD_BEHAVIOR}
                style={styles.keyboard}
            >
                <View style={styles.header}>
                    <PressableScale
                        onPress={() => router.back()}
                        hitSlop={8}
                        style={styles.headerButton}
                        accessibilityLabel="Back"
                    >
                        <Ionicons
                            name="chevron-back"
                            size={20}
                            color={colors.text}
                        />
                    </PressableScale>
                    <Text style={styles.headerTitle}>Wi-Fi Setup</Text>
                    <View style={styles.headerButton} />
                </View>

                <View style={styles.body}>
                    <Text style={styles.subtitle}>
                        Pairing lets your Finagotchi sync on its own, even when
                        your phone is nowhere near.
                    </Text>

                    {!connected ? (
                        <View style={styles.groupCard}>
                            <View style={styles.connectPrompt}>
                                <Ionicons
                                    name="bluetooth"
                                    size={22}
                                    color={colors.textMuted}
                                />
                                <Text style={styles.connectPromptText}>
                                    {statusLine ??
                                        'Connect your Finagotchi over Bluetooth first.'}
                                </Text>
                                <Button
                                    title="Connect device"
                                    onPress={() =>
                                        router.push('/hardware/binding')
                                    }
                                />
                            </View>
                        </View>
                    ) : (
                        <>
                            <View style={styles.groupCard}>
                                <View style={styles.connectedRow}>
                                    <View style={styles.connectedIconWrap}>
                                        <Ionicons
                                            name="hardware-chip-outline"
                                            size={18}
                                            color={colors.primary}
                                        />
                                    </View>
                                    <Text style={styles.connectedName}>
                                        {ble.connectedDevice?.name ?? 'Finagotchi'}
                                    </Text>
                                    <Text style={styles.connectedLabel}>
                                        Connected
                                    </Text>
                                </View>
                            </View>

                            {autoSync.lastResult === 'synced' && (
                                <Text style={styles.autoSyncNote}>
                                    Auto-sync pushed '{autoSync.lastSsid}' on
                                    connect — you're already set.
                                </Text>
                            )}
                            {autoSync.lastResult === 'unknown-network' && (
                                <Text style={styles.autoSyncNote}>
                                    '{autoSync.lastSsid}' isn't remembered yet
                                    — send it once and it syncs itself next time.
                                </Text>
                            )}

                            <Text style={styles.sectionLabel}>Network</Text>
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
                                    <Text style={styles.formLabel}>
                                        Password
                                    </Text>
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
                                        onPress={() =>
                                            setShowPassword((show) => !show)
                                        }
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
                                            iOS needs location permission to
                                            read the Wi-Fi name — it never
                                            leaves the phone.
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
                                        Sends these credentials automatically on
                                        future connects.
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
                                        Pairing required — when your phone asks,
                                        enter the 6-digit code shown on your
                                        Finagotchi, then send again.
                                    </Text>
                                </View>
                            )}
                            {sendState === 'failed' && sendError && (
                                <Text style={styles.errorText}>{sendError}</Text>
                            )}
                            {validationError && ssid.length > 0 && (
                                <Text style={styles.errorText}>
                                    {validationError}
                                </Text>
                            )}

                            {sendState === 'done' ? (
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
                                            Finagotchi is online
                                        </Text>
                                    </View>
                                    <View style={styles.groupSeparator} />
                                    <Text style={styles.doneNote}>
                                        It syncs on its own now — you can close
                                        this page.
                                    </Text>
                                </View>
                            ) : (
                                <Button
                                    title={
                                        sendState === 'pairing-required'
                                            ? 'Send again'
                                            : 'Send to Finagotchi'
                                    }
                                    loading={sending}
                                    disabled={Boolean(validationError) || sending}
                                    onPress={handleSend}
                                />
                            )}
                        </>
                    )}
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: colors.background,
    },
    keyboard: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.sm,
    },
    headerButton: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: tracking.heading * typography.heading,
    },
    body: {
        flex: 1,
        padding: spacing.lg,
        gap: spacing.md,
    },
    subtitle: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 22,
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
    connectPrompt: {
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.lg,
    },
    connectPromptText: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
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
    connectedLabel: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
    },
    autoSyncNote: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
    },
    sectionLabel: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginTop: spacing.xs,
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
    doneNote: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        paddingVertical: 12,
        paddingHorizontal: spacing.md,
    },
});
