import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Image,
    Modal,
    Pressable,
    Share,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
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
import { ExportKeySheet } from './ExportKeySheet';
import { PressableScale } from './PressableScale';
import { colors, radius, shadows, spacing, springs, typography } from '../theme/tokens';

export const SIDEBAR_WIDTH = 300;
const SWIPE_THRESHOLD = 60;
const OPEN_SWIPE_THRESHOLD = 30;
const FLICK_VELOCITY = 650;
// Horizontal pull must start within this distance of the left edge.
// Extends past Android's system back-gesture zone, which claims touches
// that start at the very screen edge on gesture-nav devices.
const EDGE_SWIPE_WIDTH = 44;
const ACTIVATE_DX = 8;
// Generous vertical tolerance: real drawer swipes are slightly diagonal, and
// a tight fail window kills the gesture before it ever activates.
const FAIL_DY = 36;

function truncateAddress(address: string | null) {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function project(initialVelocity: number, decelerationRate = 0.998) {
    'worklet';
    return (initialVelocity / 1000) * decelerationRate / (1 - decelerationRate);
}

type OpenGestureOptions = {
    translateX: SharedValue<number>;
    opacity: SharedValue<number>;
    enabled: boolean;
    onOpen: () => void;
};

/**
 * Edge-swipe gesture that opens the sidebar. Attach it with GestureDetector
 * around the real screen content (the pattern from the Expo gestures
 * tutorial): because the wrapped view IS the content, hit-testing keeps
 * working and every button underneath stays tappable. Manual activation
 * fails any touch that is not a horizontal pull starting at the left edge,
 * so taps, vertical scrolls, and other gestures pass through untouched.
 */
export function useSidebarOpenGesture({
    translateX,
    opacity,
    enabled,
    onOpen,
}: OpenGestureOptions) {
    const dragStartX = useSharedValue(0);
    const dragStartY = useSharedValue(0);

    return Gesture.Pan()
        .enabled(enabled)
        .manualActivation(true)
        .shouldCancelWhenOutside(false)
        .onTouchesDown((event, stateManager) => {
            'worklet';
            const touch = event.allTouches[0];
            if (touch && touch.absoluteX < EDGE_SWIPE_WIDTH) {
                dragStartX.value = touch.absoluteX;
                dragStartY.value = touch.absoluteY;
            } else {
                stateManager.fail();
            }
        })
        .minPointers(1)
        .onTouchesMove((event, stateManager) => {
            'worklet';
            const touch = event.allTouches[0];
            if (!touch) return;

            const dx = touch.absoluteX - dragStartX.value;
            const dy = touch.absoluteY - dragStartY.value;

            if (dx > ACTIVATE_DX && Math.abs(dy) < FAIL_DY) {
                stateManager.activate();
            } else if (Math.abs(dy) > FAIL_DY * 2 || dx < -ACTIVATE_DX * 3) {
                stateManager.fail();
            }
        })
        .onTouchesUp((_event, stateManager) => {
            'worklet';
            stateManager.fail();
        })
        .onUpdate((event) => {
            'worklet';
            const x = Math.max(0, event.translationX);
            translateX.value = Math.min(0, -SIDEBAR_WIDTH + x);
            opacity.value = Math.min(1, x / SIDEBAR_WIDTH);
        })
        .onEnd((event) => {
            'worklet';
            const projectedX = event.translationX + project(event.velocityX);
            const shouldOpen =
                projectedX > OPEN_SWIPE_THRESHOLD ||
                event.translationX > OPEN_SWIPE_THRESHOLD;

            if (shouldOpen) {
                runOnJS(onOpen)();
            } else {
                translateX.value = withSpring(-SIDEBAR_WIDTH, springs.default);
                opacity.value = withTiming(0, { duration: 200 });
            }
        });
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

    const [qrVisible, setQrVisible] = useState(false);
    const [exportVisible, setExportVisible] = useState(false);
    const walletAddress = wallet.publicKey?.toBase58() ?? null;

    const handleShowQr = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setQrVisible(true);
    }, []);

    const handleHideQr = useCallback(() => {
        setQrVisible(false);
    }, []);

    const handleShareAddress = useCallback(async () => {
        if (!walletAddress) return;
        try {
            await Share.share({ message: walletAddress });
        } catch {
            // User cancelled or share failed; ignore.
        }
    }, [walletAddress]);

    const internalTranslateX = useSharedValue(-SIDEBAR_WIDTH);
    const internalOpacity = useSharedValue(0);

    const translateX = externalTranslateX ?? internalTranslateX;
    const opacity = externalOpacity ?? internalOpacity;
    const contentShift = useSharedValue(-16);

    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    const animateOpen = useCallback((velocity = 0) => {
        if (translateX.value <= 1 && opacity.value >= 0.99) return;
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
        if (translateX.value <= -SIDEBAR_WIDTH + 1 && opacity.value <= 0.01) return;
        const isFlick = Math.abs(velocity) > FLICK_VELOCITY;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        translateX.value = withSpring(-SIDEBAR_WIDTH, {
            ...(isFlick ? springs.momentum : springs.default),
            velocity,
            reduceMotion: ReduceMotion.System,
        });
        opacity.value = withTiming(0, { duration: 220 }, (finished) => {
            if (finished) {
                runOnJS(onCloseRef.current)();
            }
        });
        contentShift.value = withTiming(-16, { duration: 180 });
    }, [translateX, opacity, contentShift]);

    useEffect(() => {
        if (visible) {
            animateOpen();
        } else {
            animateClose();
        }
    }, [visible, animateOpen, animateClose]);

    // Swipe the sidebar left to close. activeOffsetX engages after a few px
    // of horizontal travel (minDistance made the menu feel stuck for the
    // first 20px), and the wide fail window keeps slightly diagonal swipes
    // alive instead of rejecting them.
    const sidebarPan = Gesture.Pan()
        .activeOffsetX([-8, 8])
        .failOffsetY([-45, 45])
        .shouldCancelWhenOutside(false)
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
                                paddingTop: insets.top + spacing.lg,
                            },
                        ]}
                    >
                        <Animated.View style={[{ flex: 1 }, contentStyle]}>
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
                                                            ? colors.primary
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
                                                    {truncateAddress(walletAddress)}
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
                                </View>

                                {wallet.connected ? (
                                    <View style={styles.walletActions}>
                                        <PressableScale
                                            onPress={handleShowQr}
                                            style={styles.walletActionButton}
                                        >
                                            <Ionicons
                                                name="qr-code-outline"
                                                size={18}
                                                color={colors.background}
                                            />
                                            <Text style={styles.walletActionText}>
                                                Show QR
                                            </Text>
                                        </PressableScale>

                                        <PressableScale
                                            onPress={wallet.disconnect}
                                            style={[
                                                styles.walletActionButton,
                                                styles.disconnectButton,
                                            ]}
                                        >
                                            <Ionicons
                                                name="log-out-outline"
                                                size={18}
                                                color={colors.danger}
                                            />
                                            <Text
                                                style={[
                                                    styles.walletActionText,
                                                    styles.disconnectText,
                                                ]}
                                            >
                                                Disconnect
                                            </Text>
                                        </PressableScale>
                                    </View>
                                ) : null}

                                {wallet.connected && wallet.canExportPrivateKey ? (
                                    <PressableScale
                                        onPress={() => {
                                            Haptics.impactAsync(
                                                Haptics.ImpactFeedbackStyle.Light
                                            );
                                            setExportVisible(true);
                                        }}
                                        style={styles.exportButton}
                                    >
                                        <Ionicons
                                            name="key-outline"
                                            size={16}
                                            color={colors.textMuted}
                                        />
                                        <Text style={styles.exportText}>
                                            Export private key
                                        </Text>
                                    </PressableScale>
                                ) : null}
                            </View>

                            <Modal
                                visible={qrVisible}
                                transparent
                                animationType="fade"
                                onRequestClose={handleHideQr}
                            >
                                <View style={styles.qrOverlay}>
                                    <Pressable
                                        style={StyleSheet.absoluteFill}
                                        onPress={handleHideQr}
                                    />
                                    <View style={styles.qrCard}>
                                        <Text style={styles.qrTitle}>
                                            Your Solana address
                                        </Text>
                                        {walletAddress ? (
                                            <>
                                                <View style={styles.qrCodeWrap}>
                                                    <QRCode
                                                        value={walletAddress}
                                                        size={180}
                                                        backgroundColor="white"
                                                        color="black"
                                                    />
                                                </View>
                                                <Text style={styles.qrAddress}>
                                                    {walletAddress}
                                                </Text>
                                                <PressableScale
                                                    onPress={handleShareAddress}
                                                    style={styles.qrShareButton}
                                                >
                                                    <Ionicons
                                                        name="share-outline"
                                                        size={18}
                                                        color={colors.background}
                                                    />
                                                    <Text
                                                        style={styles.qrShareText}
                                                    >
                                                        Share address
                                                    </Text>
                                                </PressableScale>
                                            </>
                                        ) : (
                                            <Text style={styles.qrAddress}>
                                                No wallet connected
                                            </Text>
                                        )}
                                        <PressableScale
                                            onPress={handleHideQr}
                                            style={styles.qrCloseButton}
                                        >
                                            <Text style={styles.qrCloseText}>
                                                Close
                                            </Text>
                                        </PressableScale>
                                    </View>
                                </View>
                            </Modal>

                            <ExportKeySheet
                                visible={exportVisible}
                                onClose={() => setExportVisible(false)}
                                onReveal={wallet.exportPrivateKey}
                            />

                        </Animated.View>

                        <View style={styles.grabHandle} pointerEvents="none" />
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
        backgroundColor: 'rgba(14,27,46,0.97)',
        borderRightWidth: 1,
        borderRightColor: colors.border,
        paddingHorizontal: spacing.lg,
        shadowColor: '#000',
        shadowOffset: { width: 8, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 40,
        elevation: 20,
    },
    grabHandle: {
        position: 'absolute',
        right: 6,
        top: '50%',
        marginTop: -22,
        width: 4,
        height: 44,
        borderRadius: radius.pill,
        backgroundColor: 'rgba(255,255,255,0.14)',
    },
    headerCard: {
        marginBottom: spacing.lg,
        padding: spacing.md,
        borderRadius: radius.lg,
        backgroundColor: 'rgba(7,17,31,0.55)',
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
    },
    headerGlow: {
        position: 'absolute',
        top: -40,
        right: -40,
        width: 110,
        height: 110,
        borderRadius: 55,
        backgroundColor: 'rgba(53,215,255,0.07)',
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: radius.md,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
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
        paddingVertical: spacing.xs,
        paddingHorizontal: 10,
        borderRadius: radius.pill,
        backgroundColor: 'rgba(53,215,255,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(53,215,255,0.25)',
    },
    levelText: {
        color: colors.primary,
        fontSize: 10,
        fontFamily: 'Poppins_800ExtraBold',
        letterSpacing: 0.6,
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
        borderRadius: radius.md,
        backgroundColor: 'rgba(7,17,31,0.40)',
        borderWidth: 1,
        borderColor: colors.border,
    },
    navItemActive: {
        backgroundColor: 'rgba(53,215,255,0.10)',
        borderColor: 'rgba(53,215,255,0.35)',
    },
    navIconWrap: {
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    navIconWrapActive: {
        backgroundColor: 'rgba(53,215,255,0.14)',
    },
    navLabel: {
        flex: 1,
        color: colors.text,
        fontSize: typography.body,
        fontFamily: 'Poppins_600SemiBold',
    },
    navLabelActive: {
        color: colors.primary,
    },
    divider: {
        height: 1,
        backgroundColor: colors.border,
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
        paddingVertical: spacing.sm + spacing.xs,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        backgroundColor: 'rgba(7,17,31,0.40)',
        borderWidth: 1,
        borderColor: colors.border,
    },
    connectionIcon: {
        width: 38,
        height: 38,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
        backgroundColor: 'rgba(255,255,255,0.06)',
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
    connectionStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statusDot: {
        width: 7,
        height: 7,
        borderRadius: radius.pill,
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
    walletActions: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginTop: spacing.xs,
    },
    walletActionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        minHeight: 44,
        borderRadius: radius.md,
        backgroundColor: colors.primary,
        ...shadows.glow,
    },
    disconnectButton: {
        backgroundColor: 'rgba(255,100,124,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(255,100,124,0.35)',
        shadowOpacity: 0,
        elevation: 0,
    },
    walletActionText: {
        color: colors.background,
        fontSize: typography.small,
        fontFamily: 'Poppins_700Bold',
    },
    disconnectText: {
        color: colors.danger,
    },
    exportButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        minHeight: 40,
        marginTop: spacing.xs,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: 'rgba(7,17,31,0.40)',
    },
    exportText: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_600SemiBold',
    },
    qrOverlay: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.70)',
    },
    qrCard: {
        width: 300,
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
    },
    qrTitle: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_700Bold',
        textAlign: 'center',
    },
    qrCodeWrap: {
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: '#FFFFFF',
    },
    qrAddress: {
        color: colors.textMuted,
        fontSize: typography.small,
        fontFamily: 'Poppins_500Medium',
        textAlign: 'center',
    },
    qrShareButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        width: '100%',
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: colors.primary,
    },
    qrShareText: {
        color: colors.background,
        fontSize: typography.body,
        fontFamily: 'Poppins_800ExtraBold',
    },
    qrCloseButton: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.sm,
    },
    qrCloseText: {
        color: colors.textMuted,
        fontSize: typography.body,
        fontFamily: 'Poppins_600SemiBold',
    },
});
