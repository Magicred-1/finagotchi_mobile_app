import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useStreakFreezeStore } from '../features/freeze/store';
import { usePetStore } from '../features/pet/store';
import {
    colors,
    fonts,
    landing,
    radius,
    spacing,
    tracking,
    typography,
} from '../theme/tokens';
import { Button } from './Button';
import { PressableScale } from './PressableScale';

interface Props {
    visible: boolean;
    onClose: () => void;
}

export function StreakFreezeSheet({ visible, onClose }: Props) {
    const balance = usePetStore((s) => s.balance);
    const spendBalance = usePetStore((s) => s.spendBalance);
    const streakFreezes = useStreakFreezeStore((s) => s.streakFreezes);
    const addStreakFreezes = useStreakFreezeStore((s) => s.addStreakFreezes);
    const getPrice = useStreakFreezeStore((s) => s.getPrice);
    const price = getPrice();

    const handleBuy = () => {
        if (spendBalance(price)) {
            addStreakFreezes(1);
        }
    };

    return (
        <Modal transparent visible={visible} animationType="slide">
            <View style={styles.overlay}>
                <View style={styles.sheet}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Streak Freezes</Text>
                        <PressableScale
                            onPress={onClose}
                            style={styles.closeButton}
                            hitSlop={8}
                        >
                            <Ionicons name="close" size={22} color={colors.textMuted} />
                        </PressableScale>
                    </View>

                    <View style={styles.card}>
                        <Ionicons name="snow" size={32} color={colors.primary} />
                        <Text style={styles.owned}>{streakFreezes}</Text>
                        <Text style={styles.label}>streak freezes owned</Text>
                    </View>

                    <Text style={styles.description}>
                        Use a streak freeze to keep your streak alive when you miss a day.
                        You can use up to 3 per day.
                    </Text>

                    <View style={styles.buyRow}>
                        <View>
                            <Text style={styles.buyTitle}>Buy 1 Streak Freeze</Text>
                            <Text style={styles.buyPrice}>{price} pts</Text>
                        </View>
                        <Button
                            title="Buy"
                            onPress={handleBuy}
                            disabled={balance < price}
                        />
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(6,29,61,0.72)',
    },
    sheet: {
        padding: spacing.md,
        paddingBottom: 32,
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
        backgroundColor: landing.navy,
        borderTopWidth: 1,
        borderTopColor: landing.glassBorderStrong,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
    },
    title: {
        fontSize: typography.heading,
        fontFamily: fonts.bold,
        color: colors.textStrong,
        letterSpacing: tracking.heading,
    },
    closeButton: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: colors.border,
    },
    card: {
        alignItems: 'center',
        padding: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.badgeFree,
        borderWidth: 1,
        borderColor: 'rgba(141,201,246,0.30)',
        marginBottom: spacing.md,
    },
    owned: {
        fontSize: typography.title,
        fontFamily: fonts.monoBold,
        color: colors.textStrong,
        marginTop: spacing.xs,
    },
    label: {
        fontSize: typography.micro,
        fontFamily: fonts.mono,
        color: colors.textMuted,
        letterSpacing: tracking.eyebrow,
        textTransform: 'uppercase',
        marginTop: spacing.xs,
    },
    description: {
        fontSize: typography.small,
        fontFamily: fonts.regular,
        color: colors.textMuted,
        lineHeight: 20,
        marginBottom: spacing.md,
    },
    buyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    buyTitle: {
        fontSize: typography.body,
        fontFamily: fonts.semiBold,
        color: colors.textStrong,
    },
    buyPrice: {
        fontSize: typography.small,
        fontFamily: fonts.monoBold,
        color: colors.gold,
        marginTop: 2,
    },
});
