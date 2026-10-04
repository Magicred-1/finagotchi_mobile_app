import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
    Extrapolation,
    interpolate,
    runOnJS,
    scrollTo,
    useAnimatedRef,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useSharedValue,
    type SharedValue,
} from 'react-native-reanimated';

import { PressableScale } from '../../components/PressableScale';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type { SupportedToken } from '../../services/dca';
import { formatChange, formatPrice, type TokenQuote } from './prices';
import { TokenLogo } from './TokenLogo';

/** Row height drives snapToInterval and the selection band — keep in sync. */
const ROW_HEIGHT = 64;
const VISIBLE_ROWS = 5;
/** Extra rows of padding so the first/last token can reach the center. */
const EDGE_PADDING = ROW_HEIGHT * Math.floor(VISIBLE_ROWS / 2);
/**
 * Settle after a drag that produced no fling: if momentum begins within this
 * window the drag settle is cancelled (the fling's momentum-end wins).
 */
const DRAG_SETTLE_MS = 80;

type Props = {
    tokens: SupportedToken[];
    /** Currently selected ticker (null = nothing chosen yet). */
    selectedTicker: string | null;
    /** Live quotes keyed by mint, from useTokenPrices. */
    quotes: Record<string, TokenQuote>;
    /** Centered row changed (scroll settle or tap-to-center). */
    onSelect: (ticker: string) => void;
    /** The already-selected center row was tapped — confirm the pick. */
    onConfirm: (ticker: string) => void;
};

function indexForOffset(offsetY: number, count: number): number {
    return Math.min(count - 1, Math.max(0, Math.round(offsetY / ROW_HEIGHT)));
}

function WheelRow({
    token,
    index,
    quote,
    selected,
    scrollY,
    onPress,
}: {
    token: SupportedToken;
    index: number;
    quote: TokenQuote | undefined;
    selected: boolean;
    scrollY: SharedValue<number>;
    onPress: () => void;
}) {
    // Drum feel: rows fade and shrink as they leave the center band.
    const animatedStyle = useAnimatedStyle(() => {
        const distance = Math.abs(
            (index * ROW_HEIGHT - scrollY.value) / ROW_HEIGHT
        );
        return {
            opacity: interpolate(
                distance,
                [0, 1, 2.5],
                [1, 0.5, 0.2],
                Extrapolation.CLAMP
            ),
            transform: [
                {
                    scale: interpolate(
                        distance,
                        [0, 1, 2],
                        [1, 0.94, 0.88],
                        Extrapolation.CLAMP
                    ),
                },
            ],
        };
    });

    const changeUp = (quote?.change24h ?? 0) >= 0;

    return (
        <Animated.View style={[styles.row, animatedStyle]}>
            <PressableScale
                onPress={onPress}
                style={styles.rowPressable}
                accessibilityRole="button"
                accessibilityLabel={`${token.ticker}, ${token.name}`}
            >
                <TokenLogo ticker={token.ticker} size={32} />
                <View style={styles.rowTextCol}>
                    <Text
                        style={[
                            styles.rowTicker,
                            selected && styles.rowTickerSelected,
                        ]}
                    >
                        {token.ticker}
                    </Text>
                    <Text style={styles.rowName} numberOfLines={1}>
                        {token.name}
                    </Text>
                </View>
                <View style={styles.rowQuoteCol}>
                    <Text
                        style={[
                            styles.rowPrice,
                            selected && styles.rowTickerSelected,
                        ]}
                    >
                        {quote ? formatPrice(quote.price) : '–'}
                    </Text>
                    {quote ? (
                        <Text
                            style={[
                                styles.rowChange,
                                changeUp
                                    ? styles.rowChangeUp
                                    : styles.rowChangeDown,
                            ]}
                        >
                            {formatChange(quote.change24h)}
                        </Text>
                    ) : null}
                </View>
            </PressableScale>
        </Animated.View>
    );
}

/**
 * iOS-style vertical drum picker for the DCA token. Hand-rolled on a
 * reanimated scroll view (snapToInterval + per-row distance interpolation)
 * so no new dependency — and no new native code — ships OTA.
 */
export function TokenWheelPicker({
    tokens,
    selectedTicker,
    quotes,
    onSelect,
    onConfirm,
}: Props) {
    const selectedIndex = Math.max(
        0,
        tokens.findIndex((token) => token.ticker === selectedTicker)
    );

    const scrollRef = useAnimatedRef<Animated.ScrollView>();
    const scrollY = useSharedValue(selectedIndex * ROW_HEIGHT);
    // Last index that produced a selection — dedupes haptics/callbacks across
    // drag-end, momentum-end and tap paths.
    const lastSettledIndex = useRef(selectedIndex);
    const didInitScroll = useRef(false);
    const dragSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const onSelectRef = useRef(onSelect);
    onSelectRef.current = onSelect;
    const onConfirmRef = useRef(onConfirm);
    onConfirmRef.current = onConfirm;
    const tokensRef = useRef(tokens);
    tokensRef.current = tokens;

    const settle = useCallback((offsetY: number) => {
        const index = indexForOffset(offsetY, tokensRef.current.length);
        if (index === lastSettledIndex.current) return;
        lastSettledIndex.current = index;
        Haptics.selectionAsync();
        onSelectRef.current(tokensRef.current[index].ticker);
    }, []);

    const cancelDragSettle = useCallback(() => {
        if (dragSettleTimer.current) {
            clearTimeout(dragSettleTimer.current);
            dragSettleTimer.current = null;
        }
    }, []);

    // A drag without a fling never fires momentum events; settle on a short
    // timer and let a real fling cancel it.
    const scheduleDragSettle = useCallback(
        (offsetY: number) => {
            cancelDragSettle();
            dragSettleTimer.current = setTimeout(
                () => settle(offsetY),
                DRAG_SETTLE_MS
            );
        },
        [cancelDragSettle, settle]
    );

    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollY.value = event.contentOffset.y;
        },
        onEndDrag: (event) => {
            runOnJS(scheduleDragSettle)(event.contentOffset.y);
        },
        onMomentumBegin: () => {
            runOnJS(cancelDragSettle)();
        },
        onMomentumEnd: (event) => {
            runOnJS(cancelDragSettle)();
            runOnJS(settle)(event.contentOffset.y);
        },
    });

    useEffect(() => cancelDragSettle, [cancelDragSettle]);

    // No prefill: the first token is the default selection (the row the drum
    // opens on). No haptic — nothing the user did yet.
    useEffect(() => {
        if (selectedTicker === null && tokens.length > 0) {
            lastSettledIndex.current = 0;
            onSelectRef.current(tokens[0].ticker);
        }
    }, [selectedTicker, tokens]);

    const handleLayout = useCallback(() => {
        if (didInitScroll.current) return;
        didInitScroll.current = true;
        scrollTo(scrollRef, 0, selectedIndex * ROW_HEIGHT, false);
        scrollY.value = selectedIndex * ROW_HEIGHT;
    }, [selectedIndex, scrollRef, scrollY]);

    const handleRowPress = useCallback(
        (index: number) => {
            const ticker = tokensRef.current[index].ticker;
            if (index === lastSettledIndex.current) {
                // Tapping the centered row confirms the pick (pick = advance).
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onConfirmRef.current(ticker);
                return;
            }
            // Off-center row: scroll it to the band and select it.
            lastSettledIndex.current = index;
            Haptics.selectionAsync();
            onSelectRef.current(ticker);
            scrollTo(scrollRef, 0, index * ROW_HEIGHT, true);
        },
        [scrollRef]
    );

    return (
        <View style={styles.container}>
            <View style={styles.selectionBand} pointerEvents="none" />
            <Animated.ScrollView
                ref={scrollRef}
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                snapToInterval={ROW_HEIGHT}
                decelerationRate="fast"
                nestedScrollEnabled
                onLayout={handleLayout}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
            >
                {tokens.map((token, index) => (
                    <WheelRow
                        key={token.mint}
                        token={token}
                        index={index}
                        quote={quotes[token.mint]}
                        selected={selectedIndex === index}
                        scrollY={scrollY}
                        onPress={() => handleRowPress(index)}
                    />
                ))}
            </Animated.ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        height: ROW_HEIGHT * VISIBLE_ROWS,
        borderRadius: radius.md,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
    },
    selectionBand: {
        position: 'absolute',
        top: EDGE_PADDING,
        left: 0,
        right: 0,
        height: ROW_HEIGHT,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: colors.primary,
        backgroundColor: 'rgba(53,215,255,0.08)',
        zIndex: 1,
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingVertical: EDGE_PADDING,
    },
    row: {
        height: ROW_HEIGHT,
        justifyContent: 'center',
    },
    rowPressable: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.md,
    },
    rowTextCol: {
        flex: 1,
        gap: 1,
    },
    rowTicker: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
    },
    rowTickerSelected: {
        color: colors.primary,
    },
    rowName: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
    },
    rowQuoteCol: {
        alignItems: 'flex-end',
        gap: 1,
    },
    rowPrice: {
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
    },
    rowChange: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
    },
    rowChangeUp: {
        color: colors.success,
    },
    rowChangeDown: {
        color: colors.danger,
    },
});
