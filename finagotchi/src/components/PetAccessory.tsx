import React from 'react';
import { G, Path, Svg } from 'react-native-svg';

import type { PetAccessory } from '../features/pet/store';

interface PetAccessoryProps {
  accessory: PetAccessory;
  size: number;
  /**
   * Tee only: render just the emblem. RadialPet sets this because the engine
   * draws the shirt itself from the live body contour; previews leave it off
   * and get the standalone static tee.
   */
  fitted?: boolean;
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
  shirt: '#f1f5f9',
  shirtTrim: '#94a3b8',
  shirtEmblem: '#fbbf24',
  shirtEmblemDark: '#d97706',
};

/**
 * All artwork is drawn around the origin, which is the accessory's anchor
 * point (base center for the crown, lens midpoint for the glasses, center for
 * the rest). RadialPet places it through the engine's per-frame anchor matrix
 * so it follows the creature's posture; AccessoryPreview just centers it.
 */

function crownPath(R: number): string {
  const yMid = -0.08 * R;
  const yPeak = -0.20 * R;
  const w = 0.28 * R;
  const notch = 0.55 * w;
  return (
    `M${-w} 0` +
    `L${-notch} ${yMid}` +
    `L0 ${yPeak}` +
    `L${notch} ${yMid}` +
    `L${w} 0` +
    `Q0 ${0.08 * R} ${-w} 0Z`
  );
}

function glassesPaths(R: number) {
  const rx = 0.18 * R;
  const ry = 0.14 * R;
  const gap = 0.08 * R;
  const leftCx = -rx - gap / 2;
  const rightCx = rx + gap / 2;
  const frameW = 0.025 * R;
  const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
    `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 -${rx * 2} 0`;
  return {
    left: ellipse(leftCx, 0, rx, ry),
    right: ellipse(rightCx, 0, rx, ry),
    bridge: `M${leftCx + rx} 0L${rightCx - rx} 0`,
    frameW,
  };
}

function bowtiePath(R: number): string {
  const w = 0.24 * R;
  const h = 0.14 * R;
  const knot = 0.06 * R;
  return (
    `M0 ${-knot}` +
    `L${-w} ${-h}` +
    `L${-w} ${h}` +
    `L0 ${knot}` +
    `L${w} ${h}` +
    `L${w} ${-h}Z`
  );
}

function haloPath(R: number): string {
  const rx = 0.34 * R;
  const ry = 0.07 * R;
  const stroke = 0.04 * R;
  const outer = `M${-rx} 0a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 -${rx * 2} 0`;
  const irx = Math.max(0.01, rx - stroke);
  const iry = Math.max(0.01, ry - stroke);
  const inner = `M${-irx} 0a${irx} ${iry} 0 1 0 ${irx * 2} 0a${irx} ${iry} 0 1 0 -${irx * 2} 0`;
  return `${outer} ${inner}`;
}

function diamondPath(R: number): string {
  const s = 0.16 * R;
  return `M0 ${-s}L${s} 0L0 ${s}L${-s} 0Z`;
}

function diamondFacetPath(R: number): string {
  const s = 0.16 * R;
  return (
    `M0 ${-s}L${-s * 0.35} 0L${s * 0.35} 0Z` +
    `M${-s} 0L${-s * 0.35} 0L0 ${s}Z` +
    `M${s} 0L${s * 0.35} 0L0 ${s}Z`
  );
}

/**
 * Tee drawn around the torso anchor, sized to wrap a body of radius 0.5R;
 * the anchor scales it to the actual stage. Slight A-line, short sleeves,
 * scoop collar, and a coin emblem.
 */
function tshirtPath(R: number): string {
  const u = (v: number) => v * R;
  return (
    `M${u(-0.3)} ${u(-0.16)}` +
    `L${u(-0.46)} ${u(-0.06)}` +
    `L${u(-0.4)} ${u(0.06)}` +
    `L${u(-0.3)} ${u(0)}` +
    `L${u(-0.36)} ${u(0.3)}` +
    `L${u(0.36)} ${u(0.3)}` +
    `L${u(0.3)} ${u(0)}` +
    `L${u(0.4)} ${u(0.06)}` +
    `L${u(0.46)} ${u(-0.06)}` +
    `L${u(0.3)} ${u(-0.16)}` +
    `Q0 ${u(-0.02)} ${u(-0.3)} ${u(-0.16)}Z`
  );
}

function tshirtEmblemPath(R: number): string {
  const r = 0.06 * R;
  const cy = 0.12 * R;
  return `M${-r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 -${r * 2} 0`;
}

export const PetAccessoryArt = React.memo(function PetAccessoryArt({ accessory, size, fitted = false }: PetAccessoryProps) {
  if (accessory === 'none') return null;

  const R = size / 2;

  switch (accessory) {
    case 'crown':
      return (
        <G>
          <Path d={crownPath(R)} fill={COLORS.crown} />
          <Path
            d={`M${-0.12 * R} ${-0.12 * R}L0 ${-0.04 * R}L${0.12 * R} ${-0.12 * R}`}
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
            d={`M0 ${-0.04 * R}L0 ${0.04 * R}`}
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
    case 'tshirt': {
      const emblem = (
        <>
          <Path d={tshirtEmblemPath(R)} fill={COLORS.shirtEmblem} />
          <Path
            d={tshirtEmblemPath(R * 0.55)}
            fill="none"
            stroke={COLORS.shirtEmblemDark}
            strokeWidth={0.02 * R}
            transform={`translate(0 ${0.12 * R * 0.45})`}
          />
        </>
      );
      // Fitted mode: the engine-drawn shirt wraps the body; only the emblem
      // rides the torso anchor here.
      if (fitted) return <G>{emblem}</G>;
      return (
        <G>
          <Path d={tshirtPath(R)} fill={COLORS.shirt} />
          <Path
            d={`M${-0.26 * R} ${-0.12 * R}Q0 ${-0.04 * R} ${0.26 * R} ${-0.12 * R}`}
            stroke={COLORS.shirtTrim}
            strokeWidth={0.03 * R}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d={`M${-0.33 * R} ${0.25 * R}L${0.33 * R} ${0.25 * R}`}
            stroke={COLORS.shirtTrim}
            strokeWidth={0.03 * R}
            strokeLinecap="round"
          />
          {emblem}
        </G>
      );
    }
  }
});

/** Colors of the engine-drawn fitted tee (kept in sync with COLORS above). */
export const SHIRT_FILL = COLORS.shirt;
export const SHIRT_TRIM = COLORS.shirtTrim;

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
