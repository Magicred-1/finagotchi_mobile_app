import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
    Easing,
    ReduceMotion,
    useAnimatedStyle,
    useReducedMotion,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

import {
    Stage1Egg,
    Stage2Coinling,
    Stage3Hodler,
    Stage5Whale,
} from './PetSprites';
import { usePetStore } from '../features/pet/store';
import { colors } from '../theme/tokens';

export type PetMood =
    | 'sleeping'
    | 'waiting'
    | 'happy'
    | 'proud'
    | 'calm';

export type PetReaction = 'jump' | 'spin' | 'glow' | 'dance';

type Props = {
    mood?: PetMood;
    reaction?: PetReaction;
};

const MOOD_OVERLAYS: Record<PetMood, string> = {
    sleeping: '💤',
    waiting: '⏰',
    happy: '✨',
    proud: '👑',
    calm: '🌿',
};

export function PetCanvas({ mood = 'waiting', reaction }: Props) {
    const stage = usePetStore((state) => state.stage);
    const reducedMotion = useReducedMotion();
    const floatAnim = useSharedValue(0);
    const reactionScale = useSharedValue(1);
    const reactionRotate = useSharedValue(0);
    const reactionOpacity = useSharedValue(1);

    useEffect(() => {
        if (reducedMotion) {
            floatAnim.value = 0;
            return;
        }
        floatAnim.value = withRepeat(
            withTiming(-8, {
                duration: 1200,
                easing: Easing.inOut(Easing.cubic),
            }),
            -1,
            true
        );
    }, [reducedMotion]);

    useEffect(() => {
        if (!reaction) return;

        // Reset reaction values so repeated triggers animate from baseline.
        reactionScale.value = 1;
        reactionRotate.value = 0;
        reactionOpacity.value = 1;

        if (reducedMotion) {
            return;
        }

        switch (reaction) {
            case 'jump':
                reactionScale.value = withSequence(
                    withTiming(1.2, { duration: 180 }),
                    withTiming(0.95, { duration: 180 }),
                    withTiming(1.1, { duration: 180 }),
                    withTiming(1, { duration: 180 })
                );
                break;
            case 'spin':
                reactionRotate.value = withTiming(360, {
                    duration: 600,
                    easing: Easing.out(Easing.cubic),
                });
                break;
            case 'glow':
                reactionOpacity.value = withSequence(
                    withTiming(0.5, { duration: 300 }),
                    withTiming(1, { duration: 300 }),
                    withTiming(0.6, { duration: 300 }),
                    withTiming(1, { duration: 300 })
                );
                break;
            case 'dance':
                reactionRotate.value = withSequence(
                    withTiming(-12, { duration: 150 }),
                    withTiming(12, { duration: 150 }),
                    withTiming(-12, { duration: 150 }),
                    withTiming(12, { duration: 150 }),
                    withTiming(0, { duration: 150 })
                );
                reactionScale.value = withSequence(
                    withTiming(1.1, { duration: 150 }),
                    withTiming(0.95, { duration: 150 }),
                    withTiming(1.1, { duration: 150 }),
                    withTiming(1, { duration: 150 })
                );
                break;
        }
    }, [reaction, reducedMotion]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: floatAnim.value },
            { scale: reactionScale.value },
            { rotate: `${reactionRotate.value}deg` },
        ],
        opacity: reactionOpacity.value,
    }));

    const auraStyle = useAnimatedStyle(() => ({
        opacity: mood === 'calm' ? withTiming(1, { duration: 600 }) : 0,
    }));

    const overlayScale = useSharedValue(1);

    useEffect(() => {
        if (reducedMotion) {
            overlayScale.value = 1;
            return;
        }
        overlayScale.value = withRepeat(
            withTiming(1.15, {
                duration: 900,
                easing: Easing.inOut(Easing.cubic),
            }),
            -1,
            true
        );
    }, [reducedMotion, overlayScale]);

    const overlayPulse = useAnimatedStyle(() => ({
        transform: [{ scale: overlayScale.value }],
    }));

    const renderPet = () => {
        switch (stage) {
            case 1:
                return <Stage1Egg size={150} />;
            case 2:
                return <Stage2Coinling size={150} />;
            case 3:
                return <Stage3Hodler size={150} />;
            case 4:
                return <Stage3Hodler size={150} />;
            case 5:
                return <Stage5Whale size={150} />;
            default:
                return <Stage1Egg size={150} />;
        }
    };

    const overlay = useMemo(() => MOOD_OVERLAYS[mood], [mood]);

    return (
        <View style={styles.container}>
            {mood === 'calm' ? (
                <Animated.View style={[styles.aura, auraStyle]} />
            ) : null}

            <Animated.View style={[styles.petWrap, animatedStyle]}>
                {renderPet()}
            </Animated.View>

            <Animated.View
                style={[
                    styles.overlay,
                    styles[mood],
                    overlayPulse,
                ]}
            >
                <Text style={styles.overlayText}>{overlay}</Text>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: 160,
        height: 160,
        alignItems: 'center',
        justifyContent: 'center',
    },
    petWrap: {
        width: 150,
        height: 150,
        alignItems: 'center',
        justifyContent: 'center',
    },
    aura: {
        position: 'absolute',
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: 'rgba(114,228,90,0.18)',
    },
    overlay: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    overlayText: {
        fontSize: 22,
    },
    sleeping: {
        top: 16,
        right: 24,
    },
    waiting: {
        top: 20,
        right: 22,
    },
    happy: {
        top: 12,
        left: 18,
    },
    proud: {
        top: 4,
    },
    calm: {
        bottom: 14,
        right: 22,
    },
});
