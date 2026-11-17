import { AdditiveBlending, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from '@iwsdk/core';
import { lessMotion } from '../../comfort.js';
import { aimFromHands, arcAt, CANNON, crossHoop, type Give, land, muzzleVelocity, netSide, type Point, reachNet, type Shot, stepFlight, stepGive } from '../circus-acts.js';
import { setDeskMode } from '../desk-hands.js';
import { setV2Targets } from '../step-targets.js';
import { netTexture } from './circus.js';
import { ALONG, buildHoop, type FireHoop, flicker, type Hands, readHands, type ShowSet, standard } from './circus-show.js';
import type { DirectorSystem } from './director.js';

/**
 * Act 2 of the circus memory: the human cannonball. The player sits in the
 * mouth of the cannon, turns the barrel with its two brass handles (a dotted
 * arc shows where she would fly), and lets go of both when ready: the fuse
 * burns three seconds, the cannon fires, and she flies through three hoops
 * of fire into a net across the tent, steering a little with her arms.
 * Three shots, each farther and narrower; the last net is walked to and fro.
 * A shot that misses the net, or goes outside a hoop, is flown again.
 *
 * The camera is never turned by the game. With less motion, the flight is a
 * short fade and the player is where she landed.
 */

/** The muzzle in the tent (m); the flight goes toward +x, the flyer's right is +z. */
const MUZZLE = new Vector3(-6.6, 2.1, 5.2);
/** The eye, seated in the mouth: a little above and behind the rim (m). */
const SEAT = new Vector3(-0.15, 0.45, 0);
/** The handles' middle from the eye: ahead and down; and each handle to its side (m). */
const HANDLES = { ahead: 0.38, down: 0.3, apart: 0.25 } as const;
/** A hand this near its handle, pinching, holds it (m). */
const HOLD_REACH = 0.2;
/** Both hands open this long lets go (s); and how long the handles must have been held first. */
const LET_GO = 0.15;
const HELD_FIRST = 0.6;
/** The dotted arc: how many dots, and the time between them (s). */
const DOTS = 30;
const DOT_SECONDS = 0.06;
/** After this many flights of one shot that did not count, the hoops stop counting for it. */
const MERCY = 3;

/** A place given in the flight's own frame (right, up, ahead of the muzzle), out in the tent. */
function out(p: Point, into: Vector3): Vector3 {
  return into.set(MUZZLE.x + p.z, MUZZLE.y + p.y, MUZZLE.z + p.x);
}

/** The cannon: a red barrel banded in gold on a carriage with two big wheels; its barrel turns about the muzzle. */
function buildCannon(): { cannon: Group; barrel: Group; handles: { left: Mesh; right: Mesh } } {
  const cannon = new Group();
  cannon.name = 'Cannon';
  const barrel = new Group();
  barrel.name = 'CannonBarrel';
  const tube = new Mesh(new CylinderGeometry(0.46, 0.54, 2.6, 28, 1, true), standard(0x9c1b26, 0.45, 0.3));
  tube.rotation.z = Math.PI / 2;
  tube.position.x = -1.3;
  (tube.material as { side: number }).side = DoubleSide;
  barrel.add(tube);
  for (const x of [0, -0.85, -1.75, -2.55]) {
    const band = new Mesh(new TorusGeometry(x === 0 ? 0.47 : 0.5 + (-x / 2.6) * 0.06, 0.035, 10, 36), standard(0xd9a441, 0.3, 0.9));
    band.rotation.y = Math.PI / 2;
    band.position.x = x;
    barrel.add(band);
  }
  const handles = { left: new Mesh(new TorusGeometry(0.06, 0.012, 8, 20, Math.PI), standard(0xe2b54c, 0.25, 0.95)), right: new Mesh(new TorusGeometry(0.06, 0.012, 8, 20, Math.PI), standard(0xe2b54c, 0.25, 0.95)) };
  handles.left.name = 'CannonHandle left';
  handles.right.name = 'CannonHandle right';
  barrel.add(handles.left, handles.right);
  cannon.add(barrel);
  for (const side of [-1, 1]) {
    const wheel = new Mesh(new TorusGeometry(0.72, 0.06, 10, 32), standard(0x3a2418, 0.7));
    wheel.position.set(-1.6, -1.35, side * 0.78);
    cannon.add(wheel);
    for (let k = 0; k < 6; k += 1) {
      const spoke = new Mesh(new CylinderGeometry(0.025, 0.025, 1.4, 6), standard(0x3a2418, 0.7));
      spoke.position.copy(wheel.position);
      spoke.rotation.z = (k * Math.PI) / 6;
      cannon.add(spoke);
    }
  }
  const carriage = new Mesh(new CylinderGeometry(0.2, 0.2, 1.7, 10), standard(0x2c1c14, 0.8));
  carriage.rotation.x = Math.PI / 2;
  carriage.position.set(-1.6, -1.35, 0);
  cannon.add(carriage);
  cannon.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return { cannon, barrel, handles };
}

/** Act 2: three shots. Resolves when the third has landed in its net. */
export async function cannonAct(d: DirectorSystem, set: ShowSet, paused: () => boolean): Promise<void> {
  const { cannon, barrel, handles } = buildCannon();
  cannon.position.copy(MUZZLE);
  set.add(cannon);
  // The net across the far end, between two poles; the dotted arc; the three hoops; a flash for the shot.
  const net = set.add(new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: netTexture('#f1e3c4', 16), transparent: true, alphaTest: 0.3, side: DoubleSide, fog: false })));
  net.name = 'CannonNet';
  net.rotation.y = -Math.PI / 2;
  net.pointerEvents = 'none';
  const poles = [0, 1].map(() => {
    const pole = set.add(new Mesh(new CylinderGeometry(0.05, 0.05, 1, 8), standard(0x8a7a66, 0.6, 0.4)));
    pole.pointerEvents = 'none';
    return pole;
  });
  const dots = set.add(new InstancedMesh(new SphereGeometry(0.035, 8, 6), new MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, fog: false }), DOTS));
  dots.name = 'CannonArc';
  dots.frustumCulled = false;
  dots.pointerEvents = 'none';
  const hoops: FireHoop[] = [0, 1, 2].map(() => {
    const hoop = buildHoop(1, set.flame);
    set.add(hoop.group);
    return hoop;
  });
  const flash = new Mesh(new SphereGeometry(0.28, 12, 8), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, side: DoubleSide }));
  flash.renderOrder = 9300;
  flash.pointerEvents = 'none';
  d.player.head.add(flash);

  const hands: Hands = { left: new Vector3(), right: new Vector3(), pinching: { left: false, right: false } };
  const eye = MUZZLE.clone().add(SEAT);
  const rest = eye.clone().add(new Vector3(HANDLES.ahead, -HANDLES.down, 0));
  const toEye = new Quaternion();
  const place = new Vector3();
  const m = new Matrix4();
  const size = new Vector3();
  const still = new Quaternion();
  const at: Point = { x: 0, y: 0, z: 0 };
  const before: Point = { x: 0, y: 0, z: 0 };
  const velocity: Point = { x: 0, y: 0, z: 0 };
  const dot: Point = { x: 0, y: 0, z: 0 };
  let clock = 0;
  let yaw = 0;
  let pitch: number = CANNON.restPitch;
  // Dev: a skip ends the act. The director forgets its skips whenever a wait ends, so each wait is armed afresh.
  let skipped = false;
  const arm = (): void =>
    d.onSkip(() => {
      skipped = true;
    });
  d.sounds.bed('tent_crowd_loop', 0.4);

  const layOut = (shot: Shot): void => {
    shot.hoops.forEach((h, n) => {
      hoops[n].radius = h.radius;
      // The hoop's iron and glow were made at radius 1: scale them, and let the flames follow the radius.
      hoops[n].group.children[0].scale.setScalar(h.radius);
      hoops[n].group.children[1].scale.setScalar(h.radius);
      out(h.at, hoops[n].group.position);
      hoops[n].lit = 1;
    });
    net.scale.set(shot.netHalfWidth * 2, shot.netHalfHeight * 2, 1);
  };
  const aimBarrel = (): void => {
    barrel.rotation.set(0, (-yaw * Math.PI) / 180, (pitch * Math.PI) / 180);
    // The handles ride the rim, where the hands rest.
    handles.left.position.set(HANDLES.ahead - 0.15, -HANDLES.down + 0.45, -HANDLES.apart);
    handles.right.position.set(HANDLES.ahead - 0.15, -HANDLES.down + 0.45, HANDLES.apart);
  };
  const frame = (delta: number, shot: Shot): void => {
    clock += delta;
    d.player.head.getWorldQuaternion(toEye);
    for (const hoop of hoops) flicker(hoop, clock, toEye);
    const side = netSide(shot, clock);
    out({ x: side, y: shot.net.y, z: shot.net.z }, net.position);
    poles.forEach((pole, k) => {
      const z = net.position.z + (k === 0 ? -1 : 1) * (shot.netHalfWidth + 0.05);
      const top = net.position.y + shot.netHalfHeight + 0.2;
      pole.scale.y = top;
      pole.position.set(net.position.x, top / 2, z);
    });
    set.vignette.update(delta);
    const f = flash.material as MeshBasicMaterial;
    f.opacity = Math.max(0, f.opacity - delta * 3.5);
    flash.visible = f.opacity > 0.01;
  };
  /** Draw the arc for the aim; true when a shot let go of now would end in the net (the fuse's seconds counted). */
  const drawArc = (shot: Shot): boolean => {
    muzzleVelocity(yaw, pitch, velocity);
    let shown = 0;
    let caught = false;
    let ended = false;
    before.x = before.y = before.z = 0;
    for (let k = 1; k <= DOTS; k += 1) {
      arcAt({ x: 0, y: 0, z: 0 }, velocity, k * DOT_SECONDS, dot);
      if (!ended) {
        const hit = reachNet(before, dot, shot, netSide(shot, clock + CANNON.fuse + k * DOT_SECONDS));
        if (hit != null) {
          ended = true;
          caught = hit.caught;
        }
      }
      before.x = dot.x;
      before.y = dot.y;
      before.z = dot.z;
      if (ended && !caught && dot.z > shot.net.z + 1) break;
      size.setScalar(ended && caught ? 2.2 : 1);
      m.compose(out(dot, place), still, size);
      dots.setMatrixAt(shown, m);
      shown += 1;
      if (ended && caught) break;
    }
    dots.count = shown;
    dots.instanceMatrix.needsUpdate = true;
    return caught;
  };

  for (let n = 0; n < CANNON.shots.length && !skipped; n += 1) {
    const shot = CANNON.shots[n];
    let tries = 0;
    let landed = false;
    layOut(shot);
    while (!landed && !skipped) {
      // Aiming: the handles turn the barrel while both are held; both let go lights the fuse.
      d.rig.place(eye, ALONG);
      setDeskMode('handles');
      dots.visible = true;
      setV2Targets([handles.left, handles.right]);
      let held = 0;
      let open = 0;
      let chimed = false;
      let fuse = 0;
      let lit = false;
      const aiming = d.each((delta) => {
        if (paused()) return;
        frame(delta, shot);
        readHands(d, hands);
        const both = hands.pinching.left && hands.pinching.right && hands.left.distanceTo(hands.right) < 1.1 && place.copy(hands.left).add(hands.right).multiplyScalar(0.5).distanceTo(rest) < HOLD_REACH + CANNON.handTravel * 1.6;
        if (!lit) {
          if (both) {
            held += delta;
            open = 0;
            if (held > 0.2) setV2Targets([]);
            const aim = aimFromHands(place.z, place.y, rest.z, rest.y);
            yaw += (aim.yaw - yaw) * Math.min(1, delta * 8);
            pitch += (aim.pitch - pitch) * Math.min(1, delta * 8);
          } else if (!hands.pinching.left && !hands.pinching.right) open += delta;
          aimBarrel();
          const good = drawArc(shot);
          if (good && !chimed) d.sounds.play('ear_click', 0.5);
          chimed = good;
          if (held >= HELD_FIRST && open >= LET_GO) {
            lit = true;
            fuse = CANNON.fuse;
            d.sounds.play('fuse_burn', 0.9);
            d.sounds.bed('drum_roll_loop', 0.6);
            if (import.meta.env.DEV) console.info(`[circus] cannon shot ${n + 1}: fuse lit, yaw ${yaw.toFixed(1)} pitch ${pitch.toFixed(1)}, arc ${good ? 'in the net' : 'off the net'}`);
          }
        } else fuse -= delta;
      });
      arm();
      await d.until(() => (lit && fuse <= 0) || skipped);
      aiming();
      setV2Targets([]);
      if (skipped) break;

      // The shot.
      dots.visible = false;
      d.sounds.bed('drum_roll_loop', 0);
      d.sounds.play('cannon_boom', 1);
      (flash.material as MeshBasicMaterial).opacity = 1;
      setDeskMode('arms');
      at.x = at.y = at.z = 0;
      muzzleVelocity(yaw, pitch, velocity);
      let passed = 0;
      let outside = false;
      let result: { caught: boolean; missedBy: number } | null = null;
      let after = 0;
      let give: Give | null = null;
      if (lessMotion()) await d.rig.fadeTo(1);
      else set.vignette.set(0.72);
      const flying = d.each((delta) => {
        if (paused()) return;
        frame(delta, shot);
        if (result == null) {
          const step = lessMotion() ? 1 / 30 : delta;
          before.x = at.x;
          before.y = at.y;
          before.z = at.z;
          readHands(d, hands);
          stepFlight(at, velocity, hands.left.distanceTo(hands.right), step);
          for (const h of shot.hoops) {
            const pass = crossHoop(before, at, h);
            if (pass === 'not yet') continue;
            if (pass === 'outside') {
              outside = true;
              d.sounds.play('crowd_gasp', 0.7);
            } else {
              passed += 1;
              d.sounds.play(pass === 'through' ? 'swing_whoosh' : 'crowd_gasp', 0.7);
            }
            if (import.meta.env.DEV) console.info(`[circus] cannon hoop: ${pass}`);
          }
          result = reachNet(before, at, shot, netSide(shot, clock));
          if (result?.caught === true) give = land(Math.hypot(velocity.x, velocity.y, velocity.z));
          if (result != null && import.meta.env.DEV) console.info(`[circus] cannon shot ${n + 1}: ${result.caught ? 'in the net' : `missed the net by ${result.missedBy.toFixed(2)}`}, hoops ${passed}/3${outside ? ', one outside' : ''}`);
        } else {
          after += delta;
          if (give != null) {
            // The net takes her and gives along the flight.
            stepGive(give, delta);
            at.z = shot.net.z - 0.3 + give.depth * 0.6;
          } else {
            at.x += velocity.x * delta;
            at.y += velocity.y * delta;
            at.z += velocity.z * delta;
          }
        }
        out(at, place).add(SEAT);
        if (!lessMotion() || result != null) d.rig.place(place, ALONG);
      });
      arm();
      await d.until(() => (result != null && after >= (result.caught ? 1.6 : 0.35)) || skipped);
      const counted = result != null && (result as { caught: boolean }).caught && (tries >= MERCY || (!outside && passed === 3));
      if (result != null && (result as { caught: boolean }).caught) {
        d.sounds.play('net_twang', 1);
        d.sounds.play(counted ? 'cheer' : 'crowd_gasp', 0.8);
        if (counted) d.sounds.play('cymbal_hit', 0.7);
      }
      set.vignette.set(1);
      arm();
      await d.rig.fadeTo(1);
      flying();
      d.rig.place(eye, ALONG);
      landed = counted;
      tries += 1;
      if (!landed || n < CANNON.shots.length - 1) await d.rig.fadeTo(0);
    }
  }
  setDeskMode('one');
  flash.removeFromParent();
  cannon.visible = false;
  net.visible = false;
  dots.visible = false;
  for (const pole of poles) pole.visible = false;
  for (const hoop of hoops) hoop.group.visible = false;
  if (import.meta.env.DEV) console.info('[circus] cannon done');
}
