import React, { useCallback, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    ReduceMotion,
    SlideInLeft,
    SlideInRight,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';

import { PressableScale } from '../../components/PressableScale';
import { SWAP_TOKENS } from '../../services/swap';
import {
    landing,
    radius,
    spacing,
    springs,
    typography,
} from '../../theme/tokens';
import { TokenLogo } from '../dca/TokenLogo';

/** Finger travel / flick speed that commits a one-token step. */
const SWIPE_COMMIT_PX = 44;
const SWIPE_COMMIT_VELOCITY = 380;
/** Finger-follow damping so the token trails the drag without leading it. */
const DRAG_FOLLOW = 0.35;

/**
 * Gesture token selector: swipe left/right anywhere on the card (or tap the
 * chevrons) to walk the swap whitelist one token at a time. The token trails
 * the finger while dragging, then slides in from the swipe direction with a
 * haptic tick. The pair's other side is skipped so both sides never match.
 */
export function TokenSwiper({
    selectedTicker,
    disabledTicker,
    onSelect,
    disabled = false,
}: {
    selectedTicker: string;
    /** The pair's other side — skipped when stepping. */
    disabledTicker: string;
    onSelect: (ticker: string) => void;
    disabled?: boolean;
}) {
    const dragX = useSharedValue(0);
    /** Last step direction — picks which edge the next token slides in from. */
    const directionRef = useRef(1);

    const index = Math.max(
        0,
        SWAP_TOKENS.findIndex((token) => token.ticker === selectedTicker)
    );
    const token = SWAP_TOKENS[index];

    const step = useCallback(
        (delta: number) => {
            directionRef.current = delta;
            const count = SWAP_TOKENS.length;
            let next = index;
            do {
                next = (next + delta + count) % count;
            } while (SWAP_TOKENS[next].ticker === disabledTicker);
            onSelect(SWAP_TOKENS[next].ticker);
        },
        [index, disabledTicker, onSelect]
    );

    const stepWithFeedback = useCallback(
        (delta: number) => {
            Haptics.selectionAsync();
            step(delta);
        },
        [step]
    );

    // Horizontal pan on the card; vertical scroll keeps priority so the
    // sheet still scrolls when the gesture starts on the selector.
    const pan = Gesture.Pan()
        .enabled(!disabled)
        .activeOffsetX([-12, 12])
        .failOffsetY([-14, 14])
        .onUpdate((event) => {
            dragX.value = event.translationX * DRAG_FOLLOW;
        })
        .onEnd((event) => {
            const delta =
                event.translationX <= -SWIPE_COMMIT_PX ||
                event.velocityX <= -SWIPE_COMMIT_VELOCITY
                    ? 1
                    : event.translationX >= SWIPE_COMMIT_PX ||
                        event.velocityX >= SWIPE_COMMIT_VELOCITY
                      ? -1
                      : 0;
            if (delta !== 0) runOnJS(stepWithFeedback)(delta);
            dragX.value = withSpring(0, {
                ...springs.snappy,
                reduceMotion: ReduceMotion.System,
            });
        });

    const dragStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: dragX.value }],
    }));

    const entering = (directionRef.current >= 0 ? SlideInRight : SlideInLeft)
        .duration(200)
        .reduceMotion(ReduceMotion.System);

    return (
        <GestureDetector gesture={pan}>
            <View style={styles.swiper}>
                <PressableScale
                    onPress={() => stepWithFeedback(-1)}
                    disabled={disabled}
                    hitSlop={8}
                    style={styles.arrow}
                    accessibilityRole="button"
                    accessibilityLabel="Previous token"
                >
                    <Ionicons
                        name="chevron-back"
                        size={18}
                        color={landing.accent}
                    />
                </PressableScale>
                <View style={styles.tokenSlot}>
                    <Animated.View
                        key={token.ticker}
                        entering={entering}
                        style={[styles.tokenInner, dragStyle]}
                    >
                        <TokenLogo ticker={token.ticker} size={34} />
                        <View style={styles.tokenText}>
                            <Text style={styles.ticker}>{token.ticker}</Text>
                            <Text style={styles.name} numberOfLines={1}>
                                {token.name}
                            </Text>
                        </View>
                    </Animated.View>
                </View>
                <PressableScale
                    onPress={() => stepWithFeedback(1)}
                    disabled={disabled}
                    hitSlop={8}
                    style={styles.arrow}
                    accessibilityRole="button"
                    accessibilityLabel="Next token"
                >
                    <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={landing.accent}
                    />
                </PressableScale>
            </View>
        </GestureDetector>
    );
}

const styles = StyleSheet.create({
    swiper: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'stretch',
        backgroundColor: landing.glassActive,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: landing.glassBorder,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.xs,
    },
    arrow: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tokenSlot: {
        flex: 1,
        alignItems: 'center',
        overflow: 'hidden',
    },
    tokenInner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    tokenText: {
        alignItems: 'flex-start',
    },
    ticker: {
        color: landing.text,
        fontSize: typography.heading,
        fontFamily: 'DMSans_700Bold',
    },
    name: {
        color: landing.textMuted,
        fontSize: typography.small,
        fontFamily: 'DMSans_500Medium',
        maxWidth: 160,
    },
});
