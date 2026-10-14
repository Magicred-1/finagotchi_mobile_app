import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    ReduceMotion,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
} from 'react-native-reanimated';

import { colors, spacing, springs } from '../theme/tokens';

function StepDot({ active }: { active: boolean }) {
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

    return <Animated.View style={[styles.dot, style]} />;
}

/**
 * Wizard progress dots: one pill per step, the passed/current steps spring
 * wider. Shared by the DCA and Swap wizards (extracted from DCAWizardSheet).
 */
export function StepDots({ count, step }: { count: number; step: number }) {
    return (
        <View style={styles.dots}>
            {Array.from({ length: count }, (_, index) => (
                <StepDot key={index} active={index <= step} />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    dots: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: spacing.sm,
    },
    dot: {
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.primary,
    },
});
