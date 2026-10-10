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
    ScrollView,
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
import {
    formatTokenAmount,
    formatUsd,
    useWalletBalances,
} from '../features/wallet/balances';
import { TokenLogo } from '../screens/dca/TokenLogo';
import { ExportKeySheet } from './ExportKeySheet';
import { PressableScale } from './PressableScale';
import { SectionLabel } from './SectionLabel';
import { colors, fonts, landing, radius, shadows, spacing, springs, tracking, typography } from '../theme/tokens';

/**
 * Responsive drawer width: 85% of the screen, capped so foldables/tablets
 * don't get an oversized panel. Layout and both swipe gestures derive their
 * bounds from this, so they can never disagree on where "closed" is.
 */
export function getSidebarWidth(screenWidth: number): number {
    return Math.min(Math.round(screenWidth * 0.85), 340);
}
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

/**
 * Row icon: xStocks reuse the Backed logo fetch; SOL/USDC get the same
 * letter circle TokenLogo falls back to, so the column stays uniform.
 */
function BalanceIcon({ ticker, size = 26 }: { ticker: string; size?: number }) {
    if (ticker !== 'SOL' && ticker !== 'USDC') {
        return <TokenLogo ticker={ticker} size={size} />;
    }
    return (
        <View
            style={[
                styles.balanceIcon,
                { width: size, height: size, borderRadius: size / 2 },
            ]}
        >
            <Text style={[styles.balanceIconLetter, { fontSize: size * 0.42 }]}>
                {ticker.charAt(0)}
            </Text>
        </View>
    );
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
    /** Drawer width in px — gesture bounds follow the responsive layout. */
    sidebarWidth: number;
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
    sidebarWidth,
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
            translateX.value = Math.min(0, -sidebarWidth + x);
            opacity.value = Math.min(1, x / sidebarWidth);
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
                translateX.value = withSpring(-sidebarWidth, springs.default);
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
    const {
        rows: balanceRows,
        totalUsd,
        loading: balancesLoading,
    } = useWalletBalances(walletAddress, visible && wallet.connected);

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

    const internalTranslateX = useSharedValue(-getSidebarWidth(width));
    const internalOpacity = useSharedValue(0);

    const translateX = externalTranslateX ?? internalTranslateX;
    const opacity = externalOpacity ?? internalOpacity;
    const contentShift = useSharedValue(-16);
    const sidebarWidth = getSidebarWidth(width);

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
        if (translateX.value <= -sidebarWidth + 1 && opacity.value <= 0.01) return;
        const isFlick = Math.abs(velocity) > FLICK_VELOCITY;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        translateX.value = withSpring(-sidebarWidth, {
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
    }, [translateX, opacity, contentShift, sidebarWidth]);

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
                translateX.value = Math.max(-sidebarWidth, x);
                opacity.value = Math.max(0, 1 + x / sidebarWidth);
            }
        })
        .onEnd((event) => {
            const projectedX = event.translationX + project(event.velocityX);
            const shouldClose =
                projectedX < -SWIPE_THRESHOLD ||
                event.translationX < -sidebarWidth * 0.4;

            const velocity = event.velocityX;
            const isFlick = Math.abs(velocity) > FLICK_VELOCITY;
            const springConfig = isFlick ? springs.momentum : springs.default;

            if (shouldClose) {
                runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
                translateX.value = withSpring(-sidebarWidth, {
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
                                width: sidebarWidth,
                                height,
                                paddingTop: insets.top + spacing.lg,
                            },
                        ]}
                    >
                        <Animated.View style={[{ flex: 1 }, contentStyle]}>
                            {/* Content scrolls: the balances card made the
                                column taller than small screens, and a clipped
                                drawer is unnavigable. RNGH's ScrollView
                                negotiates with the close pan (vertical drags
                                fail it and scroll natively). */}
                            <ScrollView
                                style={styles.scroll}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{
                                    paddingBottom: insets.bottom + spacing.lg,
                                }}
                            >
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
                                                            ? landing.accent
                                                            : landing.text
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
                                <View style={styles.sectionHeader}>
                                    <SectionLabel>Wallet</SectionLabel>
                                </View>

                                <View style={styles.connectionRow}>
                                    <View style={styles.connectionIcon}>
                                        <Ionicons
                                            name="wallet-outline"
                                            size={22}
                                            color={landing.text}
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
                                    <View style={styles.balanceCard}>
                                        <View style={styles.balanceHeader}>
                                            <Text style={styles.balanceHeaderLabel}>
                                                Total balance
                                            </Text>
                                            <Text style={styles.balanceHeaderValue}>
                                                {totalUsd !== null
                                                    ? formatUsd(totalUsd)
                                                    : '–'}
                                            </Text>
                                        </View>
                                        {balanceRows.length > 0 ? (
                                            balanceRows.map((row, index) => (
                                                <View
                                                    key={row.ticker}
                                                    style={[
                                                        styles.balanceRow,
                                                        index > 0 &&
                                                            styles.balanceRowDivider,
                                                    ]}
                                                >
                                                    <BalanceIcon
                                                        ticker={row.ticker}
                                                    />
                                                    <View
                                                        style={styles.balanceRowBody}
                                                    >
                                                        <Text
                                                            style={
                                                                styles.balanceTicker
                                                            }
                                                        >
                                                            {row.ticker}
                                                        </Text>
                                                        <Text
                                                            style={
                                                                styles.balanceName
                                                            }
                                                            numberOfLines={1}
                                                        >
                                                            {row.name}
                                                        </Text>
                                                    </View>
                                                    <View
                                                        style={
                                                            styles.balanceRowValues
                                                        }
                                                    >
                                                        <Text
                                                            style={
                                                                styles.balanceUsd
                                                            }
                                                        >
                                                            {row.usdValue !==
                                                            null
                                                                ? formatUsd(
                                                                      row.usdValue
                                                                  )
                                                                : '–'}
                                                        </Text>
                                                        <Text
                                                            style={
                                                                styles.balanceAmount
                                                            }
                                                        >
                                                            {formatTokenAmount(
                                                                row.amount
                                                            )}{' '}
                                                            {row.ticker}
                                                        </Text>
                                                    </View>
                                                </View>
                                            ))
                                        ) : (
                                            <Text style={styles.balanceEmpty}>
                                                {balancesLoading
                                                    ? 'Fetching balances…'
                                                    : 'Balances unavailable'}
                                            </Text>
                                        )}
                                    </View>
                                ) : null}

                                {wallet.connected ? (
                                    <View style={styles.walletActions}>
                                        <PressableScale
                                            onPress={handleShowQr}
                                            style={styles.walletActionButton}
                                        >
                                            <Ionicons
                                                name="qr-code-outline"
                                                size={18}
                                                color={landing.onAccent}
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
                                            color={landing.textMuted}
                                        />
                                        <Text style={styles.exportText}>
                                            Export private key
                                        </Text>
                                    </PressableScale>
                                ) : null}
                            </View>
                            </ScrollView>

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
                                                        color={landing.onAccent}
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
        backgroundColor: 'rgba(6,29,61,0.6)',
    },
    sidebar: {
        position: 'absolute',
        left: 0,
        top: 0,
        backgroundColor: landing.navy,
        borderRightWidth: 1,
        borderRightColor: landing.glassBorderStrong,
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
        backgroundColor: landing.glassBorderStrong,
    },
    scroll: {
        flex: 1,
    },
    headerCard: {
        marginBottom: spacing.lg,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: landing.glass,
        borderWidth: 1,
        borderColor: landing.glassBorder,
        overflow: 'hidden',
    },
    headerGlow: {
        position: 'absolute',
        top: -40,
        right: -40,
        width: 110,
        height: 110,
        borderRadius: 55,
        backgroundColor: 'rgba(141,201,246,0.07)',
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
        backgroundColor: landing.glassActive,
        borderWidth: 1,
        borderColor: landing.glassBorder,
    },
    headerText: {
        flex: 1,
        gap: 2,
    },
    name: {
        color: landing.text,
        fontSize: typography.heading,
        fontFamily: fonts.bold,
        letterSpacing: tracking.heading,
    },
    subtitle: {
        color: landing.textMuted,
        fontSize: typography.small,
        fontFamily: fonts.medium,
    },
    levelBadge: {
        alignSelf: 'flex-start',
        marginTop: spacing.sm,
        paddingVertical: spacing.xs,
        paddingHorizontal: 10,
        borderRadius: radius.pill,
        backgroundColor: 'rgba(141,201,246,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(141,201,246,0.25)',
    },
    levelText: {
        color: landing.accent,
        fontSize: typography.micro,
        fontFamily: fonts.mono,
        letterSpacing: tracking.eyebrow,
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
        backgroundColor: landing.glass,
        borderWidth: 1,
        borderColor: landing.glassBorder,
    },
    navItemActive: {
        backgroundColor: 'rgba(141,201,246,0.10)',
        borderColor: 'rgba(141,201,246,0.35)',
    },
    navIconWrap: {
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
        backgroundColor: landing.glassActive,
    },
    navIconWrapActive: {
        backgroundColor: 'rgba(141,201,246,0.14)',
    },
    navLabel: {
        flex: 1,
        color: landing.text,
        fontSize: typography.body,
        fontFamily: fonts.medium,
    },
    navLabelActive: {
        color: landing.accent,
    },
    divider: {
        height: 1,
        backgroundColor: landing.glassBorder,
        marginBottom: spacing.lg,
    },
    section: {
        marginBottom: spacing.lg,
        gap: spacing.sm,
    },
    sectionHeader: {
        marginBottom: spacing.sm,
    },
    connectionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.sm + spacing.xs,
        paddingHorizontal: spacing.md,
        borderRadius: radius.md,
        backgroundColor: landing.glass,
        borderWidth: 1,
        borderColor: landing.glassBorder,
    },
    connectionIcon: {
        width: 38,
        height: 38,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
        backgroundColor: landing.glassActive,
    },
    connectionBody: {
        flex: 1,
        gap: 2,
    },
    connectionLabel: {
        color: landing.text,
        fontSize: typography.body,
        fontFamily: fonts.semiBold,
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
        backgroundColor: colors.success,
    },
    statusDotOffline: {
        backgroundColor: landing.textMuted,
    },
    statusText: {
        color: landing.textMuted,
        fontSize: typography.small,
        fontFamily: fonts.mono,
    },
    statusTextOffline: {
        color: landing.textMuted,
    },
    walletActions: {
        flexDirection: 'row',
        gap: spacing.sm,
        marginTop: spacing.xs,
    },
    balanceCard: {
        marginTop: spacing.sm,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: landing.glass,
        borderWidth: 1,
        borderColor: landing.glassBorder,
    },
    balanceHeader: {
        gap: 2,
        paddingBottom: spacing.sm,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: landing.glassBorder,
    },
    balanceHeaderLabel: {
        color: landing.textMuted,
        fontSize: typography.micro,
        fontFamily: fonts.mono,
        textTransform: 'uppercase',
        letterSpacing: tracking.eyebrow,
    },
    balanceHeaderValue: {
        color: landing.text,
        fontSize: typography.title,
        fontFamily: fonts.monoBold,
        letterSpacing: tracking.title,
        fontVariant: ['tabular-nums'],
    },
    balanceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.xs + 2,
    },
    balanceRowDivider: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: landing.glassBorder,
    },
    balanceIcon: {
        backgroundColor: landing.glassActive,
        alignItems: 'center',
        justifyContent: 'center',
    },
    balanceIconLetter: {
        color: landing.textMuted,
        fontFamily: fonts.semiBold,
    },
    balanceRowBody: {
        flex: 1,
        gap: 1,
    },
    balanceTicker: {
        color: landing.text,
        fontSize: typography.small,
        fontFamily: fonts.semiBold,
    },
    balanceName: {
        color: landing.textMuted,
        fontSize: typography.micro,
        fontFamily: fonts.regular,
    },
    balanceRowValues: {
        alignItems: 'flex-end',
        gap: 1,
    },
    balanceUsd: {
        color: landing.text,
        fontSize: typography.small,
        fontFamily: fonts.monoBold,
        fontVariant: ['tabular-nums'],
    },
    balanceAmount: {
        color: landing.textMuted,
        fontSize: typography.micro,
        fontFamily: fonts.mono,
        fontVariant: ['tabular-nums'],
    },
    balanceEmpty: {
        color: landing.textMuted,
        fontSize: typography.small,
        fontFamily: fonts.medium,
        paddingVertical: spacing.xs,
    },
    walletActionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        minHeight: 44,
        borderRadius: radius.sm,
        backgroundColor: landing.accent,
        ...shadows.glow,
    },
    disconnectButton: {
        backgroundColor: 'rgba(243,111,124,0.10)',
        borderWidth: 1,
        borderColor: 'rgba(243,111,124,0.35)',
        shadowOpacity: 0,
        elevation: 0,
    },
    walletActionText: {
        color: landing.onAccent,
        fontSize: typography.small,
        fontFamily: fonts.semiBold,
    },
    disconnectText: {
        color: colors.heart,
    },
    exportButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        minHeight: 40,
        marginTop: spacing.xs,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: landing.glassBorder,
        backgroundColor: landing.glass,
    },
    exportText: {
        color: landing.textMuted,
        fontSize: typography.small,
        fontFamily: fonts.medium,
    },
    qrOverlay: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(6,29,61,0.75)',
    },
    qrCard: {
        width: 300,
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: landing.navy,
        borderWidth: 1,
        borderColor: landing.glassBorderStrong,
        ...shadows.popup,
    },
    qrTitle: {
        color: landing.text,
        fontSize: typography.heading,
        fontFamily: fonts.bold,
        letterSpacing: tracking.heading,
        textAlign: 'center',
    },
    qrCodeWrap: {
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: '#FFFFFF',
    },
    qrAddress: {
        color: landing.textMuted,
        fontSize: typography.small,
        fontFamily: fonts.mono,
        textAlign: 'center',
    },
    qrShareButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        width: '100%',
        paddingVertical: spacing.sm,
        borderRadius: radius.sm,
        backgroundColor: landing.accent,
    },
    qrShareText: {
        color: landing.onAccent,
        fontSize: typography.body,
        fontFamily: fonts.semiBold,
    },
    qrCloseButton: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.sm,
    },
    qrCloseText: {
        color: landing.textMuted,
        fontSize: typography.body,
        fontFamily: fonts.semiBold,
    },
});
