import React, { memo, useEffect, useRef, useState } from 'react';
import {
    AppState,
    PanResponder,
    Pressable,
    StyleSheet,
    View,
    type GestureResponderEvent,
} from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';

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

const GLOW_OPACITY = 0.22;
/** Radius of the halo gradient, relative to the engine scale (size / 2). */
const GLOW_RADIUS = 1.0;
const EYE_FILL = '#f5f5f5';

/** Unique gradient id per mounted pet — several RadialPets share one screen. */
let glowIdCounter = 0;

export interface RadialPetProps {
  stage: StateId;
  mood?: PetMood;
  size?: number;
  onTap?: () => void;
  accessory?: PetAccessory;
  isSpectral?: boolean;
  /**
   * Set false while the pet is not visible (closed sheet, hidden cross-fade)
   * to stop its animation loop entirely. Defaults to true.
   */
  active?: boolean;
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
  active = true,
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
  const eyeRefs = [useRef<Path>(null), useRef<Path>(null)];
  const glowIdRef = useRef(`petGlow${++glowIdCounter}`);

  /**
   * The halo color only flips on evolution, so it goes through React state
   * (one cheap re-render per state change) instead of per-frame native writes
   * — react-native-svg `Stop` cannot receive props via setNativeProps.
   */
  const [glowColor, setGlowColor] = useState(
    () => lastFrameRef.current.glowColor ?? lastFrameRef.current.color
  );

  /**
   * Last values pushed natively, so unchanged props are not re-sent (and
   * re-parsed) every frame. At rest the eye capsule path is constant, the
   * body color only flips on evolution, and the eye fill never changes.
   */
  const lastBodyDRef = useRef('');
  const lastColorRef = useRef('');
  const lastEyeDRefs = [useRef(''), useRef('')];
  const eyeHiddenRefs = [useRef(false), useRef(false)];
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

      if (frame.bodyPath !== lastBodyDRef.current) {
        lastBodyDRef.current = frame.bodyPath;
        bodyRef.current?.setNativeProps({ d: frame.bodyPath });
      }
      if (frame.color !== lastColorRef.current) {
        lastColorRef.current = frame.color;
        bodyRef.current?.setNativeProps({
          fill: frame.color,
          opacity: frame.bodyAlpha,
        });
        setGlowColor(frame.glowColor ?? frame.color);
      }

      const scratch = eyeMatrixRef.current;
      for (let i = 0; i < 2; i++) {
        const eyeRef = eyeRefs[i].current;
        if (!eyeRef) continue;
        const eye = frame.eyes[i];
        if (!eye) {
          if (!eyeHiddenRefs[i].current) {
            eyeHiddenRefs[i].current = true;
            eyeRef.setNativeProps({ opacity: 0 });
          }
          continue;
        }
        eyeHiddenRefs[i].current = false;

        // engine emits SVG order [a,b,c,d,e,f]; the native `matrix` prop is
        // column-major [a, c, b, d, e, f] (see react-native-svg
        // extractTransform).
        const m = eye.m;
        scratch[0] = m[0];
        scratch[1] = m[2];
        scratch[2] = m[1];
        scratch[3] = m[3];
        scratch[4] = m[4];
        scratch[5] = m[5];

        const props: { d?: string; matrix: typeof scratch; opacity: number } = {
          matrix: scratch,
          opacity: eye.alpha,
        };
        if (eye.d !== lastEyeDRefs[i].current) {
          lastEyeDRefs[i].current = eye.d;
          props.d = eye.d;
        }
        eyeRef.setNativeProps(props);
      }
    };

    const tick = () => {
      elapsedRef.current = (Date.now() - startTimeRef.current) / 1000;
      applyFrame(engine.sample(elapsedRef.current));
      rafRef.current = requestAnimationFrame(tick);
    };

    const start = () => {
      if (rafRef.current === null) {
        // Apply one frame immediately so a reactivated pet never shows stale
        // geometry for a frame.
        tick();
      }
    };
    const stop = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    if (!active) {
      return;
    }

    // Pause with the app: no point burning battery on frames nobody sees.
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        startTimeRef.current = Date.now() - elapsedRef.current * 1000;
        start();
      } else {
        stop();
      }
    });
    start();

    return () => {
      sub.remove();
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, active]);

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
  const glowR = center * GLOW_RADIUS;

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
            {/**
             * The halo is a static radial-gradient circle instead of a scaled
             * copy of the body path: same look, but no second 64-curve path
             * string parsed natively every frame. Only its color is updated,
             * and only when the body color flips.
             */}
            <Defs>
              <RadialGradient
                id={glowIdRef.current}
                cx={0}
                cy={0}
                r={glowR}
                gradientUnits="userSpaceOnUse"
              >
                <Stop
                  offset="0.55"
                  stopColor={glowColor}
                  stopOpacity={GLOW_OPACITY}
                />
                <Stop
                  offset="1"
                  stopColor={glowColor}
                  stopOpacity="0"
                />
              </RadialGradient>
            </Defs>
            <Circle cx={0} cy={0} r={glowR} fill={`url(#${glowIdRef.current})`} />
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
