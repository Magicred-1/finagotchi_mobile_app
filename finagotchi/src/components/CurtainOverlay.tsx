import React, { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
    Easing,
    ReduceMotion,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import { colors } from '../theme/tokens';

type Props = {
    active: boolean;
    color?: string;
    coverDuration?: number;
    revealDuration?: number;
    onCovered?: () => void;
    onComplete?: () => void;
};

export default function CurtainOverlay({
    active,
    color = colors.primary,
    coverDuration = 280,
    revealDuration = 320,
    onCovered,
    onComplete,
}: Props) {
    const { width, height } = useWindowDimensions();
    const progress = useSharedValue(0);

    useEffect(() => {
        if (!active) return;

        progress.value = 0;
        progress.value = withTiming(
            1,
            {
                duration: coverDuration,
                easing: Easing.out(Easing.quad),
                reduceMotion: ReduceMotion.System,
            },
            (finished) => {
                if (!finished) return;
                if (onCovered) {
                    runOnJS(onCovered)();
                }
                progress.value = withTiming(
                    0,
                    {
                        duration: revealDuration,
                        easing: Easing.out(Easing.quad),
                        reduceMotion: ReduceMotion.System,
                    },
                    (finished2) => {
                        if (finished2 && onComplete) {
                            runOnJS(onComplete)();
                        }
                    }
                );
            }
        );
    }, [active, coverDuration, revealDuration, onCovered, onComplete, progress]);

    const leftStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: -width * (1 - progress.value) }],
    }));

    const rightStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: width * (1 - progress.value) }],
    }));

    return (
        <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { zIndex: 10 }]}
        >
            <Animated.View
                style={[
                    styles.panel,
                    { width, height, left: -width, backgroundColor: color },
                    leftStyle,
                ]}
            />
            <Animated.View
                style={[
                    styles.panel,
                    { width, height, right: -width, backgroundColor: color },
                    rightStyle,
                ]}
            />
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    panel: {
        position: 'absolute',
        top: 0,
        bottom: 0,
    },
});
