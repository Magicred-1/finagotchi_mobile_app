import React, { useEffect } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { AccessoryPreview } from './PetAccessory';
import { BottomSheet } from './BottomSheet';
import { PressableScale } from './PressableScale';
import { SectionLabel } from './SectionLabel';
import {
    COSMETIC_ACCESSORIES,
    COSMETIC_BACKGROUNDS,
    type CosmeticAccessory,
    type CosmeticBackground,
} from '../features/pet/cosmetics';
import {
    BACKGROUND_COLORS,
    usePetStore,
} from '../features/pet/store';
import { useCheckinStore } from '../features/checkin/store';
import {
    colors,
    fonts,
    radius,
    spacing,
    tracking,
    typography,
} from '../theme/tokens';

type Props = {
    visible: boolean;
    onClose: () => void;
};

function formatNumber(num: number): string {
    return Math.round(num)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export default function CollectiblesSheet({ visible, onClose }: Props) {
    const streak = useCheckinStore((state) => state.streak);
    const background = usePetStore((state) => state.background);
    const accessory = usePetStore((state) => state.accessory);
    const balance = usePetStore((state) => state.balance);
    const ownedBackgrounds = usePetStore((state) => state.ownedBackgrounds);
    const ownedAccessories = usePetStore((state) => state.ownedAccessories);
    const setCosmetic = usePetStore((state) => state.setCosmetic);
    const ownBackground = usePetStore((state) => state.ownBackground);
    const ownAccessory = usePetStore((state) => state.ownAccessory);
    const purchaseBackground = usePetStore((state) => state.purchaseBackground);
    const purchaseAccessory = usePetStore((state) => state.purchaseAccessory);

    // Streak unlocks free collectibles automatically.
    useEffect(() => {
        if (!visible) return;
        COSMETIC_BACKGROUNDS.forEach((item) => {
            if (item.price === 0 && streak >= item.unlock) {
                ownBackground(item.id);
            }
        });
        COSMETIC_ACCESSORIES.forEach((item) => {
            if (item.price === 0 && streak >= item.unlock) {
                ownAccessory(item.id);
            }
        });
    }, [visible, streak, ownBackground, ownAccessory]);

    const handleClose = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onClose();
    };

    const handleBackground = (item: CosmeticBackground) => {
        if (ownedBackgrounds.includes(item.id)) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setCosmetic({ background: item.id });
            return;
        }

        if (item.price > 0 && purchaseBackground(item.id, item.price)) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setCosmetic({ background: item.id });
            return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    };

    const handleAccessory = (item: CosmeticAccessory) => {
        if (ownedAccessories.includes(item.id)) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setCosmetic({ accessory: item.id });
            return;
        }

        if (item.price > 0 && purchaseAccessory(item.id, item.price)) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setCosmetic({ accessory: item.id });
            return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    };

    return (
        <BottomSheet visible={visible} onClose={onClose}>
            <PressableScale
                onPress={handleClose}
                style={styles.closeButton}
                hitSlop={8}
            >
                <Ionicons
                    name="close"
                    size={22}
                    color={colors.text}
                />
            </PressableScale>

            <View style={styles.header}>
                <Text style={styles.title}>Collectibles</Text>
                <View style={styles.balancePill}>
                    <Ionicons name="wallet-outline" size={12} color={colors.gold} />
                    <Text style={styles.balanceText}>{formatNumber(balance)}</Text>
                </View>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.container}
            >
                <Text style={styles.intro}>
                    Free styles unlock with your streak, rare ones drop from the
                    daily check-in wheel — or buy them with points.
                </Text>

                <View style={styles.sectionLabelWrap}>
                    <SectionLabel>Backgrounds</SectionLabel>
                </View>
                <View style={styles.grid}>
                    {COSMETIC_BACKGROUNDS.map((item) => {
                        const isOwned = ownedBackgrounds.includes(item.id);
                        const streakUnlocked = streak >= item.unlock;
                        const isActive = background === item.id;
                        const isPremium = item.price > 0;
                        const canAfford = balance >= item.price;
                        const isDisabled = !isOwned && (isPremium ? !canAfford : !streakUnlocked);
                        const [top, bottom] = BACKGROUND_COLORS[item.id];

                        return (
                            <PressableScale
                                key={item.id}
                                onPress={() => handleBackground(item)}
                                disabled={isDisabled}
                                style={[
                                    styles.tile,
                                    isActive && styles.tileActive,
                                    isDisabled && styles.tileLocked,
                                    isOwned && !isActive && styles.tileOwned,
                                ]}
                            >
                                <View
                                    style={[
                                        styles.swatch,
                                        {
                                            backgroundColor: top,
                                            borderColor: bottom,
                                        },
                                    ]}
                                />
                                <Text
                                    style={[
                                        styles.tileLabel,
                                        isDisabled && styles.tileLabelLocked,
                                    ]}
                                >
                                    {item.name}
                                </Text>
                                {!isOwned && isPremium && (
                                    <View style={[
                                        styles.priceBadge,
                                        !canAfford && styles.priceBadgeDisabled,
                                    ]}>
                                        <Ionicons name="wallet-outline" size={9} color={canAfford ? colors.gold : colors.textMuted} />
                                        <Text style={[
                                            styles.priceText,
                                            !canAfford && styles.priceTextDisabled,
                                        ]}>
                                            {formatNumber(item.price)}
                                        </Text>
                                    </View>
                                )}
                                {!isOwned && !isPremium && !streakUnlocked && (
                                    <View style={styles.lockBadge}>
                                        <Ionicons
                                            name="lock-closed"
                                            size={10}
                                            color={colors.textMuted}
                                        />
                                        <Text style={styles.lockText}>
                                            {item.unlock}d
                                        </Text>
                                    </View>
                                )}
                                {isOwned && !isActive && (
                                    <View style={styles.ownedBadge}>
                                        <Text style={styles.ownedText}>Owned</Text>
                                    </View>
                                )}
                                {isActive && (
                                    <View style={styles.checkBadge}>
                                        <Ionicons
                                            name="checkmark"
                                            size={10}
                                            color={colors.onPrimary}
                                        />
                                    </View>
                                )}
                            </PressableScale>
                        );
                    })}
                </View>

                <View style={styles.sectionLabelWrap}>
                    <SectionLabel>Accessories</SectionLabel>
                </View>
                <View style={styles.grid}>
                    {COSMETIC_ACCESSORIES.map((item) => {
                        const isOwned = ownedAccessories.includes(item.id);
                        const streakUnlocked = streak >= item.unlock;
                        const isActive = accessory === item.id;
                        const isPremium = item.price > 0;
                        const canAfford = balance >= item.price;
                        const isDisabled = !isOwned && (isPremium ? !canAfford : !streakUnlocked);

                        return (
                            <PressableScale
                                key={item.id}
                                onPress={() => handleAccessory(item)}
                                disabled={isDisabled}
                                style={[
                                    styles.tile,
                                    isActive && styles.tileActive,
                                    isDisabled && styles.tileLocked,
                                    isOwned && !isActive && styles.tileOwned,
                                ]}
                            >
                                <View style={styles.accessoryPreview}>
                                    {item.id !== 'none' && (
                                        <AccessoryPreview accessory={item.id} size={40} />
                                    )}
                                </View>
                                <Text
                                    style={[
                                        styles.tileLabel,
                                        isDisabled && styles.tileLabelLocked,
                                    ]}
                                >
                                    {item.name}
                                </Text>
                                {!isOwned && isPremium && (
                                    <View style={[
                                        styles.priceBadge,
                                        !canAfford && styles.priceBadgeDisabled,
                                    ]}>
                                        <Ionicons name="wallet-outline" size={9} color={canAfford ? colors.gold : colors.textMuted} />
                                        <Text style={[
                                            styles.priceText,
                                            !canAfford && styles.priceTextDisabled,
                                        ]}>
                                            {formatNumber(item.price)}
                                        </Text>
                                    </View>
                                )}
                                {!isOwned && !isPremium && !streakUnlocked && (
                                    <View style={styles.lockBadge}>
                                        <Ionicons
                                            name="lock-closed"
                                            size={10}
                                            color={colors.textMuted}
                                        />
                                        <Text style={styles.lockText}>
                                            {item.unlock}d
                                        </Text>
                                    </View>
                                )}
                                {isOwned && !isActive && (
                                    <View style={styles.ownedBadge}>
                                        <Text style={styles.ownedText}>Owned</Text>
                                    </View>
                                )}
                                {isActive && (
                                    <View style={styles.checkBadge}>
                                        <Ionicons
                                            name="checkmark"
                                            size={10}
                                            color={colors.onPrimary}
                                        />
                                    </View>
                                )}
                            </PressableScale>
                        );
                    })}
                </View>

                <View style={styles.streakBanner}>
                    <Ionicons name="flame-outline" size={18} color={colors.amber} />
                    <Text style={styles.streakText}>
                        Your streak: {streak} 🔥
                    </Text>
                </View>
            </ScrollView>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
    },
    title: {
        color: colors.textStrong,
        fontSize: typography.heading,
        fontFamily: fonts.bold,
        letterSpacing: tracking.heading,
    },
    balancePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: radius.pill,
        backgroundColor: colors.chip,
        borderWidth: 1,
        borderColor: colors.border,
    },
    balanceText: {
        color: colors.gold,
        fontSize: typography.small,
        fontFamily: fonts.monoBold,
    },
    closeButton: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: colors.border,
        zIndex: 10,
    },
    container: {
        paddingBottom: 32,
    },
    intro: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: fonts.regular,
        lineHeight: 24,
        marginBottom: spacing.lg,
    },
    sectionLabelWrap: {
        marginBottom: spacing.md,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.md,
        marginBottom: spacing.xl,
    },
    tile: {
        width: '47%',
        alignItems: 'center',
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.sm,
    },
    tileActive: {
        borderColor: colors.primary,
        backgroundColor: 'rgba(141,201,246,0.08)',
    },
    tileOwned: {
        borderColor: 'rgba(255,255,255,0.18)',
    },
    tileLocked: {
        opacity: 0.45,
    },
    swatch: {
        width: 44,
        height: 44,
        borderRadius: radius.md,
        borderWidth: 2,
    },
    accessoryPreview: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tileLabel: {
        color: colors.text,
        fontSize: typography.small,
        fontFamily: fonts.semiBold,
    },
    tileLabelLocked: {
        color: colors.textMuted,
    },
    priceBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingVertical: 3,
        paddingHorizontal: 6,
        borderRadius: 8,
        backgroundColor: colors.chip,
    },
    priceBadgeDisabled: {
        backgroundColor: colors.surfaceLight,
    },
    priceText: {
        color: colors.gold,
        fontSize: 9,
        fontFamily: fonts.monoBold,
    },
    priceTextDisabled: {
        color: colors.textMuted,
    },
    lockBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingVertical: 3,
        paddingHorizontal: 6,
        borderRadius: 8,
        backgroundColor: colors.surfaceLight,
    },
    lockText: {
        color: colors.textMuted,
        fontSize: 9,
        fontFamily: fonts.monoBold,
    },
    ownedBadge: {
        paddingVertical: 3,
        paddingHorizontal: 6,
        borderRadius: 8,
        backgroundColor: 'rgba(126,214,167,0.12)',
    },
    ownedText: {
        color: colors.success,
        fontSize: 9,
        fontFamily: fonts.semiBold,
    },
    checkBadge: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 9,
        backgroundColor: colors.primary,
    },
    streakBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.md,
        borderRadius: radius.md,
        backgroundColor: 'rgba(248,180,60,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(248,180,60,0.22)',
    },
    streakText: {
        color: colors.textStrong,
        fontSize: typography.body,
        fontFamily: fonts.semiBold,
    },
});
