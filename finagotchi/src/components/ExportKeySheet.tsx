import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = {
    visible: boolean;
    onClose: () => void;
    /** Dynamic-only export flow from useWallet(); resolves after the reveal UI opens. */
    onReveal: () => Promise<void>;
};

export function ExportKeySheet({ visible, onClose, onReveal }: Props) {
    const [revealing, setRevealing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleReveal = useCallback(async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setRevealing(true);
        setError(null);
        try {
            await onReveal();
            // Dynamic's secure export UI is on screen now; dismiss our sheet.
            onClose();
        } catch (err) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setError(
                err instanceof Error ? err.message : 'Could not open key export'
            );
        } finally {
            setRevealing(false);
        }
    }, [onReveal, onClose]);

    return (
        <BottomSheet visible={visible} onClose={onClose} title="Export private key">
            <View style={styles.container}>
                <View style={styles.iconWrap}>
                    <Ionicons
                        name="key-outline"
                        size={36}
                        color={colors.danger}
                    />
                </View>

                <Text style={styles.body}>
                    Your private key gives full control of this wallet. Anyone
                    who sees it can take your funds and your companion NFT.
                </Text>

                <View style={styles.warningCard}>
                    <View style={styles.warningRow}>
                        <Ionicons
                            name="shield-checkmark-outline"
                            size={16}
                            color={colors.primary}
                        />
                        <Text style={styles.warningText}>
                            Dynamic will ask you to verify it's you before
                            showing anything
                        </Text>
                    </View>
                    <View style={styles.warningRow}>
                        <Ionicons
                            name="eye-off-outline"
                            size={16}
                            color={colors.primary}
                        />
                        <Text style={styles.warningText}>
                            The key is only shown inside Dynamic's secure view —
                            Finagotchi never sees it
                        </Text>
                    </View>
                    <View style={styles.warningRow}>
                        <Ionicons
                            name="warning-outline"
                            size={16}
                            color={colors.danger}
                        />
                        <Text style={styles.warningText}>
                            Never share it or store it in screenshots, notes, or
                            cloud backups
                        </Text>
                    </View>
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <View style={styles.actions}>
                    <Button
                        title={revealing ? 'Opening...' : 'Reveal private key'}
                        onPress={handleReveal}
                        loading={revealing}
                    />
                </View>
            </View>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingBottom: 32,
        gap: spacing.lg,
        alignItems: 'center',
    },
    iconWrap: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,100,124,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,100,124,0.30)',
    },
    body: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 24,
        maxWidth: 300,
    },
    warningCard: {
        width: '100%',
        padding: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.background,
        gap: spacing.md,
    },
    warningRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
    },
    warningText: {
        flex: 1,
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
        lineHeight: 20,
    },
    error: {
        color: colors.danger,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        textAlign: 'center',
    },
    actions: {
        width: '100%',
    },
});
