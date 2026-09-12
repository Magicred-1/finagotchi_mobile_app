/**
 * Creature classes: semantic colorways for the radial creature, derived from
 * the ghost IP set in assets/ip/manifest.json. Each class pairs an IP body
 * color with its face-mark color, so the on-screen creature reads as the same
 * character the firmware sprites show in that app state.
 *
 * A class is a colorway, not a species: the silhouette stays lifecycle-driven
 * (egg → coinling → hodler → whale) so evolution morphs keep working, and the
 * class re-skins whatever stage the creature is in.
 */

export type CreatureClassName =
  | 'default'
  | 'evolution'
  | 'calm'
  | 'reward'
  | 'danger'
  | 'healthy';

export interface CreatureClass {
  id: CreatureClassName;
  /** Body color from the IP set. */
  body: string;
  /** Face-mark color: eyes and small accents. */
  mark: string;
  /** Halo / aura color. */
  glow: string;
}

/**
 * Palette follows assets/ip/manifest.json; its loose color names are resolved
 * to hex here ("warm white", "soft lavender", "warm cream", "muted cyan",
 * "seafoam green", "deep teal").
 */
export const CREATURE_CLASSES: Record<CreatureClassName, CreatureClass> = {
  default: { id: 'default', body: '#35D7FF', mark: '#FFF3E0', glow: '#35D7FF' },
  evolution: { id: 'evolution', body: '#C7B8FF', mark: '#9945FF', glow: '#9945FF' },
  calm: { id: 'calm', body: '#F4E9D4', mark: '#5E9FAF', glow: '#F4E9D4' },
  reward: { id: 'reward', body: '#FFD166', mark: '#07111F', glow: '#FFD166' },
  danger: { id: 'danger', body: '#FF647C', mark: '#F4E9D4', glow: '#FF647C' },
  healthy: { id: 'healthy', body: '#6FDDB0', mark: '#0F5A52', glow: '#5DE2A6' },
};

/** Linear mix between two #RRGGBB colors. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255;
  const ag = (pa >> 8) & 255;
  const ab = pa & 255;
  const r = Math.round(ar + (((pb >> 16) & 255) - ar) * t);
  const g = Math.round(ag + (((pb >> 8) & 255) - ag) * t);
  const bl = Math.round(ab + ((pb & 255) - ab) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

export interface BodyPalette {
  /** Key-light tint at the top-left of the body. */
  light: string;
  /** Midtone — the class body color. */
  base: string;
  /** Ambient shade at the far rim. */
  shade: string;
}

/**
 * Lit-sphere ramp for the radial body gradient: a soft key light, the class
 * midtone, and a shade pulled toward the app's deep-navy background so the
 * rim melts into the screen instead of reading as a hard sticker edge.
 */
export function bodyPalette(base: string): BodyPalette {
  return {
    light: mixHex(base, '#FFFFFF', 0.4),
    base,
    shade: mixHex(base, '#07111F', 0.45),
  };
}
