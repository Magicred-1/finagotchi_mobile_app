import React from 'react';
import { Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';

interface PetBodyProps {
  bodyPath: string;
  color: string;
  glowColor?: string;
  bodyAlpha: number;
  size: number;
  timeMs: number;
}

const GLOW_OPACITY_THRESHOLD = 0.02;

export function PetBody({ bodyPath, color, glowColor, bodyAlpha, size, timeMs }: PetBodyProps) {
  const center = size / 2;
  const pulse = glowColor
    ? 0.03 * Math.sin((timeMs * 0.5 * 2 * Math.PI) / 1000)
    : 0;
  const glowOpacity = glowColor ? Math.max(0, 0.2 + pulse) : 0;
  const hasGlow = glowColor && glowOpacity > GLOW_OPACITY_THRESHOLD;

  if (!hasGlow) {
    return <Path d={bodyPath} fill={color} opacity={bodyAlpha} />;
  }

  const glowRadius = size * 0.55;

  return (
    <G>
      <Defs>
        <RadialGradient
          id="bodyGlow"
          cx={center}
          cy={center}
          rx={glowRadius}
          ry={glowRadius}
          fx={center}
          fy={center}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0%" stopColor={glowColor} stopOpacity={glowOpacity} />
          <Stop offset="100%" stopColor={glowColor} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Path d={bodyPath} fill="url(#bodyGlow)" opacity={bodyAlpha} />
      <Path d={bodyPath} fill={color} opacity={bodyAlpha} />
    </G>
  );
}
