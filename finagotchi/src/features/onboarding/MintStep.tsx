import React, { useEffect, useState } from 'react';
import {
    SafeAreaView,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';

import { Button } from '../../components/Button';
import { RadialPet } from '../../components/RadialPet';
import { LandingGradient } from '../../components/LandingGradient';
import { FadeInUp } from './FadeInUp';
import { fonts, landing, radius, spacing, tracking, typography } from '../../theme/tokens';
import { MINT_COST_LAMPORTS } from '../../wallet/useWallet';
import { FundWalletSheet, type FundingRequest } from './FundWalletSheet';

const MINT_COST_SOL = MINT_COST_LAMPORTS / 1_000_000_000;

type Props = {
    creatureName: string;
    walletAddress: string;
    /** Demo account (App Store review): minting is free, copy says so. */
    isDemo?: boolean;
    /** Present when the connected embedded wallet may need SOL to mint. */
    funding?: FundingRequest;
    onMint: () => Promise<void>;
};

type MintStatus = 'idle' | 'minting' | 'success' | 'error';

export default function MintStep({
    creatureName,
    walletAddress,
    isDemo = false,
    funding,
    onMint,
}: Props) {
    const [status, setStatus] = useState<MintStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const { width, height } = useWindowDimensions();

    const isSmall = height < 700;
    const isTiny = width < 360;

    const rotation = useSharedValue(0);

    useEffect(() => {
        if (status === 'minting') {
            rotation.value = withRepeat(
                withTiming(360, {
                    duration: 1200,
                    easing: Easing.linear,
                }),
                -1
            );
        } else {
            rotation.value = 0;
        }
    }, [status, rotation]);

    const spinnerStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }));

    const handleMint = async () => {
        setStatus('minting');
        setError(null);

        try {
            await onMint();
            setStatus('success');
        } catch (err) {
            setStatus('error');
            setError(
                err instanceof Error
                    ? err.message
                    : 'Minting failed. Please try again.'
            );
        }
    };

    const truncatedAddress = `${walletAddress.slice(
        0,
        4
    )}...${walletAddress.slice(-4)}`;

    return (
        <SafeAreaView style={styles.safe}>
            <LandingGradient />
            <View
                style={[
                    styles.container,
                    {
                        paddingHorizontal: Math.min(Math.max(width * 0.06, 24), 40),
                        paddingVertical: isSmall ? spacing.lg : spacing.xl,
                    },
                ]}
            >
                <FadeInUp style={styles.content}>
                    <View
                        style={[
                            styles.creatureWrap,
                            isSmall && styles.creatureWrapSmall,
                        ]}
                    >
                        <RadialPet
                            stage="egg"
                            mood="calm"
                            size={isSmall ? 96 : 128}
                        />
                    </View>
                    <Text
                        style={[
                            styles.title,
                            isSmall && styles.titleSmall,
                            isTiny && styles.titleTiny,
                        ]}
                    >
                        Mint {creatureName}
                    </Text>
                    <Text
                        style={[
                            styles.body,
                            isSmall && styles.bodySmall,
                        ]}
                    >
                        {isDemo
                            ? `Demo account: minting is free and no real NFT is created.`
                            : `Minting your creature costs ${MINT_COST_SOL} SOL, and the NFT metadata will be tied to your wallet.`}
                    </Text>

                    <View style={styles.specPlate}>
                        <View style={styles.specRow}>
                            <Text style={styles.specLabel}>Cost</Text>
                            <Text style={styles.specValueMono}>
                                {isDemo ? 'Free' : `${MINT_COST_SOL} SOL`}
                            </Text>
                        </View>
                        <View style={[styles.specRow, styles.specRowDivider]}>
                            <Text style={styles.specLabel}>NFT</Text>
                            <Text style={styles.specValue}>
                                {isDemo ? 'Demo only' : 'Tied to your wallet'}
                            </Text>
                        </View>
                        <View style={[styles.specRow, styles.specRowDivider]}>
                            <Text style={styles.specLabel}>Wallet</Text>
                            <Text style={styles.specValueMono}>
                                {truncatedAddress}
                            </Text>
                        </View>
                    </View>

                    {status === 'minting' ? (
                        <View style={styles.minting}>
                            <Animated.View
                                style={[styles.spinner, spinnerStyle]}
                            >
                                <RadialPet
                                    stage="egg"
                                    mood="waiting"
                                    size={40}
                                />
                            </Animated.View>
                            <Text style={styles.mintingText}>
                                Minting your NFT...
                            </Text>
                        </View>
                    ) : null}

                    {status === 'success' ? (
                        <View style={styles.success}>
                            <View style={styles.successPet}>
                                <RadialPet
                                    stage="egg"
                                    mood="excited"
                                    size={64}
                                />
                            </View>
                            <Text style={styles.successText}>
                                {creatureName} has been minted!
                            </Text>
                        </View>
                    ) : null}

                    {status === 'error' && error ? (
                        <Text style={styles.error}>{error}</Text>
                    ) : null}
                </FadeInUp>

                {status !== 'success' ? (
                    <FadeInUp delay={160} style={styles.footer}>
                        <Button
                            title={
                                status === 'minting'
                                    ? 'Minting...'
                                    : 'Mint creature'
                            }
                            onPress={handleMint}
                            disabled={status === 'minting'}
                            tone="landing"
                        />
                    </FadeInUp>
                ) : null}
            </View>

            {funding?.walletAddress ? (
                <FundWalletSheet
                    visible={funding.visible}
                    onClose={funding.onDismiss}
                    walletAddress={funding.walletAddress}
                    balanceLamports={funding.balanceLamports}
                    requiredLamports={funding.requiredLamports}
                    onRefreshBalance={funding.onRefreshBalance}
                />
            ) : null}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: landing.navy,
    },
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    creatureWrap: {
        width: 128,
        height: 128,
        marginBottom: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    creatureWrapSmall: {
        width: 96,
        height: 96,
        marginBottom: spacing.sm,
    },
    title: {
        color: landing.text,
        fontSize: typography.title,
        fontFamily: fonts.medium,
        letterSpacing: tracking.title,
        textAlign: 'center',
        marginBottom: spacing.md,
    },
    titleSmall: {
        fontSize: 28,
    },
    titleTiny: {
        fontSize: 24,
    },
    body: {
        color: landing.textMuted,
        fontSize: typography.body,
        fontFamily: fonts.regular,
        textAlign: 'center',
        lineHeight: 24,
        maxWidth: 320,
        marginBottom: spacing.md,
    },
    bodySmall: {
        fontSize: 14,
        lineHeight: 20,
    },
    specPlate: {
        width: '100%',
        maxWidth: 320,
        borderRadius: radius.md,
        backgroundColor: landing.glass,
        borderWidth: 1,
        borderColor: landing.glassBorder,
        paddingHorizontal: spacing.md,
    },
    specRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        paddingVertical: 12,
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
        fontFamily: fonts.bold,
        textAlign: 'right',
    },
    specValueMono: {
        color: landing.text,
        fontSize: typography.small,
        fontFamily: fonts.monoBold,
        textAlign: 'right',
    },
    minting: {
        marginTop: spacing.xl,
        alignItems: 'center',
        gap: spacing.sm,
    },
    spinner: {
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    mintingText: {
        color: landing.accent,
        fontSize: typography.body,
        fontFamily: fonts.semiBold,
    },
    success: {
        marginTop: spacing.xl,
        alignItems: 'center',
        gap: spacing.sm,
    },
    successPet: {
        width: 64,
        height: 64,
        alignItems: 'center',
        justifyContent: 'center',
    },
    successText: {
        color: landing.text,
        fontSize: typography.heading,
        fontFamily: fonts.medium,
        letterSpacing: tracking.heading,
        textAlign: 'center',
    },
    error: {
        marginTop: spacing.xl,
        color: landing.error,
        fontSize: typography.body,
        fontFamily: fonts.medium,
        textAlign: 'center',
        maxWidth: 320,
    },
    footer: {
        width: '100%',
        paddingBottom: spacing.lg,
    },
});
