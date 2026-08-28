import React, { memo, useEffect, useRef } from 'react';
import {
    PanResponder,
    Pressable,
    StyleSheet,
    View,
    type GestureResponderEvent,
} from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { FinagotchiEngine, type Frame, type StateId } from '../engine/engine';
import type { PetMood } from '../engine/expressions';
import { clamp } from '../utils/math';
import type { PetAccessory } from '../features/pet/store';
import { PetAccessoryArt } from './PetAccessory';

/** Gaze limits, matching the firmware clamps. */
const MAX_YAW = 30;
const MAX_PITCH = 25;
/** BLE look writes are throttled to ~10 Hz. */
const LOOK_EMIT_INTERVAL_MS = 100;

const GLOW_SCALE = 1.15;
const GLOW_OPACITY = 0.22;
const EYE_FILL = '#f5f5f5';

/**
 * react-native-svg delivers a `transform="matrix(a,b,c,d,e,f)"` string to the
 * native side as a column-major `matrix` prop [a, c, b, d, e, f] (see
 * extractTransform). Since frames bypass React via setNativeProps, do the
 * conversion here, into a scratch array to avoid per-frame allocations.
 */
function writeEyeMatrix(
    matrix: string,
    out: [number, number, number, number, number, number]
): void {
    // engine always emits "matrix(a,b,c,d,e,f)"
    const parts = matrix.slice(7, -1).split(',');
    out[0] = +parts[0];
    out[1] = +parts[2];
    out[2] = +parts[1];
    out[3] = +parts[3];
    out[4] = +parts[4];
    out[5] = +parts[5];
}

export interface RadialPetProps {
  stage: StateId;
  mood?: PetMood;
  size?: number;
  onTap?: () => void;
  accessory?: PetAccessory;
  isSpectral?: boolean;
  /** Drag-to-look: yaw/pitch in degrees, throttled to ~10 Hz. */
  onLook?: (yaw: number, pitch: number) => void;
  /** Drag released: resume idle gaze wander. */
  onLookEnd?: () => void;
}

function RadialPetInner({
  stage,
  mood = 'calm',
  size = 150,
  onTap,
  accessory = 'none',
  isSpectral = false,
  onLook,
  onLookEnd,
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

  /**
   * Frames are pushed straight to the native SVG nodes with setNativeProps —
   * no React state, no reconciliation, 60 times a second. The JSX below only
   * re-renders for slow prop changes (accessory, spectral), so it reads the
   * latest frame from this ref to avoid snapping back to the mount frame.
   */
  const lastFrameRef = useRef<Frame>(engine.sample(0));
  const bodyRef = useRef<Path>(null);
  const glowRef = useRef<Path>(null);
  const eyeRefs = [useRef<Path>(null), useRef<Path>(null)];
  const eyeMatrixRef = useRef<
    [number, number, number, number, number, number]
  >([1, 0, 0, 1, 0, 0]);

  useEffect(() => {
    engine.setState(stage, elapsedRef.current);
  }, [engine, stage]);

  useEffect(() => {
    engine.setExpression(mood, elapsedRef.current);
  }, [engine, mood]);

  useEffect(() => {
    const applyFrame = (frame: Frame) => {
      lastFrameRef.current = frame;

      bodyRef.current?.setNativeProps({
        d: frame.bodyPath,
        fill: frame.color,
        opacity: frame.bodyAlpha,
      });
      glowRef.current?.setNativeProps({
        d: frame.bodyPath,
        fill: frame.glowColor ?? frame.color,
        opacity: frame.bodyAlpha * GLOW_OPACITY,
      });

      const scratch = eyeMatrixRef.current;
      for (let i = 0; i < 2; i++) {
        const eyeRef = eyeRefs[i].current;
        if (!eyeRef) continue;
        const eye = frame.eyes[i];
        if (!eye) {
          eyeRef.setNativeProps({ opacity: 0 });
          continue;
        }
        writeEyeMatrix(eye.matrix, scratch);
        eyeRef.setNativeProps({
          d: eye.d,
          matrix: scratch,
          fill: EYE_FILL,
          opacity: eye.alpha,
        });
      }
    };

    const tick = () => {
      elapsedRef.current = (Date.now() - startTimeRef.current) / 1000;
      applyFrame(engine.sample(elapsedRef.current));
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // --- Drag-to-look -------------------------------------------------------

  const viewRef = useRef<View>(null);
  const centerRef = useRef({ x: 0, y: 0 });
  const lastLookEmitRef = useRef(0);
  const onLookRef = useRef(onLook);
  onLookRef.current = onLook;
  const onLookEndRef = useRef(onLookEnd);
  onLookEndRef.current = onLookEnd;

  const panResponder = useRef(
    PanResponder.create({
      // Only claim the gesture once it is clearly a drag, so taps still work.
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) + Math.abs(gesture.dy) > 8,
      onPanResponderGrant: () => {
        viewRef.current?.measureInWindow((x, y, w, h) => {
          centerRef.current = { x: x + w / 2, y: y + h / 2 };
        });
      },
      onPanResponderMove: (evt: GestureResponderEvent, _gesture) => {
        const half = size / 2;
        const yaw = clamp(
          ((evt.nativeEvent.pageX - centerRef.current.x) / half) * MAX_YAW,
          -MAX_YAW,
          MAX_YAW
        );
        const pitch = clamp(
          ((evt.nativeEvent.pageY - centerRef.current.y) / half) * MAX_PITCH,
          -MAX_PITCH,
          MAX_PITCH
        );

        engineRef.current?.setLook(
          { yaw, pitch, mix: 0.85, wander: 0 },
          elapsedRef.current
        );

        const nowMs = Date.now();
        if (nowMs - lastLookEmitRef.current >= LOOK_EMIT_INTERVAL_MS) {
          lastLookEmitRef.current = nowMs;
          onLookRef.current?.(yaw, pitch);
        }
      },
      onPanResponderRelease: () => {
        engineRef.current?.setLook(null, elapsedRef.current);
        onLookEndRef.current?.();
      },
      onPanResponderTerminate: () => {
        engineRef.current?.setLook(null, elapsedRef.current);
        onLookEndRef.current?.();
      },
    })
  ).current;

  const center = size / 2;
  const frame = lastFrameRef.current;

  return (
    <View
      ref={viewRef}
      style={[styles.container, { width: size, height: size }]}
      {...panResponder.panHandlers}
    >
      <Pressable onPress={onTap} style={styles.pressable}>
        <Svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={[styles.svg, isSpectral && styles.svgSpectral]}
        >
          <G transform={`translate(${center}, ${center})`}>
            <G transform={`scale(${GLOW_SCALE})`}>
              <Path
                ref={glowRef}
                d={frame.bodyPath}
                fill={frame.glowColor ?? frame.color}
                opacity={frame.bodyAlpha * GLOW_OPACITY}
              />
            </G>
            <Path
              ref={bodyRef}
              d={frame.bodyPath}
              fill={frame.color}
              opacity={frame.bodyAlpha}
            />
            <Path
              ref={eyeRefs[0]}
              d={frame.eyes[0]?.d ?? ''}
              fill={EYE_FILL}
              opacity={frame.eyes[0]?.alpha ?? 0}
            />
            <Path
              ref={eyeRefs[1]}
              d={frame.eyes[1]?.d ?? ''}
              fill={EYE_FILL}
              opacity={frame.eyes[1]?.alpha ?? 0}
            />
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
