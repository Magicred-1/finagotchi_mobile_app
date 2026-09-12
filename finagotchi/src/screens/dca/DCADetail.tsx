import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { formatDistanceToNow } from 'date-fns';
import Animated, {
    FadeInDown,
    ReduceMotion,
    useAnimatedProps,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';

import {
    cancelPlanOrder,
    isOverdue,
    usePlanStore,
    type DcaPlan,
} from '../../services/dca';
import { useWallet } from '../../wallet/useWallet';
import { Button } from '../../components/Button';
import { PressableScale } from '../../components/PressableScale';
import {
    colors,
    radius,
    spacing,
    springs,
    tracking,
    typography,
} from '../../theme/tokens';
import { DCAWizardSheet } from './DCAWizardSheet';
import { TokenLogo } from './TokenLogo';
import { formatChange, formatPrice, useTokenPrices } from './prices';
import { cadenceAdverb, formatUsdc, timeUntilLong } from './format';
import { useNowSeconds } from './useNowSeconds';

const RING_SIZE = 168;
const RING_STROKE = 12;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const STATUS_COPY: Record<string, string> = {
    paused: 'Paused. Unspent USDC was returned to your wallet.',
    complete: 'Complete. The full budget was invested.',
    failed: 'Failed. Check your wallet for remaining funds.',
};

const STAGGER = 60;

function entering(index: number) {
    return FadeInDown.withInitialValues({
        opacity: 0,
        transform: [{ translateY: 8 }],
    })
        .delay(index * STAGGER)
        .duration(220)
        .reduceMotion(ReduceMotion.System);
}

/**
 * Budget progress ring. The stroke follows a spring from its current value,
 * so a fill landing mid-animation re-targets smoothly instead of jumping —
 * and under reduced motion it settles instantly.
 */
function ProgressRing({ plan }: { plan: DcaPlan }) {
    const progress =
        plan.totalBudget > 0 ? Math.min(1, plan.spent / plan.totalBudget) : 0;
    const animatedProgress = useSharedValue(0);

    useEffect(() => {
        animatedProgress.value = withSpring(progress, {
            ...springs.default,
            reduceMotion: ReduceMotion.System,
        });
    }, [progress, animatedProgress]);

    const ringProps = useAnimatedProps(() => ({
        strokeDashoffset: RING_CIRCUMFERENCE * (1 - animatedProgress.value),
    }));

    const overdue = isOverdue(plan);

    return (
        <View style={styles.ringWrap}>
            <View style={styles.ringDisc} pointerEvents="none" />
            <Svg width={RING_SIZE} height={RING_SIZE}>
                <Circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_RADIUS}
                    stroke={colors.surfaceLight}
                    strokeWidth={RING_STROKE}
                    fill="none"
                />
                <AnimatedCircle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_RADIUS}
                    stroke={overdue ? colors.warning : colors.primary}
                    strokeWidth={RING_STROKE}
                    strokeLinecap="round"
                    fill="none"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    animatedProps={ringProps}
                    rotation={-90}
                    origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
                />
            </Svg>
            <View style={styles.ringCenter} pointerEvents="none">
                <Text style={styles.ringPercent}>
                    {`${Math.round(progress * 100)}%`}
                </Text>
                <Text style={styles.ringValue}>
                    {`${formatUsdc(plan.spent)} of ${formatUsdc(plan.totalBudget)} USDC`}
                </Text>
            </View>
        </View>
    );
}

/**
 * Live countdown to the next buy. The overdue badge has a reserved slot so
 * it appearing/disappearing never shifts the text or the actions below.
 */
function NextExecutionTicker({ plan }: { plan: DcaPlan }) {
    const nowSec = useNowSeconds();

    if (plan.status !== 'active' || plan.nextExecutionAt === null) {
        return null;
    }

    const overdue = isOverdue(plan);
    const due = plan.nextExecutionAt <= nowSec;

    return (
        <View style={styles.nextWrap}>
            <Text style={styles.nextText}>
                {due
                    ? 'Next buy due now'
                    : `Next buy in ${timeUntilLong(plan.nextExecutionAt, nowSec)}`}
            </Text>
            <View style={styles.overdueSlot}>
                {overdue && (
                    <View style={styles.overdueBadge}>
                        <View style={styles.overdueDot} />
                        <Text style={styles.overdueBadgeText}>Overdue</Text>
                    </View>
                )}
            </View>
        </View>
    );
}

type Props = {
    planId: string;
};

export function DCADetail({ planId }: Props) {
    const insets = useSafeAreaInsets();
    const wallet = useWallet();
    const plan = usePlanStore((state) =>
        state.plans.find((p) => p.id === planId)
    );
    const fills = usePlanStore((state) => state.fills);
    const [busy, setBusy] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const quotes = useTokenPrices();

    const planFills = fills
        .filter((fill) => fill.planId === planId)
        .slice()
        .reverse();

    async function closePlan(): Promise<boolean> {
        if (!plan || !wallet.publicKey || !plan.dcaAccountPubkey) return false;
        await cancelPlanOrder({
            walletPubkey: wallet.publicKey.toBase58(),
            orderId: plan.dcaAccountPubkey,
            signMessage: wallet.signMessage,
            signTransaction: wallet.signTransaction,
        });
        usePlanStore.getState().setStatus(plan.id, 'paused');
        usePlanStore.getState().updatePlan(plan.id, { nextExecutionAt: null });
        return true;
    }

    function handlePause() {
        if (!plan) return;
        Alert.alert(
            'Pause plan?',
            'Buys stop and unspent USDC returns to your wallet. This is one-way: restarting means creating a new plan.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Pause plan',
                    style: 'destructive',
                    onPress: async () => {
                        setBusy(true);
                        try {
                            await closePlan();
                            Haptics.notificationAsync(
                                Haptics.NotificationFeedbackType.Success
                            );
                        } catch (err) {
                            Haptics.notificationAsync(
                                Haptics.NotificationFeedbackType.Error
                            );
                            Alert.alert(
                                'Pause failed',
                                err instanceof Error
                                    ? err.message
                                    : String(err)
                            );
                        } finally {
                            setBusy(false);
                        }
                    },
                },
            ]
        );
    }

    function handleEdit() {
        if (!plan) return;
        Alert.alert(
            'Edit plan',
            'Editing in v1 pauses this plan and recreates it with new settings: your unspent USDC returns to your wallet, then a new plan is created.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Continue',
                    onPress: () => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setEditOpen(true);
                    },
                },
            ]
        );
    }

    if (!plan) {
        return (
            <View
                style={[
                    styles.safe,
                    { paddingTop: insets.top, paddingBottom: insets.bottom },
                ]}
            >
                <View style={styles.missing}>
                    <Text style={styles.missingText}>Plan not found</Text>
                    <Button title="Go back" onPress={() => router.back()} />
                </View>
            </View>
        );
    }

    const quote = quotes[plan.outputMint];

    return (
        <View
            style={[
                styles.safe,
                { paddingTop: insets.top, paddingBottom: insets.bottom },
            ]}
        >
            <View style={styles.header}>
                <PressableScale
                    onPress={() => router.back()}
                    hitSlop={8}
                    style={styles.headerButton}
                    accessibilityRole="button"
                    accessibilityLabel="Back"
                >
                    <Ionicons name="chevron-back" size={20} color={colors.text} />
                </PressableScale>
                <View style={styles.headerTitleRow}>
                    <TokenLogo ticker={plan.ticker} size={24} />
                    <View>
                        <Text style={styles.headerTitle}>
                            {`${plan.ticker} · ${cadenceAdverb(plan.intervalSec)}`}
                        </Text>
                        {quote ? (
                            <Text style={styles.headerQuote}>
                                {formatPrice(quote.price)}
                                <Text
                                    style={
                                        quote.change24h >= 0
                                            ? styles.headerQuoteUp
                                            : styles.headerQuoteDown
                                    }
                                >
                                    {`  ${formatChange(quote.change24h)}`}
                                </Text>
                            </Text>
                        ) : null}
                    </View>
                </View>
                <View style={styles.headerButton} />
            </View>

            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.bodyInner}>
                    <Animated.View entering={entering(0)}>
                        <ProgressRing plan={plan} />
                    </Animated.View>

                    <Animated.View entering={entering(1)}>
                        <NextExecutionTicker plan={plan} />
                    </Animated.View>

                    <Animated.View entering={entering(2)}>
                        {plan.status === 'active' ? (
                            <View style={styles.actions}>
                                <Button
                                    title="Edit plan"
                                    variant="secondary"
                                    icon={
                                        <Ionicons
                                            name="create-outline"
                                            size={16}
                                            color={colors.text}
                                        />
                                    }
                                    onPress={handleEdit}
                                />
                                <Button
                                    title="Pause plan"
                                    variant="secondary"
                                    icon={
                                        <Ionicons
                                            name="pause-outline"
                                            size={16}
                                            color={colors.text}
                                        />
                                    }
                                    loading={busy}
                                    disabled={!wallet.connected}
                                    onPress={handlePause}
                                />
                                <Text style={styles.actionCaption}>
                                    Pausing stops buys and returns unspent
                                    USDC to your wallet.
                                </Text>
                            </View>
                        ) : (
                            <Text style={styles.statusCopy}>
                                {STATUS_COPY[plan.status]}
                            </Text>
                        )}
                    </Animated.View>

                    <Animated.View entering={entering(3)} style={styles.fills}>
                        <Text style={styles.sectionTitle}>Fill history</Text>
                        {planFills.length === 0 ? (
                            <Text style={styles.emptyFills}>
                                No buys yet. The first one lands right after
                                deposit.
                            </Text>
                        ) : (
                            planFills.map((fill, index) => (
                                <View
                                    key={`${fill.at}-${index}`}
                                    style={styles.fillRow}
                                >
                                    <View style={styles.fillLeft}>
                                        <TokenLogo
                                            ticker={plan.ticker}
                                            size={22}
                                        />
                                        <Text style={styles.fillText}>
                                            {`+${formatUsdc(fill.holdingsDelta)} ${plan.ticker}`}
                                        </Text>
                                    </View>
                                    <Text style={styles.fillTime}>
                                        {formatDistanceToNow(
                                            new Date(fill.at),
                                            { addSuffix: true }
                                        )}
                                    </Text>
                                </View>
                            ))
                        )}
                    </Animated.View>

                    <Animated.View entering={entering(4)}>
                        <Text style={styles.footerNote}>
                            Budget lives on-chain in your Jupiter DCA account.
                            Only you can withdraw.
                        </Text>
                    </Animated.View>
                </View>
            </ScrollView>

            <DCAWizardSheet
                visible={editOpen}
                onClose={() => setEditOpen(false)}
                prefillTicker={plan.ticker}
                pauseId={plan.id}
                onSuccess={() => router.dismissTo('/')}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    safe: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },
    headerButton: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    headerTitle: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_600SemiBold',
        letterSpacing: tracking.heading * typography.body,
    },
    headerQuote: {
        color: colors.textMuted,
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
        fontVariant: ['tabular-nums'],
    },
    headerQuoteUp: {
        color: colors.success,
    },
    headerQuoteDown: {
        color: colors.danger,
    },
    body: {
        paddingHorizontal: spacing.md,
        paddingBottom: spacing.lg,
    },
    bodyInner: {
        gap: spacing.md,
    },
    ringWrap: {
        alignSelf: 'center',
        marginTop: spacing.md,
    },
    ringDisc: {
        position: 'absolute',
        top: RING_STROKE + 4,
        left: RING_STROKE + 4,
        width: RING_SIZE - (RING_STROKE + 4) * 2,
        height: RING_SIZE - (RING_STROKE + 4) * 2,
        borderRadius: (RING_SIZE - (RING_STROKE + 4) * 2) / 2,
        backgroundColor: colors.surface,
    },
    ringCenter: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
    },
    ringPercent: {
        color: colors.text,
        fontSize: typography.title,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: tracking.title * typography.title,
        fontVariant: ['tabular-nums'],
    },
    ringValue: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
        fontVariant: ['tabular-nums'],
    },
    nextWrap: {
        alignItems: 'center',
        gap: spacing.xs,
    },
    nextText: {
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
        fontVariant: ['tabular-nums'],
        textAlign: 'center',
    },
    overdueSlot: {
        height: 24,
        justifyContent: 'center',
    },
    overdueBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.warning,
        paddingVertical: 2,
        paddingHorizontal: spacing.sm,
    },
    overdueBadgeText: {
        color: colors.warning,
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    overdueDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.warning,
    },
    actions: {
        gap: spacing.sm,
    },
    actionCaption: {
        color: colors.textMuted,
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
    },
    statusCopy: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
    },
    fills: {
        gap: spacing.sm,
    },
    sectionTitle: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginTop: spacing.sm,
    },
    emptyFills: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
    },
    fillRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },
    fillLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    fillText: {
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        fontVariant: ['tabular-nums'],
    },
    fillTime: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
    },
    footerNote: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        marginTop: spacing.md,
    },
    missing: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
    },
    missingText: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_500Medium',
    },
});
