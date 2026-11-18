/**
 * The circus memory's three acts, as numbers only: the unicycle on the high
 * wire through hoops of fire, the cannon shot through hoops into a net, and
 * the flying trapeze caught by a partner or by the net. No drawing, no
 * input devices and no scene here: the scene feeds hand positions in and
 * reads leans, places and verdicts out, so every rule can be tested.
 *
 * Units: metres, seconds, degrees for what a person tilts or aims, radians
 * for the trapeze's swing. Right is +x, up is +y; "ahead" is +z here (the
 * scene turns it to face along the wire, the barrel or the swing).
 */

export interface Point {
  x: number;
  y: number;
  z: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const rad = (deg: number): number => (deg * Math.PI) / 180;

/** Gravity in every act (m/s²). */
export const GRAVITY = 9.81;

// ---------------------------------------------------------------------------
// Act 1: the unicycle on the high wire, through three hoops of fire
// ---------------------------------------------------------------------------

/** One stretch of the wire, up to and through one hoop. */
export interface WireStretch {
  /** How fast a lean grows by itself (1/s²). */
  instability: number;
  /** Past this lean the wheel slips off the wire (degrees). */
  maxLean: number;
  /** One gust's push (degrees per second). */
  gust: number;
  /** Seconds between gusts (the scene jitters it by 30%). */
  gustEvery: number;
  /** Where the hoop hangs along the wire (m from the start platform). */
  hoopAt: number;
  /** The hoop's radius to the middle of its iron ring (m). */
  hoopRadius: number;
  /** How far the hoop swings to either side (m), and how often (cycles per second). */
  hoopSway: number;
  hoopSwayRate: number;
}

export const WIRE = {
  /** The wire's usable length between the platforms (m). */
  length: 12.6,
  /** The eye above the wire: wheel 0.5, post 0.45, a seated trunk 0.6 (m). */
  eyeAboveWire: 1.55,
  /** The pole's middle and the hoop's middle above the wire (m): the hoop hangs higher, so a dipped end is the end nearest the fire. */
  poleAboveWire: 1.25,
  hoopAboveWire: 1.75,
  /** Half the pole (m), and how thick the flame is inside the ring (m). */
  poleHalf: 1.2,
  flame: 0.15,
  /** Riding speed when steady, and when at the edge of slipping (m/s). */
  speed: 0.45,
  slowSpeed: 0.15,
  /** What a full tilt of the pole does (degrees/s²), the tilt that counts as full (degrees), and the tilt that counts as none. */
  control: 60,
  fullTilt: 20,
  deadTilt: 2,
  /** How fast a swing of the body dies down by itself (1/s). */
  damping: 0.8,
  /** How far the seat carries the eye sideways at a lean (m per unit sine): the camera never rolls. */
  eyeShift: 0.25,
  /** The hoop counts as being passed while the wheel is this near its plane (m). */
  hoopDepth: 0.15,
  stretches: [
    { instability: 1.6, maxLean: 25, gust: 6, gustEvery: 4, hoopAt: 3.4, hoopRadius: 1.75, hoopSway: 0, hoopSwayRate: 0 },
    { instability: 2.0, maxLean: 20, gust: 6, gustEvery: 2.5, hoopAt: 7.0, hoopRadius: 1.68, hoopSway: 0.08, hoopSwayRate: 0.35 },
    { instability: 2.2, maxLean: 18, gust: 6, gustEvery: 2.2, hoopAt: 10.6, hoopRadius: 1.64, hoopSway: 0.05, hoopSwayRate: 0.5 },
  ] as readonly WireStretch[],
} as const;

/** The rider's lean (degrees, right is positive) and how fast it is changing (degrees/s). */
export interface Lean {
  angle: number;
  rate: number;
}

/**
 * The pole's tilt from the two hands (degrees): positive when the left hand
 * is the higher one, so the pole's right end is down.
 */
export function poleTilt(leftY: number, rightY: number, apart: number): number {
  return (Math.atan2(leftY - rightY, Math.max(0.05, apart)) * 180) / Math.PI;
}

/** The pole's say in the balance, -1 to 1, from its tilt: nothing inside the dead tilt, everything at the full tilt. */
export function poleInput(tilt: number): number {
  const size = Math.abs(tilt);
  if (size <= WIRE.deadTilt) return 0;
  return Math.sign(tilt) * clamp((size - WIRE.deadTilt) / (WIRE.fullTilt - WIRE.deadTilt), 0, 1);
}

/**
 * One step of the balance. A lean grows by itself; dipping the pole's right
 * end (input above 0) pushes the rider to the right, so the rule for the
 * player is one line: whichever way you are falling, dip the other end.
 */
export function stepLean(lean: Lean, input: number, stretch: WireStretch, dt: number): void {
  const accel = stretch.instability * lean.angle + WIRE.control * clamp(input, -1, 1) - WIRE.damping * lean.rate;
  lean.rate += accel * dt;
  lean.angle += lean.rate * dt;
}

/** A gust from the left (side 1) pushes to the right, from the right (side -1) to the left. */
export function gust(lean: Lean, stretch: WireStretch, side: 1 | -1): void {
  lean.rate += side * stretch.gust;
}

export function slipped(lean: Lean, stretch: WireStretch): boolean {
  return Math.abs(lean.angle) >= stretch.maxLean;
}

/** Riding speed: full while steady (inside half the limit), falling to the slow speed at the limit. */
export function rideSpeed(lean: Lean, stretch: WireStretch): number {
  const k = clamp((Math.abs(lean.angle) / stretch.maxLean - 0.5) / 0.5, 0, 1);
  return WIRE.speed + (WIRE.slowSpeed - WIRE.speed) * k;
}

/** Seconds until the wheel slips if a lean of `from` degrees is left alone (the measure of how hard a stretch is). */
export function timeToSlip(stretch: WireStretch, from = 3): number {
  const lean: Lean = { angle: from, rate: 0 };
  let t = 0;
  while (!slipped(lean, stretch) && t < 30) {
    stepLean(lean, 0, stretch, 1 / 240);
    t += 1 / 240;
  }
  return t;
}

/** Where the hoop's middle is, sideways, at a time (m). */
export function hoopSide(stretch: WireStretch, time: number): number {
  return stretch.hoopSway * Math.sin(2 * Math.PI * stretch.hoopSwayRate * time);
}

export type HoopVerdict = 'clear' | 'left end' | 'right end' | 'head';

/**
 * Going through a hoop: do the pole's two ends and the head stay out of the
 * fire? The eye (and so the hands and the pole) is carried sideways a little
 * by the lean; the hoop hangs higher than the pole, so the end that is
 * dipped is the one that comes nearest the flame.
 */
export function throughHoop(lean: Lean, tilt: number, stretch: WireStretch, hoopSideways: number): HoopVerdict {
  const safe = stretch.hoopRadius - WIRE.flame;
  const shift = WIRE.eyeShift * Math.sin(rad(lean.angle)) - hoopSideways;
  const up = WIRE.poleAboveWire - WIRE.hoopAboveWire;
  const c = Math.cos(rad(tilt));
  const s = Math.sin(rad(tilt));
  // Positive tilt: the left end is up, the right end down.
  const left = Math.hypot(shift - WIRE.poleHalf * c, up + WIRE.poleHalf * s);
  const right = Math.hypot(shift + WIRE.poleHalf * c, up - WIRE.poleHalf * s);
  const head = Math.hypot(shift, WIRE.eyeAboveWire + 0.12 - WIRE.hoopAboveWire);
  if (left >= safe && left >= right) return 'left end';
  if (right >= safe) return 'right end';
  if (head >= safe) return 'head';
  return 'clear';
}

// ---------------------------------------------------------------------------
// Act 2: the cannon, through three hoops into a net
// ---------------------------------------------------------------------------

export interface Hoop {
  /** Along the flight (m from the muzzle), sideways and up. */
  at: Point;
  radius: number;
}

export interface Shot {
  hoops: readonly Hoop[];
  /** The net's middle, half its width and half its height (m); it hangs across the flight, tilted back. */
  net: Point;
  netHalfWidth: number;
  netHalfHeight: number;
  /** How far the net is walked to either side (m) and how fast (m/s). */
  netWalk: number;
  netSpeed: number;
}

export const CANNON = {
  /** Muzzle speed (m/s): the same every shot, so only the aim decides. */
  speed: 12.5,
  /** The barrel's rest aim and how far the handles turn it (degrees). */
  restPitch: 32,
  pitchRange: 14,
  yawRange: 22,
  /** The hands' travel that gives the whole range (m). */
  handTravel: 0.18,
  /** With one hand off the handles the barrel sags this fast (degrees/s). */
  sag: 3,
  /** The fuse (s). */
  fuse: 3,
  /** In the air: arms wide slow you and lift you a little, arms in do the opposite (m/s²). */
  airBrake: 2.2,
  airLift: 1.6,
  armsWide: 0.75,
  armsIn: 0.3,
  /** The flame inside a hoop's ring (m). */
  flame: 0.12,
  shots: [
    {
      hoops: [
        { at: { x: 0, y: 2.4, z: 4.0 }, radius: 1.4 },
        { at: { x: 0, y: 3.1, z: 7.5 }, radius: 1.2 },
        { at: { x: 0, y: 2.6, z: 11.0 }, radius: 1.1 },
      ],
      net: { x: 0, y: 1.2, z: 13.6 },
      netHalfWidth: 2.2,
      netHalfHeight: 1.6,
      netWalk: 0,
      netSpeed: 0,
    },
    {
      hoops: [
        { at: { x: 0.6, y: 2.5, z: 4.0 }, radius: 1.2 },
        { at: { x: 1.2, y: 3.2, z: 7.8 }, radius: 1.0 },
        { at: { x: 1.7, y: 2.6, z: 11.6 }, radius: 0.95 },
      ],
      net: { x: 2.1, y: 1.2, z: 14.4 },
      netHalfWidth: 1.7,
      netHalfHeight: 1.3,
      netWalk: 0,
      netSpeed: 0,
    },
    {
      hoops: [
        { at: { x: -0.5, y: 2.5, z: 4.0 }, radius: 1.1 },
        { at: { x: -1.0, y: 3.2, z: 7.8 }, radius: 0.95 },
        { at: { x: -1.4, y: 2.6, z: 11.6 }, radius: 0.9 },
      ],
      net: { x: -1.8, y: 1.2, z: 14.4 },
      netHalfWidth: 1.4,
      netHalfHeight: 1.1,
      netWalk: 1.5,
      netSpeed: 0.8,
    },
  ] as readonly Shot[],
} as const;

/** The barrel's aim (degrees: yaw to the right, pitch up) from where the two hands' midpoint is against its rest (m). */
export function aimFromHands(midX: number, midY: number, restX: number, restY: number): { yaw: number; pitch: number } {
  const yaw = clamp((midX - restX) / CANNON.handTravel, -1, 1) * CANNON.yawRange;
  const pitch = CANNON.restPitch + clamp((midY - restY) / CANNON.handTravel, -1, 1) * CANNON.pitchRange;
  return { yaw, pitch };
}

/** The velocity out of the muzzle for an aim (m/s). */
export function muzzleVelocity(yaw: number, pitch: number, out: Point = { x: 0, y: 0, z: 0 }): Point {
  const flat = CANNON.speed * Math.cos(rad(pitch));
  out.x = flat * Math.sin(rad(yaw));
  out.y = CANNON.speed * Math.sin(rad(pitch));
  out.z = flat * Math.cos(rad(yaw));
  return out;
}

/** Where a body is, `t` seconds after leaving `from` at `velocity`, with nothing but gravity (the dotted arc drawn before the shot). */
export function arcAt(from: Point, velocity: Point, t: number, out: Point = { x: 0, y: 0, z: 0 }): Point {
  out.x = from.x + velocity.x * t;
  out.y = from.y + velocity.y * t - 0.5 * GRAVITY * t * t;
  out.z = from.z + velocity.z * t;
  return out;
}

/** One step of the flight itself: gravity, and what the arms do (their distance apart, m). */
export function stepFlight(at: Point, velocity: Point, armsApart: number, dt: number): void {
  const wide = clamp((armsApart - CANNON.armsIn) / (CANNON.armsWide - CANNON.armsIn), 0, 1) * 2 - 1;
  const flat = Math.hypot(velocity.x, velocity.z) || 1;
  const brake = CANNON.airBrake * wide;
  velocity.x -= (velocity.x / flat) * brake * dt;
  velocity.z -= (velocity.z / flat) * brake * dt;
  velocity.y += (CANNON.airLift * wide - GRAVITY) * dt;
  at.x += velocity.x * dt;
  at.y += velocity.y * dt;
  at.z += velocity.z * dt;
}

export type HoopPass = 'not yet' | 'through' | 'singed' | 'outside';

/** Did the step from `before` to `after` cross the hoop's plane, and where? `singed` is through the ring but in its flame. */
export function crossHoop(before: Point, after: Point, hoop: Hoop): HoopPass {
  if (!(before.z < hoop.at.z && after.z >= hoop.at.z)) return 'not yet';
  const k = (hoop.at.z - before.z) / (after.z - before.z);
  const off = Math.hypot(before.x + (after.x - before.x) * k - hoop.at.x, before.y + (after.y - before.y) * k - hoop.at.y);
  if (off <= hoop.radius - CANNON.flame) return 'through';
  return off <= hoop.radius + CANNON.flame ? 'singed' : 'outside';
}

/** Where the walked net's middle is, sideways, at a time (m): to and fro at a steady pace. */
export function netSide(shot: Shot, time: number): number {
  if (shot.netWalk <= 0 || shot.netSpeed <= 0) return shot.net.x;
  const lap = (4 * shot.netWalk) / shot.netSpeed;
  const p = ((time % lap) + lap) % lap / lap;
  const tri = p < 0.25 ? p * 4 : p < 0.75 ? 2 - p * 4 : p * 4 - 4;
  return shot.net.x + shot.netWalk * tri;
}

/** Crossing the net's plane: caught, or by how much it was missed (m; 0 when caught). `null` until the plane is crossed. */
export function reachNet(before: Point, after: Point, shot: Shot, netSideways: number): { caught: boolean; missedBy: number } | null {
  if (!(before.z < shot.net.z && after.z >= shot.net.z)) return null;
  const k = (shot.net.z - before.z) / (after.z - before.z);
  const dx = Math.abs(before.x + (after.x - before.x) * k - netSideways) - shot.netHalfWidth;
  const dy = Math.abs(before.y + (after.y - before.y) * k - shot.net.y) - shot.netHalfHeight;
  const missedBy = Math.hypot(Math.max(0, dx), Math.max(0, dy));
  return { caught: missedBy === 0, missedBy };
}

// ---------------------------------------------------------------------------
// Act 3: the flying trapeze
// ---------------------------------------------------------------------------

export interface Flight {
  /** From the flyer's pivot to the catcher's (m). */
  gap: number;
  /** The catcher's swing: how wide (radians). He times himself to the flyer: he is nearest her `lead` seconds after her swing tops out (s). */
  catcherSwing: number;
  lead: number;
  /** How near his hands a closing hand must be to be taken (m): his own reach toward her is in this. */
  grip: number;
  /** In the dark: only the catcher's lamp and the chalk on his hands show. */
  dark: boolean;
}

export const TRAPEZE = {
  /** Rope length from pivot to the bar, for both trapezes (m), and the pivots' heights (m): the catcher's is higher, because he hangs below his bar and the flyer sits above hers. */
  rope: 3.6,
  pivotHeight: 9.4,
  catcherPivotHeight: 11.2,
  /** The flyer's eye above the bar she sits on, and the catcher's hands below his bar, arms out (m). */
  eyeAboveBar: 0.7,
  catcherReach: 1.36,
  /** The swing never grows past this (radians), and dies down this fast by itself (1/s). */
  maxSwing: rad(48),
  damping: 0.05,
  /** What a well-timed pull or push adds (radians/s²). */
  pump: 0.9,
  /** Hands this fast count as a full pull or push (m/s). */
  pumpSpeed: 0.6,
  /** Hands held this far ahead of, or behind, where they rest count as a full lean (m). */
  pumpLean: 0.12,
  /** Letting go: the push off the bar, ahead and up (m/s). */
  leapAhead: 2.6,
  leapUp: 3.4,
  /** The hands reach this far ahead of the eye in flight (m). */
  armsAhead: 0.55,
  /** The big net under everything: its height (m). */
  netHeight: 1.3,
  flights: [
    { gap: 8.6, catcherSwing: rad(42), lead: 0.35, grip: 0.9, dark: false },
    { gap: 8.6, catcherSwing: rad(42), lead: 0.35, grip: 0.5, dark: false },
    { gap: 8.6, catcherSwing: rad(42), lead: 0.35, grip: 0.5, dark: true },
  ] as readonly Flight[],
} as const;

/** A swing: its angle from straight down (radians, ahead is positive) and how fast it is turning (radians/s). */
export interface Swing {
  angle: number;
  rate: number;
}

/** The swing's natural beat (s), for small swings. */
export const SWING_SECONDS = 2 * Math.PI * Math.sqrt(TRAPEZE.rope / GRAVITY);

/**
 * How well the hands are pumping, -1 to 1: pushing ahead while swinging
 * ahead, or pulling back while swinging back, feeds the swing (above 0);
 * the opposite takes from it.
 */
export function pumpFrom(handsAheadSpeed: number, swing: Swing): number {
  if (Math.abs(swing.rate) < 0.05) return 0;
  return clamp(handsAheadSpeed / TRAPEZE.pumpSpeed, -1, 1) * Math.sign(swing.rate);
}

/**
 * The same, from where the hands are held rather than how fast they move:
 * leaning into the swing (hands ahead of their rest while swinging ahead,
 * drawn back while swinging back) feeds it. `lead` is how far ahead of
 * their rest the hands are (m).
 */
export function pumpFromLean(lead: number, swing: Swing): number {
  if (Math.abs(swing.rate) < 0.05) return 0;
  return clamp(lead / TRAPEZE.pumpLean, -1, 1) * Math.sign(swing.rate);
}

/** One step of the flyer's swing. */
export function stepSwing(swing: Swing, pump: number, dt: number): void {
  const accel = -(GRAVITY / TRAPEZE.rope) * Math.sin(swing.angle) - TRAPEZE.damping * swing.rate + TRAPEZE.pump * clamp(pump, -1, 1) * Math.sign(swing.rate || 1);
  swing.rate += accel * dt;
  swing.angle += swing.rate * dt;
  if (Math.abs(swing.angle) > TRAPEZE.maxSwing) {
    swing.angle = Math.sign(swing.angle) * TRAPEZE.maxSwing;
    swing.rate = 0;
  }
}

/** Where the bar is for a swing angle, from a pivot at z = `pivotZ` (m). */
export function barAt(angle: number, pivotZ: number, out: Point = { x: 0, y: 0, z: 0 }): Point {
  out.x = 0;
  out.y = TRAPEZE.pivotHeight - TRAPEZE.rope * Math.cos(angle);
  out.z = pivotZ + TRAPEZE.rope * Math.sin(angle);
  return out;
}

/** How long a swing of this size takes from straight down to its top (s): a wide swing is a little slower than a small one. */
export function quarterBeat(size: number): number {
  return (SWING_SECONDS * (1 + (size * size) / 16 + (11 * size ** 4) / 3072)) / 4;
}

/**
 * The catcher's timing, set each time the flyer swings forward through
 * straight down (at `now`, with a swing of `size` radians): the phase that
 * brings him nearest her `lead` seconds after she tops out.
 */
export function catcherPhase(flight: Flight, now: number, size: number): number {
  const meet = now + quarterBeat(size) + flight.lead;
  return Math.PI - (2 * Math.PI * meet) / SWING_SECONDS;
}

/** The catcher's swing at a time, for a phase from catcherPhase(): toward the flyer when his angle is negative. */
export function catcherAngle(flight: Flight, time: number, phase: number): number {
  return flight.catcherSwing * Math.cos((2 * Math.PI * time) / SWING_SECONDS + phase);
}

/** Where the catcher's two hands are at a time (their midpoint; the scene puts the wrists 0.2 m to either side). */
export function catcherHands(flight: Flight, time: number, phase: number, out: Point = { x: 0, y: 0, z: 0 }): Point {
  const angle = catcherAngle(flight, time, phase);
  barAt(angle, flight.gap, out);
  out.y += TRAPEZE.catcherPivotHeight - TRAPEZE.pivotHeight;
  // He hangs by his knees: his arms reach on down the rope's line and a little toward the flyer.
  out.y -= TRAPEZE.catcherReach * Math.cos(angle);
  out.z += TRAPEZE.catcherReach * Math.sin(angle) - 0.25;
  return out;
}

/** Letting go of the ropes at a swing: where the eye is and how it is moving (the bar's own speed plus the push off it). */
export function letGo(swing: Swing, at: Point, velocity: Point): void {
  barAt(swing.angle, 0, at);
  at.y += TRAPEZE.eyeAboveBar;
  const speed = TRAPEZE.rope * swing.rate;
  velocity.x = 0;
  velocity.y = speed * Math.sin(swing.angle) + TRAPEZE.leapUp;
  velocity.z = speed * Math.cos(swing.angle) + TRAPEZE.leapAhead;
}

/** One step of the leap: gravity only (the arms do not steer here; the timing is the skill). */
export function stepLeap(at: Point, velocity: Point, dt: number): void {
  velocity.y -= GRAVITY * dt;
  at.x += velocity.x * dt;
  at.y += velocity.y * dt;
  at.z += velocity.z * dt;
}

/** Is a closing hand on the catcher's hands? (`hands`: the flyer's two hands' midpoint.) */
export function caught(hands: Point, catcher: Point, flight: Flight): boolean {
  return Math.hypot(hands.x - catcher.x, hands.y - catcher.y, hands.z - catcher.z) <= flight.grip;
}

/** Has the leap come down to the big net? */
export function inNet(at: Point): boolean {
  return at.y - TRAPEZE.eyeAboveBar <= TRAPEZE.netHeight;
}

// ---------------------------------------------------------------------------
// Shared: the fall, and the net that takes it
// ---------------------------------------------------------------------------

/** How far the eye has dropped `t` seconds into a fall of `height` m that takes `seconds` (eased like a real fall, slowed to the length asked). */
export function fallen(t: number, seconds: number, height: number): number {
  const k = clamp(t / seconds, 0, 1);
  return height * k * k;
}

/** The net's give under a body: how far it is pushed down (m, down is positive) and how fast. */
export interface Give {
  depth: number;
  rate: number;
}

export const NET = {
  /** The bounce's beat (cycles/s) and how quickly it dies (1 is no bounce at all). */
  beat: 1.1,
  dying: 0.25,
  /** The first push down, by how fast the body arrives (m per m/s), never more than `deepest` (m). */
  perSpeed: 0.07,
  deepest: 0.6,
} as const;

/** A body arriving at `speed` m/s starts the net's give. */
export function land(speed: number): Give {
  const w = 2 * Math.PI * NET.beat;
  return { depth: 0, rate: Math.min(NET.deepest, speed * NET.perSpeed) * w };
}

/** One step of the net's bounce: a spring that dies down. */
export function stepGive(give: Give, dt: number): void {
  const w = 2 * Math.PI * NET.beat;
  const accel = -w * w * give.depth - 2 * NET.dying * w * give.rate;
  give.rate += accel * dt;
  give.depth += give.rate * dt;
}
