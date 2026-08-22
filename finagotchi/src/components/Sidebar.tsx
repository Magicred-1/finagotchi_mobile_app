import React, { useCallback, useEffect } from 'react';
import {
    Alert,
    Image,
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
    ReduceMotion,
    SharedValue,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { useWallet } from '../wallet/useWallet';
import { usePetStore } from '../features/pet/store';
import { PressableScale } from './PressableScale';
import { colors, spacing, springs, typography } from '../theme/tokens';

export const SIDEBAR_WIDTH = 300;
const SWIPE_THRESHOLD = 60;
const FLICK_VELOCITY = 650;

function truncateAddress(address: string | null) {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function project(initialVelocity: number, decelerationRate = 0.998) {
    'worklet';
    return (initialVelocity / 1000) * decelerationRate / (1 - decelerationRate);
}

type NavAction =
    | { type: 'route'; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; href: Href }
    | { type: 'action'; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; action: 'quests' | 'waitlist' };

const NAV_ITEMS: NavAction[] = [
    { type: 'route', label: 'My Pet', icon: 'happy-outline', href: '/(tabs)' },
    { type: 'action', label: 'Quests', icon: 'flag-outline', action: 'quests' },
    { type: 'action', label: 'Join Waitlist', icon: 'cube-outline', action: 'waitlist' },
];

type Props = {
    visible: boolean;
    onOpen: () => void;
    onClose: () => void;
    onOpenQuests: () => void;
    onOpenWaitlist: () => void;
    translateX?: SharedValue<number>;
    opacity?: SharedValue<number>;
};

export function Sidebar({
    visible,
    onClose,
    onOpenQuests,
    onOpenWaitlist,
    translateX: externalTranslateX,
    opacity: externalOpacity,
}: Props) {
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const wallet = useWallet();
    const router = useRouter();
    const pathname = usePathname();
    const petName = usePetStore((state) => state.name);
    const stage = usePetStore((state) => state.stage);

    const internalTranslateX = useSharedValue(-SIDEBAR_WIDTH);
    const internalOpacity = useSharedValue(0);

    const translateX = externalTranslateX ?? internalTranslateX;
    const opacity = externalOpacity ?? internalOpacity;
    const contentShift = useSharedValue(16);

    const animateOpen = useCallback((velocity = 0) => {
        const isFlick = Math.abs(velocity) > FLICK_VELOCITY;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        translateX.value = withSpring(0, {
            ...(isFlick ? springs.momentum : springs.default),
            velocity,
            reduceMotion: ReduceMotion.System,
        });
        opacity.value = withTiming(1, { duration: 250 });
        contentShift.value = withSpring(0, {
            ...springs.default,
            reduceMotion: ReduceMotion.System,
        });
    }, [translateX, opacity, contentShift]);

    const animateClose = useCallback((velocity = 0) => {
        const isFlick = Math.abs(velocity) > FLICK_VELOCITY;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        translateX.value = withSpring(-SIDEBAR_WIDTH, {
            ...(isFlick ? springs.momentum : springs.default),
            velocity,
            reduceMotion: ReduceMotion.System,
        });
        opacity.value = withTiming(0, { duration: 220 }, (finished) => {
            if (finished) {
                runOnJS(onClose)();
            }
        });
        contentShift.value = withTiming(16, { duration: 180 });
    }, [onClose, translateX, opacity, contentShift]);

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
            const projectedX = event.translationX + project(event.velocityX);
            const shouldClose =
                projectedX < -SWIPE_THRESHOLD ||
                event.translationX < -SIDEBAR_WIDTH * 0.4;

            const velocity = event.velocityX;
            const isFlick = Math.abs(velocity) > FLICK_VELOCITY;
            const springConfig = isFlick ? springs.momentum : springs.default;

            if (shouldClose) {
                runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
                translateX.value = withSpring(-SIDEBAR_WIDTH, {
                    ...springConfig,
                    velocity,
                    reduceMotion: ReduceMotion.System,
                });
                opacity.value = withTiming(0, { duration: 220 }, (finished) => {
                    if (finished) runOnJS(onClose)();
                });
            } else {
                runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
                translateX.value = withSpring(0, {
                    ...springConfig,
                    velocity,
                    reduceMotion: ReduceMotion.System,
                });
                opacity.value = withTiming(1, { duration: 220 });
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

    const handleAddBank = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Alert.alert('Bank accounts', 'Linking bank accounts is coming soon.');
    };

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        pointerEvents: opacity.value > 0 ? 'auto' : 'none',
    }));

    const sidebarStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const contentStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateX: contentShift.value }],
    }));

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
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
                        onPress={() => animateClose()}
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
                                paddingTop: insets.top + 48,
                            },
                        ]}
                    >
                        <Animated.View style={[{ flex: 1 }, contentStyle]}>
                            <View style={styles.handle} />

                            {/* HEADER */}
                            <View style={styles.headerCard}>
                                <View style={styles.headerGlow} />
                                <View style={styles.headerContent}>
                                    <Image
                                        source={require('../../assets/icon.png')}
                                        style={styles.avatar}
                                        resizeMode="contain"
                                    />
                                    <View style={styles.headerText}>
                                        <Text style={styles.name} numberOfLines={1}>
                                            {petName || 'Finny'}
                                        </Text>
                                        <Text style={styles.subtitle}>
                                            {petName ? 'Your companion' : 'Welcome'}
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.levelBadge}>
                                    <Text style={styles.levelText}>Stage {stage}</Text>
                                </View>
                            </View>

                            {/* NAVIGATION */}
                            <View style={styles.navSection}>
                                {NAV_ITEMS.map((item) => {
                                    const active =
                                        item.type === 'route' &&
                                        isActiveRoute(item.href);

                                    return (
                                        <PressableScale
                                            key={item.label}
                                            style={[
                                                styles.navItem,
                                                active && styles.navItemActive,
                                            ]}
                                            onPress={() => handleNav(item)}
                                        >
                                            <View
                                                style={[
                                                    styles.navIconWrap,
                                                    active &&
                                                        styles.navIconWrapActive,
                                                ]}
                                            >
                                                <Ionicons
                                                    name={item.icon}
                                                    size={20}
                                                    color={
                                                        active
                                                            ? colors.background
                                                            : colors.text
                                                    }
                                                />
                                            </View>
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
                                                <View
                                                    style={styles.activeAccent}
                                                />
                                            )}
                                        </PressableScale>
                                    );
                                })}
                            </View>

                            <View style={styles.divider} />

                            {/* WALLET */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Wallet</Text>

                                <View style={styles.connectionRow}>
                                    <View style={styles.connectionIcon}>
                                        <Ionicons
                                            name="wallet-outline"
                                            size={22}
                                            color={colors.text}
                                        />
                                    </View>
                                    <View style={styles.connectionBody}>
                                        <Text style={styles.connectionLabel}>
                                            Solana wallet
                                        </Text>
                                        {wallet.connected ? (
                                            <View style={styles.connectionStatus}>
                                                <View style={styles.statusDot} />
                                                <Text style={styles.statusText}>
                                                    {truncateAddress(
                                                        wallet.publicKey?.toBase58() ??
                                                            null
                                                    )}
                                                </Text>
                                            </View>
                                        ) : (
                                            <View style={styles.connectionStatus}>
                                                <View
                                                    style={[
                                                        styles.statusDot,
                                                        styles.statusDotOffline,
                                                    ]}
                                                />
                                                <Text
                                                    style={[
                                                        styles.statusText,
                                                        styles.statusTextOffline,
                                                    ]}
                                                >
                                                    Not connected
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                    {wallet.connected ? (
                                        <PressableScale
                                            onPress={wallet.disconnect}
                                            style={styles.iconButton}
                                            hitSlop={8}
                                        >
                                            <Ionicons
                                                name="log-out-outline"
                                                size={18}
                                                color={colors.danger}
                                            />
                                        </PressableScale>
                                    ) : null}
                                </View>

                                {/* BANK ACCOUNTS */}
                                <View style={styles.connectionRow}>
                                    <View
                                        style={[
                                            styles.connectionIcon,
                                            styles.connectionIconMuted,
                                        ]}
                                    >
                                        <Ionicons
                                            name="card-outline"
                                            size={22}
                                            color={colors.textMuted}
                                        />
                                    </View>
                                    <View style={styles.connectionBody}>
                                        <Text
                                            style={[
                                                styles.connectionLabel,
                                                styles.connectionLabelMuted,
                                            ]}
                                        >
                                            Bank accounts
                                        </Text>
                                        <Text
                                            style={[
                                                styles.statusText,
                                                styles.statusTextOffline,
                                            ]}
                                        >
                                            No accounts linked
                                        </Text>
                                    </View>
                                    <PressableScale
                                        onPress={handleAddBank}
                                        style={styles.addButton}
                                        hitSlop={8}
                                    >
                                        <Ionicons
                                            name="add"
                                            size={18}
                                            color={colors.primary}
                                        />
                                    </PressableScale>
                                </View>
                            </View>
                        </Animated.View>
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
    backdrop: {
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    sidebar: {
        position: 'absolute',
        left: 0,
        top: 0,
        backgroundColor: 'rgba(14,27,46,0.96)',
        borderRightWidth: 1,
        borderRightColor: 'rgba(255,255,255,0.08)',
        paddingHorizontal: spacing.lg,
        shadowColor: '#000',
        shadowOffset: { width: 8, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 40,
        elevation: 20,
    },
    handle: {
        position: 'absolute',
        top: 16,
        left: spacing.lg,
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    headerCard: {
        marginBottom: spacing.xl,
        padding: spacing.md,
        borderRadius: 22,
        backgroundColor: 'rgba(7,17,31,0.55)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
    },
    headerGlow: {
        position: 'absolute',
        top: -30,
        right: -30,
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(114,228,90,0.10)',
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 14,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
    },
    headerText: {
        flex: 1,
        gap: 2,
    },
    name: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_700Bold',
        letterSpacing: -0.3,
    },
    subtitle: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
    },
    levelBadge: {
        alignSelf: 'flex-start',
        marginTop: spacing.sm,
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 10,
        backgroundColor: 'rgba(114,228,90,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(114,228,90,0.20)',
    },
    levelText: {
        color: colors.primary,
        fontSize: 10,
        fontFamily: 'Poppins_800ExtraBold',
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    navSection: {
        marginBottom: spacing.lg,
        gap: spacing.sm,
    },
    navItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        borderRadius: 16,
        backgroundColor: 'rgba(7,17,31,0.40)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    navItemActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    navIconWrap: {
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    navIconWrapActive: {
        backgroundColor: 'rgba(7,17,31,0.25)',
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
    activeAccent: {
        position: 'absolute',
        left: 0,
        top: 12,
        bottom: 12,
        width: 3,
        borderTopRightRadius: 3,
        borderBottomRightRadius: 3,
        backgroundColor: colors.background,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        marginBottom: spacing.lg,
    },
    section: {
        marginBottom: spacing.lg,
        gap: spacing.sm,
    },
    sectionTitle: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: spacing.sm,
    },
    connectionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        borderRadius: 16,
        backgroundColor: 'rgba(7,17,31,0.40)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    connectionIcon: {
        width: 38,
        height: 38,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 11,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    connectionIconMuted: {
        backgroundColor: 'rgba(255,255,255,0.03)',
    },
    connectionBody: {
        flex: 1,
        gap: 2,
    },
    connectionLabel: {
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_600SemiBold',
    },
    connectionLabelMuted: {
        color: colors.textMuted,
    },
    connectionStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statusDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: colors.primary,
    },
    statusDotOffline: {
        backgroundColor: colors.textMuted,
    },
    statusText: {
        color: colors.primary,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
    },
    statusTextOffline: {
        color: colors.textMuted,
    },
    iconButton: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        backgroundColor: 'rgba(255,100,124,0.10)',
    },
    addButton: {
        width: 32,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 10,
        backgroundColor: 'rgba(114,228,90,0.10)',
    },
});
