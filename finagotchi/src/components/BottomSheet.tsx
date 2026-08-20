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
import * as Haptics from 'expo-haptics';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

import { colors, radius, spacing, typography } from '../theme/tokens';

type Props = {
    visible: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
};

const DRAG_THRESHOLD = 120;

export function BottomSheet({ visible, onClose, title, children }: Props) {
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const translateY = useSharedValue(height);
    const opacity = useSharedValue(0);

    const open = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        translateY.value = withSpring(0, {
            damping: 25,
            stiffness: 200,
            overshootClamping: true,
        });
        opacity.value = withTiming(1, { duration: 200 });
    }, [translateY, opacity]);

    const close = useCallback(() => {
        translateY.value = withSpring(height, {
            damping: 25,
            stiffness: 200,
        });
        opacity.value = withTiming(0, { duration: 200 }, (finished) => {
            if (finished) {
                runOnJS(onClose)();
            }
        });
    }, [height, onClose, translateY, opacity]);

    useEffect(() => {
        if (visible) {
            open();
        } else {
            close();
        }
    }, [visible, open, close]);

    const panGesture = Gesture.Pan()
        .activeOffsetY([-10, 10])
        .failOffsetX([-20, 20])
        .onUpdate((event) => {
            const y = event.translationY;
            if (y > 0) {
                translateY.value = y;
                opacity.value = Math.max(0, 1 - y / height);
            }
        })
        .onEnd((event) => {
            const shouldClose =
                event.translationY > DRAG_THRESHOLD ||
                event.velocityY > 500;

            if (shouldClose) {
                runOnJS(close)();
            } else {
                runOnJS(open)();
            }
        });

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        pointerEvents: opacity.value > 0 ? 'auto' : 'none',
    }));

    const sheetStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    return (
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
                    onPress={close}
                />
            </Animated.View>

            <Animated.View
                style={[
                    styles.sheet,
                    {
                        paddingBottom: Math.max(insets.bottom, 16),
                        maxHeight: height * 0.88,
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
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 2000,
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