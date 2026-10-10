import React, { useState } from 'react';
import {
    Alert,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { PressableScale } from './PressableScale';
import { RadialPet } from './RadialPet';
import { colors, fonts, radius, spacing, tracking, typography } from '../theme/tokens';

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
                    <RadialPet stage="egg" mood="waiting" size={96} active={visible} />
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
                    <View style={[styles.costRow, styles.costRowFirst]}>
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
                        <View style={styles.guardianIcon}>
                            <Ionicons
                                name="shield-checkmark-outline"
                                size={18}
                                color={colors.amber}
                            />
                        </View>
                        <View style={styles.guardianText}>
                            <Text style={styles.guardianButtonText}>
                                Hire a {GUARDIAN_HOURS}h guardian
                            </Text>
                            <Text style={styles.guardianButtonBody}>
                                A guardian keeps your companion fed while you're away.
                            </Text>
                        </View>
                        <View style={styles.costPill}>
                            <Text style={styles.costPillText}>
                                {GUARDIAN_COST_POINTS} pts
                            </Text>
                        </View>
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
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    title: {
        color: colors.textStrong,
        fontSize: typography.heading,
        fontFamily: fonts.bold,
        letterSpacing: tracking.heading,
        textAlign: 'center',
    },
    body: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: fonts.regular,
        textAlign: 'center',
        lineHeight: 24,
        maxWidth: 300,
    },
    costCard: {
        width: '100%',
        padding: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.panel,
        borderWidth: 1,
        borderColor: colors.border,
    },
    costRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: spacing.sm,
        marginTop: spacing.sm,
        borderTopWidth: 1,
        borderTopColor: colors.borderSoft,
    },
    costRowFirst: {
        paddingTop: 0,
        marginTop: 0,
        borderTopWidth: 0,
    },
    costLabel: {
        color: colors.textMuted,
        fontSize: typography.micro,
        fontFamily: fonts.mono,
        letterSpacing: tracking.eyebrow,
        textTransform: 'uppercase',
    },
    costValue: {
        color: colors.textStrong,
        fontSize: typography.body,
        fontFamily: fonts.monoBold,
    },
    costValueReady: {
        color: colors.primary,
    },
    tokenRow: {
        marginTop: spacing.sm,
        paddingTop: spacing.sm,
        borderTopWidth: 1,
        borderTopColor: colors.borderSoft,
    },
    tokenText: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: fonts.medium,
        textAlign: 'center',
    },
    urge: {
        color: colors.gold,
        fontSize: typography.small,
        fontFamily: fonts.medium,
        textAlign: 'center',
    },
    actions: {
        width: '100%',
        gap: spacing.md,
    },
    freeText: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: fonts.medium,
        textAlign: 'center',
    },
    guardianButton: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    guardianButtonDisabled: {
        opacity: 0.5,
    },
    guardianIcon: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
        backgroundColor: 'rgba(248,180,60,0.12)',
    },
    guardianText: {
        flex: 1,
        gap: 1,
    },
    guardianButtonText: {
        color: colors.textStrong,
        fontSize: typography.body,
        fontFamily: fonts.medium,
    },
    guardianButtonBody: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: fonts.regular,
    },
    costPill: {
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: radius.pill,
        backgroundColor: colors.chip,
    },
    costPillText: {
        color: colors.gold,
        fontSize: typography.small,
        fontFamily: fonts.monoBold,
    },
});
