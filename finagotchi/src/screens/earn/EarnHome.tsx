import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import Animated, {
    ReduceMotion,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

import { PressableScale } from '../../components/PressableScale';
import { landing, radius, spacing, springs, typography } from '../../theme/tokens';
import { DCAHome } from '../dca/DCAHome';
import { SwapHome } from '../swap/SwapHome';
import { useEarnUiStore } from './earnUiStore';

const PAGES = [
    { id: 'swap', title: 'Swap', node: <SwapHome /> },
    { id: 'dca', title: 'DCA Plan', node: <DCAHome /> },
] as const;

/** Flick speed (pt/s) that turns any drag into a page change. */
const SWIPE_VELOCITY = 500;
/** Fraction of the panel width a slow drag must cross to change pages. */
const SWIPE_DISTANCE = 0.25;
/** Rubber-band resistance past the first/last page. */
const EDGE_RESISTANCE = 0.3;

function PageDot({ active, onPress }: { active: boolean; onPress: () => void }) {
    const width = useSharedValue(active ? 18 : 8);

    useEffect(() => {
        width.value = withSpring(active ? 18 : 8, {
            ...springs.snappy,
            reduceMotion: ReduceMotion.System,
        });
    }, [active, width]);

    const style = useAnimatedStyle(() => ({
        width: width.value,
        opacity: 0.4 + ((width.value - 8) / 10) * 0.6,
    }));

    return (
        <PressableScale
            onPress={onPress}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={active ? 'Current page' : 'Go to page'}
        >
            <Animated.View style={[styles.dot, style]} />
        </PressableScale>
    );
}

/**
 * Home "earn programs" pager: Swap and DCA Plan keep their own components,
 * rendered side by side; a horizontal swipe (or a dot tap) slides between
 * them. Horizontal intent claims the gesture (activeOffsetX/failOffsetY) so
 * the home screen keeps vertical scrolling. The container height springs to
 * the active panel's measured height so the two cards can differ in size.
 */
export function EarnHome() {
    const [activePage, setActivePage] = useState(0);
    const [heights, setHeights] = useState<readonly number[]>([0, 0]);
    const width = useSharedValue(0);
    /** Committed page index (UI thread; mirrors activePage). */
    const page = useSharedValue(0);
    /** Live track offset — finger-driven during the drag, springing after. */
    const offset = useSharedValue(0);
    const heightSv = useSharedValue(0);
    /** Set once both panels have measured: until then height stays auto. */
    const measured = heights.every((h) => h > 0);

    const goToPage = useCallback(
        (index: number) => {
            const clamped = Math.max(0, Math.min(PAGES.length - 1, index));
            if (clamped === page.value) return;
            page.value = clamped;
            offset.value = withSpring(-clamped * width.value, {
                ...springs.snappy,
                reduceMotion: ReduceMotion.System,
            });
            setActivePage(clamped);
        },
        [page, offset, width]
    );

    const pan = Gesture.Pan()
        // Horizontal intent claims the gesture; vertical travel belongs to
        // the home ScrollView, so the cards stay swipeable inside it.
        .activeOffsetX([-8, 8])
        .failOffsetY([-12, 12])
        .onUpdate((event) => {
            'worklet';
            const w = width.value;
            if (w <= 0) return;
            let x = -page.value * w + event.translationX;
            const min = -(PAGES.length - 1) * w;
            if (x > 0) {
                x = x * EDGE_RESISTANCE;
            } else if (x < min) {
                x = min + (x - min) * EDGE_RESISTANCE;
            }
            offset.value = x;
        })
        .onEnd((event) => {
            'worklet';
            const w = width.value;
            if (w <= 0) return;
            const current = page.value;
            let target = current;
            if (
                event.translationX < -w * SWIPE_DISTANCE ||
                event.velocityX < -SWIPE_VELOCITY
            ) {
                target = Math.min(PAGES.length - 1, current + 1);
            } else if (
                event.translationX > w * SWIPE_DISTANCE ||
                event.velocityX > SWIPE_VELOCITY
            ) {
                target = Math.max(0, current - 1);
            }
            page.value = target;
            offset.value = withSpring(-target * w, {
                ...springs.snappy,
                reduceMotion: ReduceMotion.System,
            });
            if (target !== current) {
                runOnJS(Haptics.selectionAsync)();
                runOnJS(setActivePage)(target);
            }
        });

    // Track height follows the active panel; first measure lands directly.
    useEffect(() => {
        if (!measured) return;
        const target = heights[activePage];
        if (heightSv.value === 0) {
            heightSv.value = target;
        } else {
            heightSv.value = withTiming(target, {
                duration: 220,
                reduceMotion: ReduceMotion.System,
            });
        }
    }, [measured, heights, activePage, heightSv]);

    // Quest-card redirects queue a target program (see earnUiStore): slide
    // the pager so the redirected flow is the visible page.
    const programRequested = useEarnUiStore((state) => state.programRequested);
    useEffect(() => {
        if (!programRequested) return;
        const program = useEarnUiStore.getState().consumeProgram();
        if (!program) return;
        goToPage(PAGES.findIndex((p) => p.id === program));
    }, [programRequested, goToPage]);

    const trackStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: offset.value }],
    }));

    const viewportStyle = useAnimatedStyle(() => ({
        height: heightSv.value,
    }));

    const measurePanel = (index: number) =>
        (event: { nativeEvent: { layout: { height: number } } }) => {
            const h = event.nativeEvent.layout.height;
            if (h <= 0) return;
            setHeights((prev) =>
                prev[index] === h
                    ? prev
                    : prev.map((v, i) => (i === index ? h : v))
            );
        };

    return (
        <View style={styles.wrap}>
            <View style={styles.header}>
                <Text style={styles.title}>{PAGES[activePage].title}</Text>
                <View style={styles.dots}>
                    {PAGES.map((p, index) => (
                        <PageDot
                            key={p.id}
                            active={index === activePage}
                            onPress={() => {
                                Haptics.selectionAsync();
                                goToPage(index);
                            }}
                        />
                    ))}
                </View>
            </View>

            <GestureDetector gesture={pan}>
                <Animated.View
                    style={[styles.viewport, measured && viewportStyle]}
                    onLayout={(event) => {
                        const w = event.nativeEvent.layout.width;
                        if (w > 0 && width.value !== w) {
                            // First measure: land directly on the active page
                            // so the track never sweeps in from the left.
                            const first = width.value === 0;
                            width.value = w;
                            offset.value = first
                                ? -page.value * w
                                : withSpring(-page.value * w, {
                                      ...springs.snappy,
                                      reduceMotion: ReduceMotion.System,
                                  });
                        }
                    }}
                >
                    <Animated.View
                        // Two panels side by side: the track is 200% of the
                        // viewport, each panel 50% of the track (= viewport
                        // width) — percentages only, no JS measurement needed.
                        style={[styles.track, trackStyle]}
                    >
                        {PAGES.map((p, index) => (
                            <View
                                key={p.id}
                                style={styles.panel}
                                onLayout={measurePanel(index)}
                            >
                                {p.node}
                            </View>
                        ))}
                    </Animated.View>
                </Animated.View>
            </GestureDetector>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        width: '100%',
        gap: spacing.sm,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.xs,
    },
    title: {
        color: landing.textMuted,
        fontSize: typography.small,
        fontFamily: 'DMSans_600SemiBold',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    dots: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    dot: {
        height: 8,
        borderRadius: radius.pill,
        backgroundColor: landing.accent,
    },
    viewport: {
        width: '100%',
        overflow: 'hidden',
    },
    track: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        width: '200%',
    },
    panel: {
        // Two panels side by side, each exactly the viewport's width.
        width: '50%',
    },
});
