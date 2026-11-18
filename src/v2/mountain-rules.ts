/**
 * The mountain memory and its fight in the city, as numbers only: three old
 * ropes of which one is rotten, a rock pitch and an ice pitch of holds of
 * which some are loose, and three bank bells of which one bank is cracked.
 * One rule runs through all of it: nothing shows whether it will hold until
 * it has been tried, trying costs time, and the storm (in the city, the
 * fog) does not wait. On the holds the trying is done as climbers do it:
 * one hand stays on a hold that has already borne her while the other puts
 * her weight on the next; let go too soon, and a loose hold is a fall. No drawing, no input devices and no scene here: the
 * scene feeds hand travel in and reads gives, frays, rises and verdicts
 * out, so every rule can be tested.
 *
 * Units: metres and seconds. Up is +y.
 */

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** A seeded random number source (0 to 1), so a layout can be made again. */
export function seeded(seed: number): () => number {
  let s = Math.max(1, Math.floor(seed)) % 2147483647;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

// ---------------------------------------------------------------------------
// The weather of a pitch: the storm that closes it, and the gusts in it
// ---------------------------------------------------------------------------

/** One pitch of the route: what it offers and how hard it is to read. */
export interface Pitch {
  name: string;
  /** Rows of holds to climb (0: the ropes). */
  rows: number;
  /** Holds offered in each row. */
  across: number;
  /** How many of a row's holds may be loose (never all of them). */
  looseMost: number;
  /** The chance a row has any loose hold at all. */
  looseChance: number;
  /** How far a loose hold moves in the hand when tried (m): its tell. */
  tell: number;
  /** How loud the tell is (0 to 1). */
  tellSound: number;
  /** Seconds before the storm closes the pitch. */
  seconds: number;
  /** A gust every so many seconds, lasting this long, rattling everything by this much (m). */
  gustEvery: number;
  gustSeconds: number;
  rattle: number;
  /** Ice breaks off above every so many seconds and comes down at her (0: never). */
  iceEvery: number;
}

export const ROUTE = {
  /** From the eye to the rock (m), and how far a row lifts the climber. */
  standOff: 0.32,
  rowRise: 0.42,
  /** A row's holds above the eye as the climber reaches for them, and how far apart they are across (m). */
  holdAbove: 0.2,
  holdApart: 0.3,
  /** A hand this near a hold or a rope, pinching, has it (m). */
  takeReach: 0.13,
  /** A pull down shorter than this is only a try: the body has not moved yet (m). */
  haulFrom: 0.05,
  /** A loose hold tears out once this much weight has gone onto it (m of rise). */
  ripAt: 0.12,
  /** A sound hold knocks once the hand has tried it this far (m). */
  knockAt: 0.035,
  /** After two losses of a pitch the tells double (the hint); after three the storm also waits half as long again. */
  hintAfter: 2,
  mercyAfter: 3,
  /** A fall: this far down onto her rope (m; the scene lets her drop it under gravity), and back to the last piton, set every so many rows. */
  fall: 2.4,
  pitonEvery: 3,
  /** What a fall costs of the storm's time while she hangs and gets back on the rock (s). */
  fallSeconds: 5,
  pitches: [
    { name: 'the ropes', rows: 0, across: 3, looseMost: 1, looseChance: 1, tell: 0.1, tellSound: 1, seconds: 45, gustEvery: 7, gustSeconds: 0.9, rattle: 0.004, iceEvery: 0 },
    { name: 'the rock', rows: 6, across: 2, looseMost: 1, looseChance: 0.75, tell: 0.03, tellSound: 0.7, seconds: 74, gustEvery: 5, gustSeconds: 1.1, rattle: 0.008, iceEvery: 20 },
    { name: 'the ice', rows: 5, across: 3, looseMost: 2, looseChance: 1, tell: 0.014, tellSound: 0.4, seconds: 72, gustEvery: 3.6, gustSeconds: 1.2, rattle: 0.009, iceEvery: 12 },
  ] as readonly Pitch[],
} as const;

/** The pitch as it is played after `losses` of it: the hint doubles the tells, mercy slows the storm. */
export function eased(pitch: Pitch, losses: number): Pitch {
  if (losses < ROUTE.hintAfter) return pitch;
  return {
    ...pitch,
    tell: pitch.tell * 2,
    tellSound: Math.min(1, pitch.tellSound * 1.6),
    seconds: losses >= ROUTE.mercyAfter ? pitch.seconds * 1.5 : pitch.seconds,
    rattle: losses >= ROUTE.mercyAfter ? 0 : pitch.rattle,
    iceEvery: losses >= ROUTE.mercyAfter ? 0 : pitch.iceEvery,
  };
}

/** How far the storm has closed in (0 clear, 1 on top of the party) after `elapsed` seconds of a pitch. */
export function storm(elapsed: number, pitch: Pitch): number {
  return clamp(elapsed / pitch.seconds, 0, 1);
}

/** The gust blowing at `clock` (0 none, 1 its height): a short swell every `gustEvery` seconds, none in the first two. */
export function gust(clock: number, pitch: Pitch): number {
  if (pitch.rattle <= 0 || clock < 2) return 0;
  const into = clock % pitch.gustEvery;
  if (into >= pitch.gustSeconds) return 0;
  return Math.sin((into / pitch.gustSeconds) * Math.PI);
}

// ---------------------------------------------------------------------------
// Pitch 1: three old ropes, one of them rotten
// ---------------------------------------------------------------------------

export const ROPE = {
  /** The haul that puts a whole body's weight on a rope (m of hand travel down). */
  fullPull: 0.32,
  /** A rotten rope starts to open at this share of full weight, and parts after this long at full weight (s). */
  frayFrom: 0.3,
  fraySeconds: 1.3,
  /** Frayed this far, anyone can see what it is. */
  frayKnown: 0.22,
  /** How far a sound rope stretches at full weight, and how much more a rotten one gives by the time it parts (m). */
  stretch: 0.02,
  give: 0.12,
  /** With the party's weight on it, a rotten rope parts in this long whatever was done before (s). */
  partyParts: 1.4,
} as const;

export interface Rope {
  rotten: boolean;
  /** How far its strands have opened (0 whole, 1 parted). */
  fray: number;
  /** A sound rope that has taken a full weight and held. */
  held: boolean;
  parted: boolean;
}

/** Three ropes, one or two of them rotten (never all three): which, from `random`. */
export function layRopes(random: () => number): Rope[] {
  const first = Math.min(2, Math.floor(random() * 3));
  const two = random() < 0.5;
  const second = two ? (first + 1 + Math.min(1, Math.floor(random() * 2))) % 3 : -1;
  return [0, 1, 2].map((i) => ({ rotten: i === first || i === second, fray: 0, held: false, parted: false }));
}

/** The weight on a rope hauled down by `pull` metres (0 to 1). */
export function ropeLoad(pull: number): number {
  return clamp(pull / ROPE.fullPull, 0, 1);
}

/** What one step under `load` did to a rope. */
export type RopeEvent = 'nothing' | 'held' | 'fraying' | 'parted';

/** One step of a rope under `load`: a sound one holds at full weight; a rotten one opens strand by strand and then parts. */
export function stepRope(rope: Rope, load: number, dt: number): RopeEvent {
  if (rope.parted) return 'nothing';
  if (!rope.rotten) {
    if (load >= 1 && !rope.held) {
      rope.held = true;
      return 'held';
    }
    return 'nothing';
  }
  if (load <= ROPE.frayFrom) return 'nothing';
  rope.fray = Math.min(1, rope.fray + (dt * (load - ROPE.frayFrom)) / (1 - ROPE.frayFrom) / ROPE.fraySeconds);
  if (rope.fray >= 1) {
    rope.parted = true;
    return 'parted';
  }
  return 'fraying';
}

/** How far the rope comes down with the hand beyond the haul itself (m): a sound rope barely, a rotten one more with every strand. */
export function ropeGive(rope: Rope, load: number): number {
  return ROPE.stretch * load + (rope.rotten ? ROPE.give * rope.fray : 0);
}

/** What the guide knows of a rope from what she has done to it. */
export function ropeKnown(rope: Rope): 'sound' | 'rotten' | 'untried' {
  if (rope.parted || rope.fray >= ROPE.frayKnown) return 'rotten';
  return rope.held ? 'sound' : 'untried';
}

/** The party clipped onto a rope: it holds, or it parts under them (they hang on the guide's own line; nobody falls). */
export function clipVerdict(rope: Rope): 'holds' | 'parts' {
  return rope.rotten || rope.parted ? 'parts' : 'holds';
}

// ---------------------------------------------------------------------------
// Pitches 2 and 3: rows of holds, some of them loose
// ---------------------------------------------------------------------------

/** A row of holds, left to right: true where the hold is loose. Never all of them. */
export type Row = boolean[];

/** The rows of a pitch. Every row keeps at least one sound hold. */
export function layRows(pitch: Pitch, random: () => number): Row[] {
  const rows: Row[] = [];
  for (let r = 0; r < pitch.rows; r += 1) {
    const row: Row = new Array<boolean>(pitch.across).fill(false);
    if (random() < pitch.looseChance) {
      const most = Math.min(pitch.looseMost, pitch.across - 1);
      const loose = 1 + Math.min(most - 1, Math.floor(random() * most));
      let left = loose;
      while (left > 0) {
        const at = Math.min(pitch.across - 1, Math.floor(random() * pitch.across));
        if (row[at]) continue;
        row[at] = true;
        left -= 1;
      }
    } else random();
    rows.push(row);
  }
  return rows;
}

/** A hold as the hand has it: tried sideways or toward the climber by `off` metres, and hauled down by `down`. */
export interface Grip {
  /** How far the hand has moved from where it took the hold, any way but down (m). */
  off: number;
  /** How far the hand has come down from where it took the hold (m). */
  down: number;
}

/** How far a hold moves with the hand that tries it (m): a loose one up to its tell, a sound one not at all. */
export function holdShift(loose: boolean, grip: Grip, pitch: Pitch): number {
  if (!loose) return 0;
  return Math.min(pitch.tell, Math.hypot(grip.off, Math.min(grip.down, ROUTE.haulFrom)));
}

/** How far a haul lifts the body (m): nothing inside the first few centimetres, which are only a try. */
export function haulRise(grip: Grip): number {
  return Math.max(0, grip.down - ROUTE.haulFrom);
}

/** A loose hold with this much of the body's rise on it has torn out. */
export function ripped(loose: boolean, grip: Grip): boolean {
  return loose && haulRise(grip) >= ROUTE.ripAt - 1e-9;
}

/** A sound hold has borne her weight (and can be trusted as the hand that stays on) once this much of a haul is on it. */
export function proven(loose: boolean, grip: Grip): boolean {
  return !loose && haulRise(grip) >= ROUTE.ripAt - 1e-9;
}

/**
 * What a torn hold does to her: nothing worse than a fright while her other
 * hand is on a hold that has borne her, or while she is clipped to a piton
 * (the foot of the pitch, and every third row); otherwise she is off, onto
 * her rope.
 */
export function torn(anchored: boolean, row: number): 'caught' | 'falls' {
  return anchored || row % ROUTE.pitonEvery === 0 ? 'caught' : 'falls';
}

/** The row she is back on after a fall from `row`: the last piton below her. */
export function pitonBelow(row: number): number {
  return Math.floor(Math.max(0, row) / ROUTE.pitonEvery) * ROUTE.pitonEvery;
}

/** How far she has dropped `t` seconds into a fall (m): gravity, stopped by the rope at ROUTE.fall. */
export function fallen(t: number): number {
  return Math.min(ROUTE.fall, 0.5 * 9.81 * Math.max(0, t) * Math.max(0, t));
}

export const ICEFALL = {
  /** From the crack overhead to her head (s): the time to get a hand over her head, or to lean out of its way. */
  warning: 1.8,
  /** A hand this far above her eyes, this near the ice's line, takes it on the glove (m). */
  coverAbove: 0.1,
  coverReach: 0.3,
  /** It starts this far above her (m), and is this big (m). */
  above: 5.5,
  size: 0.16,
  /** Her head this near its line when it passes is hit (m): a lean of a hand's length and a half clears it. */
  hit: 0.2,
} as const;

/** Whether a hand at (`handX`, `handY`) covers a head whose eyes are at `eyeY` from ice coming down the line `iceX`. */
export function iceCovered(handX: number, handY: number, eyeY: number, iceX: number): boolean {
  return handY >= eyeY + ICEFALL.coverAbove && Math.abs(handX - iceX) <= ICEFALL.coverReach;
}

/** Whether ice coming down the line `iceX` hits a head at `headX` (across the face, m). */
export function iceHits(iceX: number, headX: number): boolean {
  return Math.abs(iceX - headX) < ICEFALL.hit;
}

/** A sound hold tried this far answers with a knock (once per grip, the scene keeps count). */
export function knocks(loose: boolean, grip: Grip): boolean {
  return !loose && Math.hypot(grip.off, grip.down) >= ROUTE.knockAt;
}

/** The climber on a pitch: rows done, and how far up the row in hand she is (m). */
export interface Climb {
  row: number;
  rise: number;
}

/**
 * A haul on a sound hold: the body rises with the hand, never sinks back
 * when the hold is let go (her feet are on the row below), and a row is
 * done once she has risen its whole height. `from` is her rise when the
 * hand took the hold. True when this haul finished the row.
 */
export function stepClimb(climb: Climb, from: number, grip: Grip): boolean {
  climb.rise = Math.max(climb.rise, Math.min(ROUTE.rowRise, from + haulRise(grip)));
  if (climb.rise < ROUTE.rowRise - 1e-6) return false;
  climb.row += 1;
  climb.rise = 0;
  return true;
}

/** How high the climber is above the foot of the pitch (m). */
export function climbHeight(climb: Climb): number {
  return climb.row * ROUTE.rowRise + climb.rise;
}

/**
 * What a careful climber spends on a pitch (s): one try of a hold a row,
 * a second where the first was loose, a haul a row. The storm's time has
 * to leave room for this and not for trying every hold twice.
 */
export function carefulSeconds(pitch: Pitch, tryS = 1.6, haulS = 2.2, reachS = 1.2): number {
  if (pitch.rows === 0) return 3 * (tryS + reachS) + haulS;
  // Tries until a sound hold is found, taking the row's worst mix.
  const tries = pitch.looseChance * (1 + pitch.looseMost) * 0.5 + (1 - pitch.looseChance);
  return pitch.rows * (Math.max(1, tries) * (tryS + reachS) + haulS);
}

// ---------------------------------------------------------------------------
// The fight in the city: THE FOG, three bank bells, one bank cracked
// ---------------------------------------------------------------------------

export const FOG = {
  /** Where the fog stands as the fight begins, and how fast it thickens by itself (per second). */
  start: 0.3,
  rise: 0.016,
  /** What one bell rung clear takes off it, and what the magpie's whisper puts back. */
  bell: 0.2,
  whisper: 0.15,
  /** The haul that swings a bell (m of hand travel down): a full stroke, nothing less. */
  stroke: 0.3,
  /** After three losses the fog thickens at this share of its speed. */
  mercy: 0.5,
} as const;

export interface Bank {
  /** Cracked inside: its bell will not ring until the crack is propped. */
  weak: boolean;
  /** The crack has opened for all to see (its rope was hung on). */
  cracked: boolean;
  propped: boolean;
  /** Its bell has rung and the fog round it is gone. */
  clear: boolean;
}

export interface FogFight {
  banks: Bank[];
  /** 0 clear, 1 the square is gone. */
  fog: number;
  /** The magpie has whispered (once a fight, after the second bank rings clear). */
  whispered: boolean;
}

/** Three banks, alike from outside; `random` says which one is cracked. */
export function layFog(random: () => number): FogFight {
  const weak = Math.min(2, Math.floor(random() * 3));
  return { banks: [0, 1, 2].map((i) => ({ weak: i === weak, cracked: false, propped: false, clear: false })), fog: FOG.start, whispered: false };
}

/** The fog thickens while the fight goes on. True once it has taken the square. */
export function stepFog(fight: FogFight, dt: number, losses = 0): boolean {
  fight.fog = Math.min(1, fight.fog + FOG.rise * (losses >= ROUTE.mercyAfter ? FOG.mercy : 1) * dt);
  return fight.fog >= 1;
}

/** What a full stroke on a bank's rope does. */
export type Stroke = 'rings' | 'cracks' | 'dull' | 'already';

/**
 * A full stroke on bank `i`: a sound bank's bell rings and its fog goes; a
 * cracked bank's wall opens (the first time) or answers dully (until it is
 * propped); propped, it rings like the others.
 */
export function pullBell(fight: FogFight, i: number): Stroke {
  const bank = fight.banks[i];
  if (bank.clear) return 'already';
  if (bank.weak && !bank.propped) {
    if (bank.cracked) return 'dull';
    bank.cracked = true;
    return 'cracks';
  }
  bank.clear = true;
  fight.fog = Math.max(0, fight.fog - FOG.bell);
  return 'rings';
}

/** The gold prop set in bank `i`'s crack. False if there is no open crack there. */
export function prop(fight: FogFight, i: number): boolean {
  const bank = fight.banks[i];
  if (!bank.cracked || bank.propped) return false;
  bank.propped = true;
  return true;
}

/**
 * The magpie's whisper, once two banks are clear: the fog comes back round
 * the first bank that rang, and it has to be rung again. Returns that bank,
 * or -1 if it is not time (or it has whispered already).
 */
export function whisper(fight: FogFight, firstClear: number): number {
  if (fight.whispered || fight.banks.filter((b) => b.clear).length !== 2) return -1;
  if (firstClear < 0 || !fight.banks[firstClear].clear) return -1;
  fight.whispered = true;
  fight.banks[firstClear].clear = false;
  fight.fog = Math.min(1, fight.fog + FOG.whisper);
  return firstClear;
}

export function fogLifted(fight: FogFight): boolean {
  return fight.whispered && fight.banks.every((b) => b.clear);
}
