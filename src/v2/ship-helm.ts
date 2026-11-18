/**
 * Steering the storm ship (S13, the middle stage): pure rules, no drawing.
 *
 * `off` is where the sea comes from, measured from the bow (radians): 0 is
 * dead ahead, positive on the starboard bow, negative to port. Left alone a
 * ship falls off the sea, and after each sea the wind shifts it round; the
 * helm brings her head back. Helm is -1..1: positive is starboard helm, which
 * turns her bow to starboard, toward a sea on the starboard bow.
 *
 * Seas come at a beat. One that meets her within `safe` of the bow is ridden;
 * one that meets her wider comes aboard. Enough seas ridden wins the stage;
 * too many aboard loses it.
 */

export interface HelmStage {
  name: string;
  /** Seas to ride for the stage to be won. */
  seas: number;
  /** Seconds from one sea to the next. */
  every: number;
  /** How far the sea shifts round after each one (radians), and in how long (s). */
  swing: number;
  swingIn: number;
  /** The latest the shift starts after a sea (s); it starts at a moment between none and this. */
  swingLate: number;
  /** How fast she falls off once the sea is wide of the bow (radians a second). */
  fall: number;
  /** Where the sea is when the stage begins. */
  start: number;
  /** The rehearsal: no seas come and she does not fall off; won by bringing her head to the sea and holding it there this long (s). */
  rehearsal?: number;
}

export interface HelmRules {
  /** Full helm turns her this fast (radians a second), and she takes this long to answer it (s). */
  rate: number;
  lag: number;
  /** A sea within this of the bow is ridden (radians). */
  safe: number;
  /** The sea is never further round than this (radians): it stays where she can see it. */
  limit: number;
  /** Seas aboard that lose the stage. */
  lives: number;
  /** A sea is seen coming for this long (s). */
  warning: number;
  /** At the start of a stage nothing happens for this long (s). */
  grace: number;
  /** Losses of a stage after which it is eased, and after twice as many eased again. */
  mercyAfter: number;
  /** The wheel turned this far is full helm (radians). */
  fullWheel: number;
  rehearsal: HelmStage;
  stage: HelmStage;
}

const DEG = Math.PI / 180;

export const HELM: HelmRules = {
  rate: 16 * DEG,
  lag: 0.45,
  safe: 18 * DEG,
  limit: 80 * DEG,
  lives: 3,
  warning: 3,
  grace: 1.6,
  mercyAfter: 3,
  // Well inside the wheel's travel (the desktop mouse turns it 24 degrees at most, a wrist about as far): a hand that turns it less than half way still has full helm, so the stage is lost by answering late, not by a short wrist.
  fullWheel: 10 * DEG,
  rehearsal: { name: 'Take the wheel', seas: 0, every: 0, swing: 0, swingIn: 1, swingLate: 0, fall: 0, start: 40 * DEG, rehearsal: 0.35 },
  stage: { name: 'Head to the sea', seas: 5, every: 7, swing: 48 * DEG, swingIn: 2.2, swingLate: 1.8, fall: 4 * DEG, start: 30 * DEG },
};

export interface Helm {
  off: number;
  /** How fast she is turning now (radians a second; positive to starboard). */
  turn: number;
  /** Seconds until the next sea meets her (Infinity in the rehearsal). */
  seaIn: number;
  ridden: number;
  shipped: number;
  /** The shift still to come: how much of it is left, which way, and how long until it starts. */
  swingLeft: number;
  swingWay: number;
  swingWait: number;
  /** Seconds her head has been held to the sea (the rehearsal counts this). */
  steady: number;
  clock: number;
  /** The run of chances this stage draws on. */
  seed: number;
}

export interface HelmStep {
  /** A sea met her this step. */
  struck: boolean;
  /** It was ridden (else it came aboard). */
  rode: boolean;
  won: boolean;
  lost: boolean;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** How much of a stage's trouble is left after `losses` of it: all, then less, then half. */
export function easeHelm(rules: HelmRules, losses: number): number {
  if (losses >= rules.mercyAfter * 2) return 0.5;
  if (losses >= rules.mercyAfter) return 0.7;
  return 1;
}

/** The arc that counts as the bow, wider the more a stage has been eased. */
export function safeArc(rules: HelmRules, eased: number): number {
  return rules.safe * (1 + (1 - eased) * 0.8);
}

/** The next chance in 0..1, and the seed moved on. */
function chance(helm: Helm): number {
  helm.seed = (helm.seed * 16807) % 2147483647;
  return helm.seed / 2147483647;
}

export function newHelm(stage: HelmStage, seed = 7): Helm {
  return {
    off: stage.start,
    turn: 0,
    seaIn: stage.rehearsal != null ? Infinity : stage.every,
    ridden: 0,
    shipped: 0,
    swingLeft: 0,
    swingWay: 1,
    swingWait: 0,
    steady: 0,
    clock: 0,
    seed: Math.max(1, Math.floor(seed)),
  };
}

/** What the wheel's turn asks of the rudder: -1..1 (the wheel's angle is positive clockwise, as she sees it). */
export function helmOf(rules: HelmRules, wheel: number): number {
  return clamp(wheel / rules.fullWheel, -1, 1);
}

/** After a sea, plan the next shift: which way, how far, and when it starts. */
function planSwing(rules: HelmRules, stage: HelmStage, helm: Helm, eased: number): void {
  const far = stage.swing * eased * (0.7 + 0.6 * chance(helm));
  // Away from the limit when she is already near it, else either way.
  let way = chance(helm) < 0.5 ? -1 : 1;
  if (Math.abs(helm.off + way * far) > rules.limit) way = -way;
  helm.swingLeft = far;
  helm.swingWay = way;
  helm.swingWait = stage.swingLate * chance(helm);
}

/**
 * One step of steering. `helm` is -1..1 (see helmOf). `eased` is easeHelm's.
 * `out` says what happened in this step.
 */
export function stepHelm(rules: HelmRules, stage: HelmStage, state: Helm, helm: number, dt: number, eased: number, out: HelmStep): HelmStep {
  out.struck = false;
  out.rode = false;
  out.won = false;
  out.lost = false;
  if (dt <= 0) return out;
  state.clock += dt;
  // She answers the helm with a ship's weight.
  state.turn += (clamp(helm, -1, 1) * rules.rate - state.turn) * Math.min(1, dt / rules.lag);
  state.off -= state.turn * dt;
  const safe = safeArc(rules, eased);
  const live = state.clock > rules.grace;
  if (live && stage.rehearsal == null) {
    // Wide of the bow, the sea pushes her head further off.
    state.off += stage.fall * eased * clamp(state.off / safe, -1, 1) * dt;
    // The shift after the last sea.
    if (state.swingLeft > 0) {
      if (state.swingWait > 0) state.swingWait -= dt;
      else {
        const moved = Math.min(state.swingLeft, (stage.swing / stage.swingIn) * dt);
        state.off += state.swingWay * moved;
        state.swingLeft -= moved;
      }
    }
  }
  state.off = clamp(state.off, -rules.limit, rules.limit);
  const held = Math.abs(state.off) <= safe;
  state.steady = held ? state.steady + dt : 0;
  if (stage.rehearsal != null) {
    out.won = state.steady >= stage.rehearsal;
    return out;
  }
  if (!live) return out;
  state.seaIn -= dt;
  if (state.seaIn <= 0) {
    out.struck = true;
    out.rode = held;
    if (held) state.ridden += 1;
    else state.shipped += 1;
    state.seaIn += stage.every;
    planSwing(rules, stage, state, eased);
    out.won = state.ridden >= stage.seas;
    out.lost = !out.won && state.shipped >= rules.lives;
  }
  return out;
}
