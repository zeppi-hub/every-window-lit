import { type Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import type { Actor } from './actors.js';
import type { Person } from './people.js';

/**
 * Someone calling a bird to their arm (S03): the arm held out for it
 * beckons, the other hand calls (cupped at the mouth, waved overhead, or
 * patting the arm held out), the weight goes from foot to foot and, looked
 * at, they lean in and call harder. All of it is laid over the held 'arm'
 * pose every frame, so the hand stays a place to land and the scene is told
 * where that hand is.
 */

/** What the free hand does while they call. */
export type CallStyle = 'cup' | 'wave' | 'pat';

export interface Calling {
  /** What the scene asks for (0..1 each); the body eases toward it. */
  readonly want: {
    /** Calling out (their turn, or looked at). */
    call: number;
    /** Leaning in toward the bird (looked at). */
    eager: number;
    /** Saying their line: the free hand on the chest, the head nodding. */
    speak: number;
    /** 1 moving, 0 still as the plain held pose (before the bird lands). */
    live: number;
  };
  /** The hand held out, after this frame's movement (world). */
  readonly hand: Vector3;
  /** The top of the head (world). */
  readonly head: Vector3;
  /** Back to the plain held pose, and no more movement. */
  stop(): void;
}

const UP = new Vector3(0, 1, 0);
const ARMS = ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'] as const;

const parentTurn = new Quaternion();
const turnBy = new Quaternion();
const turned = new Quaternion();
const keepUpper = new Quaternion();
const keepFore = new Quaternion();
const solved = new Quaternion();
const shoulderAt = new Vector3();
const elbowAt = new Vector3();
const wristAt = new Vector3();
const toTarget = new Vector3();
const bend = new Vector3();
const from = new Vector3();
const to = new Vector3();
const left = new Vector3();
const front = new Vector3();
const out = new Vector3();
const axis = new Vector3();
const target = new Vector3();
const chest = new Vector3();
const pole = new Vector3();
const scale = new Vector3();
const offset = new Vector3();
const a = new Vector3();
const b = new Vector3();

const smooth = (k: number) => k * k * (3 - 2 * k);
const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));
const ease = (delta: number, rate: number) => 1 - Math.exp(-delta * rate);

/** Turn a bone by `angle` about an axis given in the world, over whatever pose it is in. */
function turn(bone: Object3D | undefined, about: Vector3, angle: number): void {
  if (bone?.parent == null || angle === 0) return;
  bone.parent.getWorldQuaternion(parentTurn);
  turnBy.setFromAxisAngle(about, angle);
  turned.copy(parentTurn).invert().multiply(turnBy).multiply(parentTurn).multiply(bone.quaternion);
  bone.quaternion.copy(turned);
}

/** Turn a bone so that what pointed along `was` (world, unit) points along `will`. */
function swing(bone: Object3D, was: Vector3, will: Vector3): void {
  if (bone.parent == null) return;
  bone.parent.getWorldQuaternion(parentTurn);
  turnBy.setFromUnitVectors(was, will);
  turned.copy(parentTurn).invert().multiply(turnBy).multiply(parentTurn).multiply(bone.quaternion);
  bone.quaternion.copy(turned);
}

/**
 * Bring a wrist to `goal` (world) by turning the upper arm and the forearm,
 * the elbow kept toward `elbowSide`; `weight` blends from the pose the arm
 * was in (0) to the wrist on the goal (1). A goal out of reach is reached
 * for with a straight arm.
 */
function reach(upper: Object3D | undefined, fore: Object3D | undefined, wrist: Object3D | undefined, goal: Vector3, elbowSide: Vector3, weight: number): void {
  if (upper == null || fore == null || wrist == null || weight < 0.002) return;
  keepUpper.copy(upper.quaternion);
  keepFore.copy(fore.quaternion);
  upper.getWorldPosition(shoulderAt);
  fore.getWorldPosition(elbowAt);
  wrist.getWorldPosition(wristAt);
  const upperLength = shoulderAt.distanceTo(elbowAt);
  const foreLength = elbowAt.distanceTo(wristAt);
  if (upperLength < 1e-4 || foreLength < 1e-4) return;
  toTarget.copy(goal).sub(shoulderAt);
  const far = clamp(toTarget.length(), Math.abs(upperLength - foreLength) + 0.01, upperLength + foreLength - 0.004);
  toTarget.normalize();
  // The elbow: on the circle both bones allow, on the side asked for.
  const along = (upperLength * upperLength + far * far - foreLength * foreLength) / (2 * far);
  const aside = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
  bend.copy(elbowSide).addScaledVector(toTarget, -elbowSide.dot(toTarget));
  if (bend.lengthSq() < 1e-6) bend.set(0, -1, 0).addScaledVector(toTarget, toTarget.y);
  bend.normalize();
  from.copy(elbowAt).sub(shoulderAt).normalize();
  to.copy(toTarget).multiplyScalar(along).addScaledVector(bend, aside).normalize();
  swing(upper, from, to);
  fore.getWorldPosition(elbowAt);
  wrist.getWorldPosition(wristAt);
  from.copy(wristAt).sub(elbowAt).normalize();
  to.copy(toTarget).multiplyScalar(far).add(shoulderAt).sub(elbowAt).normalize();
  swing(fore, from, to);
  if (weight < 0.998) {
    solved.copy(upper.quaternion);
    upper.quaternion.copy(keepUpper).slerp(solved, weight);
    solved.copy(fore.quaternion);
    fore.quaternion.copy(keepFore).slerp(solved, weight);
  }
}

/**
 * Have a realistic person call the bird over their held-out arm. `landing`
 * is where that hand is now (person.hand()), to tell which arm it is.
 * A stylized stand-in has no bones: null, and it keeps its plain pose.
 */
export function makeCalling(person: Person, style: CallStyle, phase: number, landing: Vector3): Calling | null {
  const actor = person as Partial<Actor> & Person;
  if (!('adjust' in actor)) return null;
  const want = { call: 0, eager: 0, speak: 0, live: 1 };
  const hand = landing.clone();
  const head = person.head(new Vector3());
  let rest: { bone: Object3D; turn: Quaternion }[] | null = null;
  let held: 'Left' | 'Right' = 'Right';
  let call = 0;
  let eager = 0;
  let speak = 0;
  let live = 1;
  let slow = phase * 7;
  let beat = phase * 5;
  let hello = phase * 3;

  const adjust = (bones: ReadonlyMap<string, Object3D>, delta: number): void => {
    // Only over the arm held out: any other pose is the clip's own.
    if (person.pose !== 'arm') return;
    if (rest == null) {
      rest = [];
      for (const name of ARMS) {
        const bone = bones.get(name);
        if (bone != null) rest.push({ bone, turn: bone.quaternion.clone() });
      }
      // `hand` is still where the scene found the hand held out.
      const l = bones.get('LeftHand')?.getWorldPosition(a).distanceTo(hand) ?? Infinity;
      const r = bones.get('RightHand')?.getWorldPosition(b).distanceTo(hand) ?? Infinity;
      held = l < r ? 'Left' : 'Right';
    } else {
      // The held pose is not played, so nothing puts the arms back but this.
      for (const r of rest) r.bone.quaternion.copy(r.turn);
    }
    call += (want.call - call) * ease(delta, 5);
    eager += (want.eager - eager) * ease(delta, 3.5);
    speak += (want.speak - speak) * ease(delta, 4);
    live += (want.live - live) * ease(delta, 7);
    slow += delta;
    beat += delta * Math.PI * 2 * (1.05 + 0.75 * call + 0.6 * eager);
    hello += delta * Math.PI * 2 * 2.1;

    const free = held === 'Left' ? 'Right' : 'Left';
    // Their own left and front, on the ground; `out` is away from the body on the free arm's side.
    left.set(Math.cos(person.yaw), 0, -Math.sin(person.yaw));
    front.set(Math.sin(person.yaw), 0, Math.cos(person.yaw));
    out.copy(left).multiplyScalar(free === 'Left' ? 1 : -1);
    const size = person.size;

    // The weight from one foot to the other: the hips go across, the legs lean back under them, the back stays upright.
    const hips = bones.get('Hips');
    const across = Math.sin(slow * 0.85 + phase * 6.3) * 0.042 * size * live * (1 - 0.45 * eager);
    if (hips?.parent != null) {
      hips.parent.getWorldQuaternion(parentTurn).invert();
      hips.parent.getWorldScale(scale);
      // Positive is toward their right.
      offset.copy(left).multiplyScalar(-across / Math.max(1e-4, scale.x)).applyQuaternion(parentTurn);
      hips.position.add(offset);
      const lean = across / (0.88 * size);
      turn(bones.get('LeftUpLeg'), front, lean);
      turn(bones.get('RightUpLeg'), front, lean);
      turn(bones.get('LowerBack'), front, -lean * 0.8);
    }

    // Leaning in when looked at, a little with every call; breath in the chest.
    const pulse = 0.5 - 0.5 * Math.cos(beat);
    turn(bones.get('LowerBack'), left, (0.13 * eager + 0.03 * call * pulse) * live);
    turn(bones.get('Spine1'), left, (0.09 * eager - Math.sin(slow * 1.6) * 0.012) * live);
    // The head stays up on the bird; a nod with their words.
    turn(bones.get('Head'), left, (-0.1 * eager + Math.sin(slow * 5.2) * 0.05 * speak) * live);

    // The arm held out beckons: the forearm and the hand curl up and back, the whole arm drifts a little.
    const upper = bones.get(`${held}Arm`);
    const fore = bones.get(`${held}ForeArm`);
    const wrist = bones.get(`${held}Hand`);
    if (upper != null && fore != null && wrist != null) {
      turn(upper, UP, Math.sin(slow * 1.3 + phase * 4) * 0.045 * live);
      fore.getWorldPosition(elbowAt);
      wrist.getWorldPosition(wristAt);
      from.copy(wristAt).sub(elbowAt).normalize();
      axis.copy(from).cross(UP);
      if (axis.lengthSq() > 1e-4) {
        axis.normalize();
        const curl = (0.07 + 0.28 * call + 0.18 * eager) * pulse * live;
        turn(upper, axis, 0.07 * eager * live);
        turn(fore, axis, curl);
        turn(wrist, axis, curl * 1.3);
      }
    }

    // The free hand: at the mouth, waving overhead or patting the arm held out; on the chest while they speak.
    const freeUpper = bones.get(`${free}Arm`);
    const freeFore = bones.get(`${free}ForeArm`);
    const freeWrist = bones.get(`${free}Hand`);
    const skull = bones.get('Head');
    if (freeUpper != null && freeFore != null && freeWrist != null && skull != null) {
      if (style === 'cup') {
        // The wrist below and beside the mouth, so the hand comes up to the cheek.
        skull.getWorldPosition(target).addScaledVector(front, 0.1 * size).addScaledVector(out, 0.09 * size).addScaledVector(UP, -0.11 * size);
      } else if (style === 'wave') {
        freeUpper.getWorldPosition(target).addScaledVector(UP, 0.4 * size).addScaledVector(out, (0.2 + 0.13 * Math.sin(hello)) * size).addScaledVector(front, 0.12 * size);
      } else {
        // Patting the forearm of the arm held out: "here".
        (fore ?? freeUpper).getWorldPosition(a);
        (wrist ?? freeUpper).getWorldPosition(b);
        target.copy(a).lerp(b, 0.4).addScaledVector(UP, (0.06 + 0.05 * Math.abs(Math.sin(hello * 0.75))) * size);
      }
      const spine = bones.get('Spine1') ?? skull;
      spine.getWorldPosition(chest).addScaledVector(front, 0.17 * size).addScaledVector(UP, 0.1 * size).addScaledVector(out, 0.03 * size);
      target.lerp(chest, smooth(clamp(speak, 0, 1)));
      pole.copy(UP).multiplyScalar(-1).addScaledVector(out, 0.8).addScaledVector(front, -0.3);
      reach(freeUpper, freeFore, freeWrist, target, pole, smooth(clamp(Math.max(call, speak), 0, 1)) * live);
    }

    wrist?.getWorldPosition(hand);
    if (skull != null) {
      skull.getWorldPosition(head);
      head.y += 0.14 * size;
    }
  };
  actor.adjust = adjust;

  return {
    want,
    hand,
    head,
    stop: () => {
      if (rest != null) for (const r of rest) r.bone.quaternion.copy(r.turn);
      if (actor.adjust === adjust) actor.adjust = null;
    },
  };
}
