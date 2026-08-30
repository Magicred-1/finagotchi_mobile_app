import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import Svg, { G } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

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
  const [isExiting, setIsExiting] = useState(false);
  // Only tick while the ceremony is on screen; otherwise this component stays
  // mounted on the home screen and would re-render at 30 fps forever.
  const frame = usePetAnimator(visible || isExiting);
  // Time is measured from the moment the ceremony opens, not from the shared
  // clock's absolute frame count, so a reopened ceremony starts at zero.
  const startFrameRef = useRef(0);
  const frameRef = useRef(0);
  frameRef.current = frame;
  const timeMs = Math.max(0, frame - startFrameRef.current) * 33;
  const t = timeMs / 1000;

  const lastCelebratedStage = usePetStore((state) => state.lastCelebratedStage);
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
    if (visible) startFrameRef.current = frameRef.current;
  }, [visible]);

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

  // The modal stays mounted while `visible || isExiting`; once the parent hides
  // the ceremony, clear the exit flag so the modal can actually unmount.
  useEffect(() => {
    if (!visible && isExiting) setIsExiting(false);
  }, [visible, isExiting]);

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
    setShowCurtain(false);
    setIsExiting(true);
    onDismiss();
  };

  const size = 160;
  const particleCount = 10;

  const stageName = STAGE_NAMES[stage] ?? STAGE_NAMES[1];
  const displayName = petName || 'My Finny';
  const shareableMessage = `${displayName} evolved into ${
    stageName.split('•')[0].trim()
  }! 🔥 #Finagotchi`;

  // The share card is captured to a PNG and handed to the native share sheet,
  // where the user picks X (or anywhere else). Falls back to plain text if
  // file sharing or the capture itself is unavailable.
  const shareCardRef = useRef<View>(null);
  const [isSharing, setIsSharing] = useState(false);

  const shareEvolution = async () => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      if ((await Sharing.isAvailableAsync()) && shareCardRef.current) {
        const uri = await captureRef(shareCardRef, { format: 'png', quality: 1 });
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          UTI: 'public.png',
          dialogTitle: shareableMessage,
        });
      } else {
        await Share.share({ message: shareableMessage });
      }
    } catch {
      Alert.alert('Sharing failed', 'Could not share your evolution. Please try again.');
    } finally {
      setIsSharing(false);
    }
  };

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

          {/* This card is what gets captured and shared, so it carries the
              creature, its name, and the stage in the image itself. */}
          <View ref={shareCardRef} collapsable={false} style={styles.shareCard}>
            <Text style={styles.petName}>{displayName}</Text>

            <View style={styles.petWrap}>
              <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={styles.svg}>
                <G transform={`translate(${size / 2}, ${size / 2})`}>
                  <PetBody
                    bodyPath={frameData.bodyPath}
                    color={frameData.color}
                    glowColor={frameData.glowColor}
                    bodyAlpha={frameData.bodyAlpha}
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
            <Text style={styles.hashtag}>#Finagotchi</Text>
          </View>

          <View style={styles.buttonRow}>
            <Pressable onPress={shareEvolution} style={styles.shareButton} disabled={isSharing}>
              <Text style={styles.shareButtonText}>
                {isSharing ? 'Sharing…' : 'Share on X'}
              </Text>
            </Pressable>
            <Pressable onPress={exit} style={styles.button}>
              <Text style={styles.buttonText}>Continue</Text>
            </Pressable>
          </View>
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
  shareCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 24,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  petName: {
    color: colors.textMuted,
    fontSize: typography.body,
    fontFamily: 'Poppins_700Bold',
    textAlign: 'center',
  },
  petWrap: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
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
  hashtag: {
    marginTop: spacing.sm,
    color: colors.primary,
    fontSize: typography.body,
    fontFamily: 'Poppins_500Medium',
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  shareButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  shareButtonText: {
    color: colors.primary,
    fontSize: typography.body,
    fontFamily: 'Poppins_700Bold',
  },
  button: {
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
