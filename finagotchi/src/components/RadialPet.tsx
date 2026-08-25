import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { G } from 'react-native-svg';

import { FinagotchiEngine, type StateId } from '../engine/engine';
import type { PetMood } from '../engine/expressions';
import { usePetAnimator } from '../hooks/usePetAnimator';
import { PetBody } from './PetBody';
import { PetEyes } from './PetEyes';

export interface RadialPetProps {
  stage: StateId;
  mood?: PetMood;
  size?: number;
  onTap?: () => void;
}

export function RadialPet({ stage, mood = 'calm', size = 150, onTap }: RadialPetProps) {
  const frame = usePetAnimator();
  const timeMs = frame * 33;
  const t = timeMs / 1000;

  const engineRef = useRef<FinagotchiEngine | null>(null);
  if (!engineRef.current) {
    const engine = new FinagotchiEngine({ scale: size / 2, initial: stage });
    engine.setExpression(mood, 0);
    engineRef.current = engine;
  }
  const engine = engineRef.current;

  useEffect(() => {
    engine.setState(stage, t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  useEffect(() => {
    engine.setExpression(mood, t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood]);

  const frameData = useMemo(() => engine.sample(t), [engine, t]);
  const center = size / 2;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Pressable onPress={onTap} style={styles.pressable}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={styles.svg}>
          <G transform={`translate(${center}, ${center})`}>
            <PetBody
              bodyPath={frameData.bodyPath}
              color={frameData.color}
              glowColor={frameData.glowColor}
              bodyAlpha={frameData.bodyAlpha}
              size={size}
              timeMs={timeMs}
            />
            <PetEyes eyes={frameData.eyes} />
          </G>
        </Svg>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    backgroundColor: 'transparent',
  },
});
