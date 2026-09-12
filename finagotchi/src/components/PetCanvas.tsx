import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
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
  CREATURE_CLASSES,
  type CreatureClassName,
} from '../engine/classes';
import type { PetMood as EngineMood } from '../engine/expressions';
import {
  LIFE_DURATION_MS,
  REVIVE_COOLDOWNS_MS,
  usePetStore,
  type PetAccessory,
  type PetStage as NumericStage,
} from '../features/pet/store';
import { clamp } from '../utils/math';
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
  /** IP colorway override; derived from app state when omitted. */
  creatureClass?: CreatureClassName;
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

/** Warn (and switch the creature to the danger class) when less than a day of life remains. */
const LOW_TIME_THRESHOLD_MS = 24 * 60 * 60 * 1000;
/** Ring + halo canvas; the pet itself stays 150 so reactions are unchanged. */
const CANVAS = 208;
const RING_R = 92;

/** Unique gradient ids per mounted canvas, same pattern as RadialPet. */
let haloIdCounter = 0;

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // A 7-day timer would render as 167h 59m 59s if we always showed
  // hours and seconds, so only show fine-grained units when short.
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

interface LifeClock {
  /** 0..1 of the current window remaining (life timer, or revive window while dead). */
  fraction: number;
  remainingMs: number;
  isLow: boolean;
  isDead: boolean;
  text: string;
}

/**
 * Self-ticking life/revive clock. Lives here (instead of a per-second string
 * prop from the screen) so the 1 Hz tick only re-renders the ring, not the
 * whole screen and every mounted sheet.
 */
function useLifeClock(): LifeClock {
  const isDead = usePetStore((state) => state.isDead);
  const deathCount = usePetStore((state) => state.deathCount);
  const reviveWindowEndsAt = usePetStore((state) => state.reviveWindowEndsAt);
  const getLifeTimerRemainingMs = usePetStore(
    (state) => state.getLifeTimerRemainingMs
  );

  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const inReviveWindow = isDead && reviveWindowEndsAt !== null;
  const total = inReviveWindow
    ? REVIVE_COOLDOWNS_MS[
        Math.min(Math.max(0, deathCount - 1), REVIVE_COOLDOWNS_MS.length - 1)
      ]
    : LIFE_DURATION_MS;
  const remainingMs = inReviveWindow
    ? Math.max(0, new Date(reviveWindowEndsAt).getTime() - Date.now())
    : getLifeTimerRemainingMs();

  return {
    fraction: clamp(remainingMs / total, 0, 1),
    remainingMs,
    isLow: remainingMs < LOW_TIME_THRESHOLD_MS,
    isDead,
    text: formatCountdown(remainingMs),
  };
}

/** One life segment = one day; the creature lives a week. */
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_SEGMENTS = 7;
const SEG_DEG = 360 / WEEK_SEGMENTS;
/** Visual gap between day segments. */
const SEG_GAP_DEG = 9;

/** 0° points straight up, grows clockwise. */
function polar(angleDeg: number, r: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: CANVAS / 2 + r * Math.cos(rad),
    y: CANVAS / 2 + r * Math.sin(rad),
  };
}

function arcPath(startDeg: number, endDeg: number, r: number): string {
  const s = polar(startDeg, r);
  const e = polar(endDeg, r);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M${s.x.toFixed(2)} ${s.y.toFixed(2)} A${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

/**
 * The life timer as a week dial: seven day-segments around the creature,
 * elapsed days go dark, and a bead sits on the live depletion point. Reads
 * like hearts in a game — no numbers needed to grasp "about 5 days left".
 * While dead it collapses to a single continuous arc for the revive window.
 */
function LifeRing({
  remainingMs,
  fraction,
  isLow,
  isDead,
}: {
  remainingMs: number;
  fraction: number;
  isLow: boolean;
  isDead: boolean;
}) {
  const critical = isLow || isDead;
  const tone = critical
    ? colors.danger
    : remainingMs < 2 * DAY_MS
      ? colors.warning
      : colors.primary;
  const daysLeft = clamp(remainingMs / DAY_MS, 0, WEEK_SEGMENTS);
  const beadDeg = isDead ? fraction * 360 : daysLeft * SEG_DEG;
  const bead = polar(beadDeg, RING_R);

  return (
    <Svg
      width={CANVAS}
      height={CANVAS}
      viewBox={`0 0 ${CANVAS} ${CANVAS}`}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      {isDead ? (
        <>
          <Circle
            cx={CANVAS / 2}
            cy={CANVAS / 2}
            r={RING_R}
            stroke="rgba(255,255,255,0.07)"
            strokeWidth={2.5}
            fill="none"
          />
          {fraction > 0.01 ? (
            <Path
              d={arcPath(0, Math.min(fraction * 360, 359), RING_R)}
              stroke={tone}
              strokeWidth={2.5}
              strokeLinecap="round"
              fill="none"
              opacity={0.9}
            />
          ) : null}
        </>
      ) : (
        Array.from({ length: WEEK_SEGMENTS }, (_, i) => {
          const a0 = i * SEG_DEG + SEG_GAP_DEG / 2;
          const a1 = (i + 1) * SEG_DEG - SEG_GAP_DEG / 2;
          const fill = clamp(daysLeft - i, 0, 1);
          return (
            <Path
              key={i}
              d={arcPath(a0, Math.max(a0 + 0.5, a0 + (a1 - a0) * Math.max(fill, 0.02)), RING_R)}
              stroke={fill > 0 ? tone : 'rgba(255,255,255,0.08)'}
              strokeWidth={2.5}
              strokeLinecap="round"
              fill="none"
              opacity={fill > 0 ? 0.45 + 0.55 * fill : 1}
            />
          );
        })
      )}
      <Circle cx={bead.x} cy={bead.y} r={5.5} fill={tone} opacity={0.25} />
      <Circle cx={bead.x} cy={bead.y} r={2.8} fill={tone} />
    </Svg>
  );
}

/** Plain-language label: the dial shows the shape of the timer, this says it. */
function LifeTimerText({ text, critical }: { text: string; critical: boolean }) {
  const tone = critical ? colors.danger : colors.textMuted;
  return (
    <View style={styles.lifeTimerPill}>
      <Ionicons name="heart-outline" size={11} color={tone} />
      <Text style={[styles.lifeTimerText, { color: tone }]}>{text} left</Text>
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
  creatureClass,
  onTap,
  onEvolve,
  onLook,
  onLookEnd,
}: Props) {
  const stage = usePetStore((state) => state.stage);
  const life = useLifeClock();
  const previousStage = useRef(stage);
  const haloIdRef = useRef(`canvasHalo${++haloIdCounter}`);

  // Class precedence: explicit prop → spectral moments read as the evolution
  // colorway → a creature about to die shows the danger colorway. Otherwise
  // the lifecycle stage colors stand on their own.
  const cls = creatureClass
    ? CREATURE_CLASSES[creatureClass]
    : isSpectral
      ? CREATURE_CLASSES.evolution
      : life.isLow || life.isDead
        ? CREATURE_CLASSES.danger
        : null;

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

  // Mirrors the idle float: the contact shadow tightens and fades as the pet
  // lifts, which is what sells the levitation.
  const shadowStyle = useAnimatedStyle(() => {
    const t = time.value * Math.PI * 2;
    const lift = Math.sin(t * 0.45);
    return {
      transform: [{ scaleX: 1 - lift * 0.12 }],
      opacity: 0.3 - lift * 0.1,
    };
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

  const haloColor = cls?.glow ?? colors.primary;

  return (
    <View style={styles.canvasWrapper}>
      <View style={styles.stage}>
        <Animated.View style={[StyleSheet.absoluteFill, auraStyle]}>
          <Svg
            width={CANVAS}
            height={CANVAS}
            viewBox={`0 0 ${CANVAS} ${CANVAS}`}
          >
            <Defs>
              <RadialGradient
                id={haloIdRef.current}
                cx={CANVAS / 2}
                cy={CANVAS / 2}
                r={CANVAS / 2}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor={haloColor} stopOpacity={0.16} />
                <Stop offset="0.45" stopColor={haloColor} stopOpacity={0.07} />
                <Stop offset="1" stopColor={haloColor} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle
              cx={CANVAS / 2}
              cy={CANVAS / 2}
              r={CANVAS / 2 - 2}
              fill={`url(#${haloIdRef.current})`}
            />
          </Svg>
        </Animated.View>

        <Animated.View style={[styles.groundShadow, shadowStyle]} />

        <Animated.View style={animatedStyle}>
          <View style={styles.petContainer}>
            <RadialPet
              stage={STAGE_TO_RADIAL[stage]}
              mood={engineMood ?? toRadialMood(mood)}
              size={150}
              onTap={handleTap}
              accessory={accessory}
              isSpectral={isSpectral}
              creatureClass={cls?.id}
              onLook={onLook}
              onLookEnd={onLookEnd}
            />
          </View>
        </Animated.View>

        <LifeRing
          remainingMs={life.remainingMs}
          fraction={life.fraction}
          isLow={life.isLow}
          isDead={life.isDead}
        />
      </View>

      <LifeTimerText text={life.text} critical={life.isLow || life.isDead} />
    </View>
  );
}

export const PetCanvas = memo(PetCanvasInner);

const styles = StyleSheet.create({
  canvasWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    width: CANVAS,
    height: CANVAS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  petContainer: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groundShadow: {
    position: 'absolute',
    top: CANVAS / 2 + 62,
    width: 96,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#02060C',
  },
  lifeTimerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 6,
  },
  lifeTimerText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    letterSpacing: 0.2,
  },
});
