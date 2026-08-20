import React, { useCallback, useEffect } from 'react';
import {
    Pressable,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';
import {
    Gesture,
    GestureDetector,
} from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname, Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { useWallet } from '../wallet/useWallet';
import { usePetStore } from '../features/pet/store';
import { colors, spacing, typography } from '../theme/tokens';

const SIDEBAR_WIDTH = 300;
const SWIPE_THRESHOLD = 60;
const EDGE_WIDTH = 24;

function truncateAddress(address: string | null) {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

type NavAction =
    | { type: 'route'; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; href: Href }
    | { type: 'action'; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; action: 'quests' | 'waitlist' };

const NAV_ITEMS: NavAction[] = [
    { type: 'route', label: 'My Pet', icon: 'happy-outline', href: '/(tabs)' },
    { type: 'action', label: 'Quests', icon: 'flag-outline', action: 'quests' },
    { type: 'action', label: 'Hardware Waitlist', icon: 'cube-outline', action: 'waitlist' },
];

type Props = {
    visible: boolean;
    onOpen: () => void;
    onClose: () => void;
    onOpenQuests: () => void;
    onOpenWaitlist: () => void;
};

export function Slidebar({
    visible,
    onOpen,
    onClose,
    onOpenQuests,
    onOpenWaitlist,
}: Props) {
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const wallet = useWallet();
    const router = useRouter();
    const pathname = usePathname();
    const petName = usePetStore((state) => state.name);

    const translateX = useSharedValue(-SIDEBAR_WIDTH);
    const opacity = useSharedValue(0);

    const animateOpen = useCallback(() => {
        translateX.value = withSpring(0, {
            damping: 25,
            stiffness: 200,
            overshootClamping: true,
        });
        opacity.value = withTiming(1, { duration: 200 });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, [opacity, translateX]);

    const animateClose = useCallback(() => {
        translateX.value = withSpring(-SIDEBAR_WIDTH, {
            damping: 25,
            stiffness: 200,
        });
        opacity.value = withTiming(0, { duration: 200 }, (finished) => {
            if (finished) {
                runOnJS(onClose)();
            }
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, [onClose, opacity, translateX]);

    useEffect(() => {
        if (visible) {
            animateOpen();
        } else {
            animateClose();
        }
    }, [visible, animateOpen, animateClose]);

    // Swipe the sidebar left to close.
    const sidebarPan = Gesture.Pan()
        .minDistance(20)
        .failOffsetY([-20, 20])
        .onUpdate((event) => {
            const x = event.translationX;
            if (x <= 0) {
                translateX.value = Math.max(-SIDEBAR_WIDTH, x);
                opacity.value = Math.max(0, 1 + x / SIDEBAR_WIDTH);
            }
        })
        .onEnd((event) => {
            const shouldClose =
                event.translationX < -SWIPE_THRESHOLD ||
                event.velocityX < -500;

            if (shouldClose) {
                runOnJS(animateClose)();
            } else {
                runOnJS(animateOpen)();
            }
        });

    // Swipe right from the left edge of the screen to open.
    const edgePan = Gesture.Pan()
        .minDistance(20)
        .failOffsetY([-30, 30])
        .onUpdate((event) => {
            const x = event.translationX;
            if (x >= 0) {
                translateX.value = Math.min(0, -SIDEBAR_WIDTH + x);
                opacity.value = Math.min(1, x / SIDEBAR_WIDTH);
            }
        })
        .onEnd((event) => {
            const shouldOpen =
                event.translationX > SWIPE_THRESHOLD ||
                event.velocityX > 500;

            if (shouldOpen) {
                runOnJS(onOpen)();
            } else {
                runOnJS(animateClose)();
            }
        });

    const isActiveRoute = useCallback(
        (href: Href) => {
            if (pathname === href) return true;
            if (href === '/(tabs)' && pathname === '/(tabs)/index') return true;
            return false;
        },
        [pathname]
    );

    const handleNav = useCallback(
        (item: NavAction) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onClose();

            if (item.type === 'route') {
                if (pathname !== item.href) {
                    router.navigate(item.href);
                }
            } else if (item.action === 'quests') {
                onOpenQuests();
            } else if (item.action === 'waitlist') {
                onOpenWaitlist();
            }
        },
        [onClose, onOpenQuests, onOpenWaitlist, pathname, router]
    );

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        pointerEvents: opacity.value > 0 ? 'auto' : 'none',
    }));

    const sidebarStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {/* Left-edge swipe handle: only active when the menu is hidden */}
            {!visible && (
                <GestureDetector gesture={edgePan}>
                    <Animated.View
                        style={[styles.edgeHandle, { height }]}
                        pointerEvents="auto"
                    />
                </GestureDetector>
            )}

            <View
                style={[styles.container, { width, height }]}
                pointerEvents={visible ? 'auto' : 'none'}
            >
                <Animated.View
                    style={[
                        StyleSheet.absoluteFill,
                        styles.backdrop,
                        backdropStyle,
                    ]}
                >
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={animateClose}
                    />
                </Animated.View>

                <GestureDetector gesture={sidebarPan}>
                    <Animated.View
                        style={[
                            styles.sidebar,
                            sidebarStyle,
                            {
                                width: SIDEBAR_WIDTH,
                                height,
                                paddingTop: insets.top + 60,
                            },
                        ]}
                    >
                        <View style={styles.handle} />

                        <Text style={styles.title}>
                            {petName ? petName : 'Menu'}
                        </Text>

                        <View style={styles.navSection}>
                            {NAV_ITEMS.map((item) => {
                                const active =
                                    item.type === 'route' &&
                                    isActiveRoute(item.href);
                                return (
                                    <Pressable
                                        key={item.label}
                                        style={({ pressed }) => [
                                            styles.navItem,
                                            active && styles.navItemActive,
                                            pressed && styles.navItemPressed,
                                        ]}
                                        onPress={() => handleNav(item)}
                                    >
                                        <Ionicons
                                            name={item.icon}
                                            size={22}
                                            color={
                                                active
                                                    ? colors.background
                                                    : colors.text
                                            }
                                        />
                                        <Text
                                            style={[
                                                styles.navLabel,
                                                active &&
                                                    styles.navLabelActive,
                                            ]}
                                        >
                                            {item.label}
                                        </Text>
                                        {active && (
                                            <View style={styles.activePill} />
                                        )}
                                    </Pressable>
                                );
                            })}
                        </View>

                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>Wallet</Text>

                            {wallet.connected ? (
                                <View style={styles.walletCard}>
                                    <View style={styles.statusRow}>
                                        <View style={styles.statusDot} />
                                        <Text style={styles.statusText}>
                                            Connected
                                        </Text>
                                    </View>
                                    <Text style={styles.address}>
                                        {truncateAddress(
                                            wallet.publicKey?.toBase58() ??
                                                null
                                        )}
                                    </Text>
                                </View>
                            ) : (
                                <View style={styles.walletCard}>
                                    <Text style={styles.disconnectedText}>
                                        No wallet connected
                                    </Text>
                                </View>
                            )}
                        </View>

                        {wallet.connected ? (
                            <Pressable
                                style={({ pressed }) => [
                                    styles.disconnectButton,
                                    pressed && styles.disconnectButtonPressed,
                                ]}
                                onPress={wallet.disconnect}
                            >
                                <Ionicons
                                    name="log-out-outline"
                                    size={18}
                                    color={colors.background}
                                />
                                <Text style={styles.disconnectText}>
                                    Disconnect wallet
                                </Text>
                            </Pressable>
                        ) : null}
                    </Animated.View>
                </GestureDetector>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 1000,
    },
    edgeHandle: {
        position: 'absolute',
        left: 0,
        top: 0,
        width: EDGE_WIDTH,
        zIndex: 999,
    },
    backdrop: {
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sidebar: {
        position: 'absolute',
        left: 0,
        top: 0,
        backgroundColor: colors.surface,
        borderRightWidth: 1,
        borderRightColor: colors.border,
        paddingHorizontal: spacing.lg,
    },
    handle: {
        position: 'absolute',
        top: 16,
        left: spacing.lg,
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.border,
    },
    title: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_700Bold',
        marginBottom: spacing.xl,
    },
    navSection: {
        marginBottom: spacing.xl,
        gap: spacing.sm,
    },
    navItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        borderRadius: 14,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
    },
    navItemActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    navItemPressed: {
        opacity: 0.8,
        transform: [{ scale: 0.98 }],
    },
    navLabel: {
        flex: 1,
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_600SemiBold',
    },
    navLabelActive: {
        color: colors.background,
    },
    activePill: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.background,
    },
    section: {
        marginBottom: spacing.xl,
    },
    sectionTitle: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: spacing.md,
    },
    walletCard: {
        backgroundColor: colors.background,
        borderRadius: 14,
        padding: spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.sm,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.primary,
    },
    statusText: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
    },
    address: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_500Medium',
    },
    disconnectedText: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_500Medium',
    },
    disconnectButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        backgroundColor: colors.danger,
        borderRadius: 14,
        paddingVertical: spacing.md,
    },
    disconnectButtonPressed: {
        opacity: 0.85,
        transform: [{ scale: 0.98 }],
    },
    disconnectText: {
        color: colors.background,
        fontSize: typography.body,
        fontFamily: 'Poppins_700Bold',
    },
});