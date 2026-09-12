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
import {
    BACKGROUND_COLORS,
    type PetAccessory,
    type PetBackground,
    usePetStore,
} from '../features/pet/store';
import { useCheckinStore } from '../features/checkin/store';
import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = {
    visible: boolean;
    onClose: () => void;
};

type BackgroundItem = {
    id: PetBackground;
    name: string;
    unlock: number; // streak required for free items
    price: number;  // premium price; 0 means free/unlocked by streak
};

type AccessoryItem = {
    id: PetAccessory;
    name: string;
    unlock: number;
    price: number;
};

const BACKGROUNDS: BackgroundItem[] = [
    { id: 'default', name: 'Meadow', unlock: 0, price: 0 },
    { id: 'aurora', name: 'Aurora', unlock: 3, price: 0 },
    { id: 'sunset', name: 'Sunset', unlock: 7, price: 0 },
    { id: 'midnight', name: 'Midnight', unlock: 14, price: 0 },
    { id: 'galaxy', name: 'Galaxy', unlock: 0, price: 1200 },
    { id: 'gold', name: 'Golden', unlock: 0, price: 3000 },
];

const ACCESSORIES: AccessoryItem[] = [
    { id: 'none', name: 'None', unlock: 0, price: 0 },
    { id: 'glasses', name: 'Shades', unlock: 3, price: 0 },
    { id: 'bowtie', name: 'Bowtie', unlock: 7, price: 0 },
    { id: 'crown', name: 'Royal Crown', unlock: 14, price: 0 },
    { id: 'halo', name: 'Halo', unlock: 0, price: 800 },
    { id: 'tshirt', name: 'Coin Tee', unlock: 0, price: 1500 },
    { id: 'diamond', name: 'Diamond', unlock: 0, price: 2500 },
];

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

    // Streak unlocks free collectibles automatically.
    useEffect(() => {
        if (!visible) return;
        BACKGROUNDS.forEach((item) => {
            if (item.price === 0 && streak >= item.unlock) {
                ownBackground(item.id);
            }
        });
        ACCESSORIES.forEach((item) => {
            if (item.price === 0 && streak >= item.unlock) {
                ownAccessory(item.id);
            }
        });
    }, [visible, streak, ownBackground, ownAccessory]);

    const handleClose = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onClose();
    };

    const selectBackground = (item: BackgroundItem) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCosmetic({ background: item.id });
    };

    const selectAccessory = (item: AccessoryItem) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCosmetic({ accessory: item.id });
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
                    <Ionicons name="wallet-outline" size={12} color={colors.warning} />
                    <Text style={styles.balanceText}>{formatNumber(balance)}</Text>
                </View>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.container}
            >
                <Text style={styles.intro}>
                    All styles are unlocked for testing. Tap any item to equip it.
                </Text>

                <Text style={styles.sectionTitle}>Backgrounds</Text>
                <View style={styles.grid}>
                    {BACKGROUNDS.map((item) => {
                        const isOwned = true;
                        const streakUnlocked = true;
                        const isActive = background === item.id;
                        const isPremium = false;
                        const canAfford = true;
                        const isDisabled = false;
                        const [top, bottom] = BACKGROUND_COLORS[item.id];

                        return (
                            <PressableScale
                                key={item.id}
                                onPress={() => selectBackground(item)}
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
                                        <Ionicons name="wallet-outline" size={9} color={canAfford ? colors.warning : colors.textMuted} />
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
                                            color={colors.background}
                                        />
                                    </View>
                                )}
                            </PressableScale>
                        );
                    })}
                </View>

                <Text style={styles.sectionTitle}>Accessories</Text>
                <View style={styles.grid}>
                    {ACCESSORIES.map((item) => {
                        const isOwned = true;
                        const streakUnlocked = true;
                        const isActive = accessory === item.id;
                        const isPremium = false;
                        const canAfford = true;
                        const isDisabled = false;

                        return (
                            <PressableScale
                                key={item.id}
                                onPress={() => selectAccessory(item)}
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
                                        <Ionicons name="wallet-outline" size={9} color={canAfford ? colors.warning : colors.textMuted} />
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
                                            color={colors.background}
                                        />
                                    </View>
                                )}
                            </PressableScale>
                        );
                    })}
                </View>

                <View style={styles.streakBanner}>
                    <Ionicons name="flame-outline" size={18} color="#FF8E4A" />
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
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_700Bold',
    },
    balancePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 12,
        backgroundColor: 'rgba(255,209,102,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,209,102,0.20)',
    },
    balanceText: {
        color: colors.warning,
        fontSize: 13,
        fontFamily: 'Poppins_700Bold',
    },
    closeButton: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        zIndex: 10,
    },
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
    sectionTitle: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_700Bold',
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
        borderRadius: radius.lg,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        gap: spacing.sm,
    },
    tileActive: {
        borderColor: colors.primary,
        backgroundColor: 'rgba(93,226,166,0.08)',
    },
    tileOwned: {
        borderColor: 'rgba(255,209,102,0.35)',
    },
    tileLocked: {
        opacity: 0.5,
    },
    swatch: {
        width: 44,
        height: 44,
        borderRadius: 14,
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
        fontFamily: 'Poppins_700Bold',
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
        backgroundColor: 'rgba(255,209,102,0.12)',
    },
    priceBadgeDisabled: {
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    priceText: {
        color: colors.warning,
        fontSize: 9,
        fontFamily: 'Poppins_700Bold',
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
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    lockText: {
        color: colors.textMuted,
        fontSize: 9,
        fontFamily: 'Poppins_700Bold',
    },
    ownedBadge: {
        paddingVertical: 3,
        paddingHorizontal: 6,
        borderRadius: 8,
        backgroundColor: 'rgba(93,226,166,0.12)',
    },
    ownedText: {
        color: colors.primary,
        fontSize: 9,
        fontFamily: 'Poppins_700Bold',
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
        backgroundColor: 'rgba(255,142,74,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,142,74,0.20)',
    },
    streakText: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
    },
});
