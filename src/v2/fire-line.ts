/**
 * The Firewall word's two games, as numbers only.
 *
 * The forest memory (S09): a fire front comes on at a steady speed toward a
 * line of ground still to be dug. Every piece of the line takes a few full
 * strokes of the spade; embers thrown over the line must be smothered
 * before they catch. The line done before the front arrives starves the
 * fire; a piece left undug lets it across.
 *
 * The cold fire in the city (S10): a row of banks, one already fallen. The
 * fire leaps from a burning bank to its neighbour across the gap between
 * them, unless a wall stands in that gap by the time it gets there.
 *
 * No drawing, no input devices and no scene here: the scenes feed strokes,
 * walls and seconds in and read distances and verdicts out, so every rule
 * can be tested. Units: metres and seconds.
 */

// ---------------------------------------------------------------------------
// The forest: digging a firebreak ahead of the front
// ---------------------------------------------------------------------------

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** A gust: at `at` seconds the wind throws the front `leap` m nearer, over FOREST.gustSeconds. */
export interface Gust {
  at: number;
  leap: number;
}

export interface ForestStage {
  name: string;
  /** Which firebreak is dug: 1 runs across the north, 2 down the east side (after the wind turns). */
  strip: 1 | 2;
  /** The pieces to dig, counted along the strip from where the last stage stopped. */
  first: number;
  pieces: number;
  /** The digging one piece takes: a hard plunge of the spade and its toss is worth 1, a weak one less. */
  effort: number;
  /** Where the front starts from the line, and how fast it comes (m, m/s). */
  from: number;
  speed: number;
  /** The wind's gusts, each throwing the front nearer. */
  gusts: readonly Gust[];
  /** Embers thrown over the line: one after each of these many pieces dug. */
  sparksAfter: readonly number[];
  /** How long an ember smoulders before it catches (s). */
  fuse: number;
}

export const FOREST = {
  /** The first piece is a rehearsal: the fire stands off until it is dug. */
  rehearsal: { strip: 1, first: 0, pieces: 1, effort: 1 },
  stages: [
    { name: 'the front', strip: 1, first: 1, pieces: 3, effort: 2, from: 24, speed: 1.4, gusts: [], sparksAfter: [], fuse: 0 },
    { name: 'faster, harder ground, embers', strip: 1, first: 4, pieces: 4, effort: 3, from: 48, speed: 1.5, gusts: [{ at: 11, leap: 5 }], sparksAfter: [1, 3], fuse: 7 },
    { name: 'the wind turns', strip: 2, first: 0, pieces: 5, effort: 3, from: 71, speed: 1.7, gusts: [{ at: 10, leap: 5 }, { at: 24, leap: 5 }], sparksAfter: [1, 2, 4], fuse: 5.5 },
  ] as readonly ForestStage[],
  /** A gust lasts this long (s). */
  gustSeconds: 1,
  /** From this many losses of a stage on, the front comes slower and embers smoulder longer. */
  mercyAfter: 3,
  mercySpeed: 0.75,
  mercyFuse: 3,
  /** Once the line is done the front runs the rest of the way in at most this long (s), so the player sees it die against the line. */
  rushSeconds: 2.5,
  /** An ember's flight over the line (s). */
  sparkFlight: 1.3,
} as const;

/** The stage as it is played after `losses` losses of it. */
export function eased(stage: ForestStage, losses: number): ForestStage {
  if (losses < FOREST.mercyAfter) return stage;
  return { ...stage, speed: stage.speed * FOREST.mercySpeed, fuse: stage.fuse === 0 ? 0 : stage.fuse + FOREST.mercyFuse };
}

/** How fast the front comes at `time` s into the stage: its own speed, and a gust's throw while one blows. */
export function frontSpeed(stage: ForestStage, time: number): number {
  let speed = stage.speed;
  for (const gust of stage.gusts) if (time >= gust.at && time < gust.at + FOREST.gustSeconds) speed += gust.leap / FOREST.gustSeconds;
  return speed;
}

/** Seconds the front takes to reach the line, gusts and all. */
export function arrival(stage: ForestStage): number {
  let distance = stage.from;
  let time = 0;
  const dt = 1 / 60;
  while (distance > 0 && time < 600) {
    distance -= frontSpeed(stage, time) * dt;
    time += dt;
  }
  return time;
}

/** One go at a forest stage. */
export interface ForestRun {
  stage: ForestStage;
  /** Seconds since the front began to move. */
  time: number;
  /** The front's distance from the line (m). */
  distance: number;
  /** Pieces dug, and the digging put into the piece being dug now. */
  dug: number;
  progress: number;
  /** Embers thrown so far, and the one on the ground now (seconds it has left), or null. */
  thrown: number;
  ember: { left: number; flying: number } | null;
  /** Once the line is done: the speed the front comes in at (m/s; 0 until then). */
  rush: number;
  result: 'playing' | 'held' | 'crossed' | 'caught';
}

export function startForest(stage: ForestStage): ForestRun {
  return { stage, time: 0, distance: stage.from, dug: 0, progress: 0, thrown: 0, ember: null, rush: 0, result: 'playing' };
}

/** Whether the spade can dig now: not while an ember is on the ground or in the air. */
export function canDig(run: ForestRun): boolean {
  return run.result === 'playing' && run.ember == null && run.dug < run.stage.pieces;
}

export type DigResult = 'nothing' | 'bit' | 'piece' | 'line done';

/** A spadeful of `strength` (0..1) thrown out of the piece being dug. */
export function dig(run: ForestRun, strength: number): DigResult {
  if (!canDig(run) || strength <= 0) return 'nothing';
  run.progress += strength;
  if (run.progress < run.stage.effort - 1e-6) return 'bit';
  run.progress = 0;
  run.dug += 1;
  if (run.thrown < run.stage.sparksAfter.length && run.stage.sparksAfter[run.thrown] === run.dug) {
    run.thrown += 1;
    run.ember = { left: run.stage.fuse, flying: FOREST.sparkFlight };
  }
  return run.dug >= run.stage.pieces ? 'line done' : 'piece';
}

/** One full-strength spadeful. */
export function stroke(run: ForestRun): DigResult {
  return dig(run, 1);
}

/** The wet sack lands on the ember. */
export function smother(run: ForestRun): boolean {
  if (run.ember == null || run.ember.flying > 0) return false;
  run.ember = null;
  return true;
}

/** Whether a gust is blowing now. */
export function gusting(run: ForestRun): boolean {
  return run.result === 'playing' && run.rush === 0 && frontSpeed(run.stage, run.time) > run.stage.speed;
}

/**
 * A frame of the fire: the front comes on (rushing once the line is dug, so
 * its end is seen), an ember smoulders. Sets `result` when the stage ends.
 */
export function stepForest(run: ForestRun, dt: number): void {
  if (run.result !== 'playing') return;
  const before = frontSpeed(run.stage, run.time);
  run.time += dt;
  if (run.rush === 0 && run.dug >= run.stage.pieces && run.ember == null) run.rush = Math.max(run.stage.speed, run.distance / FOREST.rushSeconds);
  const speed = run.rush > 0 ? run.rush : before;
  run.distance = Math.max(0, run.distance - speed * dt);
  if (run.ember != null) {
    if (run.ember.flying > 0) run.ember.flying = Math.max(0, run.ember.flying - dt);
    else {
      run.ember.left -= dt;
      if (run.ember.left <= 0) {
        run.result = 'caught';
        return;
      }
    }
  }
  if (run.distance <= 0) run.result = run.dug >= run.stage.pieces ? 'held' : 'crossed';
}

/** How near the fire is, 0 (far off) to 1 (at the line): what the light, the sound and the sky go by. */
export function nearness(run: ForestRun): number {
  return 1 - Math.min(1, run.distance / 50);
}

/**
 * The spade in the hand. The blade's tip is followed: driven into the earth
 * it bites (the faster it was coming down, the more it takes), and lifted
 * clear again it throws what it took.
 */
export const SPADE = {
  /** The tip this far under the ground has bitten (m). */
  biteBelow: 0.08,
  /** Lifted this far over the ground, the load is thrown (m). */
  tossAbove: 0.04,
  /** Coming down this fast is a full spadeful; a slow push takes `weakest` (m/s, 0..1). */
  fullSpeed: 1,
  weakest: 0.35,
  /** The thrown earth takes this long to land and the ground to be ready (s): a plunge sooner than that takes less, down to `hasty` of it. */
  settle: 0.6,
  hasty: 0.3,
} as const;

export interface Spade {
  /** What is on the blade (0: nothing). */
  loaded: number;
  /** The tip's height last frame, and the fastest it has been coming down in this plunge (m, m/s). */
  last: number | null;
  down: number;
  /** Seconds since the last load was thrown. */
  since: number;
}

export function newSpade(): Spade {
  return { loaded: 0, last: null, down: 0, since: 9 };
}

/** How much a plunge at `speed` m/s takes. */
export function biteStrength(speed: number): number {
  return clamp(speed / SPADE.fullSpeed, SPADE.weakest, 1);
}

/**
 * A frame of the spade: `tip` is the blade tip's height over the ground
 * (negative in the earth). Returns 'bite' on the frame it bites and 'toss',
 * with what was thrown, on the frame the load leaves.
 */
export function stepSpade(spade: Spade, tip: number, dt: number): { kind: 'nothing' | 'bite' } | { kind: 'toss'; strength: number } {
  const speed = spade.last == null || dt <= 0 ? 0 : (spade.last - tip) / dt;
  spade.last = tip;
  spade.since += dt;
  if (spade.loaded > 0) {
    if (tip < SPADE.tossAbove) return { kind: 'nothing' };
    const strength = spade.loaded;
    spade.loaded = 0;
    spade.down = 0;
    spade.since = 0;
    return { kind: 'toss', strength };
  }
  // The fastest of the way down counts, fading if the hand hesitates.
  spade.down = Math.max(spade.down - 3 * dt, speed, 0);
  if (tip > -SPADE.biteBelow) return { kind: 'nothing' };
  // Frantic digging gets nowhere: the blade driven in again before the last spadeful has landed takes little.
  spade.loaded = biteStrength(spade.down) * clamp(spade.since / SPADE.settle, SPADE.hasty, 1);
  spade.down = 0;
  return { kind: 'bite' };
}

/**
 * A hand worked up and down (the stake that raises a wall): 'up' each time it
 * has risen `travel` from its lowest since it last came down, 'down' each
 * time it has fallen `travel` from its highest since.
 */
export interface Pump {
  low: number;
  high: number;
  up: boolean;
}

export function newPump(height: number): Pump {
  return { low: height, high: height, up: false };
}

export function stepPump(pump: Pump, height: number, travel: number): 'up' | 'down' | 'nothing' {
  if (!pump.up) {
    pump.low = Math.min(pump.low, height);
    if (height - pump.low < travel) return 'nothing';
    pump.up = true;
    pump.high = height;
    return 'up';
  }
  pump.high = Math.max(pump.high, height);
  if (pump.high - height < travel) return 'nothing';
  pump.up = false;
  pump.low = height;
  return 'down';
}

/** A steady pair of hands: seconds for one full plunge and toss, to shuffle to the next piece, and to throw the sack and take up digging again. */
export const HANDS = { stroke: 1.3, shuffle: 0.7, sack: 3.5 } as const;

/** Seconds a steady pair of hands needs for a stage, every spadeful a full one. */
export function handsNeed(stage: ForestStage): number {
  return stage.pieces * (stage.effort * HANDS.stroke + HANDS.shuffle) + stage.sparksAfter.length * HANDS.sack;
}

// ---------------------------------------------------------------------------
// The cold fire: a wall across the wire before the fire gets there
// ---------------------------------------------------------------------------

/** One wall: the fire runs along a wire toward it; the stake pulled up as many times as the wall has courses raises it. */
export interface WallStage {
  name: string;
  /** Seconds the fire takes from where it starts to the wall. */
  seconds: number;
  /** Full pulls of the stake that raise the whole wall (it is heavier each time). */
  pulls: number;
  /** The rehearsal: the fire does not start until the wall is up. */
  held: boolean;
}

export const WALLS = {
  stages: [
    { name: 'one wall, no hurry', seconds: 2.2, pulls: 1, held: true },
    { name: 'round the other way', seconds: 5.5, pulls: 3, held: false },
    { name: 'over the wall, at the home', seconds: 5, pulls: 5, held: false },
  ] as readonly WallStage[],
  /** From this many losses of a stage on, the fire takes this much longer. */
  mercyAfter: 3,
  mercySlower: 1.4,
  /** A wall's fire does not leave until the stake is in a hand, or this long has gone by (s): the time on the wall is all for pulling. */
  grace: 3,
} as const;

export interface WallRun {
  stage: WallStage;
  /** How far the fire has come toward the wall (0..1), and how long its whole way takes (s). */
  t: number;
  seconds: number;
  /** Pulls done. */
  pulls: number;
  result: 'playing' | 'cut' | 'passed';
}

export function startWall(stage: WallStage, losses = 0): WallRun {
  return { stage, t: 0, seconds: stage.seconds * (losses >= WALLS.mercyAfter ? WALLS.mercySlower : 1), pulls: 0, result: 'playing' };
}

/** How much of the wall stands (0..1). */
export function wallUp(run: WallRun): number {
  return Math.min(1, run.pulls / run.stage.pulls);
}

/** One full pull of the stake: another course of the wall. Returns how much of it stands now. */
export function pull(run: WallRun): number {
  if (run.result === 'playing' && run.pulls < run.stage.pulls) run.pulls += 1;
  return wallUp(run);
}

/** A frame of the cold fire: it runs toward the wall (the rehearsal's only once the wall is up), and at the wall it is cut or passes. */
export function stepWall(run: WallRun, dt: number): void {
  if (run.result !== 'playing') return;
  if (run.stage.held && wallUp(run) < 1) return;
  run.t = Math.min(1, run.t + dt / run.seconds);
  if (run.t >= 1) run.result = wallUp(run) >= 1 ? 'cut' : 'passed';
}

/** Seconds a steady hand needs for one pull (up and let it drop), and to see the fire start and reach for the stake. */
export const PULLS = { each: 0.6, react: 1.2 } as const;
