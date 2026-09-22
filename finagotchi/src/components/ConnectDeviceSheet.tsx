import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { PressableScale } from './PressableScale';
import { SearchingRadar } from './SearchingRadar';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { MOODS, useDeviceControlStore } from '../features/ble/sync';
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
        deviceState,
        error,
        startScan,
        connect,
        disconnect,
        reconnect,
        sendCommand,
    } = ble;

    const deviceMood = useDeviceControlStore((state) => state.deviceMood);
    const pushMood = useDeviceControlStore((state) => state.pushMood);

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

    function handleMoodPress(moodId: (typeof MOODS)[number]['id'], index: number) {
        pushMood(moodId);
        sendCommand(`mood:${index}`);
    }

    return (
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
                            <Text style={styles.connectedLabel}>Connected</Text>
                        </View>
                    </View>

                    {deviceState && (
                        <View style={styles.stateRow}>
                            <View style={styles.stateChip}>
                                <Text style={styles.stateValue}>{deviceState.stage}</Text>
                                <Text style={styles.stateLabel}>stage</Text>
                            </View>
                            <View style={styles.stateChip}>
                                <Text style={styles.stateValue}>🔥 {deviceState.streak}</Text>
                                <Text style={styles.stateLabel}>streak</Text>
                            </View>
                            <View style={styles.stateChip}>
                                <Text style={styles.stateValue}>{deviceState.mood}</Text>
                                <Text style={styles.stateLabel}>mood</Text>
                            </View>
                            <View style={styles.stateChip}>
                                <Text style={styles.stateValue}>✨ {deviceState.points}</Text>
                                <Text style={styles.stateLabel}>points</Text>
                            </View>
                            <View style={styles.stateChip}>
                                <Text style={styles.stateValue}>❤️ {deviceState.happy}</Text>
                                <Text style={styles.stateLabel}>happy</Text>
                            </View>
                        </View>
                    )}

                    <View style={styles.controlGroup}>
                        <Text style={styles.controlLabel}>Mood</Text>
                        <View style={styles.moodRow}>
                            {MOODS.map((mood) => {
                                const active = deviceMood === mood.id;
                                return (
                                    <PressableScale
                                        key={mood.id}
                                        onPress={() => handleMoodPress(mood.id, mood.index)}
                                        style={[
                                            styles.moodChip,
                                            active && styles.moodChipActive,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.moodChipText,
                                                active && styles.moodChipTextActive,
                                            ]}
                                        >
                                            {mood.id}
                                        </Text>
                                    </PressableScale>
                                );
                            })}
                        </View>
                    </View>

                    <Button title="Disconnect" variant="secondary" onPress={disconnect} />
                </View>
            ) : (
                <View style={styles.section}>
                    {scanning && (
                        <View style={styles.scanCard}>
                            <SearchingRadar />
                            <Text style={styles.scanTitle}>
                                Searching for nearby Finagotchi…
                            </Text>
                        </View>
                    )}
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
    );
}

const styles = StyleSheet.create({
    section: {
        gap: spacing.md,
        paddingBottom: spacing.md,
    },
    scanCard: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: colors.border,
    },
    scanTitle: {
        color: colors.primary,
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
    },
    statusText: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
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
    connectedCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: colors.border,
    },
    connectedIconWrap: {
        width: 40,
        height: 40,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(53,215,255,0.12)',
    },
    connectedInfo: {
        flex: 1,
    },
    connectedLabel: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
    },
    stateRow: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    stateChip: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: colors.border,
    },
    stateValue: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
    },
    stateLabel: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
    },
    controlGroup: {
        gap: spacing.sm,
    },
    controlLabel: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    moodRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },
    moodChip: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: colors.border,
    },
    moodChipActive: {
        backgroundColor: 'rgba(53,215,255,0.14)',
        borderColor: colors.primary,
    },
    moodChipText: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        textTransform: 'capitalize',
    },
    moodChipTextActive: {
        color: colors.primary,
    },
});
