import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
// RNGH's ScrollView so the amount slider's pan gesture negotiates with the
// sheet scroll instead of being cancelled by the native scroll view.
import { ScrollView } from 'react-native-gesture-handler';
import Animated, {
    Easing,
    FadeInDown,
    ReduceMotion,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { PressableScale } from '../../components/PressableScale';
import {
    CADENCE_OPTIONS,
    SUPPORTED_TOKENS,
    cancelPlanOrder,
    createPlanOrder,
    tokenByTicker,
    useDcaUiStore,
    usePlanStore,
    type CadenceId,
} from '../../services/dca';
import { useWallet } from '../../wallet/useWallet';
import {
    colors,
    radius,
    spacing,
    springs,
    tracking,
    typography,
} from '../../theme/tokens';
import { AmountSlider } from './AmountSlider';
import { TokenLogo } from './TokenLogo';
import { cadenceAdverb, formatUsdc, humanDuration } from './format';
import { formatChange, formatPrice, useTokenPrices } from './prices';

const STEP_TITLES = ['Pick a stock', 'Amount & cadence', 'Review'] as const;

const BUDGET_OPTIONS = [20, 50, 100, 250];

const PERCENT_MIN = 5;
const PERCENT_MAX = 50;
const PERCENT_STEP = 1;
const PERCENT_PRESETS = [5, 10, 25, 50];

/** Jupiter enforces a $10 minimum per executed round. */
const MIN_ROUND_USD = 10;

const CADENCE_CAPTIONS: Record<CadenceId, string> = {
    daily: 'A buy every day',
    weekly: 'A buy every 7 days',
    biweekly: 'Two buys a month',
    monthly: 'One buy a month',
};

const CADENCE_NOUNS: Record<CadenceId, string> = {
    daily: 'day',
    weekly: 'week',
    biweekly: '2 weeks',
    monthly: 'month',
};

const STEP_OUT = { duration: 150, easing: Easing.out(Easing.cubic) } as const;
const STEP_IN = { duration: 200, easing: Easing.out(Easing.cubic) } as const;

/** Short segment labels; full captions live in CADENCE_CAPTIONS. */
const CADENCE_SHORT: Record<CadenceId, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    biweekly: '2 wks',
    monthly: 'Monthly',
};

const SEGMENTED_PAD = 3;

/**
 * Four mutually exclusive cadences with short labels are a segmented control,
 * not a stack of radio cards: one row, a sliding indicator springing between
 * segments, and the selected caption read out underneath.
 */
function CadenceSegmented({
    value,
    onChange,
}: {
    value: CadenceId;
    onChange: (id: CadenceId) => void;
}) {
    const [width, setWidth] = useState(0);
    const x = useSharedValue(0);
    const index = CADENCE_OPTIONS.findIndex((option) => option.id === value);
    const segWidth = (width - SEGMENTED_PAD * 2) / CADENCE_OPTIONS.length;

    useEffect(() => {
        if (segWidth <= 0) return;
        x.value = withSpring(index * segWidth, springs.snappy);
    }, [index, segWidth, x]);

    const indicatorStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: x.value }],
    }));

    return (
        <View
            style={styles.segmented}
            onLayout={(event) => {
                const w = event.nativeEvent.layout.width;
                // First measure: land directly on the selected segment so the
                // indicator never sweeps in from the left on open.
                if (width === 0 && w > 0) {
                    x.value =
                        index *
                        ((w - SEGMENTED_PAD * 2) / CADENCE_OPTIONS.length);
                }
                setWidth(w);
            }}
        >
            {segWidth > 0 ? (
                <Animated.View
                    style={[
                        styles.segmentIndicator,
                        { width: segWidth },
                        indicatorStyle,
                    ]}
                />
            ) : null}
            {CADENCE_OPTIONS.map((option) => {
                const selected = option.id === value;
                return (
                    <PressableScale
                        key={option.id}
                        onPress={() => {
                            Haptics.impactAsync(
                                Haptics.ImpactFeedbackStyle.Light
                            );
                            onChange(option.id);
                        }}
                        style={styles.segment}
                    >
                        <Text
                            style={[
                                styles.segmentText,
                                selected && styles.segmentTextSelected,
                            ]}
                        >
                            {CADENCE_SHORT[option.id]}
                        </Text>
                    </PressableScale>
                );
            })}
        </View>
    );
}

function StepDots({ step }: { step: number }) {
    return (
        <View style={styles.dots}>
            {STEP_TITLES.map((title, index) => (
                <StepDot key={title} active={index <= step} />
            ))}
        </View>
    );
}

function StepDot({ active }: { active: boolean }) {
    const width = useSharedValue(active ? 18 : 8);

    useEffect(() => {
        width.value = withSpring(active ? 18 : 8, {
            ...springs.snappy,
            reduceMotion: ReduceMotion.System,
        });
    }, [active, width]);

    const style = useAnimatedStyle(() => ({
        width: width.value,
        opacity: 0.4 + (width.value - 8) / 10 * 0.6,
    }));

    return <Animated.View style={[styles.dot, style]} />;
}

/**
 * The "what you're signing up for" sentence, shared by the Review and
 * Confirm steps so the two never drift apart.
 */
function ReviewSummary({
    ticker,
    amountPerTick,
    cadenceWord,
    budget,
}: {
    ticker: string;
    amountPerTick: number;
    cadenceWord: string;
    budget: number;
}) {
    return (
        <Text style={styles.reviewText}>
            Auto-buys up to{' '}
            <Text style={styles.reviewValue}>
                {formatUsdc(amountPerTick)} USDC
            </Text>{' '}
            of <Text style={styles.reviewValue}>{ticker}</Text> {cadenceWord}{' '}
            until{' '}
            <Text style={styles.reviewValue}>{formatUsdc(budget)} USDC</Text>{' '}
            runs out. Output to your wallet. Pause anytime.
        </Text>
    );
}

type Props = {
    visible: boolean;
    onClose: () => void;
    prefillTicker?: string;
    pauseId?: string;
    /** Runs after the sheet closes on success (detail screen uses it to go home). */
    onSuccess?: () => void;
};

export function DCAWizardSheet({
    visible,
    onClose,
    prefillTicker,
    pauseId,
    onSuccess,
}: Props) {
    const { height: windowHeight } = useWindowDimensions();
    const wallet = useWallet();

    const recreate = Boolean(prefillTicker && pauseId);

    const [step, setStep] = useState(0);
    const [ticker, setTicker] = useState<string | null>(null);
    const [percent, setPercent] = useState(20);
    const [cadenceId, setCadenceId] = useState<CadenceId>('weekly');
    const [budget, setBudget] = useState(50);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Informational quotes only — never blocks the flow.
    const prices = useTokenPrices(visible && step === 0);

    const contentAnim = useSharedValue(1);

    // Fresh start every time the sheet opens; prefill applies in recreate mode.
    useEffect(() => {
        if (!visible) return;
        setStep(0);
        setTicker(
            prefillTicker && tokenByTicker(prefillTicker)
                ? prefillTicker
                : null
        );
        setError(null);
        contentAnim.value = 0;
        contentAnim.value = withTiming(1, {
            ...STEP_IN,
            reduceMotion: ReduceMotion.System,
        });
    }, [visible, prefillTicker, contentAnim]);

    const cadence = CADENCE_OPTIONS.find((c) => c.id === cadenceId)!;
    const intervalSec = cadence.intervalSec;
    // Per-buy amount is a percentage of the total budget.
    const amountPerTick = Math.round(budget * percent) / 100;
    const buys = Math.floor(budget / amountPerTick);
    const belowRoundMinimum = amountPerTick < MIN_ROUND_USD;

    const goToStep = useCallback(
        (next: number) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setError(null);
            contentAnim.value = withTiming(
                0,
                { ...STEP_OUT, reduceMotion: ReduceMotion.System },
                (finished) => {
                    if (!finished) return;
                    runOnJS(setStep)(next);
                    contentAnim.value = withTiming(1, {
                        ...STEP_IN,
                        reduceMotion: ReduceMotion.System,
                    });
                }
            );
        },
        [contentAnim]
    );

    const canContinue = step === 1 ? !belowRoundMinimum : true;

    const handleConfirm = useCallback(async () => {
        if (!wallet.connected || !wallet.publicKey || !ticker) return;
        const token = tokenByTicker(ticker);
        if (!token) return;

        setSubmitting(true);
        setError(null);
        try {
            const walletPubkey = wallet.publicKey.toBase58();
            const auth = {
                walletPubkey,
                signMessage: wallet.signMessage,
                signTransaction: wallet.signTransaction,
            };

            if (recreate && pauseId) {
                const oldPlan = usePlanStore
                    .getState()
                    .plans.find((plan) => plan.id === pauseId);
                if (
                    oldPlan &&
                    oldPlan.status === 'active' &&
                    oldPlan.dcaAccountPubkey
                ) {
                    await cancelPlanOrder({
                        ...auth,
                        orderId: oldPlan.dcaAccountPubkey,
                    });
                    usePlanStore.getState().setStatus(pauseId, 'paused');
                    usePlanStore
                        .getState()
                        .updatePlan(pauseId, { nextExecutionAt: null });
                }
            }

            const { orderId } = await createPlanOrder({
                ...auth,
                input: {
                    outputMint: token.mint,
                    amountPerTick,
                    intervalSec,
                    totalBudget: budget,
                },
            });

            usePlanStore.getState().addPlan({
                id: orderId,
                outputMint: token.mint,
                ticker: token.ticker,
                amountPerTick,
                intervalSec,
                totalBudget: budget,
                spent: 0,
                buys: 0,
                holdingsHeld: 0,
                nextExecutionAt: Math.floor(Date.now() / 1000) + intervalSec,
                status: 'active',
                dcaAccountPubkey: orderId,
                missedCount: 0,
                createdAt: new Date().toISOString(),
            });

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            useDcaUiStore.getState().requestReaction('dance');
            onClose();
            onSuccess?.();
        } catch (err) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSubmitting(false);
        }
    }, [
        wallet,
        ticker,
        recreate,
        pauseId,
        amountPerTick,
        intervalSec,
        budget,
        onClose,
        onSuccess,
    ]);

    const selectedToken = ticker ? tokenByTicker(ticker) : null;
    const cadenceWord = cadenceAdverb(intervalSec);

    const contentStyle = useAnimatedStyle(() => ({
        opacity: contentAnim.value,
        transform: [{ translateY: (1 - contentAnim.value) * 8 }],
    }));

    return (
        <BottomSheet visible={visible} onClose={onClose}>
            <View style={styles.header}>
                {step > 0 ? (
                    <PressableScale
                        onPress={() => goToStep(step - 1)}
                        hitSlop={8}
                        style={styles.headerButton}
                    >
                        <Ionicons
                            name="chevron-back"
                            size={20}
                            color={colors.text}
                        />
                    </PressableScale>
                ) : (
                    <View style={styles.headerButton} />
                )}
                <Text style={styles.headerTitle}>{STEP_TITLES[step]}</Text>
                <View style={styles.headerButton} />
            </View>

            <StepDots step={step} />

            <ScrollView
                style={[
                    styles.body,
                    // Fixed body height: the sheet never jumps size between
                    // steps, and step 1 (the tallest) fits without clipping.
                    { height: Math.min(windowHeight * 0.6, 520) },
                ]}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.bodyContent}
            >
                <Animated.View style={contentStyle}>
                    {step === 0 && (
                        <View style={styles.tokenGrid}>
                            {SUPPORTED_TOKENS.map((token, index) => {
                                const selected = ticker === token.ticker;
                                const quote = prices[token.mint];
                                const changeUp = (quote?.change24h ?? 0) >= 0;
                                return (
                                    <Animated.View
                                        key={token.mint}
                                        style={styles.tokenCell}
                                        entering={FadeInDown.withInitialValues({
                                            opacity: 0,
                                            transform: [{ translateY: 8 }],
                                        })
                                            .delay(index * 40)
                                            .duration(220)
                                            .reduceMotion(ReduceMotion.System)}
                                    >
                                        <PressableScale
                                            onPress={() => {
                                                Haptics.impactAsync(
                                                    Haptics.ImpactFeedbackStyle.Light
                                                );
                                                // Pick = advance; no Continue
                                                // button on this step.
                                                setTicker(token.ticker);
                                                goToStep(1);
                                            }}
                                            style={[
                                                styles.tokenCard,
                                                selected &&
                                                    styles.tokenCardSelected,
                                            ]}
                                        >
                                            <View style={styles.tokenHead}>
                                                <TokenLogo
                                                    ticker={token.ticker}
                                                    size={28}
                                                />
                                                <Text
                                                    style={[
                                                        styles.tokenTicker,
                                                        selected &&
                                                            styles.tokenTickerSelected,
                                                    ]}
                                                >
                                                    {token.ticker}
                                                </Text>
                                            </View>
                                            <Text
                                                style={styles.tokenName}
                                                numberOfLines={1}
                                            >
                                                {token.name}
                                            </Text>
                                            <View style={styles.tokenQuoteRow}>
                                                <Text style={styles.tokenPrice}>
                                                    {quote
                                                        ? formatPrice(quote.price)
                                                        : '–'}
                                                </Text>
                                                {quote ? (
                                                    <Text
                                                        style={[
                                                            styles.tokenChange,
                                                            changeUp
                                                                ? styles.tokenChangeUp
                                                                : styles.tokenChangeDown,
                                                        ]}
                                                    >
                                                        {formatChange(quote.change24h)}
                                                    </Text>
                                                ) : null}
                                            </View>
                                        </PressableScale>
                                    </Animated.View>
                                );
                            })}
                        </View>
                    )}

                    {step === 1 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>
                                Total budget
                            </Text>
                            <View style={styles.chipWrap}>
                                {BUDGET_OPTIONS.map((option) => {
                                    const selected = budget === option;
                                    const disabled =
                                        (option * percent) / 100 <
                                        MIN_ROUND_USD;
                                    return (
                                        <PressableScale
                                            key={option}
                                            disabled={disabled}
                                            onPress={() => {
                                                Haptics.impactAsync(
                                                    Haptics.ImpactFeedbackStyle.Light
                                                );
                                                setBudget(option);
                                            }}
                                            style={[
                                                styles.optionChip,
                                                styles.budgetChip,
                                                selected &&
                                                    styles.optionChipSelected,
                                                disabled &&
                                                    styles.optionChipDisabled,
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.optionChipText,
                                                    selected &&
                                                        styles.optionChipTextSelected,
                                                ]}
                                            >
                                                {option} USDC
                                            </Text>
                                        </PressableScale>
                                    );
                                })}
                            </View>

                            <Text style={styles.sectionLabel}>
                                Amount per buy
                            </Text>
                            <Text style={styles.amountValue}>
                                {formatUsdc(amountPerTick)} USDC
                            </Text>
                            <Text style={styles.amountCaption}>
                                {percent}% of your budget each buy
                            </Text>
                            <View style={styles.presetRow}>
                                {PERCENT_PRESETS.map((preset) => {
                                    const selected = percent === preset;
                                    return (
                                        <PressableScale
                                            key={preset}
                                            onPress={() => {
                                                Haptics.impactAsync(
                                                    Haptics.ImpactFeedbackStyle.Light
                                                );
                                                setPercent(preset);
                                            }}
                                            style={[
                                                styles.optionChip,
                                                styles.presetChip,
                                                selected &&
                                                    styles.optionChipSelected,
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.optionChipText,
                                                    selected &&
                                                        styles.optionChipTextSelected,
                                                ]}
                                            >
                                                {preset}%
                                            </Text>
                                        </PressableScale>
                                    );
                                })}
                            </View>
                            <AmountSlider
                                min={PERCENT_MIN}
                                max={PERCENT_MAX}
                                step={PERCENT_STEP}
                                value={percent}
                                onChange={setPercent}
                            />
                            {belowRoundMinimum && (
                                <View style={styles.errorRow}>
                                    <Ionicons
                                        name="alert-circle-outline"
                                        size={14}
                                        color={colors.danger}
                                    />
                                    <Text style={styles.errorText}>
                                        Each buy needs at least 10 USDC. Raise
                                        the percentage or the budget.
                                    </Text>
                                </View>
                            )}

                            <Text style={styles.sectionLabel}>Cadence</Text>
                            <CadenceSegmented
                                value={cadenceId}
                                onChange={setCadenceId}
                            />
                            <Text style={styles.cadenceCaptionLine}>
                                {CADENCE_CAPTIONS[cadenceId]}
                            </Text>

                            <View style={styles.mathCard}>
                                <Ionicons
                                    name="repeat-outline"
                                    size={14}
                                    color={colors.primary}
                                />
                                <Text style={styles.mathLine}>
                                    {`${formatUsdc(amountPerTick)} USDC of ${ticker ?? 'stock'} every ${CADENCE_NOUNS[cadenceId]}, ${buys} buys over ${humanDuration(buys * intervalSec)}.`}
                                </Text>
                            </View>
                        </View>
                    )}

                    {step === 2 && selectedToken && (
                        <View style={styles.section}>
                            <View style={styles.receiptCard}>
                                <View style={styles.receiptHead}>
                                    <TokenLogo
                                        ticker={selectedToken.ticker}
                                        size={32}
                                    />
                                    <View style={styles.receiptHeadText}>
                                        <Text style={styles.receiptTicker}>
                                            {selectedToken.ticker}
                                        </Text>
                                        <Text style={styles.receiptName}>
                                            {selectedToken.name}
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.receiptDivider} />
                                <ReviewSummary
                                    ticker={selectedToken.ticker}
                                    amountPerTick={amountPerTick}
                                    cadenceWord={cadenceWord}
                                    budget={budget}
                                />
                                {recreate && (
                                    <Text style={styles.recreateText}>
                                        Recreating a plan: confirming first
                                        cancels your old plan (unspent USDC
                                        returns to your wallet), then creates
                                        this one. A login message signature if
                                        needed, then a cancel signature and a
                                        deposit signature.
                                    </Text>
                                )}
                            </View>
                            <View style={styles.factRow}>
                                <Ionicons
                                    name="sparkles-outline"
                                    size={16}
                                    color={colors.primary}
                                />
                                <Text style={styles.factText}>
                                    Every buy farms your pet: +25 points, +10
                                    XP, happiness and a Care Clock refill.
                                </Text>
                            </View>
                            <View style={styles.factRow}>
                                <Ionicons
                                    name="flash-outline"
                                    size={16}
                                    color={colors.primary}
                                />
                                <Text style={styles.factText}>
                                    First buy executes right after deposit.
                                </Text>
                            </View>
                            <View style={styles.factRow}>
                                <Ionicons
                                    name="lock-closed-outline"
                                    size={16}
                                    color={colors.primary}
                                />
                                <Text style={styles.factText}>
                                    Budget lives in the on-chain Jupiter DCA
                                    account. Only you can withdraw
                                    (non-custodial).
                                </Text>
                            </View>
                            <View style={styles.factRow}>
                                <Ionicons
                                    name="wallet-outline"
                                    size={16}
                                    color={colors.primary}
                                />
                                <Text style={styles.factText}>
                                    Output tokens are sent to your wallet each
                                    cycle.
                                </Text>
                            </View>
                            {wallet.connected ? (
                                <>
                                    <Text style={styles.approvalsText}>
                                        {recreate
                                            ? "You'll approve a login message (once per ~24h), a cancel signature, and a deposit signature."
                                            : "You'll approve a login message (once per ~24h) and 1 deposit signature."}
                                    </Text>
                                    {error !== null && (
                                        <Text style={styles.errorText}>
                                            {error}
                                        </Text>
                                    )}
                                    {submitting && (
                                        <View style={styles.submittingRow}>
                                            <ActivityIndicator
                                                size="small"
                                                color={colors.primary}
                                            />
                                            <Text
                                                style={styles.submittingText}
                                            >
                                                {recreate
                                                    ? 'Approve the login message, then the cancel and deposit signatures…'
                                                    : 'Approve the login message, then 1 deposit signature…'}
                                            </Text>
                                        </View>
                                    )}
                                </>
                            ) : (
                                <View style={styles.receiptCard}>
                                    <Ionicons
                                        name="wallet-outline"
                                        size={28}
                                        color={colors.textMuted}
                                    />
                                    <Text style={styles.connectText}>
                                        Connect wallet in onboarding first
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}
                </Animated.View>
            </ScrollView>

            <View style={styles.footer}>
                {step === 0 ? null : step < 2 ? (
                    <Button
                        title="Review plan"
                        disabled={!canContinue}
                        onPress={() => goToStep(step + 1)}
                    />
                ) : (
                    <Button
                        title={
                            submitting
                                ? 'Confirming…'
                                : recreate
                                  ? 'Cancel old & create plan'
                                  : 'Confirm & deposit'
                        }
                        loading={submitting}
                        disabled={!wallet.connected}
                        onPress={handleConfirm}
                    />
                )}
            </View>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: spacing.sm,
    },
    headerButton: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_600SemiBold',
    },
    dots: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingBottom: spacing.md,
    },
    dot: {
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.primary,
    },
    body: {
        flexShrink: 1,
        flexGrow: 0,
    },
    bodyContent: {
        paddingBottom: spacing.md,
    },
    tokenGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },
    tokenCell: {
        width: '48%',
        flexGrow: 1,
    },
    tokenCard: {
        backgroundColor: colors.background,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        gap: spacing.xs,
    },
    tokenCardSelected: {
        borderColor: colors.primary,
        backgroundColor: colors.surfaceLight,
    },
    tokenHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    tokenTicker: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
    },
    tokenTickerSelected: {
        color: colors.primary,
    },
    tokenName: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
    },
    tokenPrice: {
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
    },
    tokenQuoteRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
    },
    tokenChange: {
        fontSize: 11,
        fontFamily: 'Poppins_600SemiBold',
    },
    tokenChangeUp: {
        color: colors.success,
    },
    tokenChangeDown: {
        color: colors.danger,
    },
    section: {
        gap: spacing.md,
    },
    sectionLabel: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginTop: spacing.sm,
    },
    amountValue: {
        color: colors.text,
        fontSize: typography.title,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: tracking.title * typography.title,
        fontVariant: ['tabular-nums'],
        textAlign: 'center',
        marginTop: spacing.xs,
    },
    amountCaption: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
        marginTop: 2,
    },
    presetRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.xs,
        marginTop: spacing.sm,
    },
    budgetChip: {
        flex: 1,
        alignItems: 'center',
    },
    chipWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm,
    },
    optionChip: {
        backgroundColor: colors.background,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },
    optionChipSelected: {
        borderColor: colors.primary,
        backgroundColor: colors.surfaceLight,
    },
    optionChipText: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
    },
    optionChipTextSelected: {
        color: colors.primary,
    },
    optionChipDisabled: {
        opacity: 0.4,
    },
    presetChip: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.xs,
    },
    segmented: {
        flexDirection: 'row',
        backgroundColor: colors.background,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: SEGMENTED_PAD,
    },
    segmentIndicator: {
        position: 'absolute',
        top: SEGMENTED_PAD,
        bottom: SEGMENTED_PAD,
        left: SEGMENTED_PAD,
        borderRadius: radius.md - 4,
        backgroundColor: 'rgba(53,215,255,0.14)',
        borderWidth: 1,
        borderColor: colors.primary,
    },
    segment: {
        flex: 1,
        height: 38,
        alignItems: 'center',
        justifyContent: 'center',
    },
    segmentText: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
    },
    segmentTextSelected: {
        color: colors.primary,
        fontFamily: 'Poppins_600SemiBold',
    },
    cadenceCaptionLine: {
        color: colors.textMuted,
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
    },
    mathCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: 'rgba(53,215,255,0.08)',
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: 'rgba(53,215,255,0.25)',
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },
    mathLine: {
        flex: 1,
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
        fontVariant: ['tabular-nums'],
    },
    receiptCard: {
        backgroundColor: colors.background,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        gap: spacing.md,
    },
    receiptHead: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    receiptHeadText: {
        gap: 2,
    },
    receiptTicker: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
    },
    receiptName: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
    },
    receiptDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
    },
    reviewText: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 24,
    },
    reviewValue: {
        color: colors.text,
        fontFamily: 'Poppins_700Bold',
    },
    recreateText: {
        color: colors.warning,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
        lineHeight: 20,
    },
    factRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
        paddingHorizontal: spacing.xs,
    },
    factText: {
        flex: 1,
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 20,
    },
    errorRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.xs,
    },
    errorText: {
        flex: 1,
        color: colors.danger,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
    },
    approvalsText: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
    },
    submittingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    submittingText: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
    },
    connectText: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
    },
    footer: {
        paddingTop: spacing.sm,
    },
});
