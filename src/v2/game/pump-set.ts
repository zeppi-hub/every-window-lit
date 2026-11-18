import { BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, Points, PointsMaterial, Quaternion, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3 } from '@iwsdk/core';
import { createHint, PINCH_AT } from '../../station/hint.js';
import { flowOf, newPump, pour, PUMP, type Pump, type PumpStep, stepPump } from '../pump-rules.js';
import type { Hands } from './circus-show.js';
import type { DirectorSystem } from './director.js';
import { mergeByMaterial } from './fx.js';
import { contactShadow, mergeStill, type RunningWater, runningWater, woodMaterial } from './pump-looks.js';

/**
 * A hand pump built for a seated player (the drought farm's, and the old
 * one on the square): a cast-iron body with an open cup on top, and a
 * two-armed lever whose wooden bar lies across the chest, taken in both
 * hands and worked up and down. A jug stands in reach; held over the cup it
 * tips and pours, and only then do strokes make pressure. A brass gauge
 * shows the pressure, and the water from the spout is as thick as the
 * pressure is high. The rules are pump-rules.ts; this draws them and reads
 * the hands.
 *
 * Its group sits on the floor under the player's eye and faces as they do:
 * local -z is ahead, +x the right, y up from the floor.
 */

/** Where things are from the seated eye (m). */
const BODY_AHEAD = 0.58;
const CUP_BELOW = 0.33;
const PIVOT_AHEAD = 0.86;
const PIVOT_BELOW = 0.3;
const ARM = 0.47;
/** The bar's swing about its pivot (radians above level): up, and down where it rests. */
const UP = 0.49;
const DOWN = -0.52;
const BAR_HALF = 0.31;
/** A pinch this near the bar takes it; a hand that has it keeps it while it stays this near the bar's line, seen from above (m). */
const TAKE = 0.15;
const KEEP = 0.34;
/** A pinch this near the jug's middle takes it; over the cup within this of its axis, it pours (m). */
const JUG_TAKE = 0.17;
const POUR_WITHIN = 0.24;
const JUG_GRIP = 0.12;
/** The relief valve by the gauge: from the eye's ground point (the side's sign on x), and how near a hand shuts it (m). */
const VALVE = { x: 0.36, below: 0.2, ahead: 0.47, reach: 0.09 } as const;
/** Puffs in the valve's spray. */
const SPRAY = 36;

/** A soft white puff: opaque at its middle, clear at its rim. */
function softPuff(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g != null) {
    const r = g.createRadialGradient(32, 32, 1, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,0.95)');
    r.addColorStop(0.4, 'rgba(235,244,250,0.5)');
    r.addColorStop(1, 'rgba(235,244,250,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(canvas);
}

/** How long nothing is taken before the ghost hands show what to do (s). */
const SHOW_AFTER = 1.6;
/** The gauge's needle: this far either side of straight up for 0 and 1 (radians). */
const NEEDLE_SWEEP = (135 * Math.PI) / 180;

export interface PumpLook {
  iron: number;
  /** Roughness and metalness of the iron (a kept pump, a rusted one). */
  rough: number;
  metal: number;
  wood: number;
  water: number;
  /** How much the water glows by itself (the treasury's gold does). */
  glow: number;
  /** What the jug stands on. */
  stand: number;
  /** A stone slab under the pump this high (m), or 0. */
  plinth: number;
  /** The jug's place from the eye's ground point: right, ahead (m). */
  jug: { x: number; z: number };
  /** Which side the spout and the gauge are on: 1 the right, -1 the left. */
  side: 1 | -1;
  /** How many stages the work has: that many small lamps stand over the gauge, one lit for each stage done. */
  lamps: number;
}

export type Side = 'left' | 'right';
const SIDES: readonly Side[] = ['left', 'right'];
const UP_AXIS = new Vector3(0, 1, 0);

/** Lay a unit cylinder (made along +y, 1 long) from `a` to `b`, `radius` thick. */
export function between(mesh: Object3D, a: Vector3, b: Vector3, radius: number): void {
  const dir = tmpA.copy(b).sub(a);
  const length = dir.length();
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.scale.set(radius, Math.max(1e-4, length), radius);
  if (length > 1e-6) mesh.quaternion.setFromUnitVectors(UP_AXIS, dir.multiplyScalar(1 / length));
}
const tmpA = new Vector3();

/** The gauge's face: cream, ticks, a red stretch where no water comes, a green one from the stage's mark up, and the mark itself. */
function drawDial(canvas: HTMLCanvasElement, mark: number): void {
  const g = canvas.getContext('2d');
  if (g == null) return;
  const c = canvas.width / 2;
  const at = (value: number, r: number): [number, number] => {
    const a = NEEDLE_SWEEP - value * 2 * NEEDLE_SWEEP;
    return [c - Math.sin(a) * r, c - Math.cos(a) * r];
  };
  const arc = (from: number, to: number, colour: string, r: number, width: number): void => {
    g.strokeStyle = colour;
    g.lineWidth = width;
    g.beginPath();
    for (let k = 0; k <= 24; k += 1) {
      const [x, y] = at(from + ((to - from) * k) / 24, r);
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  };
  g.fillStyle = '#f3ead6';
  g.beginPath();
  g.arc(c, c, c, 0, Math.PI * 2);
  g.fill();
  arc(0, PUMP.flowFrom, '#b3261e', c * 0.8, c * 0.16);
  arc(PUMP.flowFrom, mark, '#c9bfa6', c * 0.8, c * 0.16);
  arc(mark, 1, '#2f8f3a', c * 0.8, c * 0.16);
  g.strokeStyle = '#2a241c';
  for (let k = 0; k <= 10; k += 1) {
    const [x0, y0] = at(k / 10, c * 0.92);
    const [x1, y1] = at(k / 10, c * (k % 5 === 0 ? 0.66 : 0.76));
    g.lineWidth = k % 5 === 0 ? c * 0.045 : c * 0.025;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  // What the two ends mean, without a word: a full blue drop inside the green, an empty struck-out drop inside the red.
  const drop = (value: number, full: boolean): void => {
    const [x, y] = at(value, c * 0.5);
    const r = c * 0.085;
    g.beginPath();
    g.moveTo(x, y - r * 1.7);
    g.bezierCurveTo(x + r * 1.5, y, x + r, y + r * 1.2, x, y + r * 1.2);
    g.bezierCurveTo(x - r, y + r * 1.2, x - r * 1.5, y, x, y - r * 1.7);
    g.closePath();
    g.lineWidth = c * 0.025;
    if (full) {
      g.fillStyle = '#2f7fb6';
      g.fill();
    } else {
      g.strokeStyle = '#8a8478';
      g.stroke();
      g.strokeStyle = '#b3261e';
      g.beginPath();
      g.moveTo(x - r * 1.3, y + r * 1.3);
      g.lineTo(x + r * 1.3, y - r * 1.5);
      g.stroke();
    }
  };
  drop(0.1, false);
  drop(0.9, true);
  // The stage's mark: a black wedge pointing in at the green's start.
  const [mx, my] = at(mark, c * 0.97);
  const [ax, ay] = at(mark - 0.035, c * 0.6);
  const [bx, by] = at(mark + 0.035, c * 0.6);
  g.fillStyle = '#14110d';
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.lineTo(mx, my);
  g.closePath();
  g.fill();
}

/**
 * The made models for the pump (art/v2/ciftlik: yoke_pump.glb or its rusty twin, keg.glb), when they have loaded. They are
 * laid out in this file's own frame, for an eye 1.18 m above the floor; without them the pump is built here from plain shapes.
 */
export interface PumpKit {
  pump?: Object3D | null;
  keg?: Object3D | null;
}
/** The eye's height the made pump was modelled for (m). */
const MODEL_EYE = 1.18;

export interface PumpFrame extends PumpStep {
  /** The pump was primed this frame. */
  primed: boolean;
  /** A hand shut the relief valve this frame. */
  shut: boolean;
}

export class PumpRig {
  readonly group = new Group();
  readonly pump: Pump = newPump(1);
  /** What a ring can show: the bar's middle, the cup, the jug. */
  readonly barMark = new Group();
  readonly cupMark = new Group();
  readonly jug: Object3D;
  /** The jug's middle, where it is taken: what a ring shows and what the mouse's hand settles on (its own origin is its foot). */
  readonly jugMark = new Group();
  /** Where the water leaves the spout, and where the bar is at its top and bottom (world), for the scene and the desk hands. */
  readonly spout = new Vector3();
  readonly barUp = new Vector3();
  readonly barDown = new Vector3();
  /** Hands on the bar now. */
  hands = 0;
  /** Once the game is won the pump keeps its pressure by itself. */
  runs = false;
  /** Whether a hand has the jug. */
  jugHeld: Side | null = null;
  /** How far the stream falls from the spout (m). */
  fall = 0.3;
  /** The relief valve: blown open (blow()), the pump leaks fast until a hand reaches it. What a ring can show of it. */
  valveOpen = false;
  readonly valveMark = new Group();
  /** The heave of the last down stroke, 1 fading to 0: the water comes in gushes. */
  gush = 0;
  private valveLever: Object3D;
  private readonly jet: Points;
  private readonly water: RunningWater;
  private readonly ghosts: Mesh[] = [];
  private readonly d: DirectorSystem;
  private readonly floor: number;
  private kick = 0;
  private idleFor = 0;
  private jugIdleFor = 0;
  private valveFor = 0;
  private readonly height: number;
  private yoke: Object3D = new Group();
  private readonly rod: Mesh;
  private needle: Object3D = new Group();
  private readonly dial: HTMLCanvasElement;
  private readonly dialTexture: CanvasTexture;
  private readonly stream: Mesh;
  private readonly pourStream: Mesh;
  private readonly cupWater: Mesh;
  private readonly lamp: MeshStandardMaterial;
  private readonly stageLamps: MeshStandardMaterial[] = [];
  private lampsDone = 0;
  private lampNow = -1;
  private readonly jugRest = new Vector3();
  private readonly jugTurn = new Quaternion();
  private readonly holds: Record<Side, boolean> = { left: false, right: false };
  private theta = DOWN;
  private shown = 0;
  private clock = 0;
  private tilt = 0;
  private flash = 0;
  private logAt = 0;
  private mark = 0.4;
  private readonly local = { left: new Vector3(), right: new Vector3() };
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly q = new Quaternion();
  private readonly frameOut: PumpFrame = { stroke: false, down: false, dry: false, primed: false, shut: false };
  private readonly eye = new Vector3();

  /**
   * `eye` is the seated eye (world), `yaw` the way the seat faces (the rig's
   * yaw), `floor` the floor's height there. `jug` is the thing to pour from
   * (its origin at its base); it is moved into the pump's group.
   */
  constructor(d: DirectorSystem, eye: Vector3, yaw: number, floor: number, look: PumpLook, jug: Object3D, name: string, kit: PumpKit = {}) {
    const H = eye.y - floor;
    this.height = H;
    this.d = d;
    this.floor = floor;
    const group = this.group;
    group.name = name;
    group.position.set(eye.x, floor, eye.z);
    group.rotation.y = yaw;
    const iron = new MeshStandardMaterial({ color: look.iron, roughness: look.rough, metalness: look.metal });
    const wood = woodMaterial(look.wood);
    const brass = new MeshStandardMaterial({ color: 0xc08a2e, roughness: 0.28, metalness: 0.9 });
    const cupY = H - CUP_BELOW;
    const pivotY = H - PIVOT_BELOW;
    const statics = new Group();
    statics.name = `${name} iron`;
    // The pump's own fixed parts (hidden when the made model stands in for them), apart from the slab and the jug's stand.
    const bodyParts = new Group();
    bodyParts.name = `${name} body`;
    const standParts = new Group();
    standParts.name = `${name} stand`;
    let into: Group = bodyParts;
    const add = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
      mesh.position.set(x, y, z);
      into.add(mesh);
      return mesh;
    };
    // The body on its flange (and slab), the open cup with its rim.
    into = statics;
    const stone = new MeshStandardMaterial({ color: 0x77706a, roughness: 0.95 });
    if (look.plinth > 0) add(new Mesh(new BoxGeometry(0.78, look.plinth, 0.66), stone), 0, look.plinth / 2, -0.78);
    into = bodyParts;
    const bodyH = cupY - 0.07 - look.plinth;
    add(new Mesh(new CylinderGeometry(0.075, 0.092, bodyH, 18), iron), 0, look.plinth + bodyH / 2, -BODY_AHEAD);
    add(new Mesh(new CylinderGeometry(0.14, 0.15, 0.035, 18), iron), 0, look.plinth + 0.018, -BODY_AHEAD);
    add(new Mesh(new CylinderGeometry(0.098, 0.098, 0.035, 18), iron), 0, look.plinth + bodyH * 0.55, -BODY_AHEAD);
    const cup = add(new Mesh(new CylinderGeometry(0.13, 0.08, 0.075, 20, 1, true), iron.clone()), 0, cupY - 0.036, -BODY_AHEAD);
    (cup.material as MeshStandardMaterial).side = DoubleSide;
    add(new Mesh(new TorusGeometry(0.13, 0.011, 8, 28), iron), 0, cupY, -BODY_AHEAD).rotation.x = Math.PI / 2;
    // The spout: out to the right and a little ahead, turned down at its end.
    const side = look.side;
    const spoutY = H - 0.5;
    const pipe = add(new Mesh(new CylinderGeometry(0.03, 0.034, 0.36, 12), iron), side * 0.23, spoutY, -BODY_AHEAD - 0.02);
    pipe.rotation.z = Math.PI / 2;
    pipe.rotation.y = side * 0.12;
    add(new Mesh(new CylinderGeometry(0.031, 0.036, 0.07, 12), iron), side * 0.4, spoutY - 0.03, -BODY_AHEAD - 0.04);
    // The two posts and the pin the lever turns on.
    for (const x of [-0.2, 0.2]) add(new Mesh(new BoxGeometry(0.05, pivotY + 0.05 - look.plinth, 0.06), iron), x, look.plinth + (pivotY + 0.05 - look.plinth) / 2, -PIVOT_AHEAD);
    add(new Mesh(new CylinderGeometry(0.014, 0.014, 0.5, 8), iron), 0, pivotY, -PIVOT_AHEAD).rotation.z = Math.PI / 2;
    // What the jug stands on: a small barrel, hooped.
    // In the yard a keg 0.76 m tall (the made one's height); on the square a slim stone post up to 0.30 m under the eye. Either way
    // the jug stands in the first, level look and within a seated reach.
    const standH = look.plinth > 0 ? H - 0.3 : 0.76;
    into = standParts;
    // On the square the post is of the slab's own stone and drawn with it (no hoops): two drawings fewer.
    if (look.plinth > 0) into = statics;
    add(new Mesh(new CylinderGeometry(0.09, 0.08, standH, 14), look.plinth > 0 ? stone : woodMaterial(look.stand, 7)), look.jug.x, standH / 2, look.jug.z);
    if (look.plinth <= 0) for (const k of [0.25, 0.8]) add(new Mesh(new TorusGeometry(0.08 + 0.01 * k + 0.004, 0.008, 6, 20), iron), look.jug.x, standH * k, look.jug.z).rotation.x = Math.PI / 2;
    into = bodyParts;
    // The gauge: a brass case on a stub from the body, its face to the player.
    const gauge = new Group();
    gauge.position.set(side * 0.25, H - 0.19, -0.5);
    gauge.lookAt(tmpA.set(0, H, 0));
    gauge.scale.setScalar(0.8);
    // A stout brass elbow from the body up to the gauge's back, and a collar where it enters the body.
    add(new Mesh(new CylinderGeometry(0.02, 0.022, 0.26, 10), brass), side * 0.18, H - 0.31, -0.54).rotation.z = side * -0.62;
    add(new Mesh(new CylinderGeometry(0.03, 0.03, 0.03, 12), brass), side * 0.095, H - 0.4, -0.56).rotation.z = Math.PI / 2;
    const caseBack = new Mesh(new CylinderGeometry(0.086, 0.086, 0.03, 28), brass);
    caseBack.rotation.x = Math.PI / 2;
    caseBack.position.z = -0.016;
    const ring = new Mesh(new TorusGeometry(0.08, 0.009, 8, 32), brass);
    this.dial = document.createElement('canvas');
    this.dial.width = 256;
    this.dial.height = 256;
    drawDial(this.dial, 0.4);
    this.dialTexture = new CanvasTexture(this.dial);
    this.dialTexture.colorSpace = SRGBColorSpace;
    this.lamp = new MeshStandardMaterial({ map: this.dialTexture, roughness: 0.6, emissive: 0xff2a1a, emissiveIntensity: 0 });
    const face = new Mesh(new CircleGeometry(0.076, 32), this.lamp);
    face.position.z = 0.001;
    const hand = new Mesh(new BoxGeometry(0.006, 0.066, 0.002), new MeshBasicMaterial({ color: 0x14110d }));
    hand.position.y = 0.024;
    const hub = new Mesh(new CylinderGeometry(0.009, 0.009, 0.006, 12), brass);
    hub.rotation.x = Math.PI / 2;
    this.needle.add(hand);
    this.needle.position.z = 0.005;
    hub.position.z = 0.006;
    const brassParts = new Group();
    brassParts.name = `${name} gauge case`;
    brassParts.add(caseBack, ring, hub);
    gauge.add(brassParts, face, this.needle);
    const bulbs: Mesh[] = [];
    // The stages: small glass lamps in an arc over the gauge, dark until their stage is done.
    for (let k = 0; k < look.lamps; k += 1) {
      const a = (k - (look.lamps - 1) / 2) * 0.42;
      const glass = new MeshStandardMaterial({ color: 0x2b2418, roughness: 0.3, emissive: 0xffc24a, emissiveIntensity: 0 });
      const bulb = new Mesh(new SphereGeometry(0.02, 12, 8), glass);
      bulb.position.set(Math.sin(a) * 0.125, Math.cos(a) * 0.125, 0.004);
      const cup = new Mesh(new CylinderGeometry(0.012, 0.016, 0.014, 10), brass);
      cup.position.set(Math.sin(a) * 0.106, Math.cos(a) * 0.106, 0.004);
      cup.rotation.z = -a;
      gauge.add(bulb);
      bulbs.push(bulb);
      brassParts.add(cup);
      this.stageLamps.push(glass);
    }
    mergeByMaterial(brassParts);
    gauge.name = `${name} gauge`;
    // The relief valve beside the gauge: a brass cock on the same stub, its red lever down while shut; blown, the lever is up and it sprays.
    const valveAt = new Vector3(side * VALVE.x, H - VALVE.below, -VALVE.ahead);
    add(new Mesh(new CylinderGeometry(0.02, 0.024, 0.07, 12), brass), valveAt.x, valveAt.y - 0.035, valveAt.z);
    add(new Mesh(new CylinderGeometry(0.01, 0.01, 0.16, 8), brass), (valveAt.x + gauge.position.x) / 2, valveAt.y - 0.05, valveAt.z).rotation.z = Math.PI / 2;
    const redLever = new Mesh(new BoxGeometry(0.075, 0.014, 0.02), new MeshStandardMaterial({ color: 0xb3261e, roughness: 0.5 }));
    redLever.geometry.translate(0.03, 0, 0);
    redLever.position.set(valveAt.x, valveAt.y + 0.008, valveAt.z);
    this.valveLever = redLever;
    this.valveMark.position.copy(valveAt);
    this.valveMark.name = `${name} valve`;
    // Its spray: soft puffs of water and air thrown up and a little toward the player, each fading as it goes.
    const spray = new BufferGeometry();
    spray.setAttribute('position', new BufferAttribute(new Float32Array(SPRAY * 3), 3));
    this.jet = new Points(spray, new PointsMaterial({ map: softPuff(), size: 0.09, transparent: true, opacity: 0.55, depthWrite: false, color: 0xffffff, sizeAttenuation: true }));
    this.jet.position.set(valveAt.x, valveAt.y + 0.01, valveAt.z);
    this.jet.frustumCulled = false;
    this.jet.visible = false;
    // Where the pump and the jug's stand meet the ground: a soft dark patch under each.
    const under = new Group();
    under.name = `${name} contact`;
    const patchAt = (wide: number, deep: number, x: number, z: number): void => {
      const patch = contactShadow(wide, deep);
      patch.position.set(x, look.plinth > 0 ? 0.012 : 0.008, z);
      under.add(patch);
    };
    patchAt(look.plinth > 0 ? 1.25 : 0.75, look.plinth > 0 ? 1.15 : 0.95, 0, -0.74);
    patchAt(0.5, 0.5, look.jug.x, look.jug.z);
    mergeByMaterial(under);
    // One drawing for each material of the fixed parts.
    mergeByMaterial(statics);
    mergeByMaterial(bodyParts);
    mergeByMaterial(standParts);
    // And within each, what is of plain colour into one drawing (these never move).
    mergeStill(statics);
    mergeStill(bodyParts);
    mergeStill(standParts);
    group.add(under, statics, bodyParts, standParts, gauge);

    // The lever: two arms from the pin toward the player, the wooden bar across their ends, and a crossbar over the cup the plunger hangs from.
    this.yoke.position.set(0, pivotY, -PIVOT_AHEAD);
    for (const x of [-0.2, 0.2]) {
      const arm = new Mesh(new BoxGeometry(0.03, 0.034, ARM + 0.04), iron);
      arm.position.set(x, 0, ARM / 2);
      const riser = new Mesh(new BoxGeometry(0.026, 0.16, 0.026), iron);
      riser.position.set(x, 0.08, 0.28);
      this.yoke.add(arm, riser);
    }
    const cross = new Mesh(new CylinderGeometry(0.013, 0.013, 0.42, 8), iron);
    cross.rotation.z = Math.PI / 2;
    cross.position.set(0, 0.16, 0.28);
    const bar = new Mesh(new CylinderGeometry(0.021, 0.021, BAR_HALF * 2, 14), wood);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0, ARM);
    for (const x of [-BAR_HALF, BAR_HALF]) {
      const cap = new Mesh(new CylinderGeometry(0.027, 0.027, 0.025, 12), iron);
      cap.rotation.z = Math.PI / 2;
      cap.position.set(x, 0, ARM);
      this.yoke.add(cap);
    }
    this.barMark.position.set(0, 0, ARM);
    this.barMark.name = `${name} bar`;
    this.yoke.add(cross, bar);
    this.yoke.name = `${name} lever`;
    mergeByMaterial(this.yoke);
    this.yoke.add(this.barMark);
    this.rod = new Mesh(new CylinderGeometry(1, 1, 1, 8), iron);
    this.cupMark.position.set(0, cupY + 0.16, -BODY_AHEAD);
    this.cupMark.name = `${name} cup`;
    // Water standing in the cup once it is primed, the stream from the spout, and the stream from the jug.
    this.water = runningWater(look.water, look.glow);
    const water = this.water.material;
    this.cupWater = new Mesh(new CircleGeometry(0.118, 20), water);
    this.cupWater.rotation.x = -Math.PI / 2;
    this.cupWater.position.set(0, cupY - 0.02, -BODY_AHEAD);
    this.cupWater.visible = false;
    const fallShape = new CylinderGeometry(1, 0.8, 1, 10, 1, true);
    fallShape.translate(0, -0.5, 0);
    this.stream = new Mesh(fallShape, water);
    this.stream.position.set(side * 0.4, spoutY - 0.06, -BODY_AHEAD - 0.04);
    this.stream.visible = false;
    this.pourStream = new Mesh(new CylinderGeometry(1, 1, 1, 8, 1, true), water);
    this.pourStream.visible = false;
    group.add(this.yoke, this.rod, this.cupMark, this.cupWater, this.stream, this.pourStream, this.valveLever, this.valveMark, this.jet);
    // The ghost hands that show the work when nothing is taken: drawn hands, in the pinch.
    for (let k = 0; k < 2; k += 1) {
      const { hand, pinch } = createHint();
      hand.material = (hand.material as MeshBasicMaterial).clone();
      (hand.material as MeshBasicMaterial).map = pinch;
      hand.renderOrder = 9100;
      if (k === 0) hand.scale.x = -1;
      group.add(hand);
      this.ghosts.push(hand);
    }

    // The jug on its stand.
    this.jug = jug;
    jug.removeFromParent();
    this.jugRest.set(look.jug.x, standH, look.jug.z);
    jug.position.copy(this.jugRest);
    this.jugMark.position.set(0, JUG_GRIP, 0);
    this.jugMark.name = `${name} jug`;
    jug.add(this.jugMark);
    this.jugTurn.copy(jug.quaternion);
    group.add(jug);
    group.traverse((o) => {
      o.pointerEvents = 'none';
    });
    // The made models, if they loaded and have every node this file moves; else the plain shapes above stay.
    const codeYoke = this.yoke;
    const codeRod = this.rod;
    try {
      if (kit.pump != null) {
        const model = kit.pump;
        const yokeNode = model.getObjectByName('yoke');
        if (yokeNode == null) throw new Error('a node is missing');
        // Modelled for an eye 1.18 m up: on the square it stands on the slab, that much higher; for the spout on the left it is mirrored.
        model.position.set(0, H - MODEL_EYE, 0);
        model.scale.x = look.side;
        const madeStream = model.getObjectByName('pump_water_stream');
        if (madeStream != null) madeStream.visible = false;
        // The gauge stays this file's own (its drawn dial did not show on the made face when it was tried): the made one is put away,
        // and the made body's stub ends where this one hangs.
        const madeGauge = model.getObjectByName('gauge');
        if (madeGauge != null) madeGauge.visible = false;
        yokeNode.add(this.barMark);
        this.yoke = yokeNode;
        const leverNode = model.getObjectByName('valve_lever');
        if (leverNode != null) {
          redLever.visible = false;
          this.valveLever = leverNode;
        }
        bodyParts.visible = false;
        codeYoke.visible = false;
        codeRod.visible = false;
        group.add(model);
        // The made model's many parts, as few drawings: the yoke's own (they swing together), and the body's but for the yoke and the valve's lever.
        mergeStill(yokeNode);
        mergeStill(model, [yokeNode, leverNode]);
        if (import.meta.env.DEV) console.info(`[pump] ${name}: the made pump model stands in`);
      }
      if (kit.keg != null && look.plinth <= 0) {
        kit.keg.position.set(look.jug.x, 0, look.jug.z);
        standParts.visible = false;
        group.add(kit.keg);
        mergeStill(kit.keg);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.warn(`[pump] ${name}: the made model was not used (${String(error)}); the plain one stands`);
    }
    group.traverse((o) => {
      o.pointerEvents = 'none';
    });
    d.world.createTransformEntity(group, { persistent: true });
    group.updateMatrixWorld(true);
    group.localToWorld(this.spout.copy(this.stream.position));
    group.localToWorld(this.barUp.set(0, pivotY + ARM * Math.sin(UP), -PIVOT_AHEAD + ARM * Math.cos(UP)));
    group.localToWorld(this.barDown.set(0, pivotY + ARM * Math.sin(DOWN), -PIVOT_AHEAD + ARM * Math.cos(DOWN)));
    this.pose();
  }

  /**
   * The pump's day of work is done and it stands as it is from now on (the bar down, the valve shut): its still parts are
   * joined into a few drawings. The water goes on running, the dial and the lamps go on showing; the jug is left as it is.
   */
  still(): void {
    mergeStill(this.group, [this.jug]);
  }

  /** The stage's mark on the gauge. */
  setMark(mark: number): void {
    this.mark = mark;
    drawDial(this.dial, mark);
    this.dialTexture.needsUpdate = true;
  }

  /** How hard the water comes (0..1). */
  get flow(): number {
    return flowOf(this.pump);
  }

  /** The stage lamps: the first `done` are lit, and lamp `now` (the stage being played; -1 none) beats. */
  setLamps(done: number, now: number): void {
    this.lampsDone = done;
    this.lampNow = now;
  }

  /** The relief valve blows open. */
  blow(): void {
    this.valveOpen = true;
    this.valveFor = 0;
  }

  /** The gauge's face flashes red (the pump ran dry). */
  alarm(): void {
    this.flash = 1;
  }

  /** The lever's place for the rules: 0 up, 1 down. */
  private get lever(): number {
    return (UP - this.theta) / (UP - DOWN);
  }

  /**
   * One frame: read the hands, move the bar and the jug, step the rules.
   * `leakScale` as stepPump's; `live` false freezes the rules (play paused)
   * while the things still follow the hands. `busy` is a hand that holds
   * something else of the scene's (the sluice lever).
   */
  frame(delta: number, hands: Hands, leakScale: number, live: boolean, busy: Side | null = null): PumpFrame {
    const out = this.frameOut;
    out.stroke = out.down = out.dry = out.primed = out.shut = false;
    this.clock += delta;
    const H = this.height;
    const pivotY = H - PIVOT_BELOW;
    for (const side of SIDES) this.group.worldToLocal(this.local[side].copy(hands[side]));
    // The jug: taken by a pinch near its middle, carried, poured over the cup, and back to its stand when let go.
    const grip = this.a.copy(this.jug.position).setY(this.jug.position.y + JUG_GRIP);
    if (this.jugHeld != null && !hands.pinching[this.jugHeld]) this.jugHeld = null;
    if (this.jugHeld == null && !this.pump.primed) {
      for (const side of SIDES) {
        if (this.holds[side] || side === busy || !hands.pinching[side]) continue;
        if (this.local[side].distanceTo(grip) <= JUG_TAKE) this.jugHeld = side;
      }
    }
    let pouring = false;
    if (this.jugHeld != null) {
      const at = this.local[this.jugHeld];
      this.jug.position.set(at.x, at.y - JUG_GRIP, at.z);
      const dx = -at.x;
      const dz = -BODY_AHEAD - at.z;
      const off = Math.hypot(dx, dz);
      pouring = !this.pump.primed && off <= POUR_WITHIN && at.y >= H - CUP_BELOW - 0.02;
      this.tilt += ((pouring ? 1.25 : 0) - this.tilt) * Math.min(1, delta * 7);
      // Tipped toward the cup, about the level line across the way to it.
      if (off > 1e-3) this.q.setFromAxisAngle(this.b.set(dz / off, 0, -dx / off), this.tilt);
      else this.q.identity();
      this.jug.quaternion.copy(this.q).multiply(this.jugTurn);
      if (pouring && live && this.tilt > 0.8 && pour(this.pump, delta)) out.primed = true;
    } else {
      this.tilt = 0;
      this.jug.position.lerp(this.jugRest, Math.min(1, delta * 6));
      this.jug.quaternion.slerp(this.jugTurn, Math.min(1, delta * 8));
    }
    this.pourStream.visible = pouring && this.tilt > 0.8;
    if (this.pourStream.visible) {
      this.a.copy(this.jug.position).add(this.b.set(0, 0.17, 0).applyQuaternion(this.q)).addScaledVector(this.b.set(-this.jug.position.x, 0, -BODY_AHEAD - this.jug.position.z).normalize(), 0.07);
      between(this.pourStream, this.a, this.b.set(0, H - CUP_BELOW - 0.03, -BODY_AHEAD), 0.008 + 0.002 * Math.sin(this.clock * 31));
    }
    this.cupWater.visible = this.pump.primed || this.pump.poured > 0;
    if (this.cupWater.visible) this.cupWater.scale.setScalar(this.pump.primed ? 1 : 0.35 + 0.65 * (this.pump.poured / PUMP.primeSeconds));

    // The valve: any hand that reaches it, open or closed, slaps it shut.
    if (this.valveOpen) {
      this.valveFor += delta;
      for (const side of SIDES) {
        if (this.local[side].distanceTo(this.valveMark.position) > VALVE.reach) continue;
        this.valveOpen = false;
        out.shut = true;
      }
    }
    // The bar: a pinch near it takes it; the hands that have it carry it up and down round its pin.
    const barY = pivotY + ARM * Math.sin(this.theta);
    const barZ = -PIVOT_AHEAD + ARM * Math.cos(this.theta);
    let held = 0;
    let sum = 0;
    for (const side of SIDES) {
      const at = this.local[side];
      const beside = Math.max(0, Math.abs(at.x) - BAR_HALF);
      const flat = Math.hypot(beside, at.z - barZ);
      if (side === this.jugHeld || side === busy || !hands.pinching[side]) this.holds[side] = false;
      else if (this.holds[side]) this.holds[side] = flat <= KEEP;
      // A pinch anywhere in the bar's own sweep takes it (the bar comes up into the hand): nobody has to find where it rests.
      else this.holds[side] = flat <= TAKE && at.y >= pivotY + ARM * Math.sin(DOWN) - 0.12 && at.y <= pivotY + ARM * Math.sin(UP) + 0.12;
      if (this.holds[side]) {
        held += 1;
        sum += at.y;
      }
    }
    this.hands = held;
    if (import.meta.env.DEV && this.clock >= this.logAt) {
      // For tests: where each closed hand is from the bar it has not taken.
      this.logAt = this.clock + 1;
      for (const side of SIDES) {
        if (!hands.pinching[side] || this.holds[side] || side === this.jugHeld || side === busy) continue;
        const at = this.local[side];
        console.info(`[pump] ${side} hand closed ${Math.hypot(Math.max(0, Math.abs(at.x) - BAR_HALF), at.z - barZ, at.y - barY).toFixed(2)} m from the bar (at ${at.x.toFixed(2)}, ${at.y.toFixed(2)}, ${at.z.toFixed(2)}; bar ${barY.toFixed(2)}, ${barZ.toFixed(2)})`);
      }
    }
    if (held > 0) {
      const want = Math.asin(Math.max(-1, Math.min(1, (sum / held - pivotY) / ARM)));
      // Under pressure the bar is heavier: it trails the hands a little more.
      this.theta += (Math.max(DOWN, Math.min(UP, want)) - this.theta) * Math.min(1, delta * (40 - 16 * this.pump.pressure));
    } else this.theta = Math.max(DOWN, this.theta - delta * 1.6);
    if (this.runs) {
      // Won: she runs by herself now.
      this.pump.primed = true;
      this.pump.pressure += (0.92 - this.pump.pressure) * Math.min(1, delta * 2);
    } else if (live) {
      const step = stepPump(this.pump, this.lever, held, delta, leakScale * (this.valveOpen ? PUMP.valveLeak : 1));
      out.stroke = step.stroke;
      out.down = step.down;
      out.dry = step.dry;
      if (step.stroke) {
        // Every counted stroke is felt: the pump shudders, and a down stroke heaves a gush out and kicks the needle.
        this.kick = 1;
        if (step.down && this.pump.primed) {
          this.gush = 1;
          this.shown = Math.min(1, this.shown + 0.03);
        }
      }
    }
    this.gush = Math.max(0, this.gush - delta * 3.2);
    this.kick = Math.max(0, this.kick - delta * 7);
    this.show(delta, held);
    this.pose();
    this.draw(delta);
    return out;
  }

  /**
   * The ghost hands: when nothing has been taken for a moment they show the
   * work, again and again, where it is done: the jug carried to the cup; two
   * hands on the bar, up and down, wide; a hand to the blown valve.
   */
  private show(delta: number, held: number): void {
    const H = this.height;
    const [one, two] = this.ghosts;
    this.jugIdleFor = !this.pump.primed && this.jugHeld == null ? this.jugIdleFor + delta : 0;
    this.idleFor = this.pump.primed && held === 0 && !this.runs ? this.idleFor + delta : 0;
    one.visible = false;
    two.visible = false;
    this.d.player.head.getWorldPosition(this.eye);
    this.group.worldToLocal(this.eye);
    if (this.valveOpen && this.valveFor > 1.2) {
      // A hand comes down on the valve.
      const k = (this.clock * 1.1) % 1;
      this.a.copy(this.valveMark.position);
      this.a.y += 0.14 * (1 - Math.min(1, k / 0.6));
      this.ghost(one, this.a, Math.min(1, k / 0.15, (1 - k) / 0.2));
    } else if (this.jugIdleFor > SHOW_AFTER + 0.9) {
      // From the jug, up and over, to above the cup; a moment there.
      const k = ((this.jugIdleFor - SHOW_AFTER - 0.9) / 2.4) % 1;
      const along = Math.min(1, k / 0.6);
      const e = along * along * (3 - 2 * along);
      this.a.copy(this.jugRest).setY(this.jugRest.y + JUG_GRIP).lerp(this.b.set(0, H - CUP_BELOW + 0.16, -BODY_AHEAD), e);
      this.a.y += Math.sin(e * Math.PI) * 0.1;
      this.ghost(one, this.a, Math.min(1, k / 0.1, (1 - k) / 0.15));
    } else if (this.idleFor > SHOW_AFTER) {
      // Two hands on the bar's ends, down and up, a stroke a second, as wide as the bar goes.
      const k = ((this.idleFor - SHOW_AFTER) * 1.0) % 1;
      const swing = k < 0.5 ? k * 2 : 2 - k * 2;
      const theta = UP + (DOWN - UP) * (swing * swing * (3 - 2 * swing));
      const y = H - PIVOT_BELOW + ARM * Math.sin(theta);
      const z = -PIVOT_AHEAD + ARM * Math.cos(theta);
      const fade = Math.min(1, (this.idleFor - SHOW_AFTER) / 0.4);
      this.ghost(one, this.a.set(-0.2, y, z), fade);
      this.ghost(two, this.a.set(0.2, y, z), fade);
    }
    // The scene's own single ghost hand would show the same thing later: this one has shown it.
    if (one.visible) this.d.ghost.touched();
  }

  /** Put a ghost hand's pinch on a point (the group's own frame), facing the eye. */
  private ghost(hand: Mesh, at: Vector3, opacity: number): void {
    hand.position.copy(at);
    hand.lookAt(this.group.localToWorld(this.b.copy(this.eye)));
    hand.position.sub(this.b.set(PINCH_AT.x * hand.scale.x, PINCH_AT.y, 0).applyQuaternion(hand.quaternion));
    (hand.material as MeshBasicMaterial).opacity = 0.9 * Math.max(0, opacity);
    hand.visible = true;
  }

  /** Put the lever and the plunger where the angle says. */
  private pose(): void {
    this.yoke.rotation.x = -this.theta;
    const c = Math.cos(this.theta);
    const s = Math.sin(this.theta);
    const pivotY = this.height - PIVOT_BELOW;
    this.a.set(0, pivotY + 0.16 * c + 0.28 * s, -PIVOT_AHEAD + 0.28 * c - 0.16 * s);
    between(this.rod, this.a, this.b.set(0, this.height - CUP_BELOW - 0.3, -BODY_AHEAD), 0.011);
  }

  /** The needle and the water follow the pressure. */
  private draw(delta: number): void {
    const p = this.pump.pressure;
    // The needle trembles a little while there is pressure, as a real one does on a hand pump.
    this.shown += (p - this.shown) * Math.min(1, delta * 14);
    const tremble = p > 0.02 ? 0.012 * Math.sin(this.clock * 38) : 0;
    this.needle.rotation.z = NEEDLE_SWEEP - (this.shown + tremble) * 2 * NEEDLE_SWEEP;
    this.flash = Math.max(0, this.flash - delta * 0.7);
    // The dial's own glow says how it stands now, at a glance: green at or over the stage's mark, orange under it, red where no water comes
    // (and a hard red flash when the pump has just run dry).
    const alarm = this.flash * (0.6 + 0.4 * Math.sin(this.clock * 18));
    this.lamp.emissive.setHex(alarm > 0.05 || p < PUMP.flowFrom ? 0xff2a1a : p >= this.mark ? 0x2fbf4a : 0xff9a2a);
    this.lamp.emissiveIntensity = Math.max(alarm, this.pump.primed && !this.runs ? 0.22 : this.runs ? 0.18 : 0);
    this.stageLamps.forEach((glass, k) => {
      glass.emissiveIntensity = k < this.lampsDone ? 2.2 : k === this.lampNow ? 0.5 + 0.45 * Math.sin(this.clock * 5) : 0;
    });
    const flow = flowOf(this.pump);
    // Below the mark where water runs, the spout drips; above, the stream thickens with the pressure and swells with every down stroke.
    const drip = this.pump.primed && flow <= 0 && p > 0.04;
    this.stream.visible = flow > 0 || (drip && Math.sin(this.clock * 9) > 0.2);
    if (this.stream.visible) {
      const r = flow > 0 ? (0.006 + 0.03 * flow) * (0.72 + 0.6 * this.gush) + 0.003 * Math.sin(this.clock * 27) : 0.003;
      this.stream.scale.set(r, this.fall, r);
    }
    this.water.run(delta * (0.5 + 2.4 * flow));
    // The whole pump shudders on a stroke (a couple of millimetres; the seat is never moved).
    this.group.position.y = this.floor + this.kick * 0.0025 * Math.sin(this.clock * 55);
    // The valve: its lever up and a spray of water and air while it is open.
    this.valveLever.rotation.z = this.valveOpen ? 1.25 : 0;
    this.jet.visible = this.valveOpen;
    if (this.valveOpen) {
      // Each puff has its own place in a short flight that it makes again and again: up fast, spreading, a little toward the seat.
      const at = this.jet.geometry.getAttribute('position') as BufferAttribute;
      for (let k = 0; k < SPRAY; k += 1) {
        const life = (this.clock * 2.6 + k / SPRAY + (k % 5) * 0.137) % 1;
        const spread = 0.05 + 0.22 * life;
        at.setXYZ(k, Math.sin(k * 2.4) * spread * life, life * (0.5 + (k % 4) * 0.06) - 0.35 * life * life, Math.cos(k * 2.4) * spread * life + 0.12 * life);
      }
      at.needsUpdate = true;
    }
  }

  /** Put the jug back on its stand, full again. */
  jugHome(): void {
    this.jugHeld = null;
    this.jug.position.copy(this.jugRest);
    this.jug.quaternion.copy(this.jugTurn);
  }
}
