import React, { useState } from 'react';
import {
    Alert,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { PressableScale } from './PressableScale';
import { RadialPet } from './RadialPet';
import { colors, radius, spacing, typography } from '../theme/tokens';

const REMINT_COST_POINTS = 500;
const GUARDIAN_COST_POINTS = 300;
const GUARDIAN_HOURS = 12;

type Props = {
    visible: boolean;
    onClose: () => void;
    creatureName: string;
    balance: number;
    reviveTokens: number;
    reviveInvites: number;
    reviveInvitesRequired: number;
    reviveWindowEndsAt: string | null;
    onRevive: () => void;
    onInvite: () => void;
    onHireGuardian: () => void;
};

export default function ReviveSheet({
    visible,
    onClose,
    creatureName,
    balance,
    reviveTokens,
    reviveInvites,
    reviveInvitesRequired,
    reviveWindowEndsAt,
    onRevive,
    onInvite,
    onHireGuardian,
}: Props) {
    const [minting, setMinting] = useState(false);

    async function handleRevive() {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setMinting(true);
        await new Promise((resolve) => setTimeout(resolve, 1200));
        setMinting(false);
        onRevive();
    }

    function handleHireGuardian() {
        if (balance < GUARDIAN_COST_POINTS) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert('Not enough points', `A guardian costs ${GUARDIAN_COST_POINTS} points.`);
            return;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onHireGuardian();
        onClose();
    }

    const windowActive = reviveWindowEndsAt
        ? new Date(reviveWindowEndsAt).getTime() > Date.now()
        : false;
    const invitesReady = reviveInvites >= reviveInvitesRequired;
    const canAfford = windowActive
        ? balance >= REMINT_COST_POINTS || reviveTokens > 0 || invitesReady
        : true;

    return (
        <BottomSheet visible={visible} onClose={onClose} title={windowActive ? 'Revive' : 'New companion'}>
            <View style={styles.container}>
                <View style={styles.petWrap}>
                    <RadialPet stage="egg" mood="waiting" size={96} />
                </View>

                <Text style={styles.title}>
                    {windowActive ? `Bring ${creatureName} back` : 'Summon your companion'}
                </Text>
                <Text style={styles.body}>
                    {windowActive
                        ? `Your NFT is safe in your wallet. Revive within the window to keep your level progress.`
                        : 'The revive window closed, but your NFT is still in your wallet. A fresh summon resets progress.'}
                </Text>

                <View style={styles.costCard}>
                    <View style={styles.costRow}>
                        <Text style={styles.costLabel}>Cost</Text>
                        <Text style={styles.costValue}>
                            {reviveTokens > 0
                                ? 'Free token'
                                : invitesReady
                                  ? 'Free (invites)'
                                  : `${REMINT_COST_POINTS} points`}
                        </Text>
                    </View>
                    <View style={styles.costRow}>
                        <Text style={styles.costLabel}>Your balance</Text>
                        <Text style={styles.costValue}>{balance} points</Text>
                    </View>
                    <View style={styles.costRow}>
                        <Text style={styles.costLabel}>Free revive</Text>
                        <Text
                            style={[
                                styles.costValue,
                                invitesReady && styles.costValueReady,
                            ]}
                        >
                            {reviveInvites}/{reviveInvitesRequired} invites
                        </Text>
                    </View>
                    {reviveTokens > 0 ? (
                        <View style={styles.tokenRow}>
                            <Text style={styles.tokenText}>
                                You have {reviveTokens} free revive token{reviveTokens > 1 ? 's' : ''}
                            </Text>
                        </View>
                    ) : null}
                </View>

                <Text style={styles.urge}>
                    {windowActive
                        ? 'Caretakers who revive within the window keep their level progress.'
                        : 'Level and streak progress will be reset.'}
                </Text>

                <View style={styles.actions}>
                    <Button
                        title={minting ? 'Summoning...' : reviveTokens > 0 ? 'Revive free' : invitesReady ? 'Revive free (invites)' : windowActive ? `Pay ${REMINT_COST_POINTS} points` : 'Start over'}
                        onPress={handleRevive}
                        disabled={minting || !canAfford}
                    />
                    {!canAfford && windowActive ? (
                        <PressableScale onPress={onInvite}>
                            <Text style={styles.freeText}>
                                No points? Invite {reviveInvitesRequired} friends for a free revive ({reviveInvites}/{reviveInvitesRequired})
                            </Text>
                        </PressableScale>
                    ) : null}
                    <PressableScale
                        onPress={handleHireGuardian}
                        disabled={balance < GUARDIAN_COST_POINTS}
                        style={[
                            styles.guardianButton,
                            balance < GUARDIAN_COST_POINTS && styles.guardianButtonDisabled,
                        ]}
                    >
                        <Text style={styles.guardianButtonText}>
                            Hire a {GUARDIAN_HOURS}h guardian · {GUARDIAN_COST_POINTS} pts
                        </Text>
                    </PressableScale>
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
    petWrap: {
        width: 120,
        height: 120,
        borderRadius: 60,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
    title: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_800ExtraBold',
        textAlign: 'center',
    },
    body: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 24,
        maxWidth: 300,
    },
    costCard: {
        width: '100%',
        padding: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.background,
        gap: spacing.sm,
    },
    costRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    costLabel: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_500Medium',
    },
    costValue: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_800ExtraBold',
    },
    costValueReady: {
        color: colors.primary,
    },
    tokenRow: {
        marginTop: spacing.sm,
        paddingTop: spacing.sm,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
    },
    tokenText: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
    },
    urge: {
        color: colors.danger,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        textAlign: 'center',
    },
    actions: {
        width: '100%',
        gap: spacing.md,
    },
    freeText: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        textAlign: 'center',
    },
    guardianButton: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: 'rgba(139,92,246,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(139,92,246,0.25)',
    },
    guardianButtonDisabled: {
        opacity: 0.5,
    },
    guardianButtonText: {
        color: '#8B5CF6',
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
    },
});
