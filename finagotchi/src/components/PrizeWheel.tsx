import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
    Easing,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { BottomSheet } from './BottomSheet';
import { PressableScale } from './PressableScale';
import { MILESTONES, useCheckinStore } from '../features/checkin/store';
import { BACKGROUND_COLORS, usePetStore } from '../features/pet/store';
import {
    WHEEL_SEGMENT_COUNT,
    awardPrize,
    buildWheel,
    describePrize,
    pickSegment,
    type WheelSegment,
} from '../features/wheel/prizes';
import { localDayKey, useWheelStore } from '../features/wheel/store';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = {
    visible: boolean;
    onClose: () => void;
};

type Phase = 'ready' | 'spinning' | 'revealed';

const SPIN_TURNS = 5;
const SPIN_DURATION_MS = 4200;
const TICK_MS = 300;

const SVG_SIZE = 300;
const SVG_CENTER = SVG_SIZE / 2;
const WHEEL_RADIUS = 138;

function polarToCartesian(angleDeg: number, radius: number) {
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
        x: SVG_CENTER + radius * Math.cos(angleRad),
        y: SVG_CENTER + radius * Math.sin(angleRad),
    };
}

function segmentPath(index: number, segmentCount: number): string {
    const segmentAngle = 360 / segmentCount;
    const start = polarToCartesian(-90 + index * segmentAngle, WHEEL_RADIUS);
    const end = polarToCartesian(-90 + (index + 1) * segmentAngle, WHEEL_RADIUS);

    return [
        `M ${SVG_CENTER} ${SVG_CENTER}`,
        `L ${start.x} ${start.y}`,
        `A ${WHEEL_RADIUS} ${WHEEL_RADIUS} 0 0 1 ${end.x} ${end.y}`,
        'Z',
    ].join(' ');
}

function segmentColors(segment: WheelSegment): { fill: string; stroke: string } {
    switch (segment.prize.type) {
        case 'points':
            return {
                fill: 'rgba(255,209,102,0.14)',
                stroke: 'rgba(255,209,102,0.32)',
            };
        case 'xp':
            return {
                fill: 'rgba(53,215,255,0.12)',
                stroke: 'rgba(53,215,255,0.30)',
            };
        case 'background': {
            const [fill, stroke] = BACKGROUND_COLORS[segment.prize.id];
            return { fill, stroke };
        }
        case 'accessory':
            return {
                fill: 'rgba(153,69,255,0.16)',
                stroke: 'rgba(153,69,255,0.40)',
            };
    }
}

function segmentLabel(segment: WheelSegment): { emoji: string; text: string } {
    const prize = segment.prize;

    switch (prize.type) {
        case 'points':
            return { emoji: '💰', text: `${prize.amount}` };
        case 'xp':
            return { emoji: '⚡', text: `${prize.amount} XP` };
        case 'background':
        case 'accessory': {
            const { emoji, label } = describePrize(prize);
            return { emoji, text: label };
        }
    }
}

export default function PrizeWheel({ visible, onClose }: Props) {
    const { width } = useWindowDimensions();
    const wheelSize = Math.min(width * 0.78, SVG_SIZE);

    const streak = useCheckinStore((state) => state.streak);
    const hasCheckedInToday = useCheckinStore(
        (state) => state.hasCheckedInToday()
    );
    const ownedBackgrounds = usePetStore((state) => state.ownedBackgrounds);
    const ownedAccessories = usePetStore((state) => state.ownedAccessories);
    const lastSpinDay = useWheelStore((state) => state.lastSpinDay);
    const markSpun = useWheelStore((state) => state.markSpun);

    const [segments, setSegments] = useState<WheelSegment[]>([]);
    const [phase, setPhase] = useState<Phase>('ready');
    const [resultIndex, setResultIndex] = useState<number | null>(null);

    const rotation = useSharedValue(0);
    const tickInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    const canSpin = hasCheckedInToday && lastSpinDay !== localDayKey();
    const isMilestoneDay = MILESTONES.includes(streak);
    const segmentAngle = 360 / WHEEL_SEGMENT_COUNT;

    useEffect(() => {
        if (!visible) return;

        setSegments(
            buildWheel({
                ownedBackgrounds,
                ownedAccessories,
                streak,
                isMilestoneDay,
            })
        );
        setPhase('ready');
        setResultIndex(null);
        rotation.value = 0;
    }, [visible, ownedBackgrounds, ownedAccessories, streak, isMilestoneDay, rotation]);

    useEffect(() => {
        return () => {
            if (tickInterval.current) {
                clearInterval(tickInterval.current);
            }
        };
    }, []);

    const wheelStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }));

    function stopTicks() {
        if (tickInterval.current) {
            clearInterval(tickInterval.current);
            tickInterval.current = null;
        }
    }

    function finishSpin(index: number) {
        stopTicks();
        awardPrize(segments[index].prize);
        markSpun();
        setResultIndex(index);
        setPhase('revealed');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    function handleSpin() {
        if (phase !== 'ready' || segments.length === 0) return;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setPhase('spinning');

        tickInterval.current = setInterval(() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }, TICK_MS);

        const index = pickSegment(segments, Math.random);
        // Land the segment's center on the top pointer: rotate past it once
        // (360°) minus its center angle, plus several full turns for drama.
        const target =
            360 * SPIN_TURNS + (360 - (index + 0.5) * segmentAngle);

        rotation.value = withTiming(
            target,
            {
                duration: SPIN_DURATION_MS,
                easing: Easing.bezier(0.15, 0.85, 0.15, 1),
            },
            (finished) => {
                if (finished) {
                    runOnJS(finishSpin)(index);
                }
            }
        );
    }

    const result = resultIndex !== null ? describePrize(segments[resultIndex].prize) : null;

    const spinButtonLabel = useMemo(() => {
        if (phase === 'spinning') return '…';
        return 'SPIN';
    }, [phase]);

    return (
        <BottomSheet visible={visible} onClose={onClose} title="Daily Wheel">
            <View style={styles.container}>
                {!canSpin ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyEmoji}>🎡</Text>
                        <Text style={styles.emptyTitle}>
                            {hasCheckedInToday
                                ? "You've spun today!"
                                : 'Check in to spin'}
                        </Text>
                        <Text style={styles.emptyBody}>
                            {hasCheckedInToday
                                ? 'Come back tomorrow for another spin.'
                                : 'Do your daily check-in (first feed of the day) for a free spin at rare styles.'}
                        </Text>
                    </View>
                ) : (
                    <>
                        {isMilestoneDay && (
                            <View style={styles.milestoneBanner}>
                                <Text style={styles.milestoneText}>
                                    🔥 {streak}-day milestone — a rare prize is
                                    guaranteed!
                                </Text>
                            </View>
                        )}

                        <View style={[styles.wheelWrap, { width: wheelSize, height: wheelSize }]}>
                            <View style={styles.pointer} />

                            <Animated.View style={[styles.wheel, wheelStyle]}>
                                <Svg
                                    width={wheelSize}
                                    height={wheelSize}
                                    viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
                                >
                                    {segments.map((segment, index) => {
                                        const { fill, stroke } = segmentColors(segment);
                                        return (
                                            <Path
                                                key={index}
                                                d={segmentPath(index, segments.length)}
                                                fill={fill}
                                                stroke={stroke}
                                                strokeWidth={1.5}
                                            />
                                        );
                                    })}
                                </Svg>

                                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                                    {segments.map((segment, index) => {
                                        const { emoji, text } = segmentLabel(segment);
                                        const mid = index * segmentAngle + segmentAngle / 2;
                                        return (
                                            <View
                                                key={index}
                                                style={[
                                                    styles.labelArm,
                                                    { transform: [{ rotate: `${mid}deg` }] },
                                                ]}
                                            >
                                                <View
                                                    style={[
                                                        styles.labelCounter,
                                                        { transform: [{ rotate: `${-mid}deg` }] },
                                                    ]}
                                                >
                                                    <View style={{ alignItems: 'center' }}>
                                                        <Text style={styles.labelEmoji}>{emoji}</Text>
                                                        <Text style={styles.labelText} numberOfLines={1}>
                                                            {text}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            </Animated.View>

                            {phase !== 'revealed' && (
                                <View style={styles.hub} pointerEvents="box-none">
                                    <PressableScale
                                        onPress={handleSpin}
                                        disabled={phase !== 'ready'}
                                        style={[
                                            styles.hubButton,
                                            phase !== 'ready' && styles.hubButtonDisabled,
                                        ]}
                                    >
                                        <Text style={styles.hubText}>{spinButtonLabel}</Text>
                                    </PressableScale>
                                </View>
                            )}
                        </View>

                        {phase === 'revealed' && result ? (
                            <View style={styles.resultCard}>
                                <Text style={styles.resultEmoji}>{result.emoji}</Text>
                                <Text style={styles.resultLabel}>You won {result.label}!</Text>
                                <Text style={styles.resultDetail}>{result.detail}</Text>
                                <PressableScale onPress={onClose} style={styles.collectButton}>
                                    <Text style={styles.collectText}>Collect</Text>
                                </PressableScale>
                            </View>
                        ) : (
                            <Text style={styles.hint}>
                                One free spin per check-in. Rare styles can also
                                be bought with points in Collectibles.
                            </Text>
                        )}
                    </>
                )}
            </View>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        paddingBottom: 32,
        gap: spacing.lg,
    },
    emptyState: {
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.xl,
    },
    emptyEmoji: {
        fontSize: 40,
    },
    emptyTitle: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_700Bold',
    },
    emptyBody: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 24,
        maxWidth: 300,
    },
    milestoneBanner: {
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        backgroundColor: 'rgba(255,142,74,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,142,74,0.25)',
    },
    milestoneText: {
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
    },
    wheelWrap: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    pointer: {
        position: 'absolute',
        top: -4,
        alignSelf: 'center',
        width: 0,
        height: 0,
        borderLeftWidth: 9,
        borderRightWidth: 9,
        borderBottomWidth: 16,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: colors.warning,
        zIndex: 10,
    },
    wheel: {
        width: '100%',
        height: '100%',
    },
    labelArm: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        alignItems: 'center',
    },
    labelCounter: {
        // Rim inset; the arm is full-height, so the label sits this far
        // below the wheel's top edge (its rotation point is the hub).
        marginTop: 18,
        alignItems: 'center',
    },
    labelEmoji: {
        fontSize: 15,
    },
    labelText: {
        color: colors.text,
        fontSize: 10,
        fontFamily: 'Poppins_700Bold',
        maxWidth: 64,
    },
    hub: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    hubButton: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
        borderWidth: 2,
        borderColor: colors.primary,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
        elevation: 8,
    },
    hubButtonDisabled: {
        opacity: 0.6,
    },
    hubText: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: 'Poppins_800ExtraBold',
        letterSpacing: 1,
    },
    resultCard: {
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.md,
    },
    resultEmoji: {
        fontSize: 44,
    },
    resultLabel: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
    },
    resultDetail: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 20,
        maxWidth: 300,
    },
    collectButton: {
        marginTop: spacing.sm,
        paddingVertical: spacing.sm + spacing.xs,
        paddingHorizontal: spacing.xl,
        borderRadius: radius.pill,
        backgroundColor: colors.primary,
    },
    collectText: {
        color: colors.background,
        fontSize: typography.body,
        fontFamily: 'Poppins_800ExtraBold',
    },
    hint: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 20,
        maxWidth: 300,
    },
});
