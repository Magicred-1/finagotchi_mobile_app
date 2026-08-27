import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '../theme/tokens';

interface LevelUpAnimationProps {
  level: number;
  size?: number;
}

export function LevelUpAnimation({ level, size = 18 }: LevelUpAnimationProps) {
  const prevLevelRef = useRef(level);
  const triggerKeyRef = useRef(0);

  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(0);
  const rotate = useSharedValue(0);

  useEffect(() => {
    if (level > prevLevelRef.current) {
      triggerKeyRef.current += 1;
      scale.value = 0;
      opacity.value = 1;
      translateY.value = 0;
      rotate.value = 0;

      scale.value = withSequence(
        withSpring(1.6, { damping: 10, stiffness: 300 }),
        withTiming(1.2, { duration: 200 })
      );
      translateY.value = withTiming(-14, { duration: 700 });
      rotate.value = withTiming(25, { duration: 700 });
      opacity.value = withTiming(0, { duration: 700 });
    }
    prevLevelRef.current = level;
  }, [level, scale, opacity, translateY, rotate]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View style={[styles.burst, animatedStyle]}>
        <Ionicons name="sparkles" size={size} color={colors.primary} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  burst: {
    position: 'absolute',
  },
});
