import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
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
import type { PetMood as EngineMood } from '../engine/expressions';
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
  /** Device-driven expression override; bypasses the label mapping when set. */
  engineMood?: EngineMood | null;
  reaction?: PetReaction;
  reactionKey?: number | string;
  accessory?: PetAccessory;
  isSpectral?: boolean;
  onTap?: () => void;
  onEvolve?: (stage: NumericStage) => void;
  /** Drag-to-look on the pet: yaw/pitch in degrees, throttled to ~10 Hz. */
  onLook?: (yaw: number, pitch: number) => void;
  /** Drag released: resume idle gaze wander. */
  onLookEnd?: () => void;
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

const LOW_TIME_THRESHOLD_MS = 60 * 60 * 1000;

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Self-ticking life/revive countdown pill. Lives here (instead of receiving a
 * per-second string prop from the screen) so the 1 Hz tick only re-renders
 * this pill, not the whole screen and every mounted sheet.
 */
function LifeTimerPill() {
  const isDead = usePetStore((state) => state.isDead);
  const reviveWindowEndsAt = usePetStore((state) => state.reviveWindowEndsAt);
  const lifeTimerEndsAt = usePetStore((state) => state.lifeTimerEndsAt);
  const getLifeTimerRemainingMs = usePetStore(
    (state) => state.getLifeTimerRemainingMs
  );

  const [text, setText] = useState('');
  const [isLow, setIsLow] = useState(false);

  useEffect(() => {
    const update = () => {
      const remaining =
        isDead && reviveWindowEndsAt
          ? new Date(reviveWindowEndsAt).getTime() - Date.now()
          : getLifeTimerRemainingMs();
      setText(formatCountdown(remaining));
      setIsLow(
        lifeTimerEndsAt != null &&
          new Date(lifeTimerEndsAt).getTime() - Date.now() <
            LOW_TIME_THRESHOLD_MS
      );
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [isDead, reviveWindowEndsAt, lifeTimerEndsAt, getLifeTimerRemainingMs]);

  if (!text) return null;

  return (
    <View style={[styles.lifeTimerPill, isLow && styles.lifeTimerPillLow]}>
      <Ionicons
        name="timer-outline"
        size={12}
        color={isLow ? colors.danger : colors.primary}
      />
      <Text style={[styles.lifeTimerText, isLow && styles.lifeTimerTextLow]}>
        {text}
      </Text>
    </View>
  );
}

function PetCanvasInner({
  mood = 'waiting',
  engineMood,
  reaction,
  reactionKey,
  accessory = 'none',
  isSpectral = false,
  onTap,
  onEvolve,
  onLook,
  onLookEnd,
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

  // Stable handler so the memoized RadialPet doesn't re-render when this
  // component re-renders (e.g. when the mood prop changes).
  const handleTap = useCallback(() => {
    if (onTap) {
      onTap();
      return;
    }

    reactionScale.value = withSequence(
      withSpring(1.14, { damping: 12, stiffness: 320 }),
      withSpring(0.94, { damping: 13, stiffness: 260 }),
      withSpring(1, { damping: 14, stiffness: 220 })
    );
  }, [onTap, reactionScale]);

  return (
    <View style={styles.canvasWrapper}>
      <Animated.View style={animatedStyle}>
        <View style={styles.petContainer}>
          <Animated.View style={[styles.aura, auraStyle]} />
          <RadialPet
            stage={STAGE_TO_RADIAL[stage]}
            mood={engineMood ?? toRadialMood(mood)}
            size={150}
            onTap={handleTap}
            accessory={accessory}
            isSpectral={isSpectral}
            onLook={onLook}
            onLookEnd={onLookEnd}
          />
        </View>
      </Animated.View>

      <LifeTimerPill />
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
