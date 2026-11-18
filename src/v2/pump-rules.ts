/**
 * "Prime the pump" as numbers only: a hand pump that gives nothing until
 * water is poured into it, whose pressure is made by wide, quick strokes
 * and leaks away the moment they slow, and the rows of a dry field that
 * the water reaches one by one and that crack again, the farthest first,
 * when it stops coming. No drawing, no input devices and no scene here: the
 * scene feeds the lever's place in and reads pressure, flow and wet rows
 * out, so every rule can be tested.
 *
 * Units: seconds; the lever's place is 0 (up) to 1 (down); pressure is 0 to
 * 1 on the gauge; a bed's water is counted in rows from the near end.
 */

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export const PUMP = {
  /** Pressure made by one unit of counted lever travel (a full stroke down and up is two units). */
  gain: 0.59,
  /** Pressure lost every second: this share of what there is, and this much besides (so a pump left alone does reach zero). */
  leak: 0.9,
  drain: 0.06,
  /** Below this the spout only drips: nothing runs down the trough. */
  flowFrom: 0.25,
  /** A stroke's first part does not count, and it counts fully only past the second mark (so a wide stroke beats a jiggle). */
  deadTravel: 0.1,
  fullTravel: 0.5,
  /** One hand on the bar gives this share of two. */
  oneHand: 0.8,
  /** Seconds of pouring that prime the pump. */
  primeSeconds: 0.45,
  /** A pump whose pressure is all gone keeps its prime this long (s): time to read a line, look up at the field, and take the bar again. Only then does it suck air. */
  dryAfter: 4,
  /** Before the first water (the rehearsal) the pressure leaks this much slower, and reaching this mark ends it. */
  rehearsalLeak: 0.35,
  rehearsalMark: 0.6,
  /** The rehearsal is also over after this many counted half strokes (three strokes down and up), however gently they were made. */
  rehearsalStrokes: 6,
  /** At the start of every attempt of a stage nothing dries for this long (s): time to find the rhythm again. */
  grace: 1.5,
  /** A bed can soak this many rows' worth past its last row: the time there is to feed the other bed. */
  soak: 0.6,
  /** Losses of one stage after which it is made easier, and by how much; and a stage played this long eases a little more every second, down to a floor. */
  mercyLosses: 3,
  mercy: 0.6,
  patience: 50,
  patienceRate: 0.015,
  patienceFloor: 0.45,
  /** The relief valve: blown open, the pump leaks this many times faster until a hand shuts it; in a stage that has one it first blows this long after the water comes. */
  valveLeak: 2.2,
  valveFirst: 6,
} as const;

/** One stage of the field: how many beds, how fast the water runs down them, and how fast they dry. */
export interface PumpStage {
  name: string;
  beds: 1 | 2;
  rows: number;
  /** Rows a second the fed bed gains for each unit of pressure over PUMP.flowFrom. */
  advance: number;
  /** Rows a second every bed loses to the dry ground. */
  dry: number;
  /** Rows a second lost besides for every wet row (the noon sun): the longer the wet stretch, the faster its far end goes. */
  evaporation: number;
  /** Where each bed's water starts, as a share of its rows. */
  start: readonly number[];
  /** The relief valve blows this many seconds after it was last shut (0: never in this stage). */
  valveEvery: number;
}

/** The farm's three stages, then the city's row of shops (one line, no sluice, the hardest to hold). */
export const STAGES: readonly PumpStage[] = [
  { name: 'one bed', beds: 1, rows: 6, advance: 1.6, dry: 0.28, evaporation: 0, start: [0], valveEvery: 0 },
  { name: 'two beds and the sluice', beds: 2, rows: 6, advance: 1.6, dry: 0.26, evaporation: 0, start: [1, 0], valveEvery: 18 },
  { name: 'the noon sun', beds: 2, rows: 6, advance: 1.6, dry: 0.2, evaporation: 0.03, start: [0.5, 0.5], valveEvery: 13 },
];
export const CITY_STAGES: readonly PumpStage[] = [
  { name: 'the first shops', beds: 1, rows: 3, advance: 1.1, dry: 0.24, evaporation: 0, start: [0], valveEvery: 0 },
  { name: 'the whole street, hoarding', beds: 1, rows: 6, advance: 1.3, dry: 0.3, evaporation: 0.07, start: [0.34], valveEvery: 14 },
];

export interface Pump {
  /** Seconds of water poured in so far; primed at PUMP.primeSeconds. */
  poured: number;
  primed: boolean;
  pressure: number;
  /** Whether water has come out of the spout since it was last primed (a pump that never ran cannot run dry). */
  ran: boolean;
  /** The lever's place last step, where it last turned round, and which way it is going (1 down, -1 up, 0 not yet moved). */
  lever: number;
  turnedAt: number;
  going: -1 | 0 | 1;
  /** Half strokes that counted (travelled past PUMP.fullTravel) since the start. */
  strokes: number;
  /** Whether the half stroke being made has been counted yet. */
  counted: boolean;
  /** Seconds the pressure has been at nothing since it last ran. */
  emptyFor: number;
}

export function newPump(lever = 0): Pump {
  return { poured: 0, primed: false, pressure: 0, ran: false, lever, turnedAt: lever, going: 0, strokes: 0, counted: false, emptyFor: 0 };
}

/** Pour water into the pump for `dt` seconds; true once it is primed. */
export function pour(pump: Pump, dt: number): boolean {
  if (pump.primed) return true;
  pump.poured += dt;
  if (pump.poured >= PUMP.primeSeconds) {
    pump.primed = true;
    pump.ran = false;
  }
  return pump.primed;
}

/** How much of a half stroke's travel counts once it has gone `length` from where it turned (0 inside the dead part, 1 past the full mark). */
export function strokeWeight(length: number): number {
  return clamp((length - PUMP.deadTravel) / (PUMP.fullTravel - PUMP.deadTravel), 0, 1);
}

export interface PumpStep {
  /** A half stroke was just counted (for its sound), and whether it was the down one. */
  stroke: boolean;
  down: boolean;
  /** The pump just ran dry: it sucks air and must be primed again. */
  dry: boolean;
}

const STEP: PumpStep = { stroke: false, down: false, dry: false };

/**
 * One frame of the pump: the lever is now at `lever` (0 up to 1 down) held by
 * `hands` hands (0: let go, it makes no pressure). `leakScale` slows the leak
 * (the rehearsal, a stage made easier). Returns the same object every call.
 */
export function stepPump(pump: Pump, lever: number, hands: number, dt: number, leakScale = 1): PumpStep {
  STEP.stroke = false;
  STEP.down = false;
  STEP.dry = false;
  const at = clamp(lever, 0, 1);
  const moved = at - pump.lever;
  if (moved !== 0) {
    const way: -1 | 1 = moved > 0 ? 1 : -1;
    if (way !== pump.going) {
      // Turned round: a new half stroke starts where the last one ended.
      pump.going = way;
      pump.turnedAt = pump.lever;
      pump.counted = false;
    }
    const before = Math.abs(pump.lever - pump.turnedAt);
    const after = Math.abs(at - pump.turnedAt);
    if (pump.primed && hands > 0) {
      // The travel counts by how far this half stroke has come (the mean of the weight over this step).
      const weight = (strokeWeight(before) + strokeWeight(after)) / 2;
      pump.pressure += PUMP.gain * Math.abs(moved) * weight * (hands >= 2 ? 1 : PUMP.oneHand);
    }
    if (!pump.counted && after >= PUMP.fullTravel) {
      pump.counted = true;
      pump.strokes += 1;
      STEP.stroke = true;
      STEP.down = way > 0;
    }
    pump.lever = at;
  }
  if (pump.primed) {
    pump.pressure -= (PUMP.leak * pump.pressure + PUMP.drain) * leakScale * dt;
    pump.pressure = clamp(pump.pressure, 0, 1);
    if (pump.pressure >= PUMP.flowFrom) pump.ran = true;
    pump.emptyFor = pump.ran && pump.pressure <= 0 ? pump.emptyFor + dt : 0;
    if (pump.emptyFor >= PUMP.dryAfter) {
      pump.primed = false;
      pump.ran = false;
      pump.poured = 0;
      pump.emptyFor = 0;
      STEP.dry = true;
    }
  } else pump.pressure = 0;
  return STEP;
}

/** How hard the water comes out of the spout, 0 (drips) to 1. */
export function flowOf(pump: Pump): number {
  return pump.primed ? clamp((pump.pressure - PUMP.flowFrom) / (1 - PUMP.flowFrom), 0, 1) : 0;
}

/** The pressure a steady pumper holds: `cadence` full strokes (down and up) a second, each `width` of the lever's travel, with one or two hands. */
export function steadyPressure(cadence: number, width = 1, hands = 2, leakScale = 1): number {
  // Counted travel of one half stroke of this width.
  const w = clamp(width, 0, 1);
  const ramp = PUMP.fullTravel - PUMP.deadTravel;
  const counted = w <= PUMP.deadTravel ? 0 : w <= PUMP.fullTravel ? ((w - PUMP.deadTravel) * (w - PUMP.deadTravel)) / (2 * ramp) : ramp / 2 + (w - PUMP.fullTravel);
  const made = PUMP.gain * counted * 2 * cadence * (hands >= 2 ? 1 : PUMP.oneHand);
  return clamp((made / leakScale - PUMP.drain) / PUMP.leak, 0, 1);
}

/** The full strokes a second that hold `pressure` (two hands, full width): the rhythm a stage asks for. */
export function cadenceFor(pressure: number, leakScale = 1): number {
  const perStroke = PUMP.gain * (PUMP.fullTravel - PUMP.deadTravel) / 2 + PUMP.gain * (1 - PUMP.fullTravel);
  return ((PUMP.leak * pressure + PUMP.drain) * leakScale) / (2 * perStroke);
}

export interface Field {
  /** Each bed's water, in rows from the near end (up to rows + PUMP.soak). */
  fronts: number[];
  /** Whether each bed has had a whole row wet since the stage began (a bed that never had water cannot die). */
  wetted: boolean[];
}

export function newField(stage: PumpStage): Field {
  const fronts = stage.start.map((share) => share * stage.rows);
  return { fronts, wetted: fronts.map((f) => f >= 1) };
}

/** How fast a bed's water goes back (rows a second) at `front` rows, eased by `ease` (1 none). */
export function drying(stage: PumpStage, front: number, ease = 1): number {
  return (stage.dry + stage.evaporation * Math.min(front, stage.rows)) * ease;
}

/**
 * One frame of the field: the spout's `flow` (0..1 of pressure over the
 * threshold, as flowOf gives it) goes to bed `fed` (the sluice; always 0
 * with one bed). Returns the bed that has just dried right out, or -1.
 */
export function stepField(field: Field, stage: PumpStage, flow: number, fed: number, dt: number, ease = 1): number {
  let dead = -1;
  for (let b = 0; b < stage.beds; b += 1) {
    let front = field.fronts[b];
    if (b === fed) front += stage.advance * flow * (1 - PUMP.flowFrom) * dt;
    front -= drying(stage, front, ease) * dt;
    front = clamp(front, 0, stage.rows + PUMP.soak);
    if (front >= 1) field.wetted[b] = true;
    if (front <= 0 && field.wetted[b]) {
      field.wetted[b] = false;
      dead = b;
    }
    field.fronts[b] = front;
  }
  return dead;
}

/** How wet row `row` (0 the nearest) of bed `bed` is, 0 cracked to 1 soaked. */
export function rowWet(field: Field, bed: number, row: number): number {
  return clamp(field.fronts[bed] - row, 0, 1);
}

/** Won when every bed's last row is wet through. */
export function fieldWon(field: Field, stage: PumpStage): boolean {
  for (let b = 0; b < stage.beds; b += 1) if (field.fronts[b] < stage.rows) return false;
  return true;
}

/** The pressure that just keeps the whole field from going back (two beds share one spout): the gauge's mark for the stage. */
export function holdPressure(stage: PumpStage, ease = 1): number {
  const loss = stage.beds * drying(stage, stage.rows, ease);
  return clamp(PUMP.flowFrom + loss / stage.advance, 0, 1);
}

/**
 * Whether the relief valve blows now: `sinceWater` seconds of this stage's
 * water running, `sinceShut` seconds since a hand last shut it (Infinity if
 * it has not blown yet in this attempt). Eased stages blow less often.
 */
export function valveBlows(stage: PumpStage, sinceWater: number, sinceShut: number, ease = 1): boolean {
  if (stage.valveEvery <= 0) return false;
  if (sinceShut === Infinity) return sinceWater >= PUMP.valveFirst;
  return sinceShut >= stage.valveEvery / ease;
}

/** How much easier a stage is after `losses` of it and `seconds` in this attempt (1: as designed). */
export function easeAfter(losses: number, seconds: number): number {
  const lost = losses >= PUMP.mercyLosses ? PUMP.mercy : 1;
  const waited = Math.max(PUMP.patienceFloor, 1 - Math.max(0, seconds - PUMP.patience) * PUMP.patienceRate);
  return lost * waited;
}

/** The farm as it is played: the pump and one bed, then two beds and the sluice. Its third act is the surge (below); the relief valve is the square's alone. */
export const FARM_STAGES: readonly PumpStage[] = [STAGES[0], { ...STAGES[1], valveEvery: 0 }];

/**
 * Sharing the water out, the farm's third act. The pump runs by itself now,
 * and its water goes down three lanes to three places, each farther than
 * the last: the bakery, the house, the factory. Each lane has a gate; the
 * water takes the first open gate from the pump. A place fills while water
 * reaches it, and its light comes on when it is full; but a place takes
 * water only once the one before it is lit, and a lit place needs no more.
 * Water that reaches a place that cannot take it is wasted: enough of it is
 * a spill, and three spills lose the attempt.
 */
export const GATES = {
  places: ['bakery', 'house', 'factory'],
  /** Seconds the water takes down each lane. */
  travel: [2.0, 2.6, 3.2],
  /** Seconds of water arriving that fill each place. */
  fill: [4, 5, 6],
  /** After a place lights, what is still in its lane and what comes in the next second only brims its tank; water arriving later than that is wasted. */
  brim: 1.0,
  /** Seconds of wasted water that make one spill, and the spills that lose an attempt. */
  spill: 1.5,
  spills: 3,
  /** Each lost attempt (up to `easeMost`): the places fill this many times as fast, and the brim lasts this much longer. */
  faster: 1.25,
  brimmer: 0.8,
  easeMost: 3,
} as const;

export interface Gates {
  open: boolean[];
  /** Each lane's water: where its front and its back end are, 0 at the gate to 1 at the place (both 0: the lane is empty). */
  head: number[];
  tail: number[];
  /** How full each place is, 0 to 1, and for how long it has been lit (-1: not yet). */
  level: number[];
  litFor: number[];
  /** Seconds of water wasted in this attempt. */
  wasted: number;
}

export function newGates(): Gates {
  return { open: [false, false, false], head: [0, 0, 0], tail: [0, 0, 0], level: [0, 0, 0], litFor: [-1, -1, -1], wasted: 0 };
}

/** The lane the water runs down now: the first open gate from the pump (-1: all are shut, the water stays in the tub). */
export function gateFed(gates: Gates): number {
  return gates.open.indexOf(true);
}

/** The place whose turn it is: the first not yet lit (-1 once all are). */
export function gateWanted(gates: Gates): number {
  return gates.litFor.findIndex((lit) => lit < 0);
}

/** Whether lane `lane`'s water is reaching its place now. */
export function gateArriving(gates: Gates, lane: number): boolean {
  return gates.head[lane] >= 1 && gates.tail[lane] < 1;
}

/** Whether water reaching place `lane` now would be wasted, after `losses` lost attempts: the place before it is not lit, or it is lit itself and done brimming. */
export function gateWastes(gates: Gates, lane: number, losses = 0): boolean {
  const eased = Math.min(GATES.easeMost, Math.max(0, losses));
  if (gates.litFor[lane] >= 0) return gates.litFor[lane] > GATES.travel[lane] + GATES.brim + GATES.brimmer * eased;
  return lane > 0 && gates.litFor[lane - 1] < 0;
}

export interface GatesStep {
  /** The place that has just lit (-1: none). */
  lit: number;
  /** Water is being wasted this frame, and a whole spill has just been counted. */
  wasting: boolean;
  spilled: boolean;
}
const GATES_STEP: GatesStep = { lit: -1, wasting: false, spilled: false };

/** One frame of the lanes and the places. Returns the same object every call. */
export function stepGates(gates: Gates, dt: number, losses = 0): GatesStep {
  const out = GATES_STEP;
  out.lit = -1;
  out.wasting = false;
  out.spilled = false;
  const fed = gateFed(gates);
  const eased = Math.min(GATES.easeMost, Math.max(0, losses));
  const before = Math.floor(gates.wasted / GATES.spill);
  for (let k = 0; k < gates.open.length; k += 1) {
    const speed = dt / GATES.travel[k];
    if (k === fed) {
      // Water is going in: the lane's back end is at the gate, its front runs on.
      gates.tail[k] = 0;
      gates.head[k] = Math.min(1, Math.max(gates.head[k], 1e-6) + speed);
    } else if (gates.head[k] > 0) {
      // The gate is shut: what is in the lane runs on down it and out.
      gates.head[k] = Math.min(1, gates.head[k] + speed);
      gates.tail[k] += speed;
      if (gates.tail[k] >= 1) {
        gates.head[k] = 0;
        gates.tail[k] = 0;
      }
    }
    if (gates.litFor[k] >= 0) gates.litFor[k] += dt;
    if (!gateArriving(gates, k)) continue;
    if (gateWastes(gates, k, losses)) {
      gates.wasted += dt;
      out.wasting = true;
    } else if (gates.litFor[k] < 0) {
      gates.level[k] = Math.min(1, gates.level[k] + (dt * GATES.faster ** eased) / GATES.fill[k]);
      if (gates.level[k] >= 1) {
        gates.litFor[k] = 0;
        out.lit = k;
      }
    }
  }
  out.spilled = Math.floor(gates.wasted / GATES.spill) > before;
  return out;
}

export function gateSpills(gates: Gates): number {
  return Math.floor(gates.wasted / GATES.spill);
}
export function gatesWon(gates: Gates): boolean {
  return gates.litFor.every((lit) => lit >= 0);
}
export function gatesLost(gates: Gates): boolean {
  return gateSpills(gates) >= GATES.spills;
}
