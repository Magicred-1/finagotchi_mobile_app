import React, { useEffect, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Buffer } from 'buffer';

import { Button } from '../components/Button';
import { PressableScale } from '../components/PressableScale';
import { SearchingRadar } from '../components/SearchingRadar';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { FINAGOTCHI_SERVICE_UUID, useFinagotchiDevice } from '../features/ble';
import { useDcaSyncEngine } from '../services/ble/SyncEngine';

/** Provisioning characteristic (contract §1); encrypted writes only. */
const PROVISIONING_CHAR_UUID = '0000f1a2-0000-1000-8000-00805f9b34fb';

const KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : 'height';

type Step = 'scan' | 'pair' | 'provision' | 'done';

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
    const [pairCode, setPairCode] = useState('');
    const [ssid, setSsid] = useState('');
    const [password, setPassword] = useState('');
    const [provisioning, setProvisioning] = useState(false);
    const [provisionError, setProvisionError] = useState<string | null>(null);

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

    async function handleProvision() {
        if (!connectedDevice) return;
        setProvisioning(true);
        setProvisionError(null);
        try {
            // Contract §2: "<ssid>\n<pass>", one separator, no trailing
            // newline. Firmware rejects writes on an unencrypted link.
            const payload = Buffer.from(`${ssid}\n${password}`, 'utf8').toString(
                'base64'
            );
            await connectedDevice.writeCharacteristicWithResponseForService(
                FINAGOTCHI_SERVICE_UUID,
                PROVISIONING_CHAR_UUID,
                payload
            );

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
                        {step === 'pair' && 'Pair with your device.'}
                        {step === 'provision' &&
                            'Give your device Wi-Fi so it can sync on its own.'}
                        {step === 'done' && 'Your Finagotchi is ready.'}
                    </Text>

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
                                        color={colors.primary}
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
                            <Text style={styles.prompt}>
                                Enter the 6-digit code on your Finagotchi's
                                screen
                            </Text>
                            <TextInput
                                value={pairCode}
                                onChangeText={(text) =>
                                    setPairCode(text.replace(/\D/g, ''))
                                }
                                placeholder="123456"
                                placeholderTextColor={colors.textMuted}
                                style={[styles.input, styles.codeInput]}
                                keyboardType="number-pad"
                                maxLength={6}
                                returnKeyType="done"
                                onSubmitEditing={() => {
                                    if (pairCode.length === 6) {
                                        setStep('provision');
                                    }
                                }}
                            />
                            <Button
                                title="Continue"
                                disabled={pairCode.length !== 6}
                                onPress={() => setStep('provision')}
                            />
                        </View>
                    )}

                    {step === 'provision' && (
                        <View style={styles.section}>
                            <TextInput
                                value={ssid}
                                onChangeText={setSsid}
                                placeholder="Wi-Fi name (SSID)"
                                placeholderTextColor={colors.textMuted}
                                style={styles.input}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            <TextInput
                                value={password}
                                onChangeText={setPassword}
                                placeholder="Wi-Fi password"
                                placeholderTextColor={colors.textMuted}
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
                                        color={colors.primary}
                                    />
                                </View>
                                <View style={styles.successInfo}>
                                    <Text style={styles.deviceName}>
                                        {connectedDevice?.name ?? 'Finagotchi'}
                                    </Text>
                                    <Text style={styles.successLabel}>
                                        Wi-Fi provisioned
                                    </Text>
                                </View>
                            </View>
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
        backgroundColor: colors.background,
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
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_700Bold',
        marginTop: spacing.lg,
    },
    subtitle: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 24,
    },
    syncLabel: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
    },
    section: {
        gap: spacing.md,
        marginTop: spacing.sm,
    },
    statusText: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
    },
    statusTextCentered: {
        textAlign: 'center',
    },
    prompt: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_600SemiBold',
    },
    input: {
        backgroundColor: colors.surface,
        color: colors.text,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.lg,
        fontSize: typography.body,
        fontFamily: 'Poppins_500Medium',
    },
    codeInput: {
        textAlign: 'center',
        fontSize: typography.heading,
        letterSpacing: 8,
    },
    errorText: {
        color: colors.danger,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
    },
    deviceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: colors.border,
    },
    deviceRowDisabled: {
        opacity: 0.5,
    },
    deviceRowInfo: {
        flex: 1,
    },
    deviceName: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
    },
    deviceMeta: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
    },
    connectLabel: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
    },
    successCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: colors.border,
    },
    successIconWrap: {
        width: 40,
        height: 40,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(53,215,255,0.12)',
    },
    successInfo: {
        flex: 1,
    },
    successLabel: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
    },
});
