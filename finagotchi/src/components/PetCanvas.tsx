import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
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
  STAGE_NAMES,
  STAGE_THRESHOLDS,
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
  4: 'coinling',
  5: 'coinling',
  6: 'coinling',
  7: 'coinling',
  8: 'hodler',
  9: 'hodler',
  10: 'whale',
  11: 'whale',
  12: 'whale',
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
  const getEffectiveLifeTimerRemainingMs = usePetStore(
    (state) => state.getEffectiveLifeTimerRemainingMs
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
    : getEffectiveLifeTimerRemainingMs();

  return {
    fraction: clamp(remainingMs / total, 0, 1),
    remainingMs,
    isLow: remainingMs < LOW_TIME_THRESHOLD_MS,
    isDead,
    text: formatCountdown(remainingMs),
  };
}

const STAGE_INDEX_TO_RADIAL: Record<number, StateId> = {
  0: 'egg',
  1: 'coinling',
  2: 'coinling',
  3: 'coinling',
  4: 'coinling',
  5: 'coinling',
  6: 'coinling',
  7: 'hodler',
  8: 'hodler',
  9: 'whale',
  10: 'whale',
  11: 'whale',
};

function StageIcon({
  stage,
  reached,
  current,
  onPress,
}: {
  stage: number;
  reached: boolean;
  current: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.stageNode,
        reached && styles.stageNodeReached,
        current && styles.stageNodeCurrent,
      ]}
      pointerEvents="auto"
    >
      <View style={styles.stageIconInner}>
        <RadialPet
          stage={STAGE_INDEX_TO_RADIAL[stage - 1]}
          mood="calm"
          size={22}
          active={false}
          isSpectral={false}
        />
      </View>
    </Pressable>
  );
}

function StageTooltip({
  stage,
  visible,
  onClose,
}: {
  stage: number;
  visible: boolean;
  onClose: () => void;
}) {
  if (!visible) return null;
  const name = STAGE_NAMES[stage as NumericStage];
  const threshold = STAGE_THRESHOLDS[stage - 1];
  return (
    <Modal transparent visible={visible} animationType="fade">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.tooltipOverlay}>
          <View style={styles.tooltipCard}>
            <View style={styles.tooltipIcon}>
              <RadialPet
                stage={STAGE_INDEX_TO_RADIAL[stage - 1]}
                mood="calm"
                size={48}
                active={false}
                isSpectral={false}
              />
            </View>
            <Text style={styles.tooltipTitle}>{name}</Text>
            <Text style={styles.tooltipSubtitle}>Stage {stage}</Text>
            <Text style={styles.tooltipBody}>
              Unlocked at {threshold} check-ins.
            </Text>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function StageProgress() {
  const stage = usePetStore((s) => s.stage);
  const totalCheckins = usePetStore((s) => s.totalCheckins);
  const [tooltipStage, setTooltipStage] = useState<number | null>(null);
  const currentIndex = Math.max(1, Math.min(stage, STAGE_THRESHOLDS.length)) - 1;
  const nextIndex = Math.min(currentIndex + 1, STAGE_THRESHOLDS.length - 1);
  const currentThreshold = STAGE_THRESHOLDS[currentIndex];
  const nextThreshold = STAGE_THRESHOLDS[nextIndex];
  const progressInRange =
    nextThreshold === currentThreshold
      ? 1
      : clamp(
          (totalCheckins - currentThreshold) /
            (nextThreshold - currentThreshold),
          0,
          1
        );
  const isMaxed = stage === STAGE_THRESHOLDS.length;
  const fullProgress = stage - 1 + progressInRange;
  const fillWidth = clamp(
    (fullProgress / (STAGE_THRESHOLDS.length - 1)) * 100,
    0,
    100
  );
  const nodes = STAGE_THRESHOLDS.length;

  return (
    <View style={styles.stageProgressWrapper}>
      <StageTooltip
        stage={tooltipStage ?? stage}
        visible={tooltipStage !== null}
        onClose={() => setTooltipStage(null)}
      />
      <View style={styles.stageTrackWrapper}>
        <View style={styles.stageTrackBackground}>
          <View style={[styles.stageTrackFill, { width: `${fillWidth}%` }]} />
        </View>
        <View style={styles.stageNodes} pointerEvents="box-none">
          {STAGE_THRESHOLDS.map((_, i) => {
            const reached = i < stage;
            const current = i === stage - 1;
            return (
              <View
                key={i}
                style={[
                  styles.stageNodePosition,
                  { left: `${(i / (nodes - 1)) * 100}%` },
                ]}
                pointerEvents="box-none"
              >
                <StageIcon
                  stage={i + 1}
                  reached={reached}
                  current={current}
                  onPress={() => setTooltipStage(i + 1)}
                />
              </View>
            );
          })}
        </View>
      </View>
      <View style={styles.stageLabelRow}>
        <Text style={styles.stageName}>{STAGE_NAMES[stage as NumericStage]}</Text>
        {!isMaxed ? (
          <Text style={styles.stageToGo}>
            {totalCheckins}/{nextThreshold} to next
          </Text>
        ) : (
          <Text style={styles.stageToGo}>Max stage reached</Text>
        )}
      </View>
    </View>
  );
}

function LifeTimerText({ text, critical }: { text: string; critical: boolean }) {
  const tone = critical ? colors.danger : colors.textMuted;
  return (
    <View style={styles.lifeTimerPill}>
      <Ionicons name="heart-outline" size={11} color={tone} />
      <Text style={[styles.lifeTimerText, { color: tone }]}>{text} left</Text>
    </View>
  );
}

function BleSignal() {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.linear }),
      -1,
      false
    );
  }, [pulse]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + 0.6 * Math.sin(pulse.value * Math.PI * 2),
    transform: [{ scale: 1 + 0.25 * Math.sin(pulse.value * Math.PI * 2) }],
  }));

  return (
    <View style={styles.blePill} pointerEvents="none">
      <Animated.View style={[styles.bleDot, dotStyle]} />
      <Ionicons name="bluetooth" size={14} color={colors.primary} />
      <Text style={styles.bleText}>Connecting</Text>
    </View>
  );
}

function SleepingZzz() {
  const time = useSharedValue(0);

  useEffect(() => {
    time.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.linear }),
      -1,
      false
    );
  }, [time]);

  const z1 = useAnimatedStyle(() => {
    const progress = (time.value + 0.0) % 1;
    return {
      opacity: progress < 0.2 ? 0 : 1 - progress,
      transform: [
        { translateY: -progress * 28 },
        { translateX: Math.sin(progress * Math.PI * 2) * 4 },
        { scale: 0.6 + progress * 0.4 },
      ],
    };
  });

  const z2 = useAnimatedStyle(() => {
    const progress = (time.value + 0.33) % 1;
    return {
      opacity: progress < 0.2 ? 0 : 1 - progress,
      transform: [
        { translateY: -progress * 28 },
        { translateX: Math.sin(progress * Math.PI * 2) * 4 },
        { scale: 0.6 + progress * 0.4 },
      ],
    };
  });

  const z3 = useAnimatedStyle(() => {
    const progress = (time.value + 0.66) % 1;
    return {
      opacity: progress < 0.2 ? 0 : 1 - progress,
      transform: [
        { translateY: -progress * 28 },
        { translateX: Math.sin(progress * Math.PI * 2) * 4 },
        { scale: 0.6 + progress * 0.4 },
      ],
    };
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.Text style={[styles.sleepZ, z1]}>z</Animated.Text>
      <Animated.Text style={[styles.sleepZ, z2]}>z</Animated.Text>
      <Animated.Text style={[styles.sleepZ, z3]}>Z</Animated.Text>
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

  const waiting = engineMood === 'waiting';
  const isSleeping = !waiting && (mood === 'sleeping' || engineMood === 'sleepy');

  const animatedStyle = useAnimatedStyle(() => {
    // Derive idle float from a single time value. Body breath is now handled
    // by the procedural engine inside RadialPet so the SVG path itself morphs.
    const t = time.value * Math.PI * 2;
    const idleY = Math.sin(t * 0.45) * -4;
    // Waiting scene: calmer, almost hovering breath. Sleeping: slower, deeper breath + tiny sway.
    const sleepBreath = waiting ? 1 + Math.sin(t * 0.25) * 0.015 : isSleeping ? 1 + Math.sin(t * 0.18) * 0.04 : 1;
    const sleepSway = isSleeping ? Math.sin(t * 0.12) * 1.5 : 0;
    return {
      transform: [
        { translateY: idleY },
        { scale: reactionScale.value * sleepBreath },
        { rotate: `${reactionRotate.value + sleepSway}deg` },
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

        {engineMood === 'waiting' && <BleSignal />}

        {isSleeping && <SleepingZzz />}

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


      </View>

      <StageProgress />

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
  blePill: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(14,27,46,0.80)',
    borderWidth: 1,
    borderColor: 'rgba(53,215,255,0.35)',
  },
  bleDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  bleText: {
    color: colors.text,
    fontSize: 10,
    fontFamily: 'Poppins_800ExtraBold',
  },
  sleepZ: {
    position: 'absolute',
    top: CANVAS / 2 - 60,
    right: CANVAS / 2 - 50,
    color: colors.text,
    fontSize: 20,
    fontFamily: 'Poppins_800ExtraBold',
    opacity: 0.8,
  },
  stageProgressWrapper: {
    width: '100%',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 12,
  },
  stageTrackWrapper: {
    width: '100%',
    height: 20,
    justifyContent: 'center',
  },
  stageTrackBackground: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  stageTrackFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  stageNodes: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    top: 0,
    bottom: 0,
  },
  stageNodePosition: {
    position: 'absolute',
    top: '50%',
    marginTop: -10,
    marginLeft: -10,
    zIndex: 2,
  },
  stageNode: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stageNodeReached: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stageNodeCurrent: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
    shadowOpacity: 0.6,
    elevation: 4,
    transform: [{ scale: 1.12 }],
  },
  stageIconInner: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltipOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,12,0.72)',
    paddingHorizontal: 24,
  },
  tooltipCard: {
    width: '100%',
    maxWidth: 280,
    alignItems: 'center',
    padding: 24,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tooltipIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  tooltipTitle: {
    fontSize: 18,
    fontFamily: 'Poppins_800ExtraBold',
    color: colors.text,
    letterSpacing: 0.2,
  },
  tooltipSubtitle: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    color: colors.textMuted,
    marginTop: 2,
  },
  tooltipBody: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    color: colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  stageLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  stageName: {
    fontSize: 13,
    fontFamily: 'Poppins_800ExtraBold',
    color: colors.text,
    letterSpacing: 0.2,
  },
  stageToGo: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
});
