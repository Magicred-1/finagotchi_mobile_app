import React, { useEffect, useState } from 'react';
import {
    AccessibilityInfo,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
    FadeIn,
    FadeInDown,
    FadeOut,
    ReduceMotion,
} from 'react-native-reanimated';

import {
    isOverdue,
    usePlanStore,
    SUPPORTED_TOKENS,
    type DcaPlan,
} from '../../services/dca';
import { PressableScale } from '../../components/PressableScale';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { DCAWizardSheet } from './DCAWizardSheet';
import { TokenLogo } from './TokenLogo';
import { cadenceAbbrev, formatUsdc, timeUntilShort } from './format';
import { useNowSeconds } from './useNowSeconds';

/** How long each xStock logo stays before crossfading to the next. */
const LOGO_ROTATE_MS = 1600;

/**
 * One plan in the horizontal strip: logo, buy rule, and a live "next in"
 * countdown that ticks so the status never goes stale on screen.
 */
function PlanChip({ plan, index }: { plan: DcaPlan; index: number }) {
    const nowSec = useNowSeconds();
    const overdue = isOverdue(plan);

    return (
        <Animated.View
            entering={FadeInDown.withInitialValues({
                opacity: 0,
                transform: [{ translateY: 6 }],
            })
                .delay(index * 50)
                .duration(220)
                .reduceMotion(ReduceMotion.System)}
        >
            <PressableScale
                onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/dca/${plan.id}`);
                }}
                style={[styles.chip, overdue && styles.chipOverdue]}
                accessibilityRole="button"
                accessibilityLabel={`${plan.ticker} auto-buy plan`}
            >
                <TokenLogo ticker={plan.ticker} size={26} />
                <View style={styles.chipTextCol}>
                    <Text style={styles.chipTitle}>
                        {`${plan.ticker} · ${formatUsdc(plan.amountPerTick)}/${cadenceAbbrev(plan.intervalSec)}`}
                    </Text>
                    <Text
                        style={[
                            styles.chipSubtitle,
                            overdue && styles.chipSubtitleOverdue,
                        ]}
                    >
                        {overdue
                            ? 'buy overdue'
                            : `next in ${timeUntilShort(plan.nextExecutionAt, nowSec)}`}
                    </Text>
                </View>
                <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={overdue ? colors.warning : colors.textMuted}
                />
            </PressableScale>
        </Animated.View>
    );
}

/**
 * Crossfades through the xStocks logos — the banner's "this is what you'd be
 * buying" signal without a static icon.
 */
function RotatingTokenLogo() {
    const [index, setIndex] = useState(0);

    useEffect(() => {
        // Decorative loop: stopped entirely under reduced motion.
        let interval: ReturnType<typeof setInterval> | null = null;
        let subscription: { remove: () => void } | null = null;
        AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
            if (reduced) return;
            interval = setInterval(
                () => setIndex((i) => (i + 1) % SUPPORTED_TOKENS.length),
                LOGO_ROTATE_MS
            );
            subscription = AccessibilityInfo.addEventListener(
                'reduceMotionChanged',
                (nowReduced) => {
                    if (nowReduced && interval) {
                        clearInterval(interval);
                        interval = null;
                    }
                }
            );
        });
        return () => {
            if (interval) clearInterval(interval);
            subscription?.remove();
        };
    }, []);

    const ticker = SUPPORTED_TOKENS[index].ticker;

    return (
        <View style={styles.logoOrb}>
            <Animated.View
                key={ticker}
                entering={FadeIn.duration(300).reduceMotion(ReduceMotion.System)}
                exiting={FadeOut.duration(300).reduceMotion(ReduceMotion.System)}
                style={StyleSheet.absoluteFill}
            >
                <TokenLogo ticker={ticker} size={40} />
            </Animated.View>
        </View>
    );
}

export function DCAHome() {
    const plans = usePlanStore((state) => state.plans);
    const [wizardOpen, setWizardOpen] = useState(false);

    const activePlans = plans.filter((plan) => plan.status === 'active');
    const overdueCount = activePlans.filter(isOverdue).length;

    const openWizard = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setWizardOpen(true);
    };

    return (
        <View>
            {activePlans.length === 0 ? (
                <PressableScale
                    onPress={openWizard}
                    style={styles.banner}
                    accessibilityRole="button"
                >
                    <View style={styles.bannerTint} />
                    <RotatingTokenLogo />
                    <View style={styles.bannerText}>
                        <Text style={styles.bannerTitle}>
                            Farm points & XP on autopilot
                        </Text>
                        <Text style={styles.bannerBody} numberOfLines={1}>
                            by buying stocks automatically
                        </Text>
                    </View>
                    <View style={styles.bannerChevron}>
                        <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={colors.primary}
                        />
                    </View>
                </PressableScale>
            ) : (
                <View style={styles.card}>
                    {overdueCount > 0 && (
                        <View style={styles.overdueBanner}>
                            <Ionicons
                                name="alert-circle"
                                size={14}
                                color={colors.warning}
                            />
                            <Text style={styles.overdueBannerText}>
                                {overdueCount === 1
                                    ? '1 plan overdue: buys are falling behind'
                                    : `${overdueCount} plans overdue: buys are falling behind`}
                            </Text>
                        </View>
                    )}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chipRow}
                    >
                        {activePlans.map((plan, index) => (
                            <PlanChip key={plan.id} plan={plan} index={index} />
                        ))}
                        <PressableScale
                            onPress={openWizard}
                            style={styles.newChip}
                            accessibilityRole="button"
                        >
                            <Ionicons
                                name="add"
                                size={14}
                                color={colors.primary}
                            />
                            <Text style={styles.newChipText}>New plan</Text>
                        </PressableScale>
                    </ScrollView>
                </View>
            )}

            <DCAWizardSheet
                visible={wizardOpen}
                onClose={() => setWizardOpen(false)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        overflow: 'hidden',
    },
    bannerTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(53,215,255,0.07)',
    },
    logoOrb: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    bannerText: {
        flex: 1,
        gap: 2,
    },
    bannerTitle: {
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
    },
    bannerBody: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
    },
    bannerChevron: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(53,215,255,0.12)',
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        gap: spacing.sm,
    },
    overdueBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255,209,102,0.10)',
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: 'rgba(255,209,102,0.35)',
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
    },
    overdueBannerText: {
        color: colors.warning,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
    },
    chipRow: {
        alignItems: 'center',
        gap: spacing.sm,
        paddingRight: spacing.sm,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.surfaceLight,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },
    chipOverdue: {
        borderColor: 'rgba(255,209,102,0.5)',
        backgroundColor: 'rgba(255,209,102,0.08)',
    },
    chipTextCol: {
        gap: 1,
    },
    chipTitle: {
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        fontVariant: ['tabular-nums'],
    },
    chipSubtitle: {
        color: colors.textMuted,
        fontSize: 11,
        fontFamily: 'Poppins_400Regular',
        fontVariant: ['tabular-nums'],
    },
    chipSubtitleOverdue: {
        color: colors.warning,
        fontFamily: 'Poppins_500Medium',
    },
    newChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.primary,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
    },
    newChipText: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
    },
});
