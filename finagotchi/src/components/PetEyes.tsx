import React from 'react';
import { G, Path } from 'react-native-svg';

import type { RenderedEye } from '../engine/engine';
import { r2 } from '../utils/math';

interface PetEyesProps {
  eyes: RenderedEye[];
}

/** The engine carries matrices as numbers; this legacy path formats them. */
function matrixAttr(m: RenderedEye['m']): string {
  return `matrix(${r2(m[0])},${r2(m[1])},${r2(m[2])},${r2(m[3])},${r2(m[4])},${r2(m[5])})`;
}

export const PetEyes = React.memo(function PetEyes({ eyes }: PetEyesProps) {
  return (
    <G>
      {eyes.map((eye, i) => (
        <Path
          key={i}
          d={eye.d}
          fill="#f5f5f5"
          opacity={eye.alpha}
          transform={matrixAttr(eye.m)}
        />
      ))}
    </G>
  );
});
