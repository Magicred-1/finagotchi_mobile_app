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

/** Row height drives snapToInterval and the selection band — keep in sync. */
const ROW_HEIGHT = 64;
const VISIBLE_ROWS = 5;
/**
 * Settle after a drag that produced no fling: if momentum begins within this
 * window the drag settle is cancelled (the fling's momentum-end wins).
 */
const DRAG_SETTLE_MS = 80;

export type WheelItem = {
    id: string;
    title: string;
    /** Muted second line under the title. */
    subtitle?: string;
    /** Leading node (e.g. a token logo). */
    leading?: React.ReactNode;
    /** Right-aligned primary line (e.g. a price). */
    trailingTitle?: string;
    /** Right-aligned second line, tinted success/danger by `trailingUp`. */
    trailingSubtitle?: string;
    trailingUp?: boolean;
};

type Props = {
    items: WheelItem[];
    /** Currently selected item id (null = nothing chosen yet). */
    selectedId: string | null;
    /** Centered row changed (scroll settle or tap-to-center). */
    onSelect: (id: string) => void;
    /**
     * The already-selected center row was tapped — confirm the pick.
     * Optional: pickers without a confirm action (cadence) select on scroll.
     */
    onConfirm?: (id: string) => void;
    /**
     * Explicit drum height (fills the wizard step). Defaults to
     * ROW_HEIGHT × VISIBLE_ROWS. Edge padding is computed symmetrically from
     * the height so the center row and selection band stay centered.
     */
    height?: number;
};

function indexForOffset(offsetY: number, count: number): number {
    return Math.min(count - 1, Math.max(0, Math.round(offsetY / ROW_HEIGHT)));
}

function WheelRow({
    item,
    index,
    selected,
    scrollY,
    onPress,
}: {
    item: WheelItem;
    index: number;
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

    return (
        <Animated.View style={[styles.row, animatedStyle]}>
            <PressableScale
                onPress={onPress}
                style={styles.rowPressable}
                accessibilityRole="button"
                accessibilityLabel={
                    item.subtitle ? `${item.title}, ${item.subtitle}` : item.title
                }
            >
                {item.leading}
                <View style={styles.rowTextCol}>
                    <Text
                        style={[
                            styles.rowTitle,
                            selected && styles.rowTitleSelected,
                        ]}
                    >
                        {item.title}
                    </Text>
                    {item.subtitle ? (
                        <Text style={styles.rowSubtitle} numberOfLines={1}>
                            {item.subtitle}
                        </Text>
                    ) : null}
                </View>
                {item.trailingTitle ? (
                    <View style={styles.rowTrailingCol}>
                        <Text
                            style={[
                                styles.rowTrailingTitle,
                                selected && styles.rowTitleSelected,
                            ]}
                        >
                            {item.trailingTitle}
                        </Text>
                        {item.trailingSubtitle ? (
                            <Text
                                style={[
                                    styles.rowTrailingSubtitle,
                                    item.trailingUp
                                        ? styles.rowTrailingUp
                                        : styles.rowTrailingDown,
                                ]}
                            >
                                {item.trailingSubtitle}
                            </Text>
                        ) : null}
                    </View>
                ) : null}
            </PressableScale>
        </Animated.View>
    );
}

/**
 * iOS-style vertical drum picker. Hand-rolled on a reanimated scroll view
 * (snapToInterval + per-row distance interpolation) so no new dependency —
 * and no new native code — ships OTA. Token and cadence pickers are thin
 * adapters over this core.
 */
export function WheelPicker({
    items,
    selectedId,
    onSelect,
    onConfirm,
    height,
}: Props) {
    const selectedIndex = Math.max(
        0,
        items.findIndex((item) => item.id === selectedId)
    );
    const drumHeight = height ?? ROW_HEIGHT * VISIBLE_ROWS;
    // Symmetric edge padding keeps the center row (and the selection band)
    // vertically centered whatever the drum height.
    const edgePadding = Math.max(0, (drumHeight - ROW_HEIGHT) / 2);

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
    const itemsRef = useRef(items);
    itemsRef.current = items;

    const settle = useCallback((offsetY: number) => {
        const index = indexForOffset(offsetY, itemsRef.current.length);
        if (index === lastSettledIndex.current) return;
        lastSettledIndex.current = index;
        Haptics.selectionAsync();
        onSelectRef.current(itemsRef.current[index].id);
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

    // No preselected item: the first row is the default selection (the row
    // the drum opens on). No haptic — nothing the user did yet.
    useEffect(() => {
        if (selectedId === null && items.length > 0) {
            lastSettledIndex.current = 0;
            onSelectRef.current(items[0].id);
        }
    }, [selectedId, items]);

    const handleLayout = useCallback(() => {
        if (didInitScroll.current) return;
        didInitScroll.current = true;
        scrollTo(scrollRef, 0, selectedIndex * ROW_HEIGHT, false);
        scrollY.value = selectedIndex * ROW_HEIGHT;
    }, [selectedIndex, scrollRef, scrollY]);

    const handleRowPress = useCallback(
        (index: number) => {
            const id = itemsRef.current[index].id;
            if (index === lastSettledIndex.current) {
                // Tapping the centered row confirms the pick (pick = advance).
                if (!onConfirmRef.current) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onConfirmRef.current(id);
                return;
            }
            // Off-center row: scroll it to the band and select it.
            lastSettledIndex.current = index;
            Haptics.selectionAsync();
            onSelectRef.current(id);
            scrollTo(scrollRef, 0, index * ROW_HEIGHT, true);
        },
        [scrollRef]
    );

    return (
        <View style={[styles.container, { height: drumHeight }]}>
            <View
                style={[styles.selectionBand, { top: edgePadding }]}
                pointerEvents="none"
            />
            <Animated.ScrollView
                ref={scrollRef}
                style={styles.scroll}
                contentContainerStyle={{ paddingVertical: edgePadding }}
                showsVerticalScrollIndicator={false}
                snapToInterval={ROW_HEIGHT}
                decelerationRate="fast"
                nestedScrollEnabled
                onLayout={handleLayout}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
            >
                {items.map((item, index) => (
                    <WheelRow
                        key={item.id}
                        item={item}
                        index={index}
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
        // No fill/border: the drum floats on the sheet; overflow hidden still
        // clips the scrolled rows to the drum's bounds.
        borderRadius: radius.md,
        overflow: 'hidden',
    },
    selectionBand: {
        position: 'absolute',
        left: spacing.xs,
        right: spacing.xs,
        height: ROW_HEIGHT,
        // Stands on its own now that there is no container box: fully rounded
        // pill with the primary tint and cyan rule all around.
        borderWidth: 1,
        borderRadius: radius.pill,
        borderColor: colors.primary,
        backgroundColor: 'rgba(53,215,255,0.08)',
        zIndex: 1,
    },
    scroll: {
        flex: 1,
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
    rowTitle: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
    },
    rowTitleSelected: {
        color: colors.primary,
    },
    rowSubtitle: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_400Regular',
    },
    rowTrailingCol: {
        alignItems: 'flex-end',
        gap: 1,
    },
    rowTrailingTitle: {
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
    },
    rowTrailingSubtitle: {
        fontSize: 11,
        fontFamily: 'Poppins_500Medium',
    },
    rowTrailingUp: {
        color: colors.success,
    },
    rowTrailingDown: {
        color: colors.danger,
    },
});
