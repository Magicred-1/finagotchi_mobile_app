import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { G } from 'react-native-svg';

import { FinagotchiEngine, type StateId } from '../engine/engine';
import { usePetAnimator } from '../hooks/usePetAnimator';
import {
  usePetStore,
  type PetStage as NumericStage,
  STAGE_NAMES,
} from '../features/pet/store';
import { colors, spacing, typography } from '../theme/tokens';
import CurtainOverlay from './CurtainOverlay';
import { PetBody } from './PetBody';
import { PetEyes } from './PetEyes';
import { SparkleParticle } from './SparkleParticle';

type Props = {
  visible: boolean;
  stage: NumericStage;
  petName: string | null;
  onDismiss: () => void;
};

const DURATION = 3000;
const GLOW_EXPAND_END = 500;
const PARTICLE_START = 1500;
const PARTICLE_END = 3000;
const SETTLE_START = 2500;

const STAGE_TO_RADIAL: Record<NumericStage, StateId> = {
  1: 'egg',
  2: 'coinling',
  3: 'coinling',
  4: 'hodler',
  5: 'whale',
};

export default function EvolutionCeremony({ visible, stage, petName, onDismiss }: Props) {
  const { width, height } = useWindowDimensions();
  const frame = usePetAnimator();
  const timeMs = frame * 33;
  const t = timeMs / 1000;

  const lastCelebratedStage = usePetStore((state) => state.lastCelebratedStage);
  const [isExiting, setIsExiting] = useState(false);
  const [showCurtain, setShowCurtain] = useState(false);

  const engineRef = useRef<FinagotchiEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new FinagotchiEngine({
      scale: 80,
      initial: STAGE_TO_RADIAL[lastCelebratedStage],
    });
  }
  const engine = engineRef.current;

  const ceremonyStarted = useRef(false);
  const hasCompleted = useRef(false);

  useEffect(() => {
    if (visible && !ceremonyStarted.current) {
      ceremonyStarted.current = true;
      setShowCurtain(true);
      engine.setState(STAGE_TO_RADIAL[lastCelebratedStage], 0);
      engine.evolve(0);
    }
    if (!visible && ceremonyStarted.current) {
      ceremonyStarted.current = false;
      hasCompleted.current = false;
    }
  }, [visible, engine, lastCelebratedStage, stage]);

  const ceremonyTimeMs = visible || isExiting ? timeMs : 0;
  const ceremonyT = ceremonyTimeMs / 1000;

  useEffect(() => {
    if (!hasCompleted.current && ceremonyTimeMs >= DURATION) {
      hasCompleted.current = true;
      onDismiss();
    }
  }, [ceremonyTimeMs, onDismiss]);

  const frameData = useMemo(() => engine.sample(ceremonyT), [engine, ceremonyT]);

  const glowProgress = Math.min(1, ceremonyTimeMs / GLOW_EXPAND_END);
  const glowOpacity =
    glowProgress < 0.5
      ? glowProgress * 1.4
      : Math.max(0, 0.7 - ((ceremonyTimeMs - SETTLE_START) / (DURATION - SETTLE_START)) * 0.7);

  const particleProgress = useMemo(() => {
    if (ceremonyTimeMs < PARTICLE_START) return 0;
    if (ceremonyTimeMs > PARTICLE_END) return 1;
    return (ceremonyTimeMs - PARTICLE_START) / (PARTICLE_END - PARTICLE_START);
  }, [ceremonyTimeMs]);

  const exit = () => {
    setIsExiting(true);
    setShowCurtain(false);
  };

  const size = 160;
  const particleCount = 10;

  const stageName = STAGE_NAMES[stage] ?? STAGE_NAMES[1];
  const shareableMessage = `${petName || 'My Finny'} evolved into ${
    stageName.split('•')[0].trim()
  }! 🔥 #Finagotchi`;

  return (
    <Modal visible={visible || isExiting} transparent animationType="none" onRequestClose={exit}>
      <CurtainOverlay
        active={showCurtain}
        onComplete={() => setShowCurtain(false)}
        onCovered={() => {}}
        color={colors.primary}
      />
      <View style={[styles.backdrop, { width, height }]}>
        <View style={styles.spotlight} />

        <View style={styles.content}>
          <Text style={styles.evolved}>I evolved!</Text>

          <View style={styles.petWrap}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={styles.svg}>
              <G transform={`translate(${size / 2}, ${size / 2})`}>
                <PetBody
                  bodyPath={frameData.bodyPath}
                  color={frameData.color}
                  glowColor={frameData.glowColor}
                  bodyAlpha={frameData.bodyAlpha}
                  size={size}
                  timeMs={ceremonyTimeMs}
                />
                <PetEyes eyes={frameData.eyes} />

                {particleProgress > 0
                  ? Array.from({ length: particleCount }, (_, i) => (
                      <SparkleParticle
                        key={i}
                        index={i}
                        total={particleCount}
                        progress={particleProgress}
                        size={size}
                      />
                    ))
                  : null}
              </G>
            </Svg>
          </View>

          <Text style={styles.stageName}>{stageName.split('•')[0].trim()}</Text>
          <Text style={styles.shareText}>{shareableMessage}</Text>

          <Pressable onPress={exit} style={styles.button}>
            <Text style={styles.buttonText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(7,17,31,0.92)',
    paddingHorizontal: 28,
  },
  spotlight: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(114,228,90,0.08)',
  },
  content: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  evolved: {
    color: colors.primary,
    fontSize: typography.heading,
    fontFamily: 'Poppins_800ExtraBold',
    marginBottom: spacing.lg,
  },
  petWrap: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  svg: {
    backgroundColor: 'transparent',
  },
  stageName: {
    color: colors.text,
    fontSize: typography.title,
    fontFamily: 'Poppins_700Bold',
    textAlign: 'center',
  },
  shareText: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: typography.body,
    fontFamily: 'Poppins_500Medium',
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  buttonText: {
    color: colors.background,
    fontSize: typography.body,
    fontFamily: 'Poppins_700Bold',
  },
});
