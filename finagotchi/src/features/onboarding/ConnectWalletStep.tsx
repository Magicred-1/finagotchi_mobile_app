import React, { useState } from 'react';
import {
    SafeAreaView,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';

import { Button } from '../../components/Button';
import { RadialPet } from '../../components/RadialPet';
import { colors, spacing, typography } from '../../theme/tokens';

type Props = {
    platform: 'ios' | 'android' | 'web';
    onConnect: () => Promise<void>;
};

export default function ConnectWalletStep({ platform, onConnect }: Props) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { width, height } = useWindowDimensions();

    const isSmall = height < 700;
    const isTiny = width < 360;

    const handleConnect = async () => {
        setLoading(true);
        setError(null);

        try {
            await onConnect();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to connect wallet. Please try again.'
            );
        } finally {
            setLoading(false);
        }
    };

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
                    <View style={[styles.creatureWrap, isSmall && styles.creatureWrapSmall]}>
                        <RadialPet stage="egg" mood="calm" size={isSmall ? 96 : 128} />
                    </View>
                    <Text
                        style={[
                            styles.title,
                            isSmall && styles.titleSmall,
                            isTiny && styles.titleTiny,
                        ]}
                    >
                        Sign in / Sign up
                    </Text>
                    <Text
                        style={[
                            styles.body,
                            isSmall && styles.bodySmall,
                        ]}
                    >
                        Finagotchi lives on Solana. Connect a wallet so you can
                        mint your creature and track your journey.
                    </Text>
                </View>

                <View style={styles.footer}>
                    {error ? <Text style={styles.error}>{error}</Text> : null}
                    <Button
                        title={
                            loading
                                ? 'Opening...'
                                : platform === 'android'
                                ? 'Connect with Solana Mobile Wallet'
                                : 'Connect with Phantom'
                        }
                        onPress={handleConnect}
                        disabled={loading}
                    />
                    <Text style={styles.hint}>
                        {platform === 'android'
                            ? 'You will be prompted by your mobile wallet.'
                            : 'Use Google or Apple to create or access your Phantom wallet.'}
                    </Text>
                </View>
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
    },
    bodySmall: {
        fontSize: 14,
        lineHeight: 20,
    },
    footer: {
        width: '100%',
        gap: spacing.md,
        paddingBottom: spacing.lg,
    },
    error: {
        color: colors.danger,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
    },
    hint: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
    },
});
