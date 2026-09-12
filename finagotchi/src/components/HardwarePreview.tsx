import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { RadialPet } from './RadialPet';

/**
 * Hardware device preview with a live pet rendered on the screen.
 *
 * Pure React Native recreation of the web R3F reference model: portrait
 * squircle shell with a light trim seam, recessed glass display, d-pad,
 * two round buttons, keychain lug + split ring and a battery glyph.
 */

// Hardware palette sampled from the reference renders.
const SHELL = '#354253'; // dark slate-blue body
const SHELL_DEEP = '#1B232E'; // recessed details (d-pad well, lug, port)
const TRIM = '#6E8FA3'; // light seam between the shell halves
const GLASS = '#05070B';
const DISPLAY_EDGE = '#182231';
const DPAD_CROSS = '#46536A';
const METAL = '#C9D4E0';
const BATTERY = '#F2F7FB';

/**
 * All geometry below is expressed in the reference model's world units
 * (shell: 2.6 × 3.4, origin at shell center, y up) and scaled to pixels.
 */
const WORLD_HEIGHT = 4.7; // ring top to USB-C port, plus margin
const WORLD_CENTER_Y = 0.39; // vertical midpoint of the whole assembly

interface Props {
  /** Width / height of the whole preview (square). */
  size?: number;
  /** Pet stage to show on the screen. */
  stage?: import('../engine/engine').StateId;
  /** Pet mood. */
  mood?: import('../engine/expressions').PetMood;
}

export function HardwarePreview({
  size = 260,
  stage = 'egg',
  mood = 'calm',
}: Props) {
  const float = useSharedValue(0);

  React.useEffect(() => {
    float.value = withRepeat(
      withTiming(-10, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [float]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: float.value }],
  }));

  const u = size / WORLD_HEIGHT;
  const cx = size / 2;
  const cy = size / 2 + WORLD_CENTER_Y * u;

  /** Absolute style for a box centered at world (x, y) with size (w, h). */
  const rect = (x: number, y: number, w: number, h: number) => ({
    left: cx + (x - w / 2) * u,
    top: cy - (y + h / 2) * u,
    width: w * u,
    height: h * u,
  });

  /** Absolute style for a circle of radius r centered at world (x, y). */
  const circle = (x: number, y: number, r: number) => ({
    ...rect(x, y, r * 2, r * 2),
    borderRadius: r * u,
  });

  return (
    <Animated.View
      style={[styles.root, { width: size, height: size }, animatedStyle]}
    >
      {/* Split ring standing upright, facing the viewer */}
      <View
        style={[
          styles.ring,
          circle(-0.88, 2.22, 0.313),
          { borderWidth: 0.066 * u },
        ]}
      />
      <View
        style={[
          styles.ring,
          circle(-0.84, 2.26, 0.29),
          { borderWidth: 0.05 * u, borderColor: '#9FB0C0' },
        ]}
      />

      {/* Lug protruding from the shell (shell drawn over its base) */}
      <View
        style={[
          styles.part,
          rect(-0.88, 1.78, 0.42, 0.4),
          { borderRadius: 0.09 * u, backgroundColor: SHELL_DEEP },
        ]}
      />

      {/* Light seam between the shell halves, peeking out right + bottom */}
      <View
        style={[
          styles.part,
          rect(0.03, -0.03, 2.63, 3.43),
          { borderRadius: 0.39 * u, backgroundColor: TRIM },
        ]}
      />

      {/* Portrait squircle shell */}
      <View
        style={[
          styles.part,
          styles.shellShadow,
          rect(0, 0, 2.6, 3.4),
          { borderRadius: 0.38 * u, backgroundColor: SHELL },
        ]}
      />

      {/* Screen glass bezel */}
        <View
          style={[
            styles.part,
            rect(0, 0.37, 2.28, 2.3),
            { borderRadius: 0.16 * u, backgroundColor: GLASS },
          ]}
        />

        {/* Live display: pet + soft sheen across the top */}
        <View
          style={[
            styles.display,
            rect(0, 0.37, 1.92, 1.92),
            { borderRadius: 0.08 * u },
          ]}
        >
          <RadialPet stage={stage} mood={mood} size={1.45 * u} active />
          <View pointerEvents="none" style={styles.sheen} />
        </View>

        {/* White battery glyph at the top-right of the glass */}
        <View
          style={[
            styles.part,
            rect(0.86, 1.4, 0.17, 0.1),
            { borderRadius: 0.02 * u, backgroundColor: BATTERY },
          ]}
        />
        <View
          style={[
            styles.part,
            rect(0.96, 1.4, 0.035, 0.05),
            { backgroundColor: BATTERY },
          ]}
        />

        {/* D-pad: round well with a raised cross */}
        <View
          style={[
            styles.part,
            circle(-0.71, -1.28, 0.31),
            { backgroundColor: SHELL_DEEP },
          ]}
        >
          <View
            style={[
              styles.part,
              {
                width: 0.44 * u,
                height: 0.15 * u,
                borderRadius: 0.03 * u,
                backgroundColor: DPAD_CROSS,
              },
            ]}
          />
          <View
            style={[
              styles.part,
              {
                width: 0.15 * u,
                height: 0.44 * u,
                borderRadius: 0.03 * u,
                backgroundColor: DPAD_CROSS,
              },
            ]}
          />
        </View>

        {/* Two round buttons (right, diagonal) */}
        <View
          style={[
            styles.part,
            circle(0.25, -1.07, 0.13),
            { backgroundColor: SHELL_DEEP },
          ]}
        />
        <View
          style={[
            styles.part,
            circle(0.59, -1.33, 0.13),
            { backgroundColor: SHELL_DEEP },
          ]}
        />

        {/* USB-C port hint on the bottom edge */}
        <View
          style={[
            styles.part,
            rect(0, -1.69, 0.22, 0.08),
            { borderRadius: 0.04 * u, backgroundColor: SHELL_DEEP },
          ]}
        />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  part: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderColor: METAL,
    backgroundColor: 'transparent',
  },
  shellShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
  },
  display: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: DISPLAY_EDGE,
  },
  sheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '30%',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});
