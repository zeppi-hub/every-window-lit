/**
 * Bailing, as numbers only: the storm ship's hold (S13) and the sinking
 * bank (S15) are the same game. Water comes in; a bucket is plunged into
 * it, lifted and heaved out; a hatch cover slides open by itself and lets
 * more in until it is shoved shut; waves break over the deck. The water at
 * the red line loses the stage, the water down at the dry mark wins it.
 * No drawing, no input devices and no scene here: the scene feeds heights
 * and speeds in and reads levels and verdicts out, so every rule can be
 * tested.
 *
 * Units: metres, seconds. Heights are given from the player's eye (up is
 * positive). The water's level is a number: 0 at the dry mark, 1 at the
 * red line.
 */

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** One stage of the storm. */
export interface BailStage {
  name: string;
  /** The level the stage starts at. */
  start: number;
  /** What the leak lets in with the cover shut (level per second). */
  leak: number;
  /** A second hole in the planks (level per second; 0 none). */
  secondLeak: number;
  /** How fast the cover slides open by itself (of its travel per second). */
  lidCreep: number;
  /** With the cover fully open, this many times the leak comes in on top of it. */
  lidGain: number;
  /** Seconds between waves over the deck (0 none), and how long each is seen coming. */
  waveEvery: number;
  waveWarning: number;
  /** What one wave puts in the hold with the cover shut, and with it fully open (level). */
  waveShut: number;
  waveOpen: number;
  /** How far the water in the hatch climbs at its far edge when she is rolled right over (m): it leans with every roll. */
  slosh: number;
  /** A rehearsal cannot be lost: the water stops rising here, and it is won by buckets thrown and the cover shut. */
  rehearsal?: { cap: number; buckets: number };
}

export interface BailRules {
  /** What a full bucket takes out (level). */
  capacity: number;
  /** Seconds under water for an empty bucket to fill. */
  fillSeconds: number;
  /** The bucket below the hand that holds it: its rim and its bottom (m). */
  rim: number;
  bottom: number;
  /** Heights from the eye (m): the dry mark, the red line, the brim of the hatch. */
  dry: number;
  line: number;
  brim: number;
  /** The bucket is clear of the hatch when the hand is this far above the brim (m). */
  clear: number;
  /** A heave slower than `weak` throws nothing; at `full` or faster the whole bucket goes over the side (m/s). */
  weak: number;
  full: number;
  /** Heaved as she rolls the rail down, a throw needs this much less speed (of 1); as she rolls it up, as much more. */
  leanHelp: number;
  /** After this many losses of a stage it eases, and again after as many more. */
  mercyAfter: number;
  /** A stage still undecided after this long slackens (s), down to this share of its water over as long again: nobody bails for ever. */
  slackAfter: number;
  slackTo: number;
  /** At the start of every stage (and every time it is played again) nothing comes in for this long (s): time to find the bucket. */
  grace: number;
  stages: readonly BailStage[];
  rehearsal: BailStage;
}

/** The storm ship's hold (S13). */
export const SHIP: BailRules = {
  capacity: 0.12,
  fillSeconds: 0.35,
  rim: 0.05,
  bottom: 0.22,
  dry: -0.58,
  line: -0.4,
  brim: -0.36,
  clear: 0.12,
  // (A relaxed sweep of the mouse over the emulator's window moves the hand at about 1.2 to 1.9 m/s: it must be able to throw a whole bucket.)
  weak: 0.6,
  full: 1.3,
  leanHelp: 0.25,
  mercyAfter: 3,
  slackAfter: 45,
  slackTo: 0.4,
  grace: 1.6,
  rehearsal: { name: 'the calm before', start: 0.5, leak: 0.02, secondLeak: 0, lidCreep: 0, lidGain: 2.2, waveEvery: 0, waveWarning: 0, waveShut: 0, waveOpen: 0, slosh: 0.02, rehearsal: { cap: 0.55, buckets: 0.9 } },
  stages: [
    { name: 'the squall', start: 0.5, leak: 0.02, secondLeak: 0, lidCreep: 0.06, lidGain: 1.5, waveEvery: 0, waveWarning: 0, waveShut: 0, waveOpen: 0, slosh: 0.04 },
    { name: 'a sprung plank', start: 0.5, leak: 0.018, secondLeak: 0.009, lidCreep: 0.08, lidGain: 2.8, waveEvery: 13, waveWarning: 2.6, waveShut: 0.025, waveOpen: 0.14, slosh: 0.06 },
    { name: 'green water over the deck', start: 0.5, leak: 0.018, secondLeak: 0.011, lidCreep: 0.07, lidGain: 2.8, waveEvery: 8.5, waveWarning: 2.6, waveShut: 0.035, waveOpen: 0.2, slosh: 0.08 },
  ],
};

/** The sinking bank (S15): no cover to shut; the rounds come in faster, and in the last the bank lurches and takes a gulp. */
export const BANK: BailRules = {
  ...SHIP,
  capacity: 0.15,
  // The bank can be lost: each round begins with the water already well up its mark, and comes in nearly as fast as a steady hand bails.
  // (Worked out with the clock player, tests/ship-bail.test.mjs: a bucket every 1.6 s wins the rounds in about 12, 20 and 30 s; one every 2.4 s loses the last round until it is eased; hands off, a round is lost in under ten seconds.)
  slackAfter: 30,
  grace: 2.4,
  rehearsal: { name: 'the first bucket', start: 0.5, leak: 0.02, secondLeak: 0, lidCreep: 0, lidGain: 0, waveEvery: 0, waveWarning: 0, waveShut: 0, waveOpen: 0, slosh: 0, rehearsal: { cap: 0.55, buckets: 0.9 } },
  stages: [
    { name: 'the bank fills', start: 0.6, leak: 0.045, secondLeak: 0, lidCreep: 0, lidGain: 0, waveEvery: 0, waveWarning: 0, waveShut: 0, waveOpen: 0, slosh: 0 },
    { name: 'the vault goes', start: 0.66, leak: 0.042, secondLeak: 0.013, lidCreep: 0, lidGain: 0, waveEvery: 9, waveWarning: 2, waveShut: 0.08, waveOpen: 0.08, slosh: 0 },
    { name: 'the bank lurches', start: 0.7, leak: 0.042, secondLeak: 0.016, lidCreep: 0, lidGain: 0, waveEvery: 7, waveWarning: 2, waveShut: 0.105, waveOpen: 0.105, slosh: 0 },
  ],
};

/** The hold: how high the water is, how far the cover has slid open, and when the next wave comes. */
export interface Hold {
  level: number;
  /** 0 shut, 1 fully open. */
  lid: number;
  /** Seconds to the next wave (Infinity with none). */
  waveIn: number;
  /** Buckets heaved over the side so far (a half bucket counts a half). */
  thrown: number;
  /** Whether the cover has been shoved fully shut at least once. */
  shutOnce: boolean;
  /** Seconds this stage has been played. */
  clock: number;
}

/** What happened in one step of the hold. */
export interface HoldStep {
  /** A wave has just come into sight. */
  coming: boolean;
  /** A wave has just broken over the deck: what it put in the hold (level; 0 none). */
  hit: number;
  lost: boolean;
  won: boolean;
}

/** How much a stage eases after losses of it: 1, then 0.7, then 0.5 (never less). */
export function ease(rules: BailRules, losses: number): number {
  if (losses >= rules.mercyAfter * 2) return 0.5;
  if (losses >= rules.mercyAfter) return 0.7;
  return 1;
}

export function newHold(stage: BailStage): Hold {
  return { level: stage.start, lid: stage.rehearsal != null && stage.lidGain > 0 ? 0.7 : 0, waveIn: stage.waveEvery > 0 ? stage.waveEvery : Infinity, thrown: 0, shutOnce: false, clock: 0 };
}

/** How much of its water a stage still lets in after `clock` seconds of it: all of it at first, less once it has gone on long. */
export function slack(rules: BailRules, clock: number): number {
  return clamp(1 - ((clock - rules.slackAfter) / rules.slackAfter) * (1 - rules.slackTo), rules.slackTo, 1);
}

/** What comes in now (level per second). */
export function inflow(hold: Hold, stage: BailStage, eased = 1): number {
  return (stage.leak * (1 + stage.lidGain * hold.lid) + stage.secondLeak) * eased;
}

/** The water's height from the eye at a level (m). */
export function surface(rules: BailRules, level: number): number {
  return rules.dry + (rules.line - rules.dry) * level;
}

/**
 * One step of the hold: the cover creeps open unless a hand is on it, the
 * water comes in, a wave is seen and then breaks. A wave breaking on a
 * cover nobody holds knocks it wide open.
 */
export function stepHold(hold: Hold, stage: BailStage, dt: number, eased: number, lidHeld: boolean, out: HoldStep, grace = 0): HoldStep {
  out.coming = false;
  out.hit = 0;
  hold.clock += dt;
  // The breathing space at a stage's start: the water, the cover and the waves all wait.
  const live = hold.clock >= grace;
  if (!live) dt = 0;
  if (!lidHeld) hold.lid = clamp(hold.lid + stage.lidCreep * eased * dt, 0, 1);
  hold.level += inflow(hold, stage, eased) * dt;
  if (stage.rehearsal != null) hold.level = Math.min(hold.level, stage.rehearsal.cap);
  if (stage.waveEvery > 0 && live) {
    const before = hold.waveIn;
    hold.waveIn -= dt;
    if (before > stage.waveWarning && hold.waveIn <= stage.waveWarning) out.coming = true;
    if (hold.waveIn <= 0) {
      out.hit = (stage.waveShut + (stage.waveOpen - stage.waveShut) * hold.lid) * eased;
      hold.level += out.hit;
      if (!lidHeld) hold.lid = stage.lidGain > 0 ? 1 : 0;
      hold.waveIn = stage.waveEvery;
    }
  }
  if (hold.level < 0 && stage.rehearsal != null) hold.level = 0;
  out.lost = stage.rehearsal == null && hold.level >= 1;
  out.won = stage.rehearsal != null ? hold.thrown >= stage.rehearsal.buckets && (stage.lidGain === 0 || hold.shutOnce) : hold.level <= 0;
  return out;
}

/** A hand shoves the cover to `open` (0 shut, 1 fully open). */
export function shoveLid(hold: Hold, open: number): void {
  hold.lid = clamp(open, 0, 1);
  if (hold.lid <= 0.02) {
    hold.lid = 0;
    hold.shutOnce = true;
  }
}

/** The bucket in a hand: how full, and the fastest it has been heaved in this swing. */
export interface Bucket {
  fill: number;
  peak: number;
}

/** What a heave did: how much went over the side and how much slopped back (of a bucket), and how fast it was. */
export interface Throw {
  out: number;
  back: number;
  speed: number;
}

/** How much of the bucket is under water with the hand at `hand` (from the eye, m) and the water at `water`: 0 clear of it, 1 its rim under. */
export function submerged(rules: BailRules, hand: number, water: number): number {
  return clamp((water - (hand - rules.bottom)) / (rules.bottom - rules.rim), 0, 1);
}

/** How the roll changes what a throw needs: `lean` is 1 with the rail rolled right down, -1 with it rolled right up, 0 on an even keel. */
export function leanFactor(rules: BailRules, lean: number): number {
  return 1 - rules.leanHelp * clamp(lean, -1, 1);
}

/** How much of a bucket a heave of this speed puts over the side: none below `weak`, all of it from `full` (both eased or stiffened by the roll). */
export function throwShare(rules: BailRules, speed: number, lean = 0): number {
  const k = leanFactor(rules, lean);
  return clamp((speed - rules.weak * k) / ((rules.full - rules.weak) * k), 0, 1);
}

/** How far the water stands above its level (m) at a place in the hatch: `roll` -1..1, `ahead` -1 at the hatch's near edge to 1 at its far one. The water piles toward the side she rolls to. */
export function tideAt(stage: BailStage, roll: number, ahead: number): number {
  return stage.slosh * clamp(roll, -1, 1) * clamp(ahead, -1, 1);
}

/** A hand's speed as a heave (m/s): only its going up and its going ahead count; plunging down or drawing back throws nothing. */
export function heaveSpeed(up: number, ahead: number): number {
  return Math.hypot(Math.max(0, up), Math.max(0, ahead));
}

/**
 * One step of the bucket. Under water it fills as deep as it is held (and
 * what it takes is out of the hold at once). Clear of the hatch, a heave
 * at full speed throws it there and then; a slower swing throws when it
 * ends, and what does not reach the side slops back into the hold.
 * `tide` is how far the water stands above its level where the bucket is
 * (the roll piles it to one side), `lean` how the roll helps or hinders
 * the throw. Returns the throw, or null.
 */
export function stepBucket(rules: BailRules, bucket: Bucket, hold: Hold, hand: number, heave: number, dt: number, out: Throw, tide = 0, lean = 0): Throw | null {
  const under = submerged(rules, hand, surface(rules, hold.level) + tide);
  if (under > bucket.fill) {
    const take = Math.min(under - bucket.fill, dt / rules.fillSeconds);
    bucket.fill += take;
    hold.level -= take * rules.capacity;
  }
  const clear = hand >= rules.brim + rules.clear;
  if (!clear || bucket.fill <= 0.05) {
    bucket.peak = 0;
    return null;
  }
  bucket.peak = Math.max(bucket.peak, heave);
  const k = leanFactor(rules, lean);
  const ended = bucket.peak >= rules.weak * k && heave < bucket.peak * 0.5;
  if (bucket.peak < rules.full * k && !ended) return null;
  const share = throwShare(rules, bucket.peak, lean);
  out.out = bucket.fill * share;
  out.back = bucket.fill - out.out;
  out.speed = bucket.peak;
  hold.level += out.back * rules.capacity;
  hold.thrown += out.out;
  bucket.fill = 0;
  bucket.peak = 0;
  return out;
}

/** Seconds for the water to reach the red line from the stage's start with nobody doing anything (waves counted). */
export function timeToLine(stage: BailStage, eased = 1): number {
  const hold = newHold(stage);
  const step: HoldStep = { coming: false, hit: 0, lost: false, won: false };
  const dt = 1 / 60;
  for (let t = 0; t < 600; t += dt) {
    if (stepHold(hold, stage, dt, eased, false, step).lost) return t;
  }
  return Infinity;
}
