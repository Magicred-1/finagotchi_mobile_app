import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { PetSyncHero } from './PetSyncHero';
import { PressableScale } from './PressableScale';
import { SearchingRadar } from './SearchingRadar';
import { WifiSetupSheet } from './WifiSetupSheet';
import { colors, fonts, radius, spacing, typography } from '../theme/tokens';
import { useWifiAutoSyncStore } from '../features/ble';
import type { FinagotchiBle } from '../features/ble/types';

type Props = {
    visible: boolean;
    onClose: () => void;
    ble: FinagotchiBle;
};

export function ConnectDeviceSheet({ visible, onClose, ble }: Props) {
    const router = useRouter();
    const {
        status,
        devices,
        connectedDevice,
        error,
        startScan,
        connect,
        disconnect,
        reconnect,
    } = ble;

    const [wifiVisible, setWifiVisible] = useState(false);
    // Set when the user initiates a connect from THIS sheet: a fresh pairing
    // is the first-time-setup moment, so the Wi-Fi sheet auto-opens on
    // success — unless auto-sync already pushed known credentials for the
    // current network (nothing left to do). Routine reconnects and connects
    // from other screens never trigger it.
    const wifiPromptPending = useRef(false);

    // First connect from this sheet → offer Wi-Fi setup right away.
    useEffect(() => {
        if (!visible || !connectedDevice || !wifiPromptPending.current) return;
        wifiPromptPending.current = false;
        if (useWifiAutoSyncStore.getState().lastResult !== 'synced') {
            setWifiVisible(true);
        }
    }, [visible, connectedDevice]);

    // Closing the sheet drops any pending prompt.
    useEffect(() => {
        if (!visible) wifiPromptPending.current = false;
    }, [visible]);

    function handleConnectPress(device: (typeof devices)[number]) {
        wifiPromptPending.current = true;
        connect(device);
    }

    // Start looking for the device as soon as the sheet opens.
    useEffect(() => {
        if (visible && status === 'idle' && !connectedDevice) {
            startScan();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const scanning = status === 'scanning';
    const connecting = status === 'connecting';
    const reconnecting = status === 'reconnecting';

    return (
        <>
        <BottomSheet visible={visible} onClose={onClose} title="Finagotchi Hardware">
            {connectedDevice ? (
                <View style={styles.section}>
                    <View style={styles.connectedCard}>
                        <View style={styles.connectedIconWrap}>
                            <Ionicons name="bluetooth" size={20} color={colors.primary} />
                        </View>
                        <View style={styles.connectedInfo}>
                            <Text style={styles.deviceName}>
                                {connectedDevice.name ?? 'Finagotchi'}
                            </Text>
                            <View style={styles.connectedStatus}>
                                <View style={styles.connectedDot} />
                                <Text style={styles.connectedLabel}>Connected</Text>
                            </View>
                        </View>
                    </View>

                    <PressableScale
                        onPress={() => setWifiVisible(true)}
                        style={styles.deviceRow}
                        accessibilityRole="button"
                    >
                        <Ionicons name="wifi" size={18} color={colors.primary} />
                        <View style={styles.deviceRowInfo}>
                            <Text style={styles.deviceName}>Wi-Fi Setup</Text>
                            <Text style={styles.deviceMeta}>
                                Let it sync without your phone
                            </Text>
                        </View>
                        <Ionicons
                            name="chevron-forward"
                            size={14}
                            color={colors.textMuted}
                        />
                    </PressableScale>

                    <Button title="Disconnect" variant="secondary" onPress={disconnect} />
                </View>
            ) : (
                <View style={styles.section}>
                    {scanning ? <SearchingRadar /> : <PetSyncHero />}
                    <Text
                        style={[
                            styles.statusText,
                            !scanning && styles.statusTextCentered,
                        ]}
                    >
                        {connecting
                            ? 'Connecting…'
                            : reconnecting
                              ? 'Connection lost — reconnecting…'
                              : error ?? 'No Finagotchi found nearby.'}
                    </Text>

                    {devices.map((device) => (
                        <PressableScale
                            key={device.id}
                            onPress={() => handleConnectPress(device)}
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
                                    {device.rssi != null ? `${device.rssi} dBm` : ''}
                                </Text>
                            </View>
                            <Text style={styles.connectLabel}>Connect</Text>
                        </PressableScale>
                    ))}

                    {!scanning && !reconnecting && (
                        <Button
                            title="Scan again"
                            variant="secondary"
                            loading={connecting}
                            onPress={startScan}
                        />
                    )}

                    {!scanning && !connecting && !reconnecting && status === 'error' && (
                        <Button title="Reconnect" onPress={reconnect} />
                    )}

                    <Button
                        title="Pair new device (Wi-Fi setup)"
                        variant="secondary"
                        onPress={() => {
                            onClose();
                            router.push('/hardware/binding');
                        }}
                    />
                </View>
            )}
        </BottomSheet>

        <WifiSetupSheet
            visible={wifiVisible}
            onClose={() => setWifiVisible(false)}
            ble={ble}
        />
        </>
    );
}

const styles = StyleSheet.create({
    section: {
        gap: spacing.md,
        paddingBottom: spacing.md,
    },
    statusText: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: fonts.mono,
    },
    statusTextCentered: {
        textAlign: 'center',
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
        color: colors.textStrong,
        fontSize: typography.body,
        fontFamily: fonts.semiBold,
    },
    deviceMeta: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: fonts.mono,
    },
    connectLabel: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: fonts.semiBold,
    },
    connectedCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: 'rgba(141,201,246,0.35)',
    },
    connectedIconWrap: {
        width: 40,
        height: 40,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(141,201,246,0.12)',
    },
    connectedInfo: {
        flex: 1,
        gap: 2,
    },
    connectedStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    connectedDot: {
        width: 7,
        height: 7,
        borderRadius: radius.pill,
        backgroundColor: colors.success,
    },
    connectedLabel: {
        color: colors.success,
        fontSize: typography.small,
        fontFamily: fonts.medium,
    },
});
