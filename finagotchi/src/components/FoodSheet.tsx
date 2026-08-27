import React from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { BottomSheet } from './BottomSheet';
import { PressableScale } from './PressableScale';
import type { PetMood, PetReaction } from './PetCanvas';
import { useFoodStore } from '../features/food/store';
import { colors, radius, spacing, typography } from '../theme/tokens';

export type FoodItem = {
    id: string;
    emoji: string;
    name: string;
    cost: number;
    happiness: number;
    reaction: PetReaction;
    mood: PetMood;
    /** Maximum free uses per day. Undefined means unlimited (cost still applies after the first free feed). */
    dailyLimit?: number;
};

const FOODS: FoodItem[] = [
    { id: 'snack', emoji: '🥕', name: 'Snack', cost: 0, happiness: 5, reaction: 'glow', mood: 'happy', dailyLimit: 3 },
    { id: 'fruit', emoji: '🍎', name: 'Fruit Bowl', cost: 50, happiness: 10, reaction: 'jump', mood: 'happy' },
    { id: 'burger', emoji: '🍔', name: 'Burger', cost: 100, happiness: 15, reaction: 'dance', mood: 'calm' },
    { id: 'cake', emoji: '🍰', name: 'Cake', cost: 200, happiness: 25, reaction: 'spin', mood: 'proud' },
    { id: 'golden', emoji: '🌟', name: 'Golden Apple', cost: 500, happiness: 40, reaction: 'glow', mood: 'proud' },
];

function formatNumber(num: number): string {
    return Math.round(num)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

type Props = {
    visible: boolean;
    onClose: () => void;
    onSelectFood: (food: FoodItem) => void;
    isDoneToday: boolean;
    balance: number;
};

export default function FoodSheet({
    visible,
    onClose,
    onSelectFood,
    isDoneToday,
    balance,
}: Props) {
    const getUsesToday = useFoodStore((state) => state.getUsesToday);
    const canUse = useFoodStore((state) => state.canUse);
    const recordUse = useFoodStore((state) => state.recordUse);

    function handleSelect(food: FoodItem) {
        const isFree = !isDoneToday || food.cost === 0;
        const cost = isFree ? 0 : food.cost;

        if (cost > balance) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return;
        }

        if (isFree && food.dailyLimit !== undefined && !canUse(food.id, food.dailyLimit)) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            return;
        }

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (isFree && food.dailyLimit !== undefined) {
            recordUse(food.id);
        }
        onSelectFood(food);
    }

    return (
        <BottomSheet visible={visible} onClose={onClose} title="Feed">
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.container}
            >
                <Text style={styles.intro}>
                    {isDoneToday
                        ? 'Your companion is full. Treat it again for points.'
                        : "Choose today's meal. The first feed of the day is free!"}
                </Text>

                <View style={styles.grid}>
                    {FOODS.map((food) => {
                        const isFree = !isDoneToday || food.cost === 0;
                        const cost = isFree ? 0 : food.cost;
                        const usesToday = getUsesToday(food.id);
                        const limitReached = isFree && food.dailyLimit !== undefined && usesToday >= food.dailyLimit;
                        const canAfford = balance >= cost && !limitReached;
                        const usesRemaining = food.dailyLimit !== undefined
                            ? Math.max(0, food.dailyLimit - usesToday)
                            : null;

                        return (
                            <PressableScale
                                key={food.id}
                                onPress={() => handleSelect(food)}
                                disabled={!canAfford}
                                style={[
                                    styles.tile,
                                    !canAfford && styles.tileDisabled,
                                ]}
                            >
                                <Text style={styles.emoji}>{food.emoji}</Text>
                                <Text style={styles.name}>{food.name}</Text>

                                <View style={styles.happinessPill}>
                                    <Ionicons name="happy-outline" size={9} color="#FF8E9E" />
                                    <Text style={styles.happinessText}>+{food.happiness}</Text>
                                </View>

                                <View
                                    style={[
                                        styles.pricePill,
                                        cost === 0 && styles.freePill,
                                        !canAfford && styles.pricePillDisabled,
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.priceText,
                                            cost === 0 && styles.freeText,
                                            !canAfford && styles.priceTextDisabled,
                                        ]}
                                    >
                                        {cost === 0
                                            ? usesRemaining !== null
                                                ? `${usesRemaining} left`
                                                : 'Free'
                                            : formatNumber(cost)}
                                    </Text>
                                </View>
                            </PressableScale>
                        );
                    })}
                </View>
            </ScrollView>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingBottom: 32,
    },
    intro: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 24,
        marginBottom: spacing.lg,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.md,
    },
    tile: {
        width: '47%',
        alignItems: 'center',
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.lg,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.sm,
    },
    tileDisabled: {
        opacity: 0.5,
    },
    emoji: {
        fontSize: 32,
        height: 44,
        textAlignVertical: 'center',
    },
    name: {
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
    },
    happinessPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingVertical: 3,
        paddingHorizontal: 6,
        borderRadius: 6,
        backgroundColor: 'rgba(255,142,158,0.12)',
    },
    happinessText: {
        color: '#FF8E9E',
        fontSize: 9,
        fontFamily: 'Poppins_800ExtraBold',
    },
    pricePill: {
        paddingVertical: 3,
        paddingHorizontal: 6,
        borderRadius: 6,
        backgroundColor: 'rgba(255,209,102,0.12)',
    },
    freePill: {
        backgroundColor: 'rgba(93,226,166,0.12)',
    },
    pricePillDisabled: {
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    priceText: {
        color: colors.warning,
        fontSize: 9,
        fontFamily: 'Poppins_800ExtraBold',
    },
    freeText: {
        color: colors.primary,
    },
    priceTextDisabled: {
        color: colors.textMuted,
    },
});
