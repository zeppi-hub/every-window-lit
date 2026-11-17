import { CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, PlaneGeometry, Quaternion, RepeatWrapping, SphereGeometry, Vector3 } from '@iwsdk/core';
import { lessMotion } from '../../comfort.js';
import { barAt, catcherAngle, catcherHands, catcherPhase, caught, type Give, inNet, land, letGo, type Point, pumpFromLean, stepGive, stepLeap, stepSwing, type Swing, TRAPEZE } from '../circus-acts.js';
import { setV2Targets } from '../step-targets.js';
import { netTexture } from './circus.js';
import { ALONG, type Hands, readHands, type ShowSet, standard } from './circus-show.js';
import type { DirectorSystem } from './director.js';
import { WEATHER, type Weather } from './stage.js';

/**
 * Act 3 of the circus memory: the flying trapeze. The player sits on her
 * trapeze with a rope in each hand, pumps the swing by pushing and pulling
 * (like rowing), and at the top of a forward swing lets go of both ropes:
 * she leaps toward the catcher, who hangs from his own trapeze and times
 * himself to her, and closes her hands on his. A miss ends in the big net
 * and the flight is tried again. The third flight is in the dark: only the
 * catcher's lamp and the chalk on his hands show. Caught or not, it ends
 * the show: missed, the ringmaster calls the net into the light under her.
 *
 * The camera is never turned by the game: the swing moves the seat along
 * its arc, upright. With less motion the swing is half as wide to the eye
 * and a leap is a short fade.
 */

/** The flyer's pivot in the tent (m); the flight goes toward +x, her right is +z. */
const PIVOT = new Vector3(-4.3, TRAPEZE.pivotHeight, -4.2);
/** The rope grips from the eye: to each side, down, ahead (m). */
const GRIPS = { side: 0.3, down: 0.12, ahead: 0.3 } as const;
const TAKE_REACH = 0.2;
/** Both hands open this long lets go of the ropes (s). */
const LET_GO = 0.12;
/** Letting go counts as a leap from this far up a forward swing (radians); lower, or swinging back, it is only a drop. */
const LEAP_FROM = 0.15;
/** The big net under both trapezes: its middle and size (m). */
const NET = { x: 0, z: -4.2, long: 18, wide: 8 } as const;
/** The tent in the dark of the third flight. */
const BLACK: Weather = { sky: 0x030203, fog: 0x050304, density: 0.03, light: 0.015 };
const DIM: Weather = { sky: 0x0a0506, fog: 0x140a0c, density: 0.028, light: 0.09 };

/** A place given in the flight's own frame (right, up, ahead of the flyer's pivot), out in the tent. */
function out(p: Point, into: Vector3): Vector3 {
  return into.set(PIVOT.x + p.z, p.y, PIVOT.z + p.x);
}

const yAxis = new Vector3(0, 1, 0);
const span = new Vector3();

/** Stretch a rod (a cylinder one metre tall, its foot at its origin) from one point to another. */
function stretch(rod: Object3D, from: Vector3, to: Vector3): void {
  span.copy(to).sub(from);
  const length = span.length();
  rod.position.copy(from);
  rod.scale.set(1, length, 1);
  if (length > 1e-5) rod.quaternion.setFromUnitVectors(yAxis, span.divideScalar(length));
}

function rod(radius: number, colour: number, rough = 0.8): Mesh {
  const geometry = new CylinderGeometry(radius, radius, 1, 8);
  geometry.translate(0, 0.5, 0);
  const mesh = new Mesh(geometry, standard(colour, rough));
  mesh.pointerEvents = 'none';
  return mesh;
}

/** A trapeze: two ropes from a beam overhead to a polished bar. */
function buildTrapeze(): { ropes: [Mesh, Mesh]; bar: Mesh } {
  const bar = new Mesh(new CylinderGeometry(0.02, 0.02, 0.9, 12), standard(0x6b4a2c, 0.35));
  bar.rotation.x = Math.PI / 2;
  bar.pointerEvents = 'none';
  return { ropes: [rod(0.012, 0xb9a57a), rod(0.012, 0xb9a57a)], bar };
}

/**
 * The catcher, hanging by his knees: a figure of simple solids in a red
 * leotard, built head down from the bar at his origin, his arms reaching on
 * down toward the flyer. His hands are chalked white and a small lamp hangs
 * at his bar, so he can be found in the dark.
 */
function buildCatcher(): { body: Group; hands: Mesh[]; lamp: Mesh } {
  const body = new Group();
  body.name = 'Catcher';
  const skin = standard(0xc99a7a, 0.6);
  const suit = standard(0x9c1b26, 0.55);
  const part = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
    mesh.position.set(x, y, z);
    body.add(mesh);
    return mesh;
  };
  // Shins over the bar, thighs down to the hips.
  for (const side of [-1, 1]) {
    const shin = part(new Mesh(new CylinderGeometry(0.045, 0.04, 0.42, 8), suit), 0.2, 0.06, side * 0.11);
    shin.rotation.z = Math.PI / 2.4;
    part(new Mesh(new CylinderGeometry(0.065, 0.055, 0.46, 8), suit), 0, -0.24, side * 0.11);
  }
  const trunk = part(new Mesh(new CylinderGeometry(0.15, 0.19, 0.56, 12), suit), 0, -0.76, 0);
  trunk.scale.z = 0.62;
  const shoulders = part(new Mesh(new SphereGeometry(0.2, 12, 8), suit), 0, -1.03, 0);
  shoulders.scale.set(0.6, 0.45, 1.05);
  part(new Mesh(new SphereGeometry(0.105, 12, 10), skin), 0, -1.22, 0);
  const hands: Mesh[] = [];
  for (const side of [-1, 1]) {
    // Upper arms and forearms reach on down and a little toward the flyer, wrists wrapped white.
    const upper = part(new Mesh(new CylinderGeometry(0.045, 0.04, 0.3, 8), skin), -0.06, -1.2, side * 0.21);
    upper.rotation.z = -0.35;
    const fore = part(new Mesh(new CylinderGeometry(0.038, 0.032, 0.28, 8), skin), -0.17, -1.42, side * 0.2);
    fore.rotation.z = -0.5;
    hands.push(part(new Mesh(new SphereGeometry(0.05, 10, 8), new MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.9, emissive: 0xf4f1ea, emissiveIntensity: 0.25 })), -0.25, -1.55, side * 0.2));
  }
  const lamp = part(new Mesh(new SphereGeometry(0.05, 10, 8), new MeshBasicMaterial({ color: 0xffc56a, fog: false })), 0, 0.12, 0);
  body.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return { body, hands, lamp };
}

/** Act 3: three flights. Resolves when the third has ended, in the catcher's hands or in the net. */
export async function trapezeAct(d: DirectorSystem, set: ShowSet, paused: () => boolean): Promise<void> {
  const mine = buildTrapeze();
  const his = buildTrapeze();
  const catcher = buildCatcher();
  for (const o of [...mine.ropes, mine.bar, ...his.ropes, his.bar, catcher.body]) set.add(o);
  // A mesh of a hand's width, repeated over the whole net (one tile a metre).
  const cords = netTexture('#f1e3c4', 5);
  cords.wrapS = cords.wrapT = RepeatWrapping;
  cords.repeat.set(NET.long, NET.wide);
  const net = set.add(new Mesh(new PlaneGeometry(NET.long, NET.wide), new MeshBasicMaterial({ map: cords, transparent: true, alphaTest: 0.3, side: DoubleSide, fog: false })));
  net.name = 'BigNet';
  net.rotation.x = -Math.PI / 2;
  net.position.set(NET.x, TRAPEZE.netHeight, NET.z);
  net.pointerEvents = 'none';
  const gripMarks = { left: new Group() as Object3D, right: new Group() as Object3D };
  gripMarks.left.name = 'RopeGrip left';
  gripMarks.right.name = 'RopeGrip right';
  set.add(gripMarks.left);
  set.add(gripMarks.right);
  if (set.net != null) set.net.visible = false;

  const hands: Hands = { left: new Vector3(), right: new Vector3(), pinching: { left: false, right: false } };
  const swing: Swing = { angle: 0, rate: 0 };
  const bar: Point = { x: 0, y: 0, z: 0 };
  const at: Point = { x: 0, y: 0, z: 0 };
  const velocity: Point = { x: 0, y: 0, z: 0 };
  const reach: Point = { x: 0, y: 0, z: 0 };
  const mid: Point = { x: 0, y: 0, z: 0 };
  const eye = new Vector3();
  const a = new Vector3();
  const b = new Vector3();
  const middle = new Vector3();
  const upright = new Quaternion();
  let clock = 0;
  let phase = 0;
  let top = 0.3;
  let peak = 0;
  let before = 0;
  let logAt = 0;
  // Dev: a skip ends the act. The director forgets its skips whenever a wait ends, so each wait is armed afresh.
  let skipped = false;
  const arm = (): void =>
    d.onSkip(() => {
      skipped = true;
    });
  d.sounds.bed('tent_crowd_loop', 0.4);

  /** Everything that hangs: both trapezes and the catcher, for the swing and the time now. */
  const hang = (n: number): void => {
    const flight = TRAPEZE.flights[n];
    barAt(swing.angle, 0, bar);
    out(bar, a);
    mine.bar.position.copy(a);
    for (const side of [-1, 1]) {
      stretch(mine.ropes[side < 0 ? 0 : 1], b.set(PIVOT.x, PIVOT.y, PIVOT.z + side * 0.42), middle.set(a.x, a.y, a.z + side * 0.42));
    }
    const angle = catcherAngle(flight, clock, phase);
    barAt(angle, flight.gap, reach);
    reach.y += TRAPEZE.catcherPivotHeight - TRAPEZE.pivotHeight;
    out(reach, a);
    his.bar.position.copy(a);
    for (const side of [-1, 1]) {
      stretch(his.ropes[side < 0 ? 0 : 1], b.set(PIVOT.x + flight.gap, TRAPEZE.catcherPivotHeight, PIVOT.z + side * 0.42), middle.set(a.x, a.y, a.z + side * 0.42));
    }
    catcher.body.position.copy(a);
    catcher.body.rotation.z = angle;
    // His hands as the rules have them (the figure's own hands follow the same line).
    catcherHands(flight, clock, phase, reach);
  };
  const seat = (): void => {
    const wide = lessMotion() ? 0.5 : 1;
    barAt(swing.angle * wide, 0, bar);
    out(bar, eye);
    eye.y += TRAPEZE.eyeAboveBar;
    d.rig.place(eye, ALONG);
    upright.identity();
    gripMarks.left.position.set(eye.x + GRIPS.ahead, eye.y - GRIPS.down, eye.z - GRIPS.side);
    gripMarks.right.position.set(eye.x + GRIPS.ahead, eye.y - GRIPS.down, eye.z + GRIPS.side);
  };

  for (let n = 0; n < TRAPEZE.flights.length && !skipped; n += 1) {
    const flight = TRAPEZE.flights[n];
    let done = false;
    let misses = 0;
    while (!done && !skipped) {
      // After three misses the catcher reaches further with every one more.
      const reachOut = { ...flight, grip: flight.grip * (1 + 0.5 * Math.max(0, misses - 2)) };
      swing.angle = -0.12;
      swing.rate = 0;
      top = 0.3;
      phase = catcherPhase(flight, clock, top);
      d.stage.setWeather(flight.dark ? BLACK : DIM);
      set.lamp.intensity = flight.dark ? 0 : 420;
      set.spot.visible = !flight.dark;
      net.visible = !flight.dark;
      if (flight.dark) d.sounds.bed('drum_roll_loop', 0.5);
      seat();
      hang(n);

      // Take a rope in each hand.
      setV2Targets([gripMarks.left, gripMarks.right]);
      let near = 0;
      const taking = d.each((delta) => {
        clock += delta;
        readHands(d, hands);
        const both = hands.pinching.left && hands.pinching.right && hands.left.distanceTo(gripMarks.left.position) < TAKE_REACH + 0.25 && hands.right.distanceTo(gripMarks.right.position) < TAKE_REACH + 0.25;
        near = both ? near + delta : 0;
        seat();
        hang(n);
        set.vignette.update(delta);
      });
      arm();
      await d.until(() => near >= 0.2 || skipped);
      taking();
      setV2Targets([]);
      if (skipped) break;
      d.sounds.play('grab_soft', 0.6);
      swing.rate = 0.35;

      // Swing and pump, until both hands let go.
      let open = 0;
      let leapt: 'leap' | 'drop' | null = null;
      const swinging = d.each((delta) => {
        if (paused() || leapt != null) return;
        clock += delta;
        readHands(d, hands);
        // Leaning into the swing: how far ahead of the grips' rest the hands are held, against the seat.
        const lead = (hands.left.x + hands.right.x) / 2 - eye.x - GRIPS.ahead;
        const turning = swing.rate;
        stepSwing(swing, pumpFromLean(lead, swing), delta);
        if (Math.sign(turning) !== Math.sign(swing.rate) && Math.abs(swing.angle) > 0.1) d.sounds.play('rope_creak', 0.35, 0.9 + Math.random() * 0.2);
        peak = Math.max(peak, Math.abs(swing.angle));
        if (before < 0 && swing.angle >= 0) {
          // Forward through straight down: the catcher sets himself to be there when she tops out.
          top = Math.max(0.2, peak);
          peak = 0;
          phase = catcherPhase(flight, clock, top);
        }
        before = swing.angle;
        open = !hands.pinching.left && !hands.pinching.right ? open + delta : 0;
        if (open >= LET_GO) leapt = swing.angle > LEAP_FROM && swing.rate > -0.4 ? 'leap' : 'drop';
        seat();
        hang(n);
        set.vignette.update(delta);
        if (import.meta.env.DEV && clock >= logAt) {
          logAt = clock + 0.1;
          console.info(`[circus] trapeze ${n + 1} swing ${swing.angle.toFixed(2)} rate ${swing.rate.toFixed(2)} top ${top.toFixed(2)} his ${catcherAngle(flight, clock, phase).toFixed(2)}`);
        }
      });
      arm();
      await d.until(() => leapt != null || skipped);
      swinging();
      if (skipped) break;

      // The leap: gravity only; close both hands on his to be caught; else down to the net.
      letGo(swing, at, velocity);
      if (leapt === 'drop') {
        velocity.z = 0;
        velocity.y = 0;
      }
      d.sounds.play('swing_whoosh', 0.8);
      d.sounds.bed('tent_crowd_loop', 0.08);
      if (!lessMotion()) set.vignette.set(0.7);
      let held = false;
      let down = false;
      let give: Give | null = null;
      let after = 0;
      let called = false;
      if (import.meta.env.DEV) console.info(`[circus] trapeze ${n + 1}: let go (${leapt}) at swing ${swing.angle.toFixed(2)}`);
      const leaping = d.each((delta) => {
        if (paused()) return;
        clock += delta;
        hang(n);
        readHands(d, hands);
        if (!held && !down) {
          stepLeap(at, velocity, delta);
          // Her hands, in the flight's own frame.
          mid.x = (hands.left.z + hands.right.z) / 2 - PIVOT.z;
          mid.y = (hands.left.y + hands.right.y) / 2;
          mid.z = (hands.left.x + hands.right.x) / 2 - PIVOT.x;
          if (leapt === 'leap' && hands.pinching.left && hands.pinching.right && caught(mid, reach, reachOut)) {
            held = true;
            d.sounds.play('catch_slap', 1);
            d.sounds.play('cheer', 0.9, 1, 0.15);
            if (import.meta.env.DEV) console.info(`[circus] trapeze ${n + 1}: caught`);
          } else if (inNet(at)) {
            down = true;
            give = land(Math.abs(velocity.y));
            d.sounds.play('net_twang', 1);
            if (import.meta.env.DEV) console.info(`[circus] trapeze ${n + 1}: in the net`);
          } else if (flight.dark && !called && velocity.y < -2.5) {
            // The third flight missed: the ringmaster calls the net into the light under her.
            called = true;
            net.visible = true;
            d.stage.setWeather(DIM);
            set.lamp.intensity = 420;
            set.lamp.target.position.set(PIVOT.x + at.z, TRAPEZE.netHeight, PIVOT.z);
            void d.captions.say('S06-2', a.set(PIVOT.x + at.z, TRAPEZE.netHeight + 1.2, PIVOT.z + 2), 0.3);
          }
        } else {
          after += delta;
          if (held) {
            // She swings on with him: her eye a little below and behind his hands.
            at.x = reach.x;
            at.y = reach.y - 0.1;
            at.z = reach.z - TRAPEZE.armsAhead;
          } else if (give != null) {
            stepGive(give, delta);
            at.y = TRAPEZE.netHeight + TRAPEZE.eyeAboveBar - give.depth;
          }
        }
        out(at, eye);
        if (!lessMotion() || held || down) d.rig.place(eye, ALONG);
        set.vignette.update(delta);
      });
      if (lessMotion()) await d.rig.fadeTo(1);
      arm();
      await d.until(() => ((held || down) && after >= 1.8) || skipped);
      if (lessMotion()) await d.rig.fadeTo(0);
      set.vignette.set(1);
      d.sounds.bed('drum_roll_loop', 0);
      d.sounds.bed('tent_crowd_loop', 0.4);
      // The third flight ends the show either way; the others are flown until caught.
      done = held || flight.dark;
      if (held || flight.dark) {
        d.stage.setWeather(DIM);
        set.lamp.intensity = 420;
        net.visible = true;
        d.sounds.play('cymbal_hit', 0.8);
        d.sounds.play('applause', 0.9, 1, 0.3);
      } else {
        misses += 1;
        d.sounds.play('crowd_gasp', 0.7);
      }
      arm();
      await d.wait(held ? 0.6 : 1.0);
      if (!(done && n === TRAPEZE.flights.length - 1)) {
        arm();
        await d.rig.fadeTo(1);
      }
      leaping();
      if (!(done && n === TRAPEZE.flights.length - 1)) void d.rig.fadeTo(0);
    }
  }
  d.stage.setWeather(DIM);
  set.spot.visible = true;
  for (const o of [...mine.ropes, mine.bar, ...his.ropes, his.bar, catcher.body]) o.visible = false;
  void WEATHER;
  if (import.meta.env.DEV) console.info('[circus] trapeze done');
}
