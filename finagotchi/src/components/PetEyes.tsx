import React from 'react';
import { G, Path } from 'react-native-svg';

import type { RenderedEye } from '../engine/engine';

interface PetEyesProps {
  eyes: RenderedEye[];
}

export function PetEyes({ eyes }: PetEyesProps) {
  return (
    <G>
      {eyes.map((eye, i) => (
        <Path
          key={i}
          d={eye.d}
          fill="#f5f5f5"
          opacity={eye.alpha}
          transform={eye.matrix}
        />
      ))}
    </G>
  );
}
