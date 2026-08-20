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
import {
    ACCESSORY_EMOJI,
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
    unlock: number; // streak required
};

type AccessoryItem = {
    id: PetAccessory;
    name: string;
    unlock: number; // streak required
};

const BACKGROUNDS: BackgroundItem[] = [
    { id: 'default', name: 'Meadow', unlock: 0 },
    { id: 'aurora', name: 'Aurora', unlock: 3 },
    { id: 'sunset', name: 'Sunset', unlock: 7 },
    { id: 'midnight', name: 'Midnight', unlock: 14 },
];

const ACCESSORIES: AccessoryItem[] = [
    { id: 'none', name: 'None', unlock: 0 },
    { id: 'glasses', name: 'Shades', unlock: 3 },
    { id: 'bowtie', name: 'Bowtie', unlock: 7 },
    { id: 'crown', name: 'Royal Crown', unlock: 14 },
];

export default function CosmeticsSheet({ visible, onClose }: Props) {
    const streak = useCheckinStore((state) => state.streak);
    const background = usePetStore((state) => state.background);
    const accessory = usePetStore((state) => state.accessory);
    const setCosmetic = usePetStore((state) => state.setCosmetic);

    const handleClose = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onClose();
    };

    const selectBackground = (item: BackgroundItem) => {
        if (streak < item.unlock) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCosmetic({ background: item.id });
    };

    const selectAccessory = (item: AccessoryItem) => {
        if (streak < item.unlock) return;
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
                <Text style={styles.title}>Cosmetics</Text>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.container}
            >
                <Text style={styles.intro}>
                    Unlock new looks by keeping your streak alive. Every cosmetic
                    is earned — no payments required.
                </Text>

                <Text style={styles.sectionTitle}>Backgrounds</Text>
                <View style={styles.grid}>
                    {BACKGROUNDS.map((item) => {
                        const unlocked = streak >= item.unlock;
                        const active = background === item.id;
                        const [top, bottom] = BACKGROUND_COLORS[item.id];

                        return (
                            <PressableScale
                                key={item.id}
                                onPress={() => selectBackground(item)}
                                disabled={!unlocked}
                                style={[
                                    styles.tile,
                                    active && styles.tileActive,
                                    !unlocked && styles.tileLocked,
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
                                        !unlocked && styles.tileLabelLocked,
                                    ]}
                                >
                                    {item.name}
                                </Text>
                                {!unlocked && (
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
                                {active && unlocked && (
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
                        const unlocked = streak >= item.unlock;
                        const active = accessory === item.id;

                        return (
                            <PressableScale
                                key={item.id}
                                onPress={() => selectAccessory(item)}
                                disabled={!unlocked}
                                style={[
                                    styles.tile,
                                    active && styles.tileActive,
                                    !unlocked && styles.tileLocked,
                                ]}
                            >
                                <Text style={styles.emoji}>
                                    {ACCESSORY_EMOJI[item.id] || '✨'}
                                </Text>
                                <Text
                                    style={[
                                        styles.tileLabel,
                                        !unlocked && styles.tileLabelLocked,
                                    ]}
                                >
                                    {item.name}
                                </Text>
                                {!unlocked && (
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
                                {active && unlocked && (
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
        marginBottom: spacing.md,
    },
    title: {
        color: colors.text,
        fontSize: typography.heading,
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
    tileLocked: {
        opacity: 0.55,
    },
    swatch: {
        width: 44,
        height: 44,
        borderRadius: 14,
        borderWidth: 2,
    },
    emoji: {
        fontSize: 32,
        height: 44,
        textAlignVertical: 'center',
    },
    tileLabel: {
        color: colors.text,
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
    },
    tileLabelLocked: {
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
