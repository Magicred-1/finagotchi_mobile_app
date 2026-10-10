import React, { useEffect } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

import { PressableScale } from './PressableScale';
import { colors, fonts, landing, radius, shadows, spacing, tracking, typography } from '../theme/tokens';

type Props = {
    visible: boolean;
    streak: number;
    onDismiss: () => void;
};

export function MilestoneCelebration({ visible, streak, onDismiss }: Props) {
    const scale = useSharedValue(0.8);
    const opacity = useSharedValue(0);

    useEffect(() => {
        if (visible) {
            scale.value = 0.8;
            opacity.value = 0;
            scale.value = withSpring(1, { damping: 14, stiffness: 200 });
            opacity.value = withTiming(1, { duration: 250 });
        }
    }, [visible, scale, opacity]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
    }));

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onDismiss}
        >
            <View style={styles.overlay}>
                <Animated.View style={[styles.card, animatedStyle]}>
                    <Text style={styles.emoji}>🔥</Text>
                    <Text style={styles.title}>Streak milestone!</Text>
                    <Text style={styles.subtitle}>
                        You hit <Text style={styles.streak}>{streak}</Text> days.
                    </Text>
                    <Text style={styles.body}>
                        Keep checking in to evolve your creature and earn bigger wheel rewards.
                    </Text>
                    <PressableScale onPress={onDismiss} style={styles.button}>
                        <Text style={styles.buttonText}>Awesome</Text>
                    </PressableScale>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(6,29,61,0.75)',
        padding: spacing.lg,
    },
    card: {
        width: '100%',
        maxWidth: 320,
        alignItems: 'center',
        padding: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: landing.navy,
        borderWidth: 1,
        borderColor: landing.glassBorderStrong,
        ...shadows.popup,
    },
    emoji: {
        fontSize: 64,
        marginBottom: spacing.sm,
    },
    title: {
        color: colors.textStrong,
        fontSize: typography.heading,
        fontFamily: fonts.bold,
        letterSpacing: tracking.heading,
        textAlign: 'center',
    },
    subtitle: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: fonts.semiBold,
        textAlign: 'center',
        marginTop: spacing.xs,
    },
    streak: {
        color: colors.amber,
        fontFamily: fonts.monoBold,
    },
    body: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: fonts.regular,
        textAlign: 'center',
        marginTop: spacing.md,
        lineHeight: 20,
    },
    button: {
        marginTop: spacing.lg,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        borderRadius: radius.sm,
        backgroundColor: colors.primary,
    },
    buttonText: {
        color: colors.onPrimary,
        fontSize: typography.small,
        fontFamily: fonts.semiBold,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
});
