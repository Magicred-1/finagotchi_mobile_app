import React, { useEffect, useState } from 'react';
import {
    Alert,
    Share,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { Button } from './Button';
import { PressableScale } from './PressableScale';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { CauseOfDeath } from '../features/pet/store';

type Props = {
    creatureName: string;
    causeOfDeath: CauseOfDeath | null;
    streak: number;
    level: number;
    deathCount: number;
    balance: number;
    reviveTokens: number;
    reviveInvites: number;
    reviveInvitesRequired: number;
    reviveWindowEndsAt: string | null;
    onRevive: () => void;
    onInvite: () => void;
    onHireGuardian: () => void;
    onAskCommunity: () => void;
};

function formatCountdown(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
}

export default function DeathOverlay({
    creatureName,
    causeOfDeath,
    streak,
    level,
    deathCount,
    balance,
    reviveTokens,
    reviveInvites,
    reviveInvitesRequired,
    reviveWindowEndsAt,
    onRevive,
    onInvite,
    onHireGuardian,
    onAskCommunity,
}: Props) {
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    const windowRemaining = reviveWindowEndsAt
        ? Math.max(0, new Date(reviveWindowEndsAt).getTime() - now)
        : 0;
    const windowActive = windowRemaining > 0;

    function handleRevive() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        onRevive();
    }

    async function handleAskCommunity() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        try {
            const result = await Share.share({
                message: `${creatureName} turned spectral and needs help to come back. Can someone resurrect my Finagotchi?`,
                url: 'https://www.finagotchi.app/resurrect?ref=demo',
                title: `Help revive ${creatureName}`,
            });
            if (result.action === Share.sharedAction) {
                onAskCommunity();
            }
        } catch {
            // User cancelled or share failed.
        }
    }

    function handleHireGuardian() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onHireGuardian();
    }

    const invitesReady = reviveInvites >= reviveInvitesRequired;

    const primaryTitle = windowActive
        ? invitesReady
            ? 'Revive free (invites)'
            : reviveTokens > 0
              ? `Revive free (${reviveTokens})`
              : 'Revive now'
        : 'Revive now';

    return (
        <View style={styles.overlay}>
            <View style={styles.card}>
                <Text style={styles.skull}>👻</Text>
                <Text style={styles.title}>{creatureName} is spectral</Text>
                <Text style={styles.subtitle}>
                    {causeOfDeath === 'starvation'
                        ? 'Starvation. You forgot to feed them.'
                        : 'Neglect. They needed you.'}
                </Text>

                <View style={styles.lossCard}>
                    <Text style={styles.lossTitle}>What happened</Text>
                    <View style={styles.lossRow}>
                        <Text style={styles.lossLabel}>NFT</Text>
                        <Text style={[styles.lossValue, styles.lossValueSafe]}>Safe in wallet</Text>
                    </View>
                    <View style={styles.lossRow}>
                        <Text style={styles.lossLabel}>Form</Text>
                        <Text style={styles.lossValue}>Spectral</Text>
                    </View>
                    <View style={styles.lossRow}>
                        <Text style={styles.lossLabel}>Streak</Text>
                        <Text style={styles.lossValue}>{streak} days</Text>
                    </View>
                    <View style={styles.lossRow}>
                        <Text style={styles.lossLabel}>Level</Text>
                        <Text style={styles.lossValue}>{level}</Text>
                    </View>
                </View>

                <View style={styles.windowCard}>
                    <Text style={styles.windowLabel}>
                        {windowActive ? 'Revive window closes in' : 'Revive window closed'}
                    </Text>
                    <Text style={[styles.windowValue, !windowActive && styles.windowExpired]}>
                        {windowActive ? formatCountdown(windowRemaining) : 'Progress can still be restored'}
                    </Text>
                    {deathCount > 0 ? (
                        <Text style={styles.deathCountText}>
                            Death {deathCount} · longer windows with each neglect
                        </Text>
                    ) : null}
                </View>

                <Text style={styles.urge}>
                    {windowActive
                        ? 'Revive while the window is open to keep your level progress. After that, revival still works but may cost more.'
                        : 'Your companion is spectral but not gone. You can still revive, hire a guardian for next time, or ask the community.'}
                </Text>

                <View style={styles.actions}>
                    <Button
                        title={primaryTitle}
                        onPress={handleRevive}
                    />

                    {windowActive && reviveTokens === 0 ? (
                        <View style={styles.inviteCard}>
                            <View style={styles.inviteCardHeader}>
                                <Text style={styles.inviteTitle}>
                                    Free revive
                                </Text>
                                <Text
                                    style={[
                                        styles.inviteProgress,
                                        invitesReady && styles.inviteProgressReady,
                                    ]}
                                >
                                    {reviveInvites}/{reviveInvitesRequired}
                                </Text>
                            </View>
                            <Text style={styles.inviteBody}>
                                {invitesReady
                                    ? 'Your friends answered the call — revive is free.'
                                    : `Invite ${reviveInvitesRequired} friends to join Finagotchi.`}
                            </Text>
                            {!invitesReady && (
                                <PressableScale
                                    onPress={onInvite}
                                    style={styles.inviteButton}
                                >
                                    <Text style={styles.inviteButtonText}>
                                        Invite a friend
                                    </Text>
                                </PressableScale>
                            )}
                        </View>
                    ) : null}

                    <View style={styles.altActions}>
                        <PressableScale onPress={handleHireGuardian} style={styles.altButton}>
                            <Text style={styles.altButtonText}>Hire guardian</Text>
                        </PressableScale>
                        <PressableScale onPress={handleAskCommunity} style={styles.altButton}>
                            <Text style={styles.altButtonText}>Ask community</Text>
                        </PressableScale>
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 2000,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
    },
    card: {
        width: '100%',
        maxWidth: 360,
        alignItems: 'center',
        gap: spacing.lg,
    },
    skull: {
        fontSize: 80,
    },
    title: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_800ExtraBold',
        textAlign: 'center',
    },
    subtitle: {
        color: colors.danger,
        fontSize: typography.body,
        fontFamily: 'Poppins_600SemiBold',
        textAlign: 'center',
    },
    lossCard: {
        width: '100%',
        padding: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        gap: spacing.sm,
    },
    lossTitle: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
        marginBottom: spacing.sm,
    },
    lossRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    lossLabel: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_500Medium',
    },
    lossValue: {
        color: colors.danger,
        fontSize: typography.body,
        fontFamily: 'Poppins_800ExtraBold',
    },
    lossValueSafe: {
        color: colors.primary,
    },
    urge: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 22,
    },
    windowCard: {
        width: '100%',
        padding: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: 'rgba(255,142,74,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,142,74,0.20)',
        alignItems: 'center',
        gap: spacing.xs,
    },
    windowLabel: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        textAlign: 'center',
    },
    windowValue: {
        color: '#FF8E4A',
        fontSize: typography.heading,
        fontFamily: 'Poppins_800ExtraBold',
        textAlign: 'center',
    },
    windowExpired: {
        color: colors.danger,
        fontSize: typography.body,
    },
    deathCountText: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
    },
    actions: {
        width: '100%',
        gap: spacing.md,
    },
    freeReviveText: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        textAlign: 'center',
    },
    inviteCard: {
        width: '100%',
        padding: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: 'rgba(53,215,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(53,215,255,0.20)',
        gap: spacing.sm,
    },
    inviteCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    inviteTitle: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
    },
    inviteProgress: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_800ExtraBold',
    },
    inviteProgressReady: {
        color: colors.primary,
    },
    inviteBody: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 20,
    },
    inviteButton: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: colors.primary,
    },
    inviteButtonText: {
        color: colors.background,
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
    },
    altActions: {
        flexDirection: 'row',
        gap: spacing.sm,
    },
    altButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    altButtonText: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
    },
});
