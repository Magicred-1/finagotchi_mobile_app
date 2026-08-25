import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import type { StateId } from '../engine/engine';
import { usePetStore, type PetStage as NumericStage } from '../features/pet/store';
import { RadialPet } from './RadialPet';

export type PetMoodLabel = 'sleeping' | 'waiting' | 'happy' | 'proud' | 'calm';
/** @deprecated kept for compatibility with existing imports */
export type PetMood = PetMoodLabel;
export type PetReaction = 'jump' | 'spin' | 'glow' | 'dance';

type Props = {
  mood?: PetMoodLabel;
  reaction?: PetReaction;
};

const STAGE_TO_RADIAL: Record<NumericStage, StateId> = {
  1: 'egg',
  2: 'coinling',
  3: 'coinling',
  4: 'hodler',
  5: 'whale',
};

function toRadialMood(mood: PetMoodLabel): import('../engine/expressions').PetMood {
  switch (mood) {
    case 'sleeping':
      return 'sleepy';
    case 'proud':
      return 'happy';
    default:
      return mood;
  }
}

export function PetCanvas({ mood = 'waiting', reaction }: Props) {
  const stage = usePetStore((state) => state.stage);
  const [reactionState, setReactionState] = useState<{
    type: PetReaction;
    startTime: number;
  } | null>(null);
  const previousReaction = useRef<PetReaction | undefined>(undefined);

  useEffect(() => {
    if (reaction && reaction !== previousReaction.current) {
      setReactionState({ type: reaction, startTime: Date.now() });
    }
    previousReaction.current = reaction;
  }, [reaction]);

  const reactionTransform = useMemo(() => {
    if (!reactionState) return { scale: 1, rotate: 0, opacity: 1 };
    const elapsed = Date.now() - reactionState.startTime;
    const duration = reactionState.type === 'spin' ? 600 : 720;
    const progress = Math.min(1, elapsed / duration);

    if (progress >= 1) {
      return { scale: 1, rotate: 0, opacity: 1 };
    }

    switch (reactionState.type) {
      case 'jump': {
        const p = Math.sin(progress * Math.PI);
        return { scale: 1 + p * 0.15, rotate: 0, opacity: 1 };
      }
      case 'spin': {
        return { scale: 1, rotate: progress * 360, opacity: 1 };
      }
      case 'glow': {
        const opacity = 1 - Math.abs(Math.sin(progress * Math.PI * 3)) * 0.35;
        return { scale: 1, rotate: 0, opacity };
      }
      case 'dance': {
        const sway = Math.sin(progress * Math.PI * 6) * (1 - progress) * 12;
        const bounce = 1 + Math.sin(progress * Math.PI * 4) * (1 - progress) * 0.08;
        return { scale: bounce, rotate: sway, opacity: 1 };
      }
      default:
        return { scale: 1, rotate: 0, opacity: 1 };
    }
  }, [reactionState]);

  const containerStyle = {
    transform: [
      { scale: reactionTransform.scale },
      { rotate: `${reactionTransform.rotate}deg` },
    ],
    opacity: reactionTransform.opacity,
  };

  return (
    <View style={containerStyle}>
      <RadialPet
        stage={STAGE_TO_RADIAL[stage]}
        mood={toRadialMood(mood)}
        size={150}
        onTap={() => setReactionState({ type: 'jump', startTime: Date.now() })}
      />
    </View>
  );
}
