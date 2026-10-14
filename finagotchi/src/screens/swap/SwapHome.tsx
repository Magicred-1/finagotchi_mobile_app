import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { PressableScale } from '../../components/PressableScale';
import { landing, radius, spacing, typography } from '../../theme/tokens';
import { useEarnUiStore } from '../earn/earnUiStore';
import { SwapSheet } from './SwapSheet';

/**
 * Swap entry card on the home screen (the "Swap" side of the earn program
 * switch): a promo banner that opens the swap sheet in place — never a
 * transparentModal route (iOS touch-swallowing bug, see DCAHome). A quest
 * card redirect (earnUiStore) opens the same sheet without the tap.
 */
export function SwapHome() {
    const [sheetOpen, setSheetOpen] = useState(false);

    // Quest redirect: an unfinished Jupiter quest was tapped in QuestsSheet.
    const swapOpenRequested = useEarnUiStore(
        (state) => state.swapOpenRequested
    );
    useEffect(() => {
        if (!swapOpenRequested) return;
        if (!useEarnUiStore.getState().consumeSwapOpen()) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSheetOpen(true);
    }, [swapOpenRequested]);

    return (
        <View>
            <PressableScale
                onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSheetOpen(true);
                }}
                style={styles.banner}
                accessibilityRole="button"
                accessibilityLabel="Open swap"
            >
                <View style={styles.bannerTint} />
                <View style={styles.logoOrb}>
                    <Ionicons
                        name="swap-horizontal"
                        size={20}
                        color={landing.accent}
                    />
                </View>
                <View style={styles.bannerText}>
                    <Text style={styles.bannerTitle}>
                        Swap SOL, USDC & stocks
                    </Text>
                    <Text style={styles.bannerBody} numberOfLines={1}>
                        best price via Jupiter · every swap farms XP
                    </Text>
                </View>
                <View style={styles.bannerChevron}>
                    <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={landing.accent}
                    />
                </View>
            </PressableScale>

            <SwapSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: landing.glassActive,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: landing.glassBorder,
        padding: spacing.md,
        overflow: 'hidden',
    },
    bannerTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(141,201,246,0.07)',
    },
    logoOrb: {
        width: 40,
        height: 40,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(141,201,246,0.14)',
    },
    bannerText: {
        flex: 1,
        gap: 2,
    },
    bannerTitle: {
        color: landing.text,
        fontSize: typography.small,
        fontFamily: 'DMSans_600SemiBold',
    },
    bannerBody: {
        color: landing.textMuted,
        fontSize: typography.small,
        fontFamily: 'DMSans_400Regular',
    },
    bannerChevron: {
        width: 26,
        height: 26,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(141,201,246,0.14)',
    },
});
