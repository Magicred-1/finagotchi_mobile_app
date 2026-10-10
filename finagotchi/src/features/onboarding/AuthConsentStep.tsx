import React, { useCallback, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../components/Button';
import { RadialPet } from '../../components/RadialPet';
import { LandingGradient } from '../../components/LandingGradient';
import { FadeInUp } from './FadeInUp';
import { fonts, landing, radius, spacing, tracking, typography } from '../../theme/tokens';

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
            <LandingGradient />
            <View style={styles.container}>
                <FadeInUp style={styles.hero}>
                    <View style={styles.creatureWrap}>
                        <RadialPet stage="egg" mood="calm" size={96} />
                    </View>
                    <Text style={styles.title}>Sync your Finagotchi</Text>
                    <Text style={styles.body}>
                        Your wallet ({truncateAddress(walletAddress)}) will ask
                        you to sign a message to connect to the Finagotchi
                        server.
                    </Text>
                </FadeInUp>

                <FadeInUp delay={140} style={styles.points}>
                    {POINTS.map((point, index) => (
                        <View
                            key={point.icon}
                            style={[
                                styles.pointRow,
                                index > 0 && styles.pointRowDivider,
                            ]}
                        >
                            <Ionicons
                                name={point.icon}
                                size={20}
                                color={landing.accent}
                            />
                            <Text style={styles.pointText}>{point.text}</Text>
                        </View>
                    ))}
                </FadeInUp>

                <FadeInUp delay={280} style={styles.footer}>
                    <Button
                        title="Sign & continue"
                        onPress={handleConsent}
                        loading={busy}
                        disabled={busy}
                        tone="landing"
                    />
                    <Button
                        title="Not now"
                        onPress={onSkip}
                        disabled={busy}
                        variant="secondary"
                        tone="landing"
                    />
                    <Text style={styles.hint}>
                        You can enable sync later from this device. Skipping
                        keeps quests and XP local only.
                    </Text>
                    {error ? <Text style={styles.error}>{error}</Text> : null}
                </FadeInUp>
            </View>
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
        color: landing.text,
        fontSize: typography.title,
        fontFamily: fonts.medium,
        letterSpacing: tracking.title,
        textAlign: 'center',
        marginBottom: spacing.xs,
    },
    body: {
        color: landing.textMuted,
        fontSize: typography.body,
        fontFamily: fonts.regular,
        textAlign: 'center',
        lineHeight: 22,
        maxWidth: 300,
    },
    points: {
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: landing.glass,
        borderWidth: 1,
        borderColor: landing.glassBorder,
        maxWidth: 340,
        alignSelf: 'center',
        width: '100%',
    },
    pointRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
        paddingVertical: spacing.sm,
    },
    pointRowDivider: {
        borderTopWidth: 1,
        borderTopColor: landing.glassBorder,
    },
    pointText: {
        flex: 1,
        color: landing.textMuted,
        fontSize: typography.small,
        fontFamily: fonts.regular,
        lineHeight: 20,
    },
    footer: {
        width: '100%',
        maxWidth: 340,
        alignSelf: 'center',
        gap: spacing.sm,
    },
    hint: {
        color: landing.textMuted,
        fontSize: typography.micro,
        fontFamily: fonts.regular,
        textAlign: 'center',
        lineHeight: 18,
    },
    error: {
        color: landing.error,
        fontSize: typography.small,
        fontFamily: fonts.medium,
        textAlign: 'center',
    },
});
