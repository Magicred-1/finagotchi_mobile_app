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
    type PlanOrderStep,
} from '../../services/dca';
import { useClaimQueue, useQuestsStore } from '../../features/quest-engine';
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
import { TokenWheelPicker } from './TokenWheelPicker';
import { cadenceAdverb, formatUsdc, humanDuration } from './format';
import { useTokenPrices } from './prices';

const STEP_TITLES = ['Pick a stock', 'Amount & cadence', 'Review'] as const;

/** Muted one-liner under the nav title; same chrome on every step. */
const STEP_SUBTITLES = [
    'Spin the drum — tap the centered stock to continue.',
    'How much goes in, and how often it buys.',
    'Check the details before you sign.',
] as const;

const BUDGET_OPTIONS = [20, 50, 100, 250];

const PERCENT_MIN = 5;
const PERCENT_MAX = 50;
const PERCENT_STEP = 1;
const PERCENT_PRESETS = [5, 10, 25, 50];

/** Jupiter enforces a $10 minimum per executed round. */
const MIN_ROUND_USD = 10;

/** Jupiter DCA program — the starter quest "Plant a Seed" watches it. */
const JUPITER_DCA_PROGRAM_ID = 'DCA265Vj8a9CEuX1eb1LWRnDT7uK6q1xMipnNyatn23M';

const CADENCE_NOUNS: Record<CadenceId, string> = {
    daily: 'day',
    weekly: 'week',
    biweekly: '2 weeks',
    monthly: 'month',
};

const STEP_OUT = { duration: 150, easing: Easing.out(Easing.cubic) } as const;
const STEP_IN = { duration: 200, easing: Easing.out(Easing.cubic) } as const;

/** Submit-progress copy per create/cancel stage (shown while submitting). */
const STEP_LABELS: Record<PlanOrderStep, string> = {
    check: 'Checking your balance…',
    auth: 'Approve the login message in your wallet…',
    vault: 'Preparing your DCA vault…',
    craft: 'Preparing the deposit…',
    sign: 'Approve the signature in your wallet…',
    simulate: 'Checking the deposit…',
    submit: 'Creating your plan…',
};

/** Review-step fact rows (icon + copy), rendered as an inset-grouped card. */
const FACTS = [
    {
        icon: 'sparkles-outline',
        text: 'Every buy farms your pet: +25 points, +10 XP.',
    },
    {
        icon: 'flash-outline',
        text: 'First buy executes right after deposit.',
    },
    {
        icon: 'lock-closed-outline',
        text: 'Non-custodial — only you can withdraw.',
    },
    {
        icon: 'wallet-outline',
        text: 'Output tokens go to your wallet each cycle.',
    },
] as const;

const SEGMENTED_PAD = 3;

/** Short cadence segment labels (the math card carries the plain-English). */
const CADENCE_SHORT: Record<CadenceId, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    biweekly: '2 wks',
    monthly: 'Monthly',
};

const CADENCE_SEGMENTS = CADENCE_OPTIONS.map((option) => ({
    id: option.id as string,
    label: CADENCE_SHORT[option.id],
}));

const BUDGET_SEGMENTS = BUDGET_OPTIONS.map((option) => ({
    id: String(option),
    label: `${option} USDC`,
}));

/** Amount-per-buy preset segments (percent of budget). */
const PERCENT_SEGMENTS = PERCENT_PRESETS.map((preset) => ({
    id: String(preset),
    label: `${preset}%`,
}));

/**
 * iOS segmented control: mutually exclusive short options on one row, a
 * sliding indicator springing between segments. One selection idiom for the
 * whole wizard (cadence, amount presets); the drum wheel covers long lists.
 */
function SegmentedControl({
    options,
    value,
    onChange,
    disabledIds,
}: {
    options: readonly { id: string; label: string }[];
    value: string;
    onChange: (id: string) => void;
    /** Dimmed and non-selectable segments (e.g. below the Jupiter minimum). */
    disabledIds?: ReadonlySet<string>;
}) {
    const [width, setWidth] = useState(0);
    const x = useSharedValue(0);
    // A free-form value (slider-set percent) may match no segment: hide the
    // indicator rather than highlighting the wrong one.
    const selectedIndex = options.findIndex((option) => option.id === value);
    const index = Math.max(0, selectedIndex);
    const segWidth = (width - SEGMENTED_PAD * 2) / options.length;

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
                        index * ((w - SEGMENTED_PAD * 2) / options.length);
                }
                setWidth(w);
            }}
        >
            {segWidth > 0 && selectedIndex >= 0 ? (
                <Animated.View
                    style={[
                        styles.segmentIndicator,
                        { width: segWidth },
                        indicatorStyle,
                    ]}
                />
            ) : null}
            {options.map((option) => {
                const selected = option.id === value;
                const disabled = disabledIds?.has(option.id) ?? false;
                return (
                    <PressableScale
                        key={option.id}
                        disabled={disabled}
                        onPress={() => {
                            Haptics.selectionAsync();
                            onChange(option.id);
                        }}
                        style={[
                            styles.segment,
                            disabled && styles.segmentDisabled,
                        ]}
                    >
                        <Text
                            style={[
                                styles.segmentText,
                                selected && styles.segmentTextSelected,
                            ]}
                        >
                            {option.label}
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
    /** Preselected cadence (device `dca:new` requests carry freqSec). */
    prefillCadenceId?: CadenceId;
    /**
     * Target per-buy amount in USD (device `dca:new` requests carry SOL,
     * converted by the caller). Fitted onto the budget × percent grid.
     */
    prefillAmountUsd?: number;
    pauseId?: string;
    /** Runs after the sheet closes on success (detail screen uses it to go home). */
    onSuccess?: () => void;
};

/**
 * Fit a per-buy USD target onto the budget × percent grid (presets × 5–50%).
 * Approximate by construction — the closest grid point wins.
 */
function fitAmountToGrid(amountUsd: number): { budget: number; percent: number } {
    let best = { budget: 50, percent: 20 };
    let bestError = Number.POSITIVE_INFINITY;
    for (const budget of BUDGET_OPTIONS) {
        const percent = Math.min(
            PERCENT_MAX,
            Math.max(PERCENT_MIN, Math.round((100 * amountUsd) / budget))
        );
        const error = Math.abs((budget * percent) / 100 - amountUsd);
        if (error < bestError) {
            best = { budget, percent };
            bestError = error;
        }
    }
    return best;
}

export function DCAWizardSheet({
    visible,
    onClose,
    prefillTicker,
    prefillCadenceId,
    prefillAmountUsd,
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
    const [progressStep, setProgressStep] = useState<PlanOrderStep | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Measured viewport of the step body: the step 0 drum sizes to fill it.
    const [bodyHeight, setBodyHeight] = useState(0);

    // Informational quotes only — never blocks the flow.
    const prices = useTokenPrices(visible && step === 0);

    const contentAnim = useSharedValue(1);

    // Fresh start every time the sheet opens; prefills (recreate mode or a
    // device dca:new request) apply on top of the defaults.
    useEffect(() => {
        if (!visible) return;
        setStep(0);
        setTicker(
            prefillTicker && tokenByTicker(prefillTicker)
                ? prefillTicker
                : null
        );
        setCadenceId(prefillCadenceId ?? 'weekly');
        if (prefillAmountUsd && prefillAmountUsd > 0) {
            const fit = fitAmountToGrid(prefillAmountUsd);
            setBudget(fit.budget);
            setPercent(fit.percent);
        } else {
            setBudget(50);
            setPercent(20);
        }
        setError(null);
        setProgressStep(null);
        contentAnim.value = 0;
        contentAnim.value = withTiming(1, {
            ...STEP_IN,
            reduceMotion: ReduceMotion.System,
        });
    }, [visible, prefillTicker, prefillCadenceId, prefillAmountUsd, contentAnim]);

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
        setProgressStep(null);
        try {
            const walletPubkey = wallet.publicKey.toBase58();
            const auth = {
                walletPubkey,
                signMessage: wallet.signMessage,
                signTransaction: wallet.signTransaction,
                onStep: setProgressStep,
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

            const { orderId, txSignature } = await createPlanOrder({
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
                orderState: 'depositing',
                missedCount: 0,
                createdAt: new Date().toISOString(),
            });

            // Feed the quest engine: Jupiter's hosted API posts the deposit
            // tx itself, so useWallet.signAndSendTransaction (and thus
            // observeOutgoingTx) never fires for a DCA plan creation.
            useQuestsStore.getState().recordTx({
                signature: txSignature,
                slot: 0,
                blockTime: Date.now(),
                wallet: walletPubkey,
                programId: JUPITER_DCA_PROGRAM_ID,
                instruction: 'app_dca',
            });
            // recordTx enqueues a claim when a quest completes — cash it now.
            void useClaimQueue.getState().flush();

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            useDcaUiStore.getState().requestReaction('dance');
            onClose();
            onSuccess?.();
        } catch (err) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            const message = err instanceof Error ? err.message : String(err);
            // The sheet shows the message, but support reports come from the
            // console — make sure the full Jupiter error body lands there too.
            console.error('dca: create plan failed:', message);
            setError(message);
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

            <Text style={styles.stepSubtitle}>{STEP_SUBTITLES[step]}</Text>

            <ScrollView
                style={[
                    styles.body,
                    // Fixed body height: the sheet never jumps size between
                    // steps. Steps 1-2 are compressed to fit a 375×667 screen
                    // without scrolling; the ScrollView stays as a safety net.
                    { height: Math.min(windowHeight * 0.64, 540) },
                ]}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[
                    styles.bodyContent,
                    step === 0 && styles.bodyContentWheel,
                ]}
                // Step 0 is the full-height drum: it owns vertical scrolling,
                // so the sheet scroll stands down and never fights it.
                scrollEnabled={step !== 0}
                onLayout={(event) =>
                    setBodyHeight(event.nativeEvent.layout.height)
                }
            >
                <Animated.View style={contentStyle}>
                    {step === 0 && bodyHeight > 0 && (
                        <TokenWheelPicker
                            tokens={SUPPORTED_TOKENS}
                            selectedTicker={ticker}
                            quotes={prices}
                            height={bodyHeight}
                            onSelect={setTicker}
                            onConfirm={(chosen) => {
                                // Pick = advance; no Continue button on this step.
                                setTicker(chosen);
                                goToStep(1);
                            }}
                        />
                    )}

                    {step === 1 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>
                                Total budget
                            </Text>
                            <SegmentedControl
                                options={BUDGET_SEGMENTS}
                                value={String(budget)}
                                onChange={(id) => setBudget(Number(id))}
                                disabledIds={
                                    new Set(
                                        BUDGET_OPTIONS.filter(
                                            (option) =>
                                                (option * percent) / 100 <
                                                MIN_ROUND_USD
                                        ).map(String)
                                    )
                                }
                            />

                            <Text style={styles.sectionLabel}>
                                Amount per buy
                            </Text>
                            <Text style={styles.amountValue}>
                                {formatUsdc(amountPerTick)} USDC
                            </Text>
                            <Text style={styles.amountCaption}>
                                {percent}% of your budget each buy
                            </Text>
                            <SegmentedControl
                                options={PERCENT_SEGMENTS}
                                value={String(percent)}
                                onChange={(id) => setPercent(Number(id))}
                            />
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
                            <SegmentedControl
                                options={CADENCE_SEGMENTS}
                                value={cadenceId}
                                onChange={(id) =>
                                    setCadenceId(id as CadenceId)
                                }
                            />

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
                            <View style={styles.groupCard}>
                                <View style={styles.groupRow}>
                                    <TokenLogo
                                        ticker={selectedToken.ticker}
                                        size={28}
                                    />
                                    <View style={styles.groupRowTextCol}>
                                        <Text style={styles.summaryTicker}>
                                            {selectedToken.ticker}
                                        </Text>
                                        <Text style={styles.summaryName}>
                                            {selectedToken.name}
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.groupSeparator} />
                                <View style={styles.summaryRow}>
                                    <Text style={styles.summaryLabel}>
                                        Per buy
                                    </Text>
                                    <Text style={styles.summaryValue}>
                                        {formatUsdc(amountPerTick)} USDC
                                    </Text>
                                </View>
                                <View style={styles.groupSeparator} />
                                <View style={styles.summaryRow}>
                                    <Text style={styles.summaryLabel}>
                                        Cadence
                                    </Text>
                                    <Text style={styles.summaryValue}>
                                        Every {CADENCE_NOUNS[cadenceId]}
                                    </Text>
                                </View>
                                <View style={styles.groupSeparator} />
                                <View style={styles.summaryRow}>
                                    <Text style={styles.summaryLabel}>
                                        Total budget
                                    </Text>
                                    <Text style={styles.summaryValue}>
                                        {formatUsdc(budget)} USDC
                                    </Text>
                                </View>
                                <View style={styles.groupSeparator} />
                                <View style={styles.summaryRow}>
                                    <Text style={styles.summaryLabel}>
                                        Buys
                                    </Text>
                                    <Text style={styles.summaryValue}>
                                        {buys} over{' '}
                                        {humanDuration(buys * intervalSec)}
                                    </Text>
                                </View>
                            </View>

                            <ReviewSummary
                                ticker={selectedToken.ticker}
                                amountPerTick={amountPerTick}
                                cadenceWord={cadenceWord}
                                budget={budget}
                            />
                            {recreate && (
                                <Text style={styles.recreateText}>
                                    Recreating a plan: confirming first cancels
                                    your old plan (unspent USDC returns to your
                                    wallet), then creates this one. A login
                                    message signature if needed, then a cancel
                                    signature and a deposit signature.
                                </Text>
                            )}

                            <View style={styles.groupCard}>
                                {FACTS.map((fact, index) => (
                                    <View key={fact.icon}>
                                        {index > 0 && (
                                            <View
                                                style={styles.groupSeparator}
                                            />
                                        )}
                                        <View style={styles.groupRow}>
                                            <Ionicons
                                                name={fact.icon}
                                                size={16}
                                                color={colors.primary}
                                            />
                                            <Text style={styles.factText}>
                                                {fact.text}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
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
                                                {progressStep
                                                    ? STEP_LABELS[progressStep]
                                                    : recreate
                                                      ? 'Approve the login message, then the cancel and deposit signatures…'
                                                      : 'Approve the login message, then 1 deposit signature…'}
                                            </Text>
                                        </View>
                                    )}
                                </>
                            ) : (
                                <View style={styles.groupCard}>
                                    <View style={styles.connectRow}>
                                        <Ionicons
                                            name="wallet-outline"
                                            size={28}
                                            color={colors.textMuted}
                                        />
                                        <Text style={styles.connectText}>
                                            Connect wallet in onboarding first
                                        </Text>
                                    </View>
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
        fontSize: typography.heading,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: tracking.heading * typography.heading,
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
    bodyContentWheel: {
        // The drum is measured to the exact body height; no trailing gap.
        paddingBottom: 0,
    },
    stepSubtitle: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        paddingBottom: spacing.sm,
    },
    section: {
        gap: spacing.sm,
    },
    sectionLabel: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginTop: spacing.xs,
    },
    groupCard: {
        backgroundColor: colors.surfaceLight,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
    },
    groupRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        minHeight: 40,
    },
    groupRowTextCol: {
        flex: 1,
        gap: 1,
    },
    groupSeparator: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginLeft: spacing.md,
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.md,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        minHeight: 34,
    },
    summaryLabel: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
    },
    summaryValue: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_600SemiBold',
        fontVariant: ['tabular-nums'],
        flexShrink: 1,
        textAlign: 'right',
    },
    summaryTicker: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
    },
    summaryName: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
    },
    amountValue: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: tracking.heading * typography.heading,
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
    segmentDisabled: {
        opacity: 0.35,
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
        fontSize: 11,
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
    connectRow: {
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.lg,
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
