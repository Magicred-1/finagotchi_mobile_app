import React from 'react';
import { G, Path } from 'react-native-svg';

interface PetBodyProps {
  bodyPath: string;
  color: string;
  glowColor?: string;
  bodyAlpha: number;
}

const GLOW_SCALE = 1.15;
const GLOW_OPACITY = 0.22;

export const PetBody = React.memo(function PetBody({
  bodyPath,
  color,
  glowColor,
  bodyAlpha,
}: PetBodyProps) {
  return (
    <G>
      <G transform={`scale(${GLOW_SCALE})`}>
        <Path
          d={bodyPath}
          fill={glowColor ?? color}
          opacity={bodyAlpha * GLOW_OPACITY}
        />
      </G>
      <Path d={bodyPath} fill={color} opacity={bodyAlpha} />
    </G>
  );
});
