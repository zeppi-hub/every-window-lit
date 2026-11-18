/**
 * The valley memory's rules, as numbers only: a keeper rings a herd with a
 * line of rags on stakes before the wolves come down. A stake is driven by
 * lifting a two-handled driver and slamming it down; the line between two
 * stakes is hauled in hand over hand until it stands clear of the snow; a
 * line left slack sags, and a wolf goes under where it lies. The ring is the
 * player's own choice of holes: too wide and the coil runs out, too tight
 * and one of the herd is left outside. No drawing, no input devices and no
 * scene here: the scene feeds hand heights and pulls in and reads depths,
 * sags and verdicts out, so every rule can be tested.
 *
 * Units: metres, seconds. The ground is a plane: x east, z south (the
 * scene's own axes), a place on it is a Spot.
 */

export interface Spot {
  x: number;
  z: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The straight distance between two places (m). */
export function gap(a: Spot, b: Spot): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

// ---------------------------------------------------------------------------
// The stake and its driver
// ---------------------------------------------------------------------------

export const DRIVE = {
  /** How far a stake goes down before it stands firm (m). */
  depth: 0.22,
  /** A slam from this high is a full blow (m); from under `minDrop` it is no blow at all. */
  fullDrop: 0.24,
  minDrop: 0.05,
  /** A full blow in soft ground sinks the stake this far (m): three of them and it is firm. */
  fullBlow: 0.078,
  /** A blow weaker than this share of a full one bounces off frozen ground and sinks nothing. */
  bounce: 0.3,
  /** The fall's average speed: under `minSpeed` the driver was only set down (m/s); from `fullSpeed` up it counts in full. */
  minSpeed: 0.5,
  fullSpeed: 1.3,
  /** A hand that wavers by less than this is not yet falling, or rising again (m). */
  waver: 0.02,
  /** The driver is on the stake when this near its top (m). */
  touch: 0.008,
} as const;

/**
 * How far one blow sinks a stake: half the drop is half the blow, a driver
 * lowered slowly is no blow, and a feeble one bounces. `ground` is how hard
 * the ground is (1 soft; 1.65 takes five full blows where soft takes three).
 */
export function blow(drop: number, seconds: number, ground = 1): number {
  if (drop < DRIVE.minDrop || seconds <= 0) return 0;
  const height = clamp(drop / DRIVE.fullDrop, 0, 1);
  const speed = clamp((drop / seconds - DRIVE.minSpeed) / (DRIVE.fullSpeed - DRIVE.minSpeed), 0, 1);
  const strength = height * speed;
  if (strength < DRIVE.bounce) return 0;
  return (DRIVE.fullBlow * strength) / ground;
}

/** The driver over one stake: how high it has been lifted since its last blow, and how long it has been coming down. */
export interface Driver {
  lifted: number;
  falling: number;
  /** The lowest it has been since it started down (m above the stake). */
  low: number;
}

export function newDriver(): Driver {
  return { lifted: 0, falling: 0, low: 0 };
}

/**
 * One step of the driver, `height` above the stake's top (0 or less: on it).
 * Returns how far this step's blow sank the stake (0: no blow). Let go of
 * (`held` false), the driver rests on the stake and its lift is forgotten.
 */
export function stepDriver(driver: Driver, height: number, held: boolean, dt: number, ground = 1): number {
  if (!held) {
    driver.lifted = 0;
    driver.falling = 0;
    driver.low = 0;
    return 0;
  }
  const h = Math.max(0, height);
  if (h <= DRIVE.touch) {
    const sunk = blow(driver.lifted, Math.max(driver.falling, dt), ground);
    driver.lifted = 0;
    driver.falling = 0;
    driver.low = 0;
    return sunk;
  }
  if (h >= driver.lifted - DRIVE.waver) {
    // Still going up, or held at the top.
    driver.lifted = Math.max(driver.lifted, h);
    driver.falling = 0;
    driver.low = h;
    return 0;
  }
  if (h > driver.low + DRIVE.waver) {
    // Lowered, then lifted again: the blow starts from here.
    driver.lifted = h;
    driver.falling = 0;
    driver.low = h;
    return 0;
  }
  driver.falling += dt;
  driver.low = Math.min(driver.low, h);
  return 0;
}

// ---------------------------------------------------------------------------
// The line between two stakes
// ---------------------------------------------------------------------------

export const LINE = {
  /** The line's height on a firm stake (m above the snow). */
  height: 0.72,
  /** A span holds while its lowest rag hangs this high or higher (m): lower, and a wolf goes under. */
  clear: 0.32,
  /** A line nobody holds slides back through the notch this fast (m/s), until its knot bites. */
  slip: 0.45,
  /** Let go of for this long, the knot bites and the span is left as it is (s). */
  tieAfter: 0.9,
  /** The line counts as taken once this much has come through the notch (m): a hand resting on it starts nothing. */
  taken: 0.05,
} as const;

/** How far the middle of a span hangs below its stakes, for a line `slack` longer than the gap (m). */
export function sag(distance: number, slack: number): number {
  if (slack <= 0) return 0;
  return Math.sqrt((3 * distance * slack) / 8);
}

/** The most slack a span of this length can keep and still hold (m). */
export function slackAllowed(distance: number): number {
  const drop = LINE.height - LINE.clear;
  return (8 * drop * drop) / (3 * distance);
}

/** Whether a span this slack keeps a wolf out. */
export function holds(distance: number, slack: number): boolean {
  return slack <= slackAllowed(distance) + 1e-9;
}

/** The line's height above the snow at `k` (0..1) along a span (never under the snow). */
export function lineHeight(distance: number, slack: number, k: number): number {
  return Math.max(0.02, LINE.height - sag(distance, slack) * 4 * k * (1 - k));
}

/** One span being hauled in. */
export interface Haul {
  /** The gap it crosses, the slack it began with and the slack it has now (m). */
  distance: number;
  from: number;
  slack: number;
  /** Seconds since a hand last held the line, once one has (a line never touched waits as it lies). */
  idle: number;
  touched: boolean;
  tied: boolean;
}

export function newHaul(distance: number, slack: number): Haul {
  return { distance, from: slack, slack, idle: 0, touched: false, tied: false };
}

/**
 * One step of the haul: `pulled` metres came through the notch (the hands'
 * travel along the line while they held it). Taut, the knot bites at once.
 * Let go of, the line slides back, and after LINE.tieAfter the knot bites
 * on whatever slack is left; in the rehearsal (`patient`) it never does.
 * A line no hand has taken yet lies as it was paid out.
 */
export function stepHaul(haul: Haul, pulled: number, held: boolean, dt: number, patient = false): 'hauling' | 'taut' | 'left slack' {
  if (haul.tied) return holds(haul.distance, haul.slack) ? 'taut' : 'left slack';
  if (held) {
    haul.idle = 0;
    haul.slack = Math.max(0, haul.slack - Math.max(0, pulled));
    if (haul.from - haul.slack >= LINE.taken) haul.touched = true;
  } else if (haul.touched) {
    haul.idle += dt;
    haul.slack = Math.min(haul.from, haul.slack + LINE.slip * dt);
  }
  if (holds(haul.distance, haul.slack)) {
    haul.tied = true;
    return 'taut';
  }
  if (!held && haul.touched && !patient && haul.idle >= LINE.tieAfter) {
    haul.tied = true;
    return 'left slack';
  }
  return 'hauling';
}

/**
 * A gust takes line back through the notch: all of `gust` (m) from a line
 * nobody holds, half from one hand, none from two. A tied span is past it.
 */
export function gustHaul(haul: Haul, hands: number, gust: number): number {
  if (haul.tied || gust <= 0) return 0;
  const took = Math.min(haul.from - haul.slack, gust * (hands >= 2 ? 0 : hands === 1 ? 0.5 : 1));
  haul.slack += Math.max(0, took);
  return Math.max(0, took);
}

// ---------------------------------------------------------------------------
// The herd, the holes and the three stages
// ---------------------------------------------------------------------------

export interface Beast extends Spot {
  kind: 'cow' | 'calf' | 'bull';
  /** The ones the ring is for: left outside, the stage is lost. The others may be left to the hills. */
  core: boolean;
  /** The way it stands (radians about up). */
  yaw: number;
}

export interface ValleyStage {
  name: string;
  /** Where a stake can go. */
  holes: readonly Spot[];
  herd: readonly Beast[];
  /** The coil's length (m), and the slack a span is paid out with before it is hauled (m). */
  rope: number;
  slack: number;
  /** Seconds from the stage's start until the wolves are down at the ring. */
  dusk: number;
  /** How hard the ground is (blow()). */
  ground: number;
  /** The wind: how much line a gust takes back (gustHaul()), and the seconds between gusts. */
  gust: number;
  gustEvery: number;
  /** The herd's walk: east (+x) at this speed (m/s) until a line turns it; 0 stands still. */
  drift: number;
  /** Where the wolves come from (radians: 0 is north, clockwise seen from above). */
  wolvesFrom: number;
  /** A ring that works, hole by hole (the hint, and the dev skip). */
  answer: readonly number[];
}

const beast = (kind: Beast['kind'], x: number, z: number, yaw: number, core = true): Beast => ({ kind, x, z, yaw, core });
/** Holes on a circle round the middle, the first at `from` degrees (0 is east, 90 south). */
const round = (radius: number, count: number, from: number): Spot[] =>
  Array.from({ length: count }, (_, k) => {
    const a = ((from + (k * 360) / count) * Math.PI) / 180;
    return { x: +(radius * Math.cos(a)).toFixed(3), z: +(radius * Math.sin(a)).toFixed(3) };
  });

export const STAGES: readonly ValleyStage[] = [
  {
    // Four holes, two cows and the calf between them, and all the time in the world.
    name: 'a small ring',
    holes: round(5.2, 4, 45),
    // Side by side, head to tail (each is four metres long and nearly two wide), the calf by the second.
    herd: [beast('cow', -0.3, -1.3, Math.PI / 2 + 0.2), beast('cow', 0.3, 1.0, -Math.PI / 2 + 0.15), beast('calf', 0.2, 2.9, Math.PI / 2)],
    rope: 36,
    slack: 0.7,
    dusk: 62,
    ground: 1,
    gust: 0,
    gustEvery: 99,
    drift: 0,
    wolvesFrom: 0,
    answer: [0, 1, 2, 3],
  },
  {
    // The cows and the calf here, two bulls grazing far to the east, and one coil: not enough to go round them all.
    name: 'two herds, one coil',
    holes: [...round(5.2, 5, 18), { x: 11, z: -6.5 }, { x: 18.5, z: 0 }, { x: 11, z: 6.5 }],
    herd: [beast('cow', -0.4, -1.3, Math.PI / 2 + 0.2), beast('cow', 0.4, 0.9, -Math.PI / 2 + 0.15), beast('cow', -1.0, 2.9, Math.PI / 2 - 0.1), beast('calf', 2.9, 1.6, 0.9), beast('bull', 12.5, -2.0, -1.2, false), beast('bull', 15.0, 2.0, 2.0, false)],
    rope: 36,
    slack: 0.8,
    dusk: 92,
    ground: 1.3,
    gust: 0.14,
    gustEvery: 3.2,
    drift: 0,
    // Out of the north-east (the valley's east and west are walls of ice).
    wolvesFrom: 0.4,
    answer: [0, 1, 2, 3, 4],
  },
  {
    // Dusk; the wolves are coming down from the north-west and the herd is walking away from them, east, toward where no line is yet.
    name: 'the herd on the move',
    holes: round(5.6, 5, 36),
    herd: [beast('cow', -0.2, -1.1, Math.PI / 2), beast('cow', 0.6, 0.9, Math.PI / 2), beast('cow', -1.4, 2.9, Math.PI / 2), beast('calf', -3.4, -0.6, Math.PI / 2)],
    rope: 38,
    slack: 0.8,
    dusk: 94,
    ground: 1.65,
    gust: 0.2,
    gustEvery: 2.8,
    drift: 0.085,
    wolvesFrom: -0.4,
    // The east side first: the holes either side of where the herd is headed.
    answer: [4, 0, 1, 2, 3],
  },
];

/** The same stage made gentler, for a player who has lost it three times: softer ground, less to haul, no wind, a later dusk, a slower herd. */
export function eased(stage: ValleyStage): ValleyStage {
  return { ...stage, slack: stage.slack * 0.5, dusk: stage.dusk * 1.4, ground: 1, gust: 0, drift: stage.drift * 0.6 };
}

/** Whether `p` is inside the ring drawn through `ring` in order (crossing count). */
export function inside(ring: readonly Spot[], p: Spot): boolean {
  let within = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) within = !within;
  }
  return within;
}

/** Whether the walk from `p` to `q` crosses the span from `a` to `b`. */
export function crosses(p: Spot, q: Spot, a: Spot, b: Spot): boolean {
  const side = (o: Spot, u: Spot, v: Spot): number => (u.x - o.x) * (v.z - o.z) - (u.z - o.z) * (v.x - o.x);
  const d1 = side(a, b, p);
  const d2 = side(a, b, q);
  const d3 = side(p, q, a);
  const d4 = side(p, q, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** The ring as the player has built it so far. */
export interface Ring {
  /** The holes staked, in the order they were staked. */
  order: number[];
  /** Each tied span's slack: span k runs from order[k] to order[k + 1] (the last one back to order[0] once closed). */
  slacks: number[];
  closed: boolean;
}

export function newRing(): Ring {
  return { order: [], slacks: [], closed: false };
}

/** The rope gone from the coil: every tied span, and its slack. */
export function ropeUsed(stage: ValleyStage, ring: Ring): number {
  let used = 0;
  ring.slacks.forEach((slack, k) => {
    const a = stage.holes[ring.order[k]];
    const b = stage.holes[ring.order[(k + 1) % ring.order.length]];
    used += gap(a, b) + slack;
  });
  return used;
}

/**
 * The line paid out for a span from the last stake to hole `to` (the first
 * stake again closes the ring): the slack it starts with, or null if the
 * coil cannot reach at all.
 */
export function payOut(stage: ValleyStage, ring: Ring, to: number): { distance: number; slack: number } | null {
  if (ring.order.length === 0) return { distance: 0, slack: 0 };
  const distance = gap(stage.holes[ring.order[ring.order.length - 1]], stage.holes[to]);
  const left = stage.rope - ropeUsed(stage, ring);
  if (left < distance) return null;
  return { distance, slack: Math.min(stage.slack, left - distance) };
}

/** Which holes can be picked next: any not staked yet, and the first stake again once three stand (that closes the ring). */
export function choices(stage: ValleyStage, ring: Ring): number[] {
  if (ring.closed) return [];
  const free = stage.holes.map((_, i) => i).filter((i) => !ring.order.includes(i));
  // The first stake only once every earlier span is tied (the line reaches the last stake).
  return ring.order.length >= 3 && ring.slacks.length === ring.order.length - 1 ? [...free, ring.order[0]] : free;
}

/** The hole a hint points at: the answer's next, if the ring so far follows it; else the first stake (to close). */
export function hintFor(stage: ValleyStage, ring: Ring): number {
  const next = stage.answer[ring.order.length];
  const follows = ring.order.every((hole, k) => hole === stage.answer[k]);
  if (follows && next != null) return next;
  if (follows && ring.order.length === stage.answer.length) return stage.answer[0];
  const open = choices(stage, ring);
  return ring.order.length >= 3 ? ring.order[0] : (open[0] ?? 0);
}

export type Verdict =
  | { kind: 'held' }
  /** A span was left too slack: a wolf goes under it. */
  | { kind: 'slack'; span: number }
  /** One of the herd the ring was for stands outside it. */
  | { kind: 'left out'; beast: number };

/** The closed ring, judged as the wolves reach it: every span must hold, and every one of the core herd must be inside. */
export function judge(stage: ValleyStage, ring: Ring, herd: readonly Spot[] = stage.herd): Verdict {
  for (let k = 0; k < ring.slacks.length; k += 1) {
    const a = stage.holes[ring.order[k]];
    const b = stage.holes[ring.order[(k + 1) % ring.order.length]];
    if (!holds(gap(a, b), ring.slacks[k])) return { kind: 'slack', span: k };
  }
  const line = ring.order.map((i) => stage.holes[i]);
  for (let i = 0; i < stage.herd.length; i += 1) if (stage.herd[i].core && !inside(line, herd[i])) return { kind: 'left out', beast: i };
  return { kind: 'held' };
}

// ---------------------------------------------------------------------------
// The herd on the move (the third stage)
// ---------------------------------------------------------------------------

/** A tied span as the herd meets it. */
export interface Fenced {
  a: Spot;
  b: Spot;
  holds: boolean;
}

export interface Herd {
  at: Spot[];
  /** 1 walking east, -1 turned back west. */
  way: 1 | -1;
}

/** How far ahead of its middle a beast meets a line (m). */
export const BEAST_AHEAD = 1.9;

export function newHerd(stage: ValleyStage): Herd {
  return { at: stage.herd.map((b) => ({ x: b.x, z: b.z })), way: 1 };
}

/**
 * One step of the herd's walk. A line that holds turns the whole herd
 * back; a line that sags is walked over. Returns the index of a beast that
 * has left the stage's ring of holes (strayed: the stage is lost), or -1,
 * and whether the herd turned this step.
 */
export function stepHerd(herd: Herd, stage: ValleyStage, fenced: readonly Fenced[], dt: number): { strayed: number; turned: boolean } {
  if (stage.drift === 0) return { strayed: -1, turned: false };
  const step = stage.drift * herd.way * dt;
  let turned = false;
  for (const p of herd.at) {
    const nose = { x: p.x + herd.way * BEAST_AHEAD + step, z: p.z };
    if (fenced.some((f) => f.holds && crosses(p, nose, f.a, f.b))) turned = true;
  }
  if (turned) {
    herd.way = herd.way === 1 ? -1 : 1;
    return { strayed: -1, turned: true };
  }
  for (const p of herd.at) p.x += step;
  const strayed = herd.at.findIndex((p) => !inside(stage.holes, p));
  return { strayed, turned: false };
}

/** Seconds until the first of the herd walks out of the ring of holes if no line turns it (Infinity for a herd standing still). */
export function timeToStray(stage: ValleyStage): number {
  if (stage.drift === 0) return Infinity;
  const herd = newHerd(stage);
  for (let t = 0; t < 600; t += 0.1) if (stepHerd(herd, stage, [], 0.1).strayed >= 0) return t;
  return Infinity;
}

/** How near the ring the wolves are (0 on the ridge, 1 at the line), `clock` seconds into a stage. */
export function wolvesDown(stage: ValleyStage, clock: number): number {
  return clamp(clock / stage.dusk, 0, 1);
}
