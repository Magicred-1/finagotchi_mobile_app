import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    ReduceMotion,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { colors, radius, shadows, springs } from '../../theme/tokens';

const TOUCH_HEIGHT = 44;
const TRACK_HEIGHT = 8;
const KNOB_SIZE = 26;

type Props = {
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (value: number) => void;
};

/**
 * Step slider driven by a UI-thread pan gesture: the fill/knob track the
 * finger directly, and the snapped value is handed back via runOnJS. The
 * track is inset by half the knob on both sides so the knob always stays
 * inside the touch view (no clipping at min/max).
 */
export function AmountSlider({ min, max, step, value, onChange }: Props) {
    const progress = useSharedValue((value - min) / (max - min));
    const trackWidth = useSharedValue(0);
    const lastSnapped = useSharedValue(value);
    // 1 while the finger is on the knob: drives the knob's grow/shrink.
    const active = useSharedValue(0);

    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useEffect(() => {
        lastSnapped.value = value;
        progress.value = withTiming((value - min) / (max - min), {
            duration: 120,
            reduceMotion: ReduceMotion.System,
        });
    }, [value, min, max, progress, lastSnapped]);

    const pan = Gesture.Pan()
        .minDistance(0)
        // Horizontal intent claims the gesture; vertical travel belongs to
        // the sheet's ScrollView, so the knob stays draggable inside it.
        .activeOffsetX([-2, 2])
        .failOffsetY([-16, 16])
        .onBegin((event) => {
            'worklet';
            active.value = withSpring(1, {
                ...springs.snappy,
                reduceMotion: ReduceMotion.System,
            });
            // Usable track is inset by half a knob on each side.
            const usable = trackWidth.value - KNOB_SIZE;
            if (usable <= 0) return;
            const p = Math.min(
                1,
                Math.max(0, (event.x - KNOB_SIZE / 2) / usable)
            );
            progress.value = p;
            const snapped = Math.round((min + p * (max - min)) / step) * step;
            if (snapped !== lastSnapped.value) {
                lastSnapped.value = snapped;
                runOnJS(onChangeRef.current)(snapped);
                runOnJS(Haptics.selectionAsync)();
            }
        })
        .onUpdate((event) => {
            'worklet';
            const usable = trackWidth.value - KNOB_SIZE;
            if (usable <= 0) return;
            const p = Math.min(
                1,
                Math.max(0, (event.x - KNOB_SIZE / 2) / usable)
            );
            progress.value = p;
            const snapped = Math.round((min + p * (max - min)) / step) * step;
            if (snapped !== lastSnapped.value) {
                lastSnapped.value = snapped;
                runOnJS(onChangeRef.current)(snapped);
                runOnJS(Haptics.selectionAsync)();
            }
        })
        .onFinalize(() => {
            'worklet';
            active.value = withSpring(0, {
                ...springs.snappy,
                reduceMotion: ReduceMotion.System,
            });
        });

    const fillStyle = useAnimatedStyle(() => ({
        width: `${progress.value * 100}%`,
    }));

    const knobStyle = useAnimatedStyle(() => ({
        transform: [
            {
                translateX: progress.value * (trackWidth.value - KNOB_SIZE),
            },
            // Direct-manipulation cue: the knob grows under the finger.
            { scale: 1 + active.value * 0.2 },
        ],
    }));

    return (
        <GestureDetector gesture={pan}>
            <View
                style={styles.touch}
                onLayout={(event) => {
                    trackWidth.value = event.nativeEvent.layout.width;
                }}
            >
                <View style={styles.trackWrap}>
                    <View style={styles.track} />
                    <Animated.View style={[styles.fill, fillStyle]} />
                </View>
                <Animated.View style={[styles.knob, knobStyle]} />
            </View>
        </GestureDetector>
    );
}

const styles = StyleSheet.create({
    touch: {
        height: TOUCH_HEIGHT,
        justifyContent: 'center',
    },
    trackWrap: {
        marginHorizontal: KNOB_SIZE / 2,
        justifyContent: 'center',
    },
    track: {
        height: TRACK_HEIGHT,
        borderRadius: radius.pill,
        backgroundColor: colors.border,
    },
    fill: {
        position: 'absolute',
        left: 0,
        height: TRACK_HEIGHT,
        borderRadius: radius.pill,
        backgroundColor: colors.primary,
    },
    knob: {
        position: 'absolute',
        left: 0,
        width: KNOB_SIZE,
        height: KNOB_SIZE,
        borderRadius: KNOB_SIZE / 2,
        backgroundColor: colors.primary,
        borderWidth: 3,
        borderColor: colors.text,
        ...shadows.small,
    },
});
