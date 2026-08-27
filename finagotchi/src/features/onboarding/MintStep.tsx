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
import { colors, spacing, typography } from '../../theme/tokens';

type Props = {
    creatureName: string;
    walletAddress: string;
    onMint: () => Promise<void>;
};

type MintStatus = 'idle' | 'minting' | 'success' | 'error';

export default function MintStep({
    creatureName,
    walletAddress,
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
            <View
                style={[
                    styles.container,
                    {
                        paddingHorizontal: Math.min(Math.max(width * 0.06, 24), 40),
                        paddingVertical: isSmall ? spacing.lg : spacing.xl,
                    },
                ]}
            >
                <View style={styles.content}>
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
                        Minting your creature requires a small SOL fee. On
                        devnet this uses test SOL, and the NFT metadata will be
                        tied to your wallet.
                    </Text>
                    <Text style={styles.address}>
                        Wallet: {truncatedAddress}
                    </Text>

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
                </View>

                {status !== 'success' ? (
                    <View style={styles.footer}>
                        <Button
                            title={
                                status === 'minting'
                                    ? 'Minting...'
                                    : 'Mint creature'
                            }
                            onPress={handleMint}
                            disabled={status === 'minting'}
                        />
                    </View>
                ) : null}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: colors.background,
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
        color: colors.text,
        fontSize: typography.title,
        fontFamily: 'Poppins_700Bold',
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
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 24,
        maxWidth: 320,
        marginBottom: spacing.md,
    },
    bodySmall: {
        fontSize: 14,
        lineHeight: 20,
    },
    address: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
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
        color: colors.primary,
        fontSize: typography.body,
        fontFamily: 'Poppins_600SemiBold',
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
        color: colors.primary,
        fontSize: typography.heading,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
    },
    error: {
        marginTop: spacing.xl,
        color: colors.danger,
        fontSize: typography.body,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
        maxWidth: 320,
    },
    footer: {
        width: '100%',
        paddingBottom: spacing.lg,
    },
});
