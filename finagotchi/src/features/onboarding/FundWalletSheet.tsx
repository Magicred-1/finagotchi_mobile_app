import React, { useCallback, useEffect } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';

import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { PressableScale } from '../../components/PressableScale';
import { fonts, landing, radius, spacing, tracking, typography } from '../../theme/tokens';

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
            tone="landing"
        >
            <View style={styles.section}>
                <Text style={styles.body}>
                    Your embedded wallet needs SOL to mint your Finagotchi.
                </Text>
            </View>

            <View style={styles.depositCard}>
                <View style={styles.specRows}>
                    <View style={styles.specRow}>
                        <Text style={styles.specLabel}>Required</Text>
                        <Text style={styles.specValue}>
                            {formatSol(requiredLamports)} SOL
                        </Text>
                    </View>
                    {balanceLamports !== null ? (
                        <View style={[styles.specRow, styles.specRowDivider]}>
                            <Text style={styles.specLabel}>Balance</Text>
                            <Text style={styles.specValue}>
                                {formatSol(balanceLamports)} SOL
                            </Text>
                        </View>
                    ) : null}
                </View>
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
                <View style={styles.shareWrap}>
                    <Button
                        title="Share address"
                        onPress={handleShareAddress}
                        tone="landing"
                        icon={
                            <Ionicons
                                name="share-outline"
                                size={16}
                                color={landing.onAccent}
                            />
                        }
                    />
                </View>
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
        color: landing.textMuted,
        fontSize: typography.body,
        fontFamily: fonts.regular,
        textAlign: 'center',
        lineHeight: 22,
    },
    depositCard: {
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.md,
        marginBottom: spacing.md,
        borderRadius: radius.md,
        backgroundColor: landing.glass,
        borderWidth: 1,
        borderColor: landing.glassBorder,
    },
    specRows: {
        alignSelf: 'stretch',
        paddingBottom: spacing.sm,
        marginBottom: spacing.xs,
        borderBottomWidth: 1,
        borderBottomColor: landing.glassBorder,
    },
    specRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.xs,
    },
    specRowDivider: {
        borderTopWidth: 1,
        borderTopColor: landing.glassBorder,
    },
    specLabel: {
        color: landing.eyebrow,
        fontSize: typography.micro,
        fontFamily: fonts.mono,
        letterSpacing: tracking.eyebrow,
        textTransform: 'uppercase',
    },
    specValue: {
        color: landing.text,
        fontSize: typography.small,
        fontFamily: fonts.monoBold,
    },
    qrWrap: {
        padding: spacing.sm,
        borderRadius: radius.sm,
        backgroundColor: 'white',
    },
    address: {
        color: landing.text,
        fontSize: typography.small,
        fontFamily: fonts.mono,
        textAlign: 'center',
        lineHeight: 18,
    },
    shareWrap: {
        alignSelf: 'stretch',
    },
    hint: {
        color: landing.textMuted,
        fontSize: typography.micro,
        fontFamily: fonts.regular,
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
        color: landing.textMuted,
        fontSize: typography.body,
        fontFamily: fonts.semiBold,
    },
});
