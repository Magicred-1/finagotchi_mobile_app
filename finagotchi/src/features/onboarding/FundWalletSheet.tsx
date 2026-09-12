import React, { useCallback, useEffect } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';

import { BottomSheet } from '../../components/BottomSheet';
import { PressableScale } from '../../components/PressableScale';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type Props = {
    visible: boolean;
    onClose: () => void;
    walletAddress: string;
    balanceLamports: number | null;
    requiredLamports: number;
    onRefreshBalance: () => void;
};

/** Data and callbacks a parent screen needs to render a FundWalletSheet. */
export type FundingRequest = {
    visible: boolean;
    walletAddress: string | null;
    balanceLamports: number | null;
    requiredLamports: number;
    onRefreshBalance: () => void;
    onDismiss: () => void;
};

const LAMPORTS_PER_SOL = 1_000_000_000;
const POLL_INTERVAL_MS = 5000;

function formatSol(lamports: number): string {
    return (lamports / LAMPORTS_PER_SOL).toFixed(4);
}

export function FundWalletSheet({
    visible,
    onClose,
    walletAddress,
    balanceLamports,
    requiredLamports,
    onRefreshBalance,
}: Props) {
    // Watch for incoming funds while the sheet is open; the parent
    // advances automatically once the balance covers the mint.
    useEffect(() => {
        if (!visible) return;
        onRefreshBalance();
        const interval = setInterval(onRefreshBalance, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [visible, onRefreshBalance]);

    const handleShareAddress = useCallback(async () => {
        try {
            await Share.share({ message: walletAddress });
        } catch {
            // User cancelled or share failed; ignore.
        }
    }, [walletAddress]);

    return (
        <BottomSheet
            visible={visible}
            onClose={onClose}
            title="Add SOL to your wallet"
        >
            <View style={styles.section}>
                <Text style={styles.body}>
                    Your embedded wallet needs at least{' '}
                    {formatSol(requiredLamports)} SOL to mint your Finagotchi.
                    {balanceLamports !== null
                        ? ` You currently have ${formatSol(balanceLamports)} SOL.`
                        : ''}
                </Text>
            </View>

            <View style={styles.depositCard}>
                <View style={styles.qrWrap}>
                    <QRCode
                        value={walletAddress}
                        size={140}
                        backgroundColor="white"
                        color="black"
                    />
                </View>
                <Text style={styles.address} selectable>
                    {walletAddress}
                </Text>
                <PressableScale
                    onPress={handleShareAddress}
                    style={styles.shareButton}
                >
                    <Ionicons
                        name="share-outline"
                        size={16}
                        color={colors.background}
                    />
                    <Text style={styles.shareButtonLabel}>Share address</Text>
                </PressableScale>
                <Text style={styles.hint}>
                    Send SOL to this address from another wallet or exchange.
                </Text>
            </View>

            <PressableScale onPress={onClose} style={styles.laterButton}>
                <Text style={styles.laterButtonLabel}>
                    I&apos;ll add SOL later
                </Text>
            </PressableScale>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    section: {
        gap: spacing.sm,
        marginBottom: spacing.md,
    },
    body: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 22,
    },
    depositCard: {
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.md,
        marginBottom: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: colors.border,
    },
    qrWrap: {
        padding: spacing.sm,
        borderRadius: radius.sm,
        backgroundColor: 'white',
    },
    address: {
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
        lineHeight: 18,
    },
    shareButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        paddingHorizontal: spacing.md,
        minHeight: 40,
        borderRadius: radius.sm,
        backgroundColor: colors.primary,
    },
    shareButtonLabel: {
        color: colors.background,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
    },
    hint: {
        color: colors.textMuted,
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 16,
    },
    laterButton: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 44,
        marginBottom: spacing.sm,
    },
    laterButtonLabel: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_600SemiBold',
    },
});
