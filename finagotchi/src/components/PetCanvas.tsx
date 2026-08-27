import React, { memo, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { StateId } from '../engine/engine';
import {
  usePetStore,
  type PetAccessory,
  type PetStage as NumericStage,
} from '../features/pet/store';
import { colors } from '../theme/tokens';
import { RadialPet } from './RadialPet';

export type PetMoodLabel =
  | 'sleeping'
  | 'waiting'
  | 'happy'
  | 'proud'
  | 'calm'
  | 'sad';
/** @deprecated kept for compatibility with existing imports */
export type PetMood = PetMoodLabel;
export type PetReaction = 'jump' | 'spin' | 'glow' | 'dance';

type Props = {
  mood?: PetMoodLabel;
  reaction?: PetReaction;
  reactionKey?: number | string;
  accessory?: PetAccessory;
  lifeTimeLeft?: string;
  lifeTimerEndsAt?: string | null;
  isSpectral?: boolean;
  onTap?: () => void;
  onEvolve?: (stage: NumericStage) => void;
};

const STAGE_TO_RADIAL: Record<NumericStage, StateId> = {
  1: 'egg',
  2: 'coinling',
  3: 'coinling',
  4: 'hodler',
  5: 'whale',
};

function toRadialMood(
  mood: PetMoodLabel
): import('../engine/expressions').PetMood {
  switch (mood) {
    case 'sleeping':
      return 'sleepy';
    case 'proud':
      return 'happy';
    default:
      return mood;
  }
}

function PetCanvasInner({
  mood = 'waiting',
  reaction,
  reactionKey,
  accessory = 'none',
  lifeTimeLeft,
  lifeTimerEndsAt,
  isSpectral = false,
  onTap,
  onEvolve,
}: Props) {
  const stage = usePetStore((state) => state.stage);
  const previousStage = useRef(stage);

  useEffect(() => {
    if (stage > previousStage.current) {
      onEvolve?.(stage);
    }
    previousStage.current = stage;
  }, [stage, onEvolve]);

  // A single shared time value drives all idle motion in the worklet,
  // avoiding multiple concurrent Reanimated repeat animations.
  const time = useSharedValue(0);
  const reactionScale = useSharedValue(1);
  const reactionRotate = useSharedValue(0);
  const reactionOpacity = useSharedValue(1);

  useEffect(() => {
    time.value = withRepeat(
      withTiming(1, { duration: 4000, easing: Easing.linear }),
      -1,
      false
    );
  }, [time]);

  useEffect(() => {
    if (!reaction) return;

    switch (reaction) {
      case 'jump': {
        reactionScale.value = withSequence(
          withSpring(1.28, { damping: 10, stiffness: 340 }),
          withSpring(0.88, { damping: 11, stiffness: 260 }),
          withSpring(1, { damping: 13, stiffness: 220 })
        );
        break;
      }
      case 'spin': {
        reactionRotate.value = withTiming(reactionRotate.value + 360, {
          duration: 650,
          easing: Easing.out(Easing.cubic),
        });
        reactionScale.value = withSequence(
          withTiming(0.9, { duration: 120 }),
          withSpring(1.08, { damping: 10, stiffness: 240 }),
          withSpring(1, { damping: 12, stiffness: 240 })
        );
        break;
      }
      case 'glow': {
        reactionScale.value = withSequence(
          withTiming(1.16, { duration: 160 }),
          withTiming(1.04, { duration: 180 }),
          withTiming(1.14, { duration: 180 }),
          withTiming(1.04, { duration: 180 }),
          withTiming(1.12, { duration: 180 }),
          withTiming(1, { duration: 200 })
        );
        reactionOpacity.value = withSequence(
          withTiming(0.72, { duration: 160 }),
          withTiming(1, { duration: 180 }),
          withTiming(0.72, { duration: 180 }),
          withTiming(1, { duration: 180 }),
          withTiming(0.72, { duration: 180 }),
          withTiming(1, { duration: 200 })
        );
        break;
      }
      case 'dance': {
        reactionScale.value = withSequence(
          withTiming(1.06, { duration: 110 }),
          withTiming(0.94, { duration: 110 }),
          withTiming(1.06, { duration: 110 }),
          withTiming(0.94, { duration: 110 }),
          withTiming(1.06, { duration: 110 }),
          withTiming(0.94, { duration: 110 }),
          withTiming(1.04, { duration: 110 }),
          withSpring(1, { damping: 12, stiffness: 240 })
        );
        reactionRotate.value = withSequence(
          withTiming(-14, { duration: 110 }),
          withTiming(14, { duration: 110 }),
          withTiming(-14, { duration: 110 }),
          withTiming(14, { duration: 110 }),
          withTiming(-14, { duration: 110 }),
          withTiming(14, { duration: 110 }),
          withTiming(-8, { duration: 110 }),
          withSpring(0, { damping: 12, stiffness: 240 })
        );
        break;
      }
    }
  }, [reaction, reactionKey, reactionScale, reactionRotate, reactionOpacity]);

  const animatedStyle = useAnimatedStyle(() => {
    // Derive idle float from a single time value. Body breath is now handled
    // by the procedural engine inside RadialPet so the SVG path itself morphs.
    const t = time.value * Math.PI * 2;
    const idleY = Math.sin(t * 0.45) * -4;
    return {
      transform: [
        { translateY: idleY },
        { scale: reactionScale.value },
        { rotate: `${reactionRotate.value}deg` },
      ],
      opacity: reactionOpacity.value,
    };
  });

  const auraStyle = useAnimatedStyle(() => {
    const t = time.value * Math.PI * 2;
    const scale = 1 + Math.sin(t * 0.35) * 0.07;
    return { transform: [{ scale }] };
  });

  function handleTap() {
    if (onTap) {
      onTap();
      return;
    }

    reactionScale.value = withSequence(
      withSpring(1.14, { damping: 12, stiffness: 320 }),
      withSpring(0.94, { damping: 13, stiffness: 260 }),
      withSpring(1, { damping: 14, stiffness: 220 })
    );
  }

  const isLifeTimerLow =
    lifeTimerEndsAt != null &&
    new Date(lifeTimerEndsAt).getTime() - Date.now() < 60 * 60 * 1000;

  return (
    <View style={styles.canvasWrapper}>
      <Animated.View style={animatedStyle}>
        <View style={styles.petContainer}>
          <Animated.View style={[styles.aura, auraStyle]} />
          <RadialPet
            stage={STAGE_TO_RADIAL[stage]}
            mood={toRadialMood(mood)}
            size={150}
            onTap={handleTap}
            accessory={accessory}
            isSpectral={isSpectral}
          />
        </View>
      </Animated.View>

      {lifeTimeLeft ? (
        <View
          style={[
            styles.lifeTimerPill,
            isLifeTimerLow && styles.lifeTimerPillLow,
          ]}
        >
          <Ionicons
            name="timer-outline"
            size={12}
            color={isLifeTimerLow ? colors.danger : colors.primary}
          />
          <Text
            style={[
              styles.lifeTimerText,
              isLifeTimerLow && styles.lifeTimerTextLow,
            ]}
          >
            {lifeTimeLeft}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export const PetCanvas = memo(PetCanvasInner);

const styles = StyleSheet.create({
  canvasWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  petContainer: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aura: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primary,
    opacity: 0.12,
  },
  lifeTimerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(7,17,31,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  lifeTimerPillLow: {
    backgroundColor: 'rgba(255,100,124,0.12)',
    borderColor: 'rgba(255,100,124,0.25)',
  },
  lifeTimerText: {
    color: colors.text,
    fontSize: 11,
    fontFamily: 'Poppins_800ExtraBold',
  },
  lifeTimerTextLow: {
    color: colors.danger,
  },
});
