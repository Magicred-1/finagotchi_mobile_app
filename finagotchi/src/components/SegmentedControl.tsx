import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';

import { PressableScale } from './PressableScale';
import { colors, landing, radius, springs, typography } from '../theme/tokens';

const SEGMENTED_PAD = 3;

/**
 * iOS segmented control: mutually exclusive short options on one row, a
 * sliding indicator springing between segments. Extracted from the DCA
 * wizard so any screen can offer the same selection idiom (the home screen's
 * DCA/Swap program switch uses it).
 */
export function SegmentedControl({
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
    // A free-form value may match no segment: hide the indicator rather than
    // highlighting the wrong one.
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

const styles = StyleSheet.create({
    segmented: {
        flexDirection: 'row',
        backgroundColor: landing.glass,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: landing.glassBorder,
        padding: SEGMENTED_PAD,
    },
    segmentIndicator: {
        position: 'absolute',
        top: SEGMENTED_PAD,
        bottom: SEGMENTED_PAD,
        left: SEGMENTED_PAD,
        borderRadius: radius.sm - SEGMENTED_PAD,
        backgroundColor: 'rgba(141,201,246,0.14)',
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
        fontFamily: 'DMSans_500Medium',
    },
    segmentTextSelected: {
        color: colors.primary,
        fontFamily: 'DMSans_600SemiBold',
    },
});
