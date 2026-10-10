import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    BackHandler,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
    Easing,
    ReduceMotion,
    runOnJS,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withDelay,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

import {
    fonts,
    gradients,
    gradientStops,
    landing,
    radius,
    shadows,
    spacing,
    typography,
} from '../theme/tokens';
import { playPop } from '../lib/sfx';
import { GradientFill } from './GradientFill';
import { PressableScale } from './PressableScale';
import { SectionLabel } from './SectionLabel';
import { SoftGlow } from './SoftGlow';
import { useSheetPortal } from './SheetPortal';

/** One action in the dialog grid — the phase-2 dock's button contract. */
export type DialogAction = {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    badge: string;
    badgeVariant?: 'free' | 'cost';
    highlighted?: boolean;
    onPress: () => void;
    accessibilityLabel?: string;
};

type Props = {
    visible: boolean;
    onClose: () => void;
    actions: DialogAction[];
};

/** Bubbly entrance: low-damping spring with slight overshoot. */
const CARD_SPRING = { damping: 11, stiffness: 180, mass: 1 };
const ITEM_SPRING = { damping: 10, stiffness: 220, mass: 1 };
const BACKDROP_MS = 200;
const EXIT_MS = 140;

/** Staggered pop-in wrapper for each action button. */
function BubbleItem({
    index,
    active,
    children,
}: {
    index: number;
    active: boolean;
    children: React.ReactNode;
}) {
    const reducedMotion = useReducedMotion();
    const progress = useSharedValue(0);

    useEffect(() => {
        if (!active) {
            progress.value = 0;
            return;
        }
        progress.value = reducedMotion
            ? 1
            : withDelay(100 + index * 55, withSpring(1, ITEM_SPRING));
    }, [active, index, reducedMotion, progress]);

    const style = useAnimatedStyle(() => ({
        opacity: progress.value,
        transform: [{ scale: 0.55 + progress.value * 0.45 }],
    }));

    return <Animated.View style={style}>{children}</Animated.View>;
}

function DialogActionButton({
    action,
}: {
    action: DialogAction;
}) {
    return (
        <PressableScale
            onPress={action.onPress}
            style={styles.actionButton}
            accessibilityLabel={
                action.accessibilityLabel ?? `${action.label}, costs ${action.badge}`
            }
        >
            <View
                style={[
                    styles.actionIconCircle,
                    action.highlighted && styles.actionIconCircleHighlighted,
                ]}
            >
                <Ionicons
                    name={action.icon}
                    size={20}
                    color={
                        action.highlighted ? landing.accent : landing.textMuted
                    }
                />
            </View>
            <Text style={styles.actionLabel}>{action.label}</Text>
            <View
                style={[
                    styles.actionBadge,
                    action.badgeVariant === 'free'
                        ? styles.actionBadgeFree
                        : styles.actionBadgeCost,
                ]}
            >
                <Text
                    style={[
                        styles.actionBadgeText,
                        action.badgeVariant === 'free' &&
                            styles.actionBadgeTextFree,
                    ]}
                >
                    {action.badge}
                </Text>
            </View>
        </PressableScale>
    );
}

/**
 * Centered actions dialog — the site's `.popup-dialog` recipe (navy →
 * deep-blue gradient, radial highlight, glass border) with a bubbly pop:
 * the card springs in from 0.8 scale and the actions pop in staggered.
 * A short pop SFX plays on open and on action taps (silent failure if the
 * expo-audio native module is missing on older installs). Reduced motion
 * gets a plain fade, no springs.
 *
 * Renders through the SheetPortal (not RN Modal) for the same reason as
 * BottomSheet: Dynamic's WebView must be able to draw above our overlays.
 */
export function ActionsDialog({ visible, onClose, actions }: Props) {
    const reducedMotion = useReducedMotion();
    const [rendered, setRendered] = useState(visible);

    const backdropOpacity = useSharedValue(0);
    const cardOpacity = useSharedValue(0);
    const cardScale = useSharedValue(0.8);

    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    const close = useCallback(() => {
        onCloseRef.current();
    }, []);

    useEffect(() => {
        if (visible) {
            setRendered(true);
            playPop(0.7);
            backdropOpacity.value = withTiming(1, {
                duration: BACKDROP_MS,
                reduceMotion: ReduceMotion.System,
            });
            cardOpacity.value = withTiming(1, {
                duration: reducedMotion ? 150 : 180,
            });
            cardScale.value = reducedMotion
                ? 1
                : withSpring(1, CARD_SPRING);
            return;
        }
        backdropOpacity.value = withTiming(0, { duration: EXIT_MS });
        cardOpacity.value = withTiming(0, { duration: EXIT_MS });
        cardScale.value = withTiming(0.92, { duration: EXIT_MS }, (finished) => {
            if (finished) runOnJS(setRendered)(false);
        });
    }, [visible, reducedMotion, backdropOpacity, cardOpacity, cardScale]);

    // Hardware back closes the dialog.
    useEffect(() => {
        if (!rendered) return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            close();
            return true;
        });
        return () => sub.remove();
    }, [rendered, close]);

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: backdropOpacity.value,
        pointerEvents: backdropOpacity.value > 0 ? 'auto' : 'none',
    }));

    const cardStyle = useAnimatedStyle(() => ({
        opacity: cardOpacity.value,
        transform: [{ scale: cardScale.value }],
    }));

    useSheetPortal(
        rendered ? (
            <View style={styles.container}>
                <Animated.View
                    style={[
                        StyleSheet.absoluteFill,
                        styles.backdrop,
                        backdropStyle,
                    ]}
                >
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={close}
                        accessibilityLabel="Close actions"
                    />
                </Animated.View>

                <Animated.View style={[styles.card, cardStyle]}>
                    <GradientFill
                        colors={gradients.landingDialog}
                        locations={gradientStops.landingDialog}
                        start={{ x: 0.2, y: 0 }}
                        end={{ x: 0.8, y: 1 }}
                        style={StyleSheet.absoluteFill}
                    />
                    <SoftGlow
                        color={landing.dialogHighlight}
                        style={styles.dialogHighlight}
                    />

                    <Pressable
                        onPress={close}
                        style={styles.closeButton}
                        accessibilityLabel="Close actions"
                        accessibilityRole="button"
                    >
                        <Ionicons
                            name="close"
                            size={20}
                            color={landing.textMuted}
                        />
                    </Pressable>

                    <View style={styles.header}>
                        <SectionLabel color={landing.eyebrow}>
                            Actions
                        </SectionLabel>
                    </View>

                    <View style={styles.grid}>
                        {actions.map((action, index) => (
                            <BubbleItem
                                key={action.label}
                                index={index}
                                active={visible}
                            >
                                <DialogActionButton
                                    action={{
                                        ...action,
                                        onPress: () => {
                                            Haptics.impactAsync(
                                                Haptics.ImpactFeedbackStyle.Light
                                            );
                                            playPop(0.4);
                                            close();
                                            action.onPress();
                                        },
                                    }}
                                />
                            </BubbleItem>
                        ))}
                    </View>
                </Animated.View>
            </View>
        ) : null
    );

    return null;
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
    },
    backdrop: {
        backgroundColor: landing.backdrop,
    },
    card: {
        width: '100%',
        maxWidth: 340,
        marginHorizontal: spacing.lg,
        borderRadius: radius.lg,
        backgroundColor: landing.navy,
        borderWidth: 1,
        borderColor: landing.glassBorderStrong,
        overflow: 'hidden',
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.md,
        paddingBottom: spacing.lg,
        ...shadows.popup,
    },
    dialogHighlight: {
        position: 'absolute',
        top: '-18%',
        right: '-25%',
        width: '70%',
        height: '55%',
    },
    closeButton: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2,
    },
    header: {
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: spacing.md,
    },
    actionButton: {
        alignItems: 'center',
        gap: 4,
        width: 120,
        minHeight: 44,
    },
    actionIconCircle: {
        width: 52,
        height: 52,
        borderRadius: 23,
        backgroundColor: landing.glass,
        borderWidth: 1,
        borderColor: landing.glassBorder,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionIconCircleHighlighted: {
        borderColor: landing.accent,
        backgroundColor: landing.glassHover,
    },
    actionLabel: {
        color: landing.text,
        fontSize: typography.micro,
        fontFamily: fonts.medium,
    },
    actionBadge: {
        paddingVertical: 2,
        paddingHorizontal: 7,
        borderRadius: 6,
    },
    actionBadgeFree: {
        backgroundColor: landing.glassHover,
    },
    actionBadgeCost: {
        backgroundColor: landing.glass,
    },
    actionBadgeText: {
        color: landing.textMuted,
        fontSize: 9,
        fontFamily: fonts.semiBold,
    },
    actionBadgeTextFree: {
        color: landing.accent,
    },
});
