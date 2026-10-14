import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
// RNGH's ScrollView so the TokenSwiper pans negotiate with the sheet
// scroll instead of being cancelled by the native scroll view.
import { ScrollView } from 'react-native-gesture-handler';
import Animated, {
    FadeIn,
    FadeInDown,
    ReduceMotion,
} from 'react-native-reanimated';

import { BottomSheet } from '../../components/BottomSheet';
import { Button } from '../../components/Button';
import { PressableScale } from '../../components/PressableScale';
import { SegmentedControl } from '../../components/SegmentedControl';
import { Skeleton } from '../../components/Skeleton';
import {
    JUPITER_SWAP_PROGRAM_ID,
    SWAP_REWARD,
    SWAP_TOKENS,
    fetchTokenBalance,
    fromBaseUnits,
    getSwapQuote,
    performSwap,
    quickAmount,
    rewardSwap,
    swapTokenByTicker,
    toBaseUnits,
    type SwapQuote,
    type SwapStep,
} from '../../services/swap';
import { useDcaUiStore } from '../../services/dca';
import { useClaimQueue, useQuestsStore } from '../../features/quest-engine';
import { useWallet } from '../../wallet/useWallet';
import {
    colors,
    landing,
    radius,
    spacing,
    typography,
} from '../../theme/tokens';
import { FitAmountInput } from './FitAmountInput';
import { TokenSwiper } from './TokenSwiper';
import { formatUsdEstimate, useSwapPrices } from './prices';

/** Debounce between the last keystroke and the quote request. */
const QUOTE_DEBOUNCE_MS = 500;

/** Quick-pick segments: fractions of the input token's wallet balance. */
const QUICK_SEGMENTS = [
    { id: '0.1', label: '10%' },
    { id: '0.25', label: '25%' },
    { id: '1', label: 'MAX' },
] as const;

/** Submit-progress copy per swap stage (shown while submitting). */
const STEP_LABELS: Record<SwapStep, string> = {
    quote: 'Getting the best price…',
    sign: 'Approve the swap in your wallet…',
    execute: 'Executing the swap…',
};

/** Trim a token amount for display: 0.000012345678 → "0.00001235". */
function formatTokenAmount(value: number): string {
    if (!Number.isFinite(value)) return '–';
    if (value >= 1000) {
        return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
    if (value >= 1) return String(Math.round(value * 10_000) / 10_000);
    return value.toPrecision(4);
}

/**
 * One-tap Jupiter swap on a vertical hero layout: the amount leads at the
 * top (font shrinking to always fit one line), each side's token is picked
 * by swiping its selector card, and the receive side breathes a skeleton
 * while the quote loads. The order is crafted on confirm, never while
 * typing, so the signature always covers a live quote. A completed swap
 * feeds the pet (+points, +XP), fires the home-screen dance, and counts
 * toward quests.
 */
export function SwapSheet({
    visible,
    onClose,
}: {
    visible: boolean;
    onClose: () => void;
}) {
    const wallet = useWallet();
    const prices = useSwapPrices(visible);
    const windowHeight = useWindowDimensions().height;

    const [fromTicker, setFromTicker] = useState('SOL');
    const [toTicker, setToTicker] = useState('USDC');
    const [amountText, setAmountText] = useState('');
    /** Last tapped quick segment — drives its indicator; cleared on typing. */
    const [quickPick, setQuickPick] = useState('');
    const [balance, setBalance] = useState<number | null>(null);
    const [quote, setQuote] = useState<SwapQuote | null>(null);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [quoteError, setQuoteError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [progressStep, setProgressStep] = useState<SwapStep | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<{
        signature: string;
        paidText: string;
        receivedText: string;
    } | null>(null);
    /** Stale-response guard: only the latest debounced quote may land. */
    const quoteSeq = useRef(0);

    const fromToken = swapTokenByTicker(fromTicker) ?? SWAP_TOKENS[0];
    const toToken = swapTokenByTicker(toTicker) ?? SWAP_TOKENS[1];
    const amount = Number(amountText);
    const amountValid = Number.isFinite(amount) && amount > 0;
    const walletPubkey = wallet.publicKey?.toBase58() ?? null;
    const exceedsBalance = balance !== null && amountValid && amount > balance;

    // Wallet balance of the pay-side token, for the quick-amount segments.
    // Refetched on open, on token change, and after a completed swap.
    useEffect(() => {
        if (!visible || !walletPubkey) {
            setBalance(null);
            return;
        }
        let cancelled = false;
        fetchTokenBalance(walletPubkey, fromToken).then((value) => {
            if (!cancelled) setBalance(value);
        });
        return () => {
            cancelled = true;
        };
    }, [visible, walletPubkey, fromToken, success]);

    // Debounced display quote (no taker — nothing is built server-side per
    // keystroke). The confirm flow crafts a fresh order anyway.
    useEffect(() => {
        if (!visible) return;
        setQuote(null);
        setQuoteError(null);
        if (!amountValid || fromTicker === toTicker || !walletPubkey) {
            setQuoteLoading(false);
            return;
        }
        const seq = ++quoteSeq.current;
        setQuoteLoading(true);
        const timer = setTimeout(() => {
            let baseAmount: string;
            try {
                baseAmount = toBaseUnits(amount, fromToken);
            } catch {
                setQuoteLoading(false);
                return;
            }
            getSwapQuote({
                walletPubkey,
                inputMint: fromToken.mint,
                outputMint: toToken.mint,
                amount: baseAmount,
            })
                .then((next) => {
                    if (seq !== quoteSeq.current) return;
                    setQuote(next);
                    setQuoteLoading(false);
                })
                .catch((err) => {
                    if (seq !== quoteSeq.current) return;
                    setQuoteError(err instanceof Error ? err.message : String(err));
                    setQuoteLoading(false);
                });
        }, QUOTE_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [
        visible,
        amountText,
        amount,
        amountValid,
        fromTicker,
        toTicker,
        fromToken,
        toToken,
        walletPubkey,
    ]);

    /** Pay-side pick: keep the pair valid by moving the get-side if needed. */
    const pickFrom = useCallback(
        (ticker: string) => {
            setFromTicker(ticker);
            // Balance (and thus any quick-pick fraction) is per-token.
            setQuickPick('');
            if (ticker === toTicker) {
                const fallback = SWAP_TOKENS.find((t) => t.ticker !== ticker);
                if (fallback) setToTicker(fallback.ticker);
            }
        },
        [toTicker]
    );

    const flip = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setFromTicker(toTicker);
        setToTicker(fromTicker);
        setAmountText('');
        setQuickPick('');
    }, [fromTicker, toTicker]);

    const handleSwap = useCallback(async () => {
        if (!wallet.connected || !wallet.publicKey || !amountValid) return;
        setSubmitting(true);
        setError(null);
        setProgressStep(null);
        try {
            const pubkey = wallet.publicKey.toBase58();
            const { order, result } = await performSwap({
                walletPubkey: pubkey,
                // /execute validates the signed bytes against the cached
                // order — swap txs must be signed v0 as-is, NOT through the
                // legacy-converting DCA signer.
                signTransaction: wallet.signVersionedTransaction,
                input: {
                    inputMint: fromToken.mint,
                    outputMint: toToken.mint,
                    amount: toBaseUnits(amount, fromToken),
                },
                onStep: setProgressStep,
            });

            const paid = fromBaseUnits(
                result.totalInputAmount ?? order.inAmount,
                fromToken
            );
            const received = fromBaseUnits(
                result.totalOutputAmount ?? order.outAmount,
                toToken
            );

            // Feed the quest engine: Jupiter's /execute lands the swap tx
            // itself, so useWallet.signAndSendTransaction (and thus
            // observeOutgoingTx) never fires for an in-app swap.
            useQuestsStore.getState().recordTx({
                signature: result.signature,
                slot: 0,
                blockTime: Date.now(),
                wallet: pubkey,
                programId: JUPITER_SWAP_PROGRAM_ID,
                instruction: 'app_swap',
            });
            // recordTx enqueues a claim when a quest completes — cash it now.
            void useClaimQueue.getState().flush();

            // Same pet reward as a DCA fill: points + XP + happiness + Care
            // Clock refill, then the home-screen dance.
            rewardSwap();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            useDcaUiStore.getState().requestReaction('dance');
            setSuccess({
                signature: result.signature,
                paidText: `${formatTokenAmount(paid)} ${fromToken.ticker}`,
                receivedText: `${formatTokenAmount(received)} ${toToken.ticker}`,
            });
        } catch (err) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            const message = err instanceof Error ? err.message : String(err);
            // The sheet shows the message, but support reports come from the
            // console — make sure the full Jupiter error body lands there too.
            console.error('swap: swap failed:', message);
            setError(message);
        } finally {
            setSubmitting(false);
        }
    }, [wallet, amount, amountValid, fromToken, toToken]);

    // Fresh form every time the sheet opens; a completed swap resets on close.
    useEffect(() => {
        if (visible) return;
        quoteSeq.current += 1;
        setAmountText('');
        setQuickPick('');
        setQuote(null);
        setQuoteError(null);
        setQuoteLoading(false);
        setSubmitting(false);
        setProgressStep(null);
        setError(null);
        setSuccess(null);
    }, [visible]);

    const estimatedOut = quote ? fromBaseUnits(quote.outAmount, toToken) : null;
    const rate =
        quote && amountValid
            ? fromBaseUnits(quote.outAmount, toToken) / amount
            : null;
    const fromUsd =
        amountValid && prices[fromToken.mint]
            ? amount * prices[fromToken.mint].price
            : null;
    const toUsd =
        estimatedOut !== null && prices[toToken.mint]
            ? estimatedOut * prices[toToken.mint].price
            : null;

    const quickDisabled =
        balance === null || balance <= 0 || submitting
            ? new Set(QUICK_SEGMENTS.map((s) => s.id))
            : undefined;

    const canSwap =
        wallet.connected &&
        amountValid &&
        !exceedsBalance &&
        fromTicker !== toTicker &&
        quote !== null &&
        !quoteLoading &&
        !submitting;

    return (
        <BottomSheet visible={visible} onClose={onClose}>
            <View style={styles.header}>
                <View style={styles.headerButton} />
                <Text style={styles.headerTitle}>Swap</Text>
                <PressableScale
                    onPress={onClose}
                    hitSlop={8}
                    style={styles.headerButton}
                    accessibilityLabel="Close swap"
                >
                    <Ionicons name="close" size={20} color={colors.text} />
                </PressableScale>
            </View>

            <ScrollView
                style={{ maxHeight: Math.min(windowHeight * 0.72, 640) }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.bodyContent}
                keyboardShouldPersistTaps="handled"
            >
                {success !== null ? (
                    <View style={styles.successWrap}>
                        <Animated.View
                            entering={FadeInDown.withInitialValues({
                                opacity: 0,
                                transform: [{ translateY: 8 }, { scale: 0.8 }],
                            })
                                .duration(280)
                                .reduceMotion(ReduceMotion.System)}
                            style={styles.successOrb}
                        >
                            <Ionicons
                                name="checkmark"
                                size={34}
                                color={colors.success}
                            />
                        </Animated.View>
                        <Animated.Text
                            entering={FadeInDown.duration(220)
                                .delay(90)
                                .reduceMotion(ReduceMotion.System)}
                            style={styles.successTitle}
                        >
                            Swap complete
                        </Animated.Text>
                        <Animated.Text
                            entering={FadeInDown.duration(220)
                                .delay(150)
                                .reduceMotion(ReduceMotion.System)}
                            style={styles.successBody}
                        >
                            {`You swapped ${success.paidText} for ${success.receivedText}.`}
                        </Animated.Text>
                        <Animated.View
                            entering={FadeInDown.duration(220)
                                .delay(210)
                                .reduceMotion(ReduceMotion.System)}
                            style={styles.rewardRow}
                        >
                            <View style={styles.rewardChip}>
                                <Ionicons
                                    name="sparkles"
                                    size={12}
                                    color={landing.accent}
                                />
                                <Text style={styles.rewardChipText}>
                                    +{SWAP_REWARD.points} points
                                </Text>
                            </View>
                            <View style={styles.rewardChip}>
                                <Ionicons
                                    name="flash"
                                    size={12}
                                    color={landing.accent}
                                />
                                <Text style={styles.rewardChipText}>
                                    +{SWAP_REWARD.xp} XP
                                </Text>
                            </View>
                            <View style={styles.rewardChip}>
                                <Ionicons
                                    name="paw"
                                    size={12}
                                    color={landing.accent}
                                />
                                <Text style={styles.rewardChipText}>
                                    pet danced
                                </Text>
                            </View>
                        </Animated.View>
                        {success.signature !== '' && (
                            <Text style={styles.successSig} numberOfLines={1}>
                                {`tx ${success.signature.slice(0, 12)}…${success.signature.slice(-6)}`}
                            </Text>
                        )}
                        <View style={styles.successCta}>
                            <Button title="Done" onPress={onClose} />
                        </View>
                    </View>
                ) : (
                    <View style={styles.form}>
                        {/* YOU PAY — hero amount leads, token picked by swipe */}
                        <View style={styles.labelRow}>
                            <Text style={styles.label}>You pay</Text>
                            {wallet.connected && balance === null ? (
                                <Skeleton width={96} height={13} />
                            ) : balance !== null ? (
                                <Text style={styles.labelSide}>
                                    {`Balance: ${formatTokenAmount(balance)} ${fromToken.ticker}`}
                                </Text>
                            ) : null}
                        </View>

                        <FitAmountInput
                            value={amountText}
                            onChangeText={(text) => {
                                setQuickPick('');
                                setAmountText(text.replace(/[^0-9.]/g, ''));
                            }}
                            editable={!submitting}
                            error={exceedsBalance}
                            accessibilityLabel={`Amount of ${fromToken.ticker} to swap`}
                        />
                        <Text
                            style={[
                                styles.amountCaption,
                                exceedsBalance && styles.amountCaptionError,
                            ]}
                        >
                            {exceedsBalance
                                ? `Only ${formatTokenAmount(balance)} ${fromToken.ticker} in your wallet`
                                : fromUsd !== null
                                  ? `≈ ${formatUsdEstimate(fromUsd)}`
                                  : `${fromToken.ticker} amount`}
                        </Text>

                        <TokenSwiper
                            selectedTicker={fromTicker}
                            disabledTicker={toTicker}
                            onSelect={pickFrom}
                            disabled={submitting}
                        />

                        <SegmentedControl
                            options={QUICK_SEGMENTS}
                            value={quickPick}
                            disabledIds={quickDisabled}
                            onChange={(id) => {
                                if (balance === null) return;
                                setQuickPick(id);
                                setAmountText(
                                    quickAmount(balance, Number(id), fromToken)
                                );
                            }}
                        />

                        {/* FLIP */}
                        <PressableScale
                            onPress={flip}
                            style={styles.flipButton}
                            accessibilityRole="button"
                            accessibilityLabel="Flip swap direction"
                        >
                            <Ionicons
                                name="swap-vertical"
                                size={18}
                                color={landing.accent}
                            />
                        </PressableScale>

                        {/* YOU RECEIVE — skeleton breathes while quoting */}
                        <View style={styles.labelRow}>
                            <Text style={styles.label}>You receive</Text>
                            {toUsd !== null && (
                                <Text style={styles.labelSide}>
                                    {`≈ ${formatUsdEstimate(toUsd)}`}
                                </Text>
                            )}
                        </View>

                        <View style={styles.receiveHero}>
                            {quoteLoading ? (
                                <Skeleton
                                    width="55%"
                                    height={44}
                                    borderRadius={radius.md}
                                />
                            ) : (
                                <Animated.Text
                                    key={quote?.outAmount ?? 'idle'}
                                    entering={FadeIn.duration(180).reduceMotion(
                                        ReduceMotion.System
                                    )}
                                    style={styles.receiveAmount}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                >
                                    {estimatedOut !== null
                                        ? `≈ ${formatTokenAmount(estimatedOut)}`
                                        : '–'}
                                </Animated.Text>
                            )}
                        </View>

                        <TokenSwiper
                            selectedTicker={toTicker}
                            disabledTicker={fromTicker}
                            onSelect={setToTicker}
                            disabled={submitting}
                        />

                        {/* QUOTE DETAILS */}
                        {quote !== null && !quoteLoading && (
                            <Animated.View
                                entering={FadeIn.duration(180).reduceMotion(
                                    ReduceMotion.System
                                )}
                                style={styles.quoteCard}
                            >
                                {rate !== null && (
                                    <View style={styles.quoteRow}>
                                        <Text style={styles.quoteKey}>Rate</Text>
                                        <Text style={styles.quoteValue}>
                                            {`1 ${fromToken.ticker} ≈ ${formatTokenAmount(rate)} ${toToken.ticker}`}
                                        </Text>
                                    </View>
                                )}
                                <View style={styles.quoteRow}>
                                    <Ionicons
                                        name="sparkles-outline"
                                        size={12}
                                        color={landing.accent}
                                    />
                                    <Text style={styles.quoteHint}>
                                        {`Feeds your pet +${SWAP_REWARD.points} points, +${SWAP_REWARD.xp} XP. Counts toward quests.`}
                                    </Text>
                                </View>
                            </Animated.View>
                        )}

                        {quoteError !== null && !quoteLoading && (
                            <Text style={styles.errorText}>{quoteError}</Text>
                        )}
                        {error !== null && (
                            <Text style={styles.errorText}>{error}</Text>
                        )}
                        {!wallet.connected && (
                            <Text style={styles.errorText}>
                                Connect your wallet to swap.
                            </Text>
                        )}

                        <Button
                            title={
                                submitting && progressStep
                                    ? STEP_LABELS[progressStep]
                                    : 'Swap'
                            }
                            onPress={handleSwap}
                            disabled={!canSwap}
                            loading={submitting}
                        />
                    </View>
                )}
            </ScrollView>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.sm,
    },
    headerButton: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        color: colors.textStrong,
        fontSize: typography.heading,
        fontFamily: 'DMSans_700Bold',
    },
    bodyContent: {
        paddingBottom: spacing.md,
    },
    form: {
        gap: spacing.sm,
    },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 16,
    },
    label: {
        color: landing.textMuted,
        fontSize: typography.small,
        fontFamily: 'DMSans_600SemiBold',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    labelSide: {
        color: landing.textMuted,
        fontSize: typography.small,
        fontFamily: 'DMSans_500Medium',
        fontVariant: ['tabular-nums'],
    },
    amountCaption: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'DMSans_500Medium',
        textAlign: 'center',
        marginTop: -spacing.xs,
    },
    amountCaptionError: {
        color: colors.danger,
    },
    flipButton: {
        alignSelf: 'center',
        width: 36,
        height: 36,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: landing.glassActive,
        borderWidth: 1,
        borderColor: landing.glassBorder,
    },
    receiveHero: {
        alignSelf: 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 56,
    },
    receiveAmount: {
        color: colors.textStrong,
        fontSize: 40,
        fontFamily: 'DMSans_800ExtraBold',
        fontVariant: ['tabular-nums'],
        paddingVertical: spacing.xs,
    },
    quoteCard: {
        backgroundColor: 'rgba(141,201,246,0.08)',
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: 'rgba(141,201,246,0.25)',
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        gap: spacing.xs,
    },
    quoteRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.xs,
    },
    quoteKey: {
        color: landing.textMuted,
        fontSize: typography.small,
        fontFamily: 'DMSans_500Medium',
    },
    quoteValue: {
        color: landing.text,
        fontSize: typography.small,
        fontFamily: 'DMSans_600SemiBold',
        fontVariant: ['tabular-nums'],
    },
    quoteHint: {
        flex: 1,
        color: landing.accent,
        fontSize: typography.small,
        fontFamily: 'DMSans_500Medium',
    },
    errorText: {
        color: colors.danger,
        fontSize: typography.small,
        fontFamily: 'DMSans_500Medium',
    },
    successWrap: {
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.lg,
    },
    successOrb: {
        width: 64,
        height: 64,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(126,214,167,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(126,214,167,0.4)',
    },
    successTitle: {
        color: colors.textStrong,
        fontSize: typography.title,
        fontFamily: 'DMSans_700Bold',
    },
    successBody: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'DMSans_400Regular',
        textAlign: 'center',
    },
    rewardRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: spacing.xs,
    },
    rewardChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(141,201,246,0.10)',
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: 'rgba(141,201,246,0.35)',
        paddingVertical: 5,
        paddingHorizontal: spacing.sm,
    },
    rewardChipText: {
        color: landing.accent,
        fontSize: typography.small,
        fontFamily: 'DMSans_600SemiBold',
    },
    successSig: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'DMSans_500Medium',
        fontVariant: ['tabular-nums'],
    },
    successCta: {
        alignSelf: 'stretch',
    },
});
