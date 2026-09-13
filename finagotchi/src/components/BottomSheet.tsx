import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    BackHandler,
    Keyboard,
    Platform,
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
import * as Haptics from 'expo-haptics';
import Animated, {
    ReduceMotion,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

import { colors, radius, spacing, springs, typography } from '../theme/tokens';
import { useSheetPortal } from './SheetPortal';

type Props = {
    visible: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
};

const DRAG_THRESHOLD = 120;
const FLICK_VELOCITY = 500;

/**
 * Project where a gesture will come to rest given its release velocity.
 * Apple's exponential decay projection from "Designing Fluid Interfaces".
 */
function project(initialVelocity: number, decelerationRate = 0.998) {
    'worklet';
    return (initialVelocity / 1000) * decelerationRate / (1 - decelerationRate);
}

/**
 * Rubber-band a value past an edge so it resists instead of hard-stopping.
 */
function rubberband(overshoot: number, dimension: number, constant = 0.55) {
    'worklet';
    return (overshoot * dimension * constant) / (dimension + constant * overshoot);
}

export function BottomSheet({ visible, onClose, title, children }: Props) {
    const { height } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const translateY = useSharedValue(height);
    const opacity = useSharedValue(0);
    const keyboardOffset = useSharedValue(0);

    // The sheet renders through a portal at the app root so it escapes the
    // parent's layout and clipping (RN has no portals). Deliberately NOT an
    // RN Modal: a Modal is a separate native window that draws above
    // Dynamic's embedded-webview overlay, burying Dynamic's signature UI
    // under our sheets. The host stays mounted through the close animation
    // and the node unmounts only when it finishes.
    const [modalVisible, setModalVisible] = useState(visible);

    // Keep the latest onClose in a ref so `close` stays referentially stable.
    // Parents pass inline arrows, and without this the visible-effect below
    // re-fires on every parent render, restarting open/close animations.
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    // runOnJS must receive a stable JS-realm function. Creating the closure
    // inside the worklet callback (runOnJS(() => ...)) crashes worklets with
    // "isHostFunction(runtime)" when the frame callback fires.
    const notifyClosed = useCallback(() => {
        setModalVisible(false);
        onCloseRef.current();
    }, []);

    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [keyboardOpen, setKeyboardOpen] = useState(false);

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSub = Keyboard.addListener(showEvent, (event) => {
            setKeyboardHeight(event.endCoordinates.height);
            setKeyboardOpen(true);
        });
        const hideSub = Keyboard.addListener(hideEvent, () => {
            setKeyboardHeight(0);
            setKeyboardOpen(false);
        });

        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    useEffect(() => {
        keyboardOffset.value = withTiming(-keyboardHeight, {
            duration: Platform.OS === 'ios' ? 250 : 0,
        });
    }, [keyboardHeight, keyboardOffset]);

    const open = useCallback((velocity = 0) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const isFlick = Math.abs(velocity) > FLICK_VELOCITY;
        translateY.value = withSpring(0, {
            ...(isFlick ? springs.momentum : springs.default),
            velocity,
            reduceMotion: ReduceMotion.System,
        });
        opacity.value = withTiming(1, { duration: 200 });
    }, [translateY, opacity]);

    const close = useCallback((velocity = 0) => {
        const isFlick = Math.abs(velocity) > FLICK_VELOCITY;
        // Account for any active keyboard offset so the sheet fully exits
        // the screen even when the keyboard is currently pushing it up.
        const targetY = height - keyboardOffset.value;
        translateY.value = withSpring(targetY, {
            ...(isFlick ? springs.momentum : springs.default),
            velocity,
            reduceMotion: ReduceMotion.System,
        });
        opacity.value = withTiming(0, { duration: 200 }, (finished) => {
            if (finished) {
                runOnJS(notifyClosed)();
            }
        });
    }, [height, translateY, opacity, keyboardOffset, notifyClosed]);

    // Track whether the sheet was ever opened so a `visible=false` render on
    // mount doesn't run a pointless close animation and fire onClose.
    const hasOpenedRef = useRef(false);

    useEffect(() => {
        if (visible) {
            hasOpenedRef.current = true;
            setModalVisible(true);
            open();
        } else if (hasOpenedRef.current) {
            hasOpenedRef.current = false;
            close();
        }
    }, [visible, open, close]);

    const panGesture = Gesture.Pan()
        .activeOffsetY([-10, 10])
        .failOffsetX([-20, 20])
        .onUpdate((event) => {
            const y = event.translationY;
            if (y >= 0) {
                translateY.value = y;
                opacity.value = Math.max(0, 1 - y / height);
            } else {
                // Pulling up past the top: apply rubber-band resistance.
                const resisted = rubberband(-y, height * 0.35, 0.55);
                translateY.value = -resisted;
            }
        })
        .onEnd((event) => {
            const projectedY = event.translationY + project(event.velocityY);
            const shouldClose =
                projectedY > DRAG_THRESHOLD ||
                event.translationY > height * 0.45;

            if (shouldClose) {
                runOnJS(close)(event.velocityY);
            } else {
                runOnJS(open)(event.velocityY);
            }
        });

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        pointerEvents: opacity.value > 0 ? 'auto' : 'none',
    }));

    // Hardware back replaces Modal's onRequestClose.
    useEffect(() => {
        if (!modalVisible) return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            close();
            return true;
        });
        return () => sub.remove();
    }, [modalVisible, close]);

    const sheetStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: translateY.value + keyboardOffset.value },
        ],
    }));

    useSheetPortal(
        modalVisible ? (
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
                        onPress={() => close()}
                    />
                </Animated.View>

                <Animated.View
                    style={[
                        styles.sheet,
                        {
                            paddingBottom: Math.max(insets.bottom, 16),
                            maxHeight: keyboardOpen
                                ? height - keyboardHeight - 24
                                : height * 0.88,
                        },
                        sheetStyle,
                    ]}
                >
                    <GestureDetector gesture={panGesture}>
                        <View style={styles.dragHandle}>
                            <View style={styles.handle} />
                        </View>
                    </GestureDetector>

                    {title ? (
                        <Text style={styles.title}>{title}</Text>
                    ) : null}

                    {children}
                </Animated.View>
            </View>
        ) : null
    );

    return null;
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'flex-end',
    },
    backdrop: {
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    sheet: {
        width: '100%',
        backgroundColor: colors.surface,
        borderTopLeftRadius: radius.lg,
        borderTopRightRadius: radius.lg,
        borderTopWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        paddingTop: 12,
        paddingHorizontal: spacing.lg,
    },
    dragHandle: {
        alignSelf: 'stretch',
        alignItems: 'center',
        paddingVertical: 12,
        marginTop: -12,
    },
    handle: {
        alignSelf: 'center',
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.border,
        marginBottom: spacing.md,
    },
    title: {
        color: colors.text,
        fontSize: typography.heading,
        fontFamily: 'Poppins_700Bold',
        marginBottom: spacing.md,
    },
});
