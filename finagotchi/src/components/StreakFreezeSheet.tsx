import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useStreakFreezeStore } from '../features/freeze/store';
import { usePetStore } from '../features/pet/store';
import { colors, radius, spacing, typography } from '../theme/tokens';
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
                        <PressableScale onPress={onClose}>
                            <Ionicons name="close" size={22} color={colors.textMuted} />
                        </PressableScale>
                    </View>

                    <View style={styles.card}>
                        <Ionicons name="snow" size={32} color={colors.cyan} />
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
                        <PressableScale
                            onPress={handleBuy}
                            disabled={balance < price}
                            style={[styles.buyButton, balance < price && styles.buyButtonDisabled]}
                        >
                            <Text style={styles.buyButtonText}>Buy</Text>
                        </PressableScale>
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
        backgroundColor: 'rgba(2,6,12,0.72)',
    },
    sheet: {
        padding: spacing.md,
        paddingBottom: 32,
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
        backgroundColor: colors.surface,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
    },
    title: {
        fontSize: typography.heading,
        fontFamily: 'Poppins_800ExtraBold',
        color: colors.text,
    },
    card: {
        alignItems: 'center',
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: 'rgba(53,215,255,0.12)',
        borderWidth: 1,
        borderColor: 'rgba(53,215,255,0.25)',
        marginBottom: spacing.md,
    },
    owned: {
        fontSize: 32,
        fontFamily: 'Poppins_800ExtraBold',
        color: colors.text,
        marginTop: spacing.xs,
    },
    label: {
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        color: colors.textMuted,
        marginTop: 2,
    },
    description: {
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        color: colors.textMuted,
        lineHeight: 20,
        marginBottom: spacing.md,
    },
    buyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    buyTitle: {
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
        color: colors.text,
    },
    buyPrice: {
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        color: colors.warning,
    },
    buyButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: radius.pill,
        backgroundColor: colors.primary,
    },
    buyButtonDisabled: {
        backgroundColor: colors.surfaceLight,
    },
    buyButtonText: {
        fontSize: typography.small,
        fontFamily: 'Poppins_800ExtraBold',
        color: colors.background,
    },
});
