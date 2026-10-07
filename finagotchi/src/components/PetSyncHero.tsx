import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import Animated, {
    ReduceMotion,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';

import { colors, radius } from '../theme/tokens';

/**
 * Resolved once at module scope: expo-gl is a native module absent from
 * runtime-1.2.6 builds. Its JS (GLView.js) calls requireNativeModule at module
 * scope and would throw on those builds, so the 3D implementation module is
 * only ever imported when this check passes — same pattern as
 * features/ble/locationPermission.ts. expo-modules-core itself is always
 * present and never throws for a missing module here.
 */
const HAS_EXPO_GL = (() => {
    try {
        return (
            requireOptionalNativeModule('ExponentGLObjectManager') !== null
        );
    } catch {
        return false;
    }
})();

const LazyTeardrop = HAS_EXPO_GL
    ? React.lazy(() => import('./PetSyncHeroGL'))
    : null;

/** 2D stand-in while the runtime lacks expo-gl: mascot with a breathing ring. */
function FallbackPulse({ size }: { size: number }) {
    const ringScale = useSharedValue(1);
    const ringOpacity = useSharedValue(0.5);

    useEffect(() => {
        ringScale.value = withRepeat(
            withTiming(1.25, { duration: 1400, reduceMotion: ReduceMotion.System }),
            -1,
            true
        );
        ringOpacity.value = withRepeat(
            withTiming(0.15, { duration: 1400, reduceMotion: ReduceMotion.System }),
            -1,
            true
        );
    }, [ringScale, ringOpacity]);

    const ringStyle = useAnimatedStyle(() => ({
        transform: [{ scale: ringScale.value }],
        opacity: ringOpacity.value,
    }));

    return (
        <View style={[styles.frame, { width: size, height: size }]}>
            <Animated.View
                style={[
                    styles.ring,
                    {
                        width: size * 0.72,
                        height: size * 0.72,
                        borderRadius: radius.pill,
                    },
                    ringStyle,
                ]}
            />
            <Image
                source={require('../../assets/ghost-icon-animated.gif')}
                style={{ width: size * 0.55, height: size * 0.55 }}
                resizeMode="contain"
            />
        </View>
    );
}

/**
 * Hero visual for the BLE connect/sync sheet: the 3D teardrop when expo-gl is
 * in the runtime, the pulsing mascot otherwise. Zero native-module crashes
 * either way.
 */
export function PetSyncHero({ size = 140 }: { size?: number }) {
    if (LazyTeardrop) {
        return (
            <React.Suspense fallback={<FallbackPulse size={size} />}>
                <LazyTeardrop size={size} />
            </React.Suspense>
        );
    }
    return <FallbackPulse size={size} />;
}

const styles = StyleSheet.create({
    frame: {
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
    },
    ring: {
        position: 'absolute',
        borderWidth: 1,
        borderColor: colors.primary,
    },
});
