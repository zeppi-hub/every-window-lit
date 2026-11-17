/**
 * The world shaking, never the camera (META_VR_V2_TASARIM.md: "dünya
 * sallanıyor, kamera sallanmıyor"; medium and strong; Less motion damps it).
 * Two kinds: a sway, the slow roll and pitch of a ship's deck in a storm,
 * and a tremor, the quick shaking of a fire's crash or a mountain's
 * rockfall. Pure: quakeAt says, for a moment of a quake, how far the world
 * is turned (radians, about x and z, round the player) and moved (m).
 */
export type QuakeKind = 'sway' | 'tremor';
export type QuakeStrength = 'medium' | 'strong';

export interface QuakeSpec {
  kind: QuakeKind;
  strength: QuakeStrength;
  /** How long it lasts, its fade out included (s). Infinity: till stopQuake. */
  seconds: number;
}

/** Per kind and strength: the largest turn (radians) and move (m), and the main frequency (Hz). */
export const QUAKE_SIZES: Readonly<Record<QuakeKind, Readonly<Record<QuakeStrength, { turn: number; move: number; hz: number }>>>> = {
  sway: { medium: { turn: 0.035, move: 0.02, hz: 0.18 }, strong: { turn: 0.07, move: 0.04, hz: 0.22 } },
  tremor: { medium: { turn: 0.006, move: 0.008, hz: 5 }, strong: { turn: 0.014, move: 0.02, hz: 6 } },
};

/** Less motion: this share of the size, at this share of the speed. */
export const CALM_SIZE = 0.3;
export const CALM_SPEED = 0.6;
/** The quake grows in over RISE and dies out over FALL (s). */
export const RISE = 0.4;
export const FALL = 0.8;

export interface QuakeOffset {
  /** Turn about the world's x and z axes, round the player (radians). */
  pitch: number;
  roll: number;
  /** Move (m). */
  x: number;
  y: number;
  z: number;
}

/** How strong the quake is at `t` seconds of `seconds` (0..1): growing in, full, dying out. */
export function envelope(t: number, seconds: number): number {
  if (t <= 0) return 0;
  const rise = Math.min(1, t / RISE);
  if (!Number.isFinite(seconds)) return rise * rise * (3 - 2 * rise);
  const left = seconds - t;
  if (left <= 0) return 0;
  const k = Math.min(rise, Math.min(1, left / FALL));
  return k * k * (3 - 2 * k);
}

/** The world's offset `t` seconds into a quake (out). Sums of sines at unrelated rates, so it never repeats visibly. */
export function quakeAt(spec: QuakeSpec, t: number, calm: boolean, out: QuakeOffset): QuakeOffset {
  const size = QUAKE_SIZES[spec.kind][spec.strength];
  const k = envelope(t, spec.seconds) * (calm ? CALM_SIZE : 1);
  const w = 2 * Math.PI * size.hz * (calm ? CALM_SPEED : 1);
  const a = w * t;
  out.roll = k * size.turn * (0.7 * Math.sin(a) + 0.3 * Math.sin(1.73 * a + 1.1));
  out.pitch = k * size.turn * (0.6 * Math.sin(0.81 * a + 0.4) + 0.4 * Math.sin(2.31 * a + 2.0));
  out.x = k * size.move * (0.6 * Math.sin(1.37 * a + 0.7) + 0.4 * Math.sin(2.9 * a));
  out.y = k * size.move * (0.7 * Math.sin(1.11 * a + 1.9) + 0.3 * Math.sin(3.7 * a + 0.3));
  out.z = k * size.move * (0.5 * Math.sin(0.93 * a + 2.6) + 0.5 * Math.sin(2.53 * a + 1.4));
  return out;
}
