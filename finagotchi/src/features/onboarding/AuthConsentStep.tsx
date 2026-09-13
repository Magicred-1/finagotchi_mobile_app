import React, { useCallback, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../components/Button';
import { PressableScale } from '../../components/PressableScale';
import { RadialPet } from '../../components/RadialPet';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type Props = {
    walletAddress: string;
    /** Grants consent and runs the wallet-signed login; throws on failure. */
    onConsent: () => Promise<void>;
    onSkip: () => void;
};

function truncateAddress(address: string): string {
    if (address.length <= 12) return address;
    return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

const POINTS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
    {
        icon: 'shield-checkmark-outline',
        text: 'It is not a transaction — no SOL moves and there are no fees.',
    },
    {
        icon: 'key-outline',
        text: 'One signature proves ownership and creates your secure session token.',
    },
    {
        icon: 'cloud-upload-outline',
        text: 'Your public address and on-chain activity are used to power quests, XP and rewards.',
    },
];

export default function AuthConsentStep({
    walletAddress,
    onConsent,
    onSkip,
}: Props) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleConsent = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            await onConsent();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Could not create your session. Please try again.'
            );
        } finally {
            setBusy(false);
        }
    }, [onConsent]);

    return (
        <SafeAreaView style={styles.safe}>
            <View style={styles.container}>
                <View style={styles.hero}>
                    <View style={styles.creatureWrap}>
                        <RadialPet stage="egg" mood="calm" size={96} />
                    </View>
                    <Text style={styles.title}>Sync your Finagotchi</Text>
                    <Text style={styles.body}>
                        Your wallet ({truncateAddress(walletAddress)}) will ask
                        you to sign a message to connect to the Finagotchi
                        server.
                    </Text>
                </View>

                <View style={styles.points}>
                    {POINTS.map((point) => (
                        <View key={point.icon} style={styles.pointRow}>
                            <Ionicons
                                name={point.icon}
                                size={20}
                                color={colors.textMuted}
                            />
                            <Text style={styles.pointText}>{point.text}</Text>
                        </View>
                    ))}
                </View>

                <View style={styles.footer}>
                    <Button
                        title="Sign & continue"
                        onPress={handleConsent}
                        loading={busy}
                        disabled={busy}
                    />
                    <PressableScale
                        onPress={onSkip}
                        disabled={busy}
                        style={styles.textButton}
                    >
                        <Text style={styles.textButtonLabel}>Not now</Text>
                    </PressableScale>
                    <Text style={styles.hint}>
                        You can enable sync later from this device. Skipping
                        keeps quests and XP local only.
                    </Text>
                    {error ? <Text style={styles.error}>{error}</Text> : null}
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
        justifyContent: 'center',
        gap: spacing.xl,
        paddingVertical: spacing.xl,
        paddingHorizontal: spacing.lg,
    },
    hero: {
        alignItems: 'center',
    },
    creatureWrap: {
        width: 96,
        height: 96,
        marginBottom: spacing.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_800ExtraBold',
        textAlign: 'center',
        marginBottom: spacing.xs,
    },
    body: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 22,
        maxWidth: 300,
    },
    points: {
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        maxWidth: 340,
        alignSelf: 'center',
        width: '100%',
    },
    pointRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
    },
    pointText: {
        flex: 1,
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 20,
    },
    footer: {
        width: '100%',
        maxWidth: 340,
        alignSelf: 'center',
        gap: spacing.sm,
    },
    textButton: {
        alignItems: 'center',
        paddingVertical: spacing.sm,
        minHeight: 44,
        justifyContent: 'center',
    },
    textButtonLabel: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_600SemiBold',
    },
    hint: {
        color: colors.textMuted,
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 18,
    },
    error: {
        color: colors.danger,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
    },
});
