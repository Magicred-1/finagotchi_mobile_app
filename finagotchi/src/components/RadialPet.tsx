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

import { FinagotchiEngine, type AnchorName, type Frame, type StateId } from '../engine/engine';
import { CREATURE_CLASSES, bodyPalette, type BodyPalette, type CreatureClassName } from '../engine/classes';
import type { PetMood } from '../engine/expressions';
import { clamp } from '../utils/math';
import type { PetAccessory } from '../features/pet/store';
import { PetAccessoryArt, SHIRT_FILL, SHIRT_TRIM } from './PetAccessory';

/** Which engine anchor each accessory rides on. */
const ACCESSORY_ANCHOR: Record<Exclude<PetAccessory, 'none'>, AnchorName> = {
  crown: 'headTop',
  glasses: 'face',
  bowtie: 'chest',
  halo: 'aboveHead',
  diamond: 'cheek',
  tshirt: 'torso',
};

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
   * IP colorway override (assets/ip/manifest.json). When set, the body, eyes,
   * and halo take the class palette instead of the lifecycle stage colors.
   */
  creatureClass?: CreatureClassName;
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
  creatureClass,
  active = true,
  onLook,
  onLookEnd,
}: RadialPetProps) {
  const cls = creatureClass ? CREATURE_CLASSES[creatureClass] : null;
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
  const accessoryGRef = useRef<InstanceType<typeof G> | null>(null);
  const shirtPathRef = useRef<Path>(null);
  const shirtCollarRef = useRef<Path>(null);
  /** Current accessory readable inside the animation-loop closure. */
  const accessoryNameRef = useRef(accessory);
  accessoryNameRef.current = accessory;
  const glowIdRef = useRef(`petGlow${++glowIdCounter}`);
  const bodyGradIdRef = useRef(`petBody${++glowIdCounter}`);
  /** Class palette readable inside the animation-loop closure. */
  const classRef = useRef(cls);
  classRef.current = cls;

  /**
   * Body shading, eye marks, and halo color only flip on evolution or class
   * change, so they go through React state (one cheap re-render) instead of
   * per-frame native writes — react-native-svg `Stop` cannot receive props
   * via setNativeProps.
   */
  const [palette, setPalette] = useState<BodyPalette>(() =>
    bodyPalette(cls?.body ?? lastFrameRef.current.color)
  );
  const [eyeFill, setEyeFill] = useState(cls?.mark ?? EYE_FILL);
  const [glowColor, setGlowColor] = useState(
    () =>
      cls?.glow ?? lastFrameRef.current.glowColor ?? lastFrameRef.current.color
  );

  // Class swap re-skins body, marks, and halo; clearing it restores the
  // stage-driven colors from the last engine frame.
  useEffect(() => {
    const frame = lastFrameRef.current;
    setPalette(bodyPalette(cls?.body ?? frame.color));
    setEyeFill(cls?.mark ?? EYE_FILL);
    setGlowColor(cls?.glow ?? frame.glowColor ?? frame.color);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatureClass]);

  /**
   * Last values pushed natively, so unchanged props are not re-sent (and
   * re-parsed) every frame. At rest the eye capsule path is constant, the
   * body color only flips on evolution, and the eye fill never changes.
   */
  const lastBodyDRef = useRef('');
  const lastColorRef = useRef('');
  const lastShirtDRef = useRef('');
  const lastShirtCollarRef = useRef('');
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

  // The fitted tee's geometry comes from the engine; keep it off otherwise.
  useEffect(() => {
    engine.setShirtEnabled(accessory === 'tshirt');
  }, [engine, accessory]);

  useEffect(() => {
    const applyFrame = (frame: Frame) => {
      lastFrameRef.current = frame;

      if (frame.bodyPath !== lastBodyDRef.current) {
        lastBodyDRef.current = frame.bodyPath;
        bodyRef.current?.setNativeProps({ d: frame.bodyPath });
      }
      if (frame.color !== lastColorRef.current) {
        lastColorRef.current = frame.color;
        bodyRef.current?.setNativeProps({ opacity: frame.bodyAlpha });
        if (!classRef.current) {
          setPalette(bodyPalette(frame.color));
          setGlowColor(frame.glowColor ?? frame.color);
        }
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

      // Accessories ride the engine's anchor transforms so they track the
      // creature's posture, gaze, and breath exactly like the eyes do.
      const accessoryG = accessoryGRef.current;
      if (accessoryG) {
        const name = accessoryNameRef.current;
        const m = name !== 'none' ? frame.anchors[ACCESSORY_ANCHOR[name]] : undefined;
        if (m) {
          scratch[0] = m[0];
          scratch[1] = m[2];
          scratch[2] = m[1];
          scratch[3] = m[3];
          scratch[4] = m[4];
          scratch[5] = m[5];
          accessoryG.setNativeProps({ matrix: scratch });
        }
      }

      // Fitted tee: engine-drawn from the live body contour.
      if (frame.shirt) {
        if (frame.shirt.d !== lastShirtDRef.current) {
          lastShirtDRef.current = frame.shirt.d;
          shirtPathRef.current?.setNativeProps({ d: frame.shirt.d });
        }
        if (frame.shirt.collar !== lastShirtCollarRef.current) {
          lastShirtCollarRef.current = frame.shirt.collar;
          shirtCollarRef.current?.setNativeProps({ d: frame.shirt.collar });
        }
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
  // Initial placement for the first paint and for accessory swaps; the
  // animation loop takes over via setNativeProps afterwards.
  const anchor = accessory !== 'none' ? frame.anchors[ACCESSORY_ANCHOR[accessory]] : undefined;
  const accessoryTransform = anchor ? `matrix(${anchor.join(' ')})` : undefined;

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
              {/**
               * Lit-sphere body shading: key light from the top-left, class
               * midtone, ambient navy shade at the rim. Gives the flat ghost
               * volume without a second path per frame.
               */}
              <RadialGradient
                id={bodyGradIdRef.current}
                cx={-center * 0.3}
                cy={-center * 0.38}
                r={center * 1.55}
                gradientUnits="userSpaceOnUse"
              >
                <Stop offset="0" stopColor={palette.light} />
                <Stop offset="0.52" stopColor={palette.base} />
                <Stop offset="1" stopColor={palette.shade} />
              </RadialGradient>
            </Defs>
            <Circle cx={0} cy={0} r={glowR} fill={`url(#${glowIdRef.current})`} />
            <Path
              ref={bodyRef}
              d={frame.bodyPath}
              fill={`url(#${bodyGradIdRef.current})`}
              opacity={frame.bodyAlpha}
            />
            {accessory === 'tshirt' ? (
              <>
                <Path
                  ref={shirtPathRef}
                  d={frame.shirt?.d ?? ''}
                  fill={SHIRT_FILL}
                />
                <Path
                  ref={shirtCollarRef}
                  d={frame.shirt?.collar ?? ''}
                  stroke={SHIRT_TRIM}
                  strokeWidth={size * 0.015}
                  strokeLinecap="round"
                  fill="none"
                />
              </>
            ) : null}
            <Path
              ref={eyeRefs[0]}
              d={frame.eyes[0]?.d ?? ''}
              fill={eyeFill}
              opacity={frame.eyes[0]?.alpha ?? 0}
            />
            <Path
              ref={eyeRefs[1]}
              d={frame.eyes[1]?.d ?? ''}
              fill={eyeFill}
              opacity={frame.eyes[1]?.alpha ?? 0}
            />
            {accessory !== 'none' ? (
              <G ref={accessoryGRef} transform={accessoryTransform}>
                <PetAccessoryArt accessory={accessory} size={size} fitted />
              </G>
            ) : null}
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
