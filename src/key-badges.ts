import type { Step } from './line-queue.js';
import type { CaptionSize } from './station/caption.js';
import { DEV_KEYS, type DevAction } from './dev-keys.js';
import { TAGS } from './season/lines.js';
import { SEAT_EYE } from './station/layout.js';

/**
 * The dev server's key badges, for testing in the desktop emulator (IWER):
 * beside each step's instruction on Tocco's panel, a small badge with the
 * key that does the step (dev-keys.ts), so a whole week can be played from
 * the keyboard. Only dev-badges.ts, which only dev-tools.ts loads, draws
 * them, so nothing of this ships. Its imports are as free of the runtime as
 * dev-keys.ts and caption.ts, so `node --test` loads it as it is.
 *
 * Where they stand: in a row just above the line's band, at the band's end
 * on the side of the thing to touch (the end its arrow is at; Tocco's own
 * side, the left, for his "Tap me"), pulled in toward the middle as far as
 * it takes for every badge's middle to stay within 30 degrees of straight
 * ahead and every edge within 46 (K1). Above the band they never cover it,
 * the arrow, or the way the ghost hand sets out from the arrow's tip.
 */

/** What a row of badges stands beside: a step's instruction (or its help line), or Tocco's "Tap me" line. */
export type BadgeFor = Step | 'tocco';

/** A key on a badge: the shortcut it stands for, and the word for what it picks ('' for none). */
export interface BadgeKey {
  action: DevAction;
  label: string;
}

const press = (action: DevAction, label = ''): BadgeKey => ({ action, label });

/**
 * Each step's keys. The three things are 1, 2 and 3 from left to right as
 * they lie on the sill, each with the word their tag says in the first week
 * (season/lines.ts TAGS), and their badges stand in that order. Looking
 * across at Lina's window has no key: her answer comes by itself.
 */
export const STEP_BADGES: Readonly<Record<BadgeFor, readonly BadgeKey[]>> = {
  latch: [press('latch')],
  bell: [press('rope')],
  choosing: [press('choose0', TAGS[0]), press('choose1', TAGS[1]), press('choose2', TAGS[2])],
  chosen: [press('lower')],
  model: [press('window')],
  visit: [press('window')],
  sun: [press('sun')],
  sunOn: [press('sun')],
  lamp: [press('lamp')],
  look: [],
  close: [press('latch')],
  knock: [press('knock')],
  tocco: [press('tocco')],
};

/** Tocco is left of every place his line hangs: his "Tap me" badge stands at that end. */
export const TOCCO_END = 'left';

/** The key a shortcut is pressed with, as the "Emulator controls" card names it. */
export function keyOf(action: DevAction): string {
  for (const k of DEV_KEYS) if (k.action === action) return k.key;
  return '';
}

/**
 * A badge's measures at a caption size (px on the line's canvas, about 0.33
 * mm each): the key cap's side, the dark backing's margin round it, the
 * room between the cap and its word, between two badges, and between the
 * band's top and the badges' foot; the key's and the word's text sizes.
 * Larger captions (comfort.ts) make them larger with the line.
 */
export interface BadgeSize {
  cap: number;
  pad: number;
  inner: number;
  gap: number;
  rise: number;
  letter: number;
  label: number;
}

export function badgeSize(size: CaptionSize): BadgeSize {
  // The key's letter about as tall as the line's capitals, so it reads wherever the line does.
  const cap = Math.round(size.font * 1.1);
  return {
    cap,
    pad: Math.round(cap * 0.13),
    inner: Math.round(cap * 0.24),
    gap: Math.round(cap * 0.3),
    rise: Math.round(cap * 0.25),
    letter: Math.round(cap * 0.86),
    label: Math.round(size.font * 0.62),
  };
}

/** The badges' canvas (dev-badges.ts): a row is at most this wide, and as tall as the larger badges need (px, as on his line's). */
export const BADGE_CANVAS = { w: 1280, h: 128 } as const;

/** The font a badge's word is written in. */
export function badgeFont(px: number, bold = false): string {
  return `${bold ? 700 : 600} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
}

/** A badge as placed: its key and word, its middle (px from the middle of the line's canvas, x right, y up) and its size. */
export interface PlacedBadge {
  key: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A badge's middle at most this far to the side of straight ahead, and its edges at most this far (degrees; K1 less half a degree). */
export const CENTRE_MOST = 29.5;
export const EDGE_MOST = 45.5;

/** A place a line hangs, facing the seat (station/tocco.ts faceSeat). */
export type Place = { readonly x: number; readonly y: number; readonly z: number };

/**
 * A point `u` m right of and `v` m above the middle of a panel at `at` that
 * faces the seated eye (as station/tocco.ts faceSeat turns it), seen from
 * the eye: degrees right of and above straight ahead.
 */
export function seenOnPanel(at: Place, u: number, v: number): { yaw: number; pitch: number } {
  const dx = SEAT_EYE.x - at.x;
  const dy = SEAT_EYE.y - at.y;
  const dz = SEAT_EYE.z - at.z;
  const turn = Math.atan2(dx, dz);
  const tilt = -Math.atan2(dy, Math.hypot(dx, dz));
  // Euler YXZ: tilt about x first, then turn about y.
  const y1 = v * Math.cos(tilt);
  const z1 = v * Math.sin(tilt);
  const x = at.x + u * Math.cos(turn) + z1 * Math.sin(turn);
  const y = at.y + y1;
  const z = at.z - u * Math.sin(turn) + z1 * Math.cos(turn);
  const ex = x - SEAT_EYE.x;
  const ez = SEAT_EYE.z - z;
  return { yaw: (Math.atan2(ex, ez) * 180) / Math.PI, pitch: (Math.atan2(y - SEAT_EYE.y, Math.hypot(ex, ez)) * 180) / Math.PI };
}

/**
 * Lays out `keys` above a line's band (`band` as caption.ts bandOf gives
 * it, on a panel at `at`, `metresPerPx` m to a pixel): flush with the band's
 * `end`, then pulled in toward the middle, 2 px at a time, until every
 * badge's middle is within CENTRE_MOST and every edge within EDGE_MOST.
 * `measure` gives a word's width in px at a text size.
 */
export function placeBadges(
  keys: readonly BadgeKey[],
  band: { readonly w: number; readonly h: number; readonly lift: number },
  end: 'left' | 'right',
  at: Place,
  size: CaptionSize,
  metresPerPx: number,
  measure: (text: string, px: number) => number,
): PlacedBadge[] {
  const s = badgeSize(size);
  const h = s.cap + 2 * s.pad;
  const widths = keys.map((k) => (k.label === '' ? h : s.pad + s.cap + s.inner + Math.ceil(measure(k.label, s.label)) + 2 * s.pad));
  const total = widths.reduce((sum, w) => sum + w, 0) + s.gap * (keys.length - 1);
  const y = band.lift + band.h / 2 + s.rise + h / 2;
  const placed: PlacedBadge[] = [];
  let from = end === 'right' ? band.w / 2 - total : -band.w / 2;
  const inward = end === 'right' ? -2 : 2;
  for (let tries = 0; tries <= 1000; tries += 1) {
    placed.length = 0;
    let x = from;
    keys.forEach((k, i) => {
      placed.push({ key: keyOf(k.action), label: k.label, x: x + widths[i] / 2, y, w: widths[i], h });
      x += widths[i] + s.gap;
    });
    if (placed.every((b) => within(b, at, metresPerPx))) break;
    from += inward;
  }
  return placed;
}

/** Whether a badge's middle and its corners are within CENTRE_MOST and EDGE_MOST of straight ahead. */
function within(b: PlacedBadge, at: Place, metresPerPx: number): boolean {
  if (Math.abs(seenOnPanel(at, b.x * metresPerPx, b.y * metresPerPx).yaw) > CENTRE_MOST) return false;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      if (Math.abs(seenOnPanel(at, (b.x + (sx * b.w) / 2) * metresPerPx, (b.y + (sy * b.h) / 2) * metresPerPx).yaw) > EDGE_MOST) return false;
    }
  }
  return true;
}

/** Badges are shown unless the tester hid them with H; remembered in this browser where storage allows. */
const SHOWN_KEY = 'every-window-lit.key-badges';
let shown = true;

export function badgesShown(): boolean {
  return shown;
}

/** Reads whether the badges were hidden on an earlier visit; with storage missing or blocked they show. */
export function loadBadges(storage: () => Pick<Storage, 'getItem'> | null | undefined): boolean {
  try {
    shown = storage()?.getItem(SHOWN_KEY) !== 'off';
  } catch {
    shown = true;
  }
  return shown;
}

/** H: hides the badges or shows them again, and remembers it if storage allows. */
export function toggleBadges(storage: () => Pick<Storage, 'setItem'> | null | undefined): boolean {
  shown = !shown;
  try {
    storage()?.setItem(SHOWN_KEY, shown ? 'on' : 'off');
  } catch {
    // Storage blocked or full: the choice holds for this visit only.
  }
  return shown;
}
