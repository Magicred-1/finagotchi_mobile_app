import React, { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { G } from 'react-native-svg';

import { FinagotchiEngine, type Frame, type StateId } from '../engine/engine';
import type { PetMood } from '../engine/expressions';
import type { PetAccessory } from '../features/pet/store';
import { PetAccessoryArt } from './PetAccessory';
import { PetBody } from './PetBody';
import { PetEyes } from './PetEyes';

export interface RadialPetProps {
  stage: StateId;
  mood?: PetMood;
  size?: number;
  onTap?: () => void;
  accessory?: PetAccessory;
  isSpectral?: boolean;
}

function RadialPetInner({
  stage,
  mood = 'calm',
  size = 150,
  onTap,
  accessory = 'none',
  isSpectral = false,
}: RadialPetProps) {
  const engineRef = useRef<FinagotchiEngine | null>(null);
  if (!engineRef.current) {
    const engine = new FinagotchiEngine({ scale: size / 2, initial: stage });
    engine.setExpression(mood, 0);
    engineRef.current = engine;
  }
  const engine = engineRef.current;

  const startTimeRef = useRef(Date.now());
  const elapsedRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const [frame, setFrame] = useState<Frame>(() => engine.sample(0));

  useEffect(() => {
    engine.setState(stage, elapsedRef.current);
  }, [engine, stage]);

  useEffect(() => {
    engine.setExpression(mood, elapsedRef.current);
  }, [engine, mood]);

  useEffect(() => {
    const tick = () => {
      elapsedRef.current = (Date.now() - startTimeRef.current) / 1000;
      setFrame(engine.sample(elapsedRef.current));
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [engine]);

  const center = size / 2;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Pressable onPress={onTap} style={styles.pressable}>
        <Svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={[styles.svg, isSpectral && styles.svgSpectral]}
        >
          <G transform={`translate(${center}, ${center})`}>
            <PetBody
              bodyPath={frame.bodyPath}
              color={frame.color}
              glowColor={frame.glowColor}
              bodyAlpha={frame.bodyAlpha}
            />
            <PetEyes eyes={frame.eyes} />
            <PetAccessoryArt accessory={accessory} size={size} />
          </G>
        </Svg>
        {isSpectral ? (
          <View style={[styles.spectralOverlay, { width: size, height: size }]} />
        ) : null}
      </Pressable>
    </View>
  );
}

export const RadialPet = memo(RadialPetInner);

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
  svgSpectral: {
    opacity: 0.55,
  },
  spectralOverlay: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(139,92,246,0.18)',
    pointerEvents: 'none',
  },
});
