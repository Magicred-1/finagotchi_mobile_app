import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Atlas,
  Canvas,
  useImage,
  useRectBuffer,
  useRSXformBuffer,
} from '@shopify/react-native-skia';

import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { usePetStore } from '../features/pet/store';

const TOTAL_COLUMNS = 9;
const TOTAL_ROWS = 7;
const DISPLAY_SIZE = 180; // Reduced canvas size to fit hero neatly without clipping
const FRAME_DURATION = 180;

const STAGE_FRAMES = {
  1: [0, 1, 2, 3],
  2: [9, 10, 11, 12],
  3: [27, 28, 29, 30],
} as const;

export function PetCanvas() {
  const stage = usePetStore((state) => state.stage);

  const spriteSheet = useImage(
    require('../../assets/sprites/pets/pet-atlas.png')
  );

  const animationProgress = useSharedValue(0);
  const floatAnim = useSharedValue(0);

  const frames = STAGE_FRAMES[stage] ?? STAGE_FRAMES[1];

  useEffect(() => {
    animationProgress.value = 0;
    animationProgress.value = withRepeat(
      withTiming(1, {
        duration: frames.length * FRAME_DURATION,
        easing: Easing.linear,
      }),
      -1,
      false
    );

    return () => {
      animationProgress.value = 0;
    };
  }, [stage, frames.length]);

  useEffect(() => {
    floatAnim.value = withRepeat(
      withTiming(-6, {
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );

    return () => {
      floatAnim.value = 0;
    };
  }, []);

  const currentFrame = useDerivedValue(() => {
    const frameIdx = Math.floor(animationProgress.value * frames.length);
    return frames[Math.min(frameIdx, frames.length - 1)];
  });

  const sprites = useRectBuffer(1, (value) => {
    'worklet';
    if (!spriteSheet) return;

    const frameWidth = spriteSheet.width() / TOTAL_COLUMNS;
    const frameHeight = spriteSheet.height() / TOTAL_ROWS;

    const frame = currentFrame.value;
    const column = frame % TOTAL_COLUMNS;
    const row = Math.floor(frame / TOTAL_COLUMNS);

    value.setXYWH(
      column * frameWidth,
      row * frameHeight,
      frameWidth,
      frameHeight
    );
  });

  const transforms = useRSXformBuffer(1, (value) => {
    'worklet';
    if (!spriteSheet) return;

    const frameWidth = spriteSheet.width() / TOTAL_COLUMNS;
    const scale = DISPLAY_SIZE / frameWidth;

    value.set(scale, 0, 0, floatAnim.value);
  });

  if (!spriteSheet) {
    return <View style={styles.canvasPlaceholder} />;
  }

  return (
    <Canvas style={styles.canvas}>
      <Atlas
        image={spriteSheet}
        sprites={sprites}
        transforms={transforms}
      />
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: DISPLAY_SIZE,
    height: DISPLAY_SIZE,
  },
  canvasPlaceholder: {
    width: DISPLAY_SIZE,
    height: DISPLAY_SIZE,
  },
});