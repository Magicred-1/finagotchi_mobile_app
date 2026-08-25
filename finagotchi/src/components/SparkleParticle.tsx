import React, { useMemo } from 'react';
import { Path, G } from 'react-native-svg';

interface SparkleParticleProps {
  index: number;
  total: number;
  progress: number; // 0 = burst start, 1 = faded
  size: number;
}

/**
 * A simple four-pointed star that bursts outward from the center and fades.
 */
export function SparkleParticle({
  index,
  total,
  progress,
  size,
}: SparkleParticleProps) {
  const { translateX, translateY, opacity, scale } = useMemo(() => {
    const angle = (index / total) * 2 * Math.PI;
    const distance = size * 0.4 * progress;
    const wobble = Math.sin(progress * Math.PI * 2 + index) * size * 0.05;

    return {
      translateX: Math.cos(angle) * distance + Math.cos(angle + Math.PI / 2) * wobble,
      translateY: Math.sin(angle) * distance + Math.sin(angle + Math.PI / 2) * wobble,
      opacity: Math.max(0, 1 - progress),
      scale: 1 - progress * 0.4,
    };
  }, [index, total, progress, size]);

  const starSize = size * 0.04 * scale;
  const d =
    `M 0 ${-starSize}` +
    `C ${starSize * 0.3} ${-starSize * 0.3} ${starSize * 0.3} ${-starSize * 0.3} ${starSize} 0` +
    `C ${starSize * 0.3} ${starSize * 0.3} ${starSize * 0.3} ${starSize * 0.3} 0 ${starSize}` +
    `C ${-starSize * 0.3} ${starSize * 0.3} ${-starSize * 0.3} ${starSize * 0.3} ${-starSize} 0` +
    `C ${-starSize * 0.3} ${-starSize * 0.3} ${-starSize * 0.3} ${-starSize * 0.3} 0 ${-starSize}` +
    ' Z';

  return (
    <G transform={`translate(${translateX}, ${translateY})`} opacity={opacity}>
      <Path d={d} fill="#FFD700" />
    </G>
  );
}
