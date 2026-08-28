import React from 'react';
import { G, Path, Svg } from 'react-native-svg';

import type { PetAccessory } from '../features/pet/store';

interface PetAccessoryProps {
  accessory: PetAccessory;
  size: number;
}

const COLORS = {
  crown: '#fbbf24',
  crownDark: '#d97706',
  glasses: 'rgba(31, 41, 55, 0.82)',
  bowtie: '#f43f5e',
  bowtieDark: '#be123c',
  halo: '#fbbf24',
  diamond: '#22d3ee',
  diamondLight: '#cffafe',
};

function crownPath(R: number): string {
  const yBase = -0.58 * R;
  const yMid = -0.66 * R;
  const yPeak = -0.78 * R;
  const w = 0.28 * R;
  const notch = 0.55 * w;
  return (
    `M${-w} ${yBase}` +
    `L${-notch} ${yMid}` +
    `L0 ${yPeak}` +
    `L${notch} ${yMid}` +
    `L${w} ${yBase}` +
    `Q0 ${yBase + 0.08 * R} ${-w} ${yBase}Z`
  );
}

function glassesPaths(R: number) {
  const cy = -0.10 * R;
  const rx = 0.18 * R;
  const ry = 0.14 * R;
  const gap = 0.08 * R;
  const leftCx = -rx - gap / 2;
  const rightCx = rx + gap / 2;
  const frameW = 0.025 * R;
  const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
    `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 -${rx * 2} 0`;
  return {
    left: ellipse(leftCx, cy, rx, ry),
    right: ellipse(rightCx, cy, rx, ry),
    bridge: `M${leftCx + rx} ${cy}L${rightCx - rx} ${cy}`,
    frameW,
  };
}

function bowtiePath(R: number): string {
  const cy = 0.48 * R;
  const w = 0.24 * R;
  const h = 0.14 * R;
  const knot = 0.06 * R;
  return (
    `M0 ${cy - knot}` +
    `L${-w} ${cy - h}` +
    `L${-w} ${cy + h}` +
    `L0 ${cy + knot}` +
    `L${w} ${cy + h}` +
    `L${w} ${cy - h}Z`
  );
}

function haloPath(R: number): string {
  const cy = -0.82 * R;
  const rx = 0.34 * R;
  const ry = 0.07 * R;
  const stroke = 0.04 * R;
  const outer = `M${-rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 -${rx * 2} 0`;
  const irx = Math.max(0.01, rx - stroke);
  const iry = Math.max(0.01, ry - stroke);
  const inner = `M${-irx} ${cy}a${irx} ${iry} 0 1 0 ${irx * 2} 0a${irx} ${iry} 0 1 0 -${irx * 2} 0`;
  return `${outer} ${inner}`;
}

function diamondPath(R: number): string {
  const cx = 0.46 * R;
  const cy = -0.34 * R;
  const s = 0.16 * R;
  return (
    `M${cx} ${cy - s}` +
    `L${cx + s} ${cy}` +
    `L${cx} ${cy + s}` +
    `L${cx - s} ${cy}Z`
  );
}

function diamondFacetPath(R: number): string {
  const cx = 0.46 * R;
  const cy = -0.34 * R;
  const s = 0.16 * R;
  return (
    `M${cx} ${cy - s}L${cx - s * 0.35} ${cy}L${cx + s * 0.35} ${cy}Z` +
    `M${cx - s} ${cy}L${cx - s * 0.35} ${cy}L${cx} ${cy + s}Z` +
    `M${cx + s} ${cy}L${cx + s * 0.35} ${cy}L${cx} ${cy + s}Z`
  );
}

export const PetAccessoryArt = React.memo(function PetAccessoryArt({ accessory, size }: PetAccessoryProps) {
  if (accessory === 'none') return null;

  const R = size / 2;

  switch (accessory) {
    case 'crown':
      return (
        <G>
          <Path d={crownPath(R)} fill={COLORS.crown} />
          <Path
            d={`M${-0.12 * R} ${-0.70 * R}L0 ${-0.62 * R}L${0.12 * R} ${-0.70 * R}`}
            stroke={COLORS.crownDark}
            strokeWidth={0.02 * R}
            fill="none"
            opacity={0.35}
          />
        </G>
      );
    case 'glasses': {
      const { left, right, bridge, frameW } = glassesPaths(R);
      return (
        <G>
          <Path d={left} fill={COLORS.glasses} />
          <Path d={right} fill={COLORS.glasses} />
          <Path
            d={bridge}
            stroke={COLORS.glasses}
            strokeWidth={frameW}
            strokeLinecap="round"
            fill="none"
          />
        </G>
      );
    }
    case 'bowtie':
      return (
        <G>
          <Path d={bowtiePath(R)} fill={COLORS.bowtie} />
          <Path
            d={`M0 ${0.44 * R}L0 ${0.52 * R}`}
            stroke={COLORS.bowtieDark}
            strokeWidth={0.02 * R}
            strokeLinecap="round"
          />
        </G>
      );
    case 'halo':
      return (
        <G>
          <Path
            d={haloPath(R)}
            fill={COLORS.halo}
            fillRule="evenodd"
            opacity={0.92}
          />
        </G>
      );
    case 'diamond':
      return (
        <G>
          <Path d={diamondPath(R)} fill={COLORS.diamond} />
          <Path d={diamondFacetPath(R)} fill={COLORS.diamondLight} opacity={0.55} />
        </G>
      );
  }
});

interface AccessoryPreviewProps {
  accessory: PetAccessory;
  size?: number;
}

export function AccessoryPreview({ accessory, size = 44 }: AccessoryPreviewProps) {
  if (accessory === 'none') return null;

  const center = size / 2;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <G transform={`translate(${center}, ${center})`}>
        <PetAccessoryArt accessory={accessory} size={size} />
      </G>
    </Svg>
  );
}
