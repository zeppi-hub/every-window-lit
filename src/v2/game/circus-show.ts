import {
  AdditiveBlending,
  AssetManager,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CapsuleGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  type Entity,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Quaternion,
  Raycaster,
  SphereGeometry,
  SpotLight,
  TorusGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { lessMotion } from '../../comfort.js';
import { pinchPoint } from '../../systems/pinch-reach.js';
import { fallen, type Give, gust, hoopSide, land, type Lean, poleInput, poleTilt, rideSpeed, slipped, stepGive, stepLean, throughHoop, WIRE, type WireStretch } from '../circus-acts.js';
import { setDeskMode } from '../desk-hands.js';
import { setGoal } from '../goal.js';
import { endMiniGame, MiniGame, playMiniGame } from '../minigame.js';
import { MiniGameSystem } from '../minigame-system.js';
import { featherMesh, parrotWords, stowWing } from '../parrot-system.js';
import { setV2Targets } from '../step-targets.js';
import { wristJoint } from '../wing-hands-system.js';
import type { DirectorSystem } from './director.js';
import { PerformerBody } from './circus-body.js';
import { cannonAct } from './circus-cannon.js';
import { ringmasterCalled, trapezeAct } from './circus-trapeze.js';
import { WORDS } from './lines.js';
import { FEATHER } from './opening.js';
import { WEATHER, type Weather } from './stage.js';

/**
 * S06, the circus memory as a show in three acts. The player is no longer
 * the catcher at the ringside: inside the memory she is the performer, and
 * the net is what catches her. Act 1 (here): seated on a unicycle on the
 * high wire, a balance pole in both hands, through three hoops of fire.
 * A touch of flame or a lean too far and she falls; the crew has the net
 * under her; she starts again from the last hoop she passed. Acts 2 and 3
 * (the cannon, the trapeze) are not in this file yet.
 *
 * The camera is never turned by the game: a lean shows on the unicycle and
 * in a small sideways drift of the seat, never as a roll of the view.
 */

/** The wire in the tent (art/v2/sirk/README.md): its height, and where the ride starts along it (m). */
const WIRE_Y = 6.02;
const START_X = -6.3;
/** Facing along the wire, toward +x (the rig's yaw 0 faces -z). The rider's right is +z. */
export const ALONG = -Math.PI / 2;
/** The net's top where a body lands, and the eye above it once caught (m). */
const NET_TOP = 1.35;
const EYE_IN_NET = 0.75;
/** A fall's length (s) and how far the view closes during it (1 open, 0.5 half). */
const FALL_SECONDS = 1.5;
const FALL_VIEW = 0.5;
/** The pole waits here from the eye before it is taken: ahead and down (m). */
const POLE_AHEAD = 0.38;
const POLE_DOWN = 0.3;
const GRIP_APART = 0.5;
/** The unicycle's crank (m), and the saddle's top above the wire. */
const CRANK = 0.115;
const SADDLE_TOP = 0.95;
/** The rider's neck and saddle sit this far behind her eyes (m). */
const SEAT_BACK = 0.1;
/** The wire gives this much under the wheel in the middle of its span (m), and its ends in the tent. */
const WIRE_SAG = 0.09;
const WIRE_ENDS = [-6.7, 6.7] as const;
/** A hand this near its grip, pinching, has it (m). */
const TAKE_REACH = 0.14;
/** The rehearsal on the platform: a gentle stretch that cannot be lost, tipped this far each way (degrees). */
const REHEARSAL: WireStretch = { instability: 0.5, maxLean: 60, gust: 0, gustEvery: 99, hoopAt: 99, hoopRadius: 9, hoopSway: 0, hoopSwayRate: 0 };
const REHEARSAL_TIP = 8;
/** After this many falls at one hoop, the gusts stop for it. */
const MERCY_FALLS = 3;
/** How long she takes to find her seat at each start on the wire (s). */
const SEAT_SECONDS = 1.6;
/** The plate's top row in this memory. */
export const BIG_TOP = 'MEMORY · THE BIG TOP';
/** Flames round one hoop: an outer, redder tongue and an inner, whiter one at each place. */
const FLAMES = 72;
/** The tent during the show: dark, the canvas only seen where a light falls. */
const DARK: Weather = { sky: 0x0a0506, fog: 0x140a0c, density: 0.028, light: 0.09 };

type Side = 'left' | 'right';

export interface Hands {
  left: Vector3;
  right: Vector3;
  pinching: { left: boolean; right: boolean };
}

/** Where the two hands are (the pinch point of a tracked hand, else the grip of a controller), and whether each is closed. */
export function readHands(d: DirectorSystem, out: Hands): void {
  for (const side of ['left', 'right'] as const satisfies readonly Side[]) {
    const point = pinchPoint(side);
    if (point != null) out[side].copy(point);
    else d.player.gripSpaces[side].getWorldPosition(out[side]);
    out.pinching[side] = d.input.xr.getSelectState(side).active;
  }
}

/** The view closing in from its edges during a fall: a dark card just ahead of the eye with a clear round middle. */
export class Vignette {
  private readonly card: Mesh;
  private open = 1;
  private want = 1;

  constructor(head: Object3D) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const g = canvas.getContext('2d');
    if (g != null) {
      const r = g.createRadialGradient(128, 128, 40, 128, 128, 128);
      r.addColorStop(0, 'rgba(0,0,0,0)');
      r.addColorStop(0.55, 'rgba(0,0,0,0.85)');
      r.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = r;
      g.fillRect(0, 0, 256, 256);
    }
    this.card = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true, depthTest: false, depthWrite: false, fog: false }));
    this.card.name = 'FallVignette';
    this.card.renderOrder = 9400;
    this.card.position.set(0, 0, -0.25);
    this.card.visible = false;
    this.card.pointerEvents = 'none';
    head.add(this.card);
  }

  /** 1 is fully open (hidden), 0.5 leaves about half the view. */
  set(open: number): void {
    this.want = open;
  }

  update(delta: number): void {
    this.open += (this.want - this.open) * Math.min(1, delta * 6);
    this.card.visible = this.open < 0.98;
    // The clear middle is 40/128 of the card: at scale 1.6 it spans about 110 degrees at 0.25 m.
    this.card.scale.setScalar(1.6 * (0.35 + 0.65 * ((this.open - 0.5) / 0.5)) * 2.2);
  }

  dispose(): void {
    this.card.removeFromParent();
  }
}

export function standard(colour: number, rough = 0.7, metal = 0): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: colour, roughness: rough, metalness: metal });
}

/** The circus props that are real models (art/v2/sirk/README.md); each takes the place of a plain shape built here, node for node. */
const CIRCUS_FILES = ['unicycle', 'balance_pole', 'cannon', 'trapeze', 'catcher'] as const;
export type CircusFile = (typeof CIRCUS_FILES)[number];
let circusLoading: Promise<unknown> | null = null;

/** Load the props once; a file that is not there leaves the plain shape in its place. */
export function loadCircusProps(): Promise<unknown> {
  circusLoading ??= Promise.all(CIRCUS_FILES.map((name) => AssetManager.loadGLTF(`v2/sirk/${name}.glb`, `v2_circus_${name}`).catch(() => null)));
  return circusLoading;
}

/** A fresh copy of a prop's scene, or null when its file did not load. */
export function circusProp(name: CircusFile): Object3D | null {
  const scene = AssetManager.getGLTF(`v2_circus_${name}`)?.scene;
  if (scene == null) return null;
  const copy = scene.clone(true);
  copy.traverse((o) => {
    o.pointerEvents = 'none';
    o.frustumCulled = false;
  });
  return copy;
}

/** The unicycle: a red tyre on a bright rim, cranks and pedals that turn with it, a fork, a post and a saddle; its origin where the tyre meets the wire. */
function buildUnicycle(): Group {
  const g = new Group();
  g.name = 'Unicycle';
  const model = circusProp('unicycle');
  if (model?.getObjectByName('UnicycleWheel') != null && model.getObjectByName('Pedal left') != null) {
    g.name = 'UnicycleRig';
    g.add(model);
    return g;
  }
  const chrome = standard(0xd8d8d8, 0.22, 0.95);
  const wheel = new Group();
  wheel.name = 'UnicycleWheel';
  wheel.position.y = 0.25;
  wheel.add(new Mesh(new TorusGeometry(0.232, 0.026, 12, 40), standard(0xb3202e, 0.85)));
  wheel.add(new Mesh(new TorusGeometry(0.203, 0.009, 6, 40), chrome));
  for (let k = 0; k < 14; k += 1) {
    const spoke = new Mesh(new CylinderGeometry(0.0022, 0.0022, 0.405, 5), chrome);
    spoke.rotation.z = (k * Math.PI) / 14;
    spoke.position.z = k % 2 === 0 ? 0.012 : -0.012;
    wheel.add(spoke);
  }
  const hub = new Mesh(new CylinderGeometry(0.022, 0.022, 0.17, 12), chrome);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);
  // Cranks half a turn apart; each pedal is kept level by the ride, not by the wheel.
  for (const side of [-1, 1]) {
    const crank = new Mesh(new BoxGeometry(CRANK, 0.02, 0.012), chrome);
    crank.position.set((side * CRANK) / 2, 0, side * 0.085);
    wheel.add(crank);
    const pedal = new Group();
    pedal.name = side < 0 ? 'Pedal left' : 'Pedal right';
    pedal.position.set(side * CRANK, 0, side * 0.135);
    const tread = new Mesh(new BoxGeometry(0.1, 0.018, 0.085), standard(0x1c1a19, 0.9));
    pedal.add(tread);
    for (const end of [-1, 1]) {
      const glass = new Mesh(new BoxGeometry(0.012, 0.014, 0.05), new MeshStandardMaterial({ color: 0xffb020, emissive: 0xff8a00, emissiveIntensity: 0.6, roughness: 0.3 }));
      glass.position.x = end * 0.052;
      pedal.add(glass);
    }
    wheel.add(pedal);
  }
  g.add(wheel);
  for (const side of [-1, 1]) {
    const leg = new Mesh(new CylinderGeometry(0.011, 0.011, 0.36, 8), chrome);
    leg.position.set(0, 0.43, side * 0.06);
    g.add(leg);
  }
  const crown = new Mesh(new CylinderGeometry(0.014, 0.014, 0.14, 8), chrome);
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 0.61;
  g.add(crown);
  const post = new Mesh(new CylinderGeometry(0.014, 0.014, 0.28, 8), chrome);
  post.position.y = 0.75;
  g.add(post);
  // The saddle: a long padded seat, its nose and tail turned up, studded round the edge.
  const saddle = new Mesh(new CapsuleGeometry(0.07, 0.17, 6, 14), standard(0x3a2418, 0.55));
  saddle.rotation.z = Math.PI / 2;
  saddle.scale.set(0.55, 1, 1.25);
  saddle.position.y = 0.895;
  g.add(saddle);
  for (const end of [-1, 1]) {
    const horn = new Mesh(new SphereGeometry(0.05, 10, 8), standard(0x3a2418, 0.55));
    horn.scale.set(0.9, 0.7, 1.1);
    horn.position.set(end * 0.14, 0.915, 0);
    g.add(horn);
  }
  g.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return g;
}

/** The balance pole: 2.4 m of pale wood along its own z, two leather grips, a lead weight at each end. */
function buildPole(): { pole: Group; grips: { left: Object3D; right: Object3D }; weights: Mesh[] } {
  const pole = new Group();
  pole.name = 'BalancePole';
  const model = circusProp('balance_pole');
  const gripLeft = model?.getObjectByName('PoleGrip left');
  const gripRight = model?.getObjectByName('PoleGrip right');
  if (model != null && gripLeft != null && gripRight != null) {
    pole.name = 'BalancePoleRig';
    pole.add(model);
    const lit: Mesh[] = [];
    for (const name of ['PoleWeight left', 'PoleWeight right']) {
      model.getObjectByName(name)?.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh !== true || Array.isArray(mesh.material)) return;
        const own = (mesh.material as MeshStandardMaterial).clone();
        own.emissive = new Color(0xffc83d);
        own.emissiveIntensity = 0;
        mesh.material = own;
        lit.push(mesh);
      });
    }
    return { pole, grips: { left: gripLeft, right: gripRight }, weights: lit };
  }
  const shaft = new Mesh(new CylinderGeometry(0.015, 0.015, WIRE.poleHalf * 2, 10), standard(0xd8b06a, 0.6));
  shaft.rotation.x = Math.PI / 2;
  pole.add(shaft);
  const grips = { left: new Group() as Object3D, right: new Group() as Object3D };
  const weights: Mesh[] = [];
  for (const [side, at] of [['left', -GRIP_APART / 2], ['right', GRIP_APART / 2]] as const) {
    const wrap = new Mesh(new CylinderGeometry(0.019, 0.019, 0.13, 10), standard(0x4a2f1c, 0.8));
    wrap.rotation.x = Math.PI / 2;
    wrap.position.z = at;
    pole.add(wrap);
    grips[side].name = `PoleGrip ${side}`;
    grips[side].position.z = at;
    pole.add(grips[side]);
    const weight = new Mesh(new SphereGeometry(0.045, 14, 10), new MeshStandardMaterial({ color: 0x6f7378, roughness: 0.5, metalness: 0.6, emissive: 0xffc83d, emissiveIntensity: 0 }));
    weight.position.z = Math.sign(at) * WIRE.poleHalf;
    pole.add(weight);
    weights.push(weight);
    // Red tape wound at each end, the way a walker marks her pole.
    for (let k = 0; k < 4; k += 1) {
      const tape = new Mesh(new CylinderGeometry(0.0165, 0.0165, 0.06, 10), standard(0xb3202e, 0.5));
      tape.rotation.x = Math.PI / 2;
      tape.position.z = Math.sign(at) * (WIRE.poleHalf - 0.12 - k * 0.14);
      pole.add(tape);
    }
  }
  return { pole, grips, weights };
}

export interface FireHoop {
  group: Group;
  flames: InstancedMesh;
  glow: Mesh;
  light: PointLight;
  radius: number;
  lit: number;
}

/** A soft flame drawn once: white at the root, through yellow and orange, to nothing at the tip and edges. */
export function flameTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.translate(32, 92);
    g.scale(1, 2.6);
    const r = g.createRadialGradient(0, 0, 1, 0, -6, 30);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.25, 'rgba(255,236,170,0.95)');
    r.addColorStop(0.6, 'rgba(255,150,50,0.5)');
    r.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = r;
    g.fillRect(-32, -40, 64, 60);
  }
  return new CanvasTexture(canvas);
}

/** A hoop of iron across the wire (its plane faces along x), with a ring of flames that can be lit and the light they throw. */
export function buildHoop(radius: number, map: CanvasTexture): FireHoop {
  const group = new Group();
  group.name = 'FireHoop';
  const iron = new Mesh(new TorusGeometry(radius, 0.03, 8, 48), standard(0x1c1a19, 0.6, 0.7));
  iron.rotation.y = Math.PI / 2;
  group.add(iron);
  const glow = new Mesh(new TorusGeometry(radius, 0.07, 6, 48), new MeshBasicMaterial({ color: 0xff6a12, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, fog: false }));
  glow.rotation.y = Math.PI / 2;
  group.add(glow);
  const flames = new InstancedMesh(new PlaneGeometry(0.3, 0.6), new MeshBasicMaterial({ map, transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false, side: DoubleSide }), FLAMES);
  flames.name = 'HoopFlames';
  flames.frustumCulled = false;
  flames.visible = false;
  const outer = new Color(0xff5a14);
  const inner = new Color(0xffd27a);
  for (let k = 0; k < FLAMES; k += 1) flames.setColorAt(k, k % 2 === 0 ? outer : inner);
  group.add(flames);
  const light = new PointLight(0xff8a3a, 0, 11, 1.6);
  group.add(light);
  group.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return { group, flames, glow, light, radius, lit: 0 };
}

const flameAt = new Matrix4();
const flamePlace = new Vector3();
const flameSize = new Vector3();
const upright = new Quaternion();

/** The flames lick up from all round the ring, each on its own beat, always turned to the eye; `lit` grows from 0 to 1 as the hoop catches. */
export function flicker(hoop: FireHoop, time: number, toEye: Quaternion): void {
  hoop.flames.visible = hoop.lit > 0.01;
  const breath = 0.85 + 0.1 * Math.sin(time * 9) + 0.05 * Math.sin(time * 23);
  (hoop.glow.material as MeshBasicMaterial).opacity = 0.5 * hoop.lit * breath;
  hoop.light.intensity = 26 * hoop.lit * breath;
  if (!hoop.flames.visible) return;
  for (let k = 0; k < FLAMES; k += 1) {
    const place = k >> 1;
    const a = (place / (FLAMES / 2)) * Math.PI * 2;
    const beat = 0.8 + 0.3 * Math.sin(time * (6 + (place % 5)) + place * 1.7) + 0.2 * Math.sin(time * 14 + place);
    // The flames at the top stand tall, those underneath curl round the iron.
    const tall = Math.max(0.25, beat) * hoop.lit * (0.75 + 0.6 * Math.max(0, Math.sin(a))) * (k % 2 === 0 ? 1 : 0.62);
    flamePlace.set(0, hoop.radius * Math.sin(a) + 0.2 * tall, hoop.radius * Math.cos(a));
    flameSize.set(k % 2 === 0 ? 1.15 : 0.7, tall, 1);
    flameAt.compose(flamePlace, toEye, flameSize);
    hoop.flames.setMatrixAt(k, flameAt);
  }
  hoop.flames.instanceMatrix.needsUpdate = true;
}

/**
 * The house: people seated on the bleachers all round, found by dropping a
 * line onto the planks so nobody floats. Shoulders and a head each, two
 * draws for everyone; they are shapes in the dark, never faces.
 */
function buildCrowd(planks: Object3D | null, wanted: number): { bodies: InstancedMesh; heads: InstancedMesh } {
  // A seated trunk turned on a lathe: hips, waist, chest, the slope of the shoulders, the neck (m; flattened front to back when placed).
  const trunk = new LatheGeometry([[0.0, 0], [0.17, 0], [0.16, 0.2], [0.19, 0.36], [0.215, 0.46], [0.2, 0.52], [0.1, 0.56], [0.05, 0.6], [0.05, 0.66], [0, 0.66]].map(([r, y]) => new Vector2(r, y)), 12);
  const head = new SphereGeometry(0.1, 10, 8);
  head.scale(0.92, 1.15, 1);
  const bodies = new InstancedMesh(trunk, standard(0xffffff, 0.95), wanted);
  const heads = new InstancedMesh(head, standard(0xffffff, 0.8), wanted);
  bodies.name = 'TentCrowdBodies';
  heads.name = 'TentCrowdHeads';
  bodies.pointerEvents = 'none';
  heads.pointerEvents = 'none';
  const m = new Matrix4();
  const at = new Vector3();
  const size = new Vector3();
  const down = new Vector3(0, -1, 0);
  const ray = new Raycaster();
  ray.far = 12;
  const coats = [0x3a1c22, 0x1f2a3a, 0x2c2a26, 0x40342a, 0x232323, 0x34202c].map((c) => new Color(c));
  const skins = [0x8a6a55, 0x6a4a38, 0xa58468, 0x4a3428].map((c) => new Color(c));
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  let n = 0;
  for (let tries = 0; tries < wanted * 8 && n < wanted && planks != null; tries += 1) {
    const a = random() * Math.PI * 2;
    const r = 8 + random() * 7;
    at.set(Math.cos(a) * r, 10, Math.sin(a) * r);
    ray.set(at, down);
    const hit = ray.intersectObject(planks, true)[0];
    if (hit == null || hit.point.y < 0.3) continue;
    const big = 0.92 + random() * 0.2;
    // Shoulders: wide across, shallow front to back, turned to face the ring.
    size.set(big, big, 0.6 * big);
    at.copy(hit.point);
    upright.setFromAxisAngle(down, a + Math.PI / 2);
    m.compose(at, upright, size);
    bodies.setMatrixAt(n, m);
    bodies.setColorAt(n, coats[n % coats.length]);
    size.setScalar(big);
    at.y = hit.point.y + 0.76 * big;
    m.compose(at, upright, size);
    heads.setMatrixAt(n, m);
    heads.setColorAt(n, skins[n % skins.length]);
    n += 1;
  }
  upright.identity();
  bodies.count = n;
  heads.count = n;
  bodies.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  if (import.meta.env.DEV) console.info(`[circus] ${n} seated in the house`);
  return { bodies, heads };
}

/** Dust hanging in the light round the wire: the near layer the eye reads depth from. */
function buildDust(count: number): Points {
  const places = new Float32Array(count * 3);
  let seed = 11;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let k = 0; k < count; k += 1) {
    places[k * 3] = -7 + random() * 14;
    places[k * 3 + 1] = WIRE_Y + 0.2 + random() * 3.2;
    places[k * 3 + 2] = -2.4 + random() * 4.8;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(places, 3));
  const dust = new Points(geometry, new PointsMaterial({ color: 0xffe2b0, size: 0.02, sizeAttenuation: true, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false, fog: false }));
  dust.name = 'TentDust';
  dust.frustumCulled = false;
  dust.pointerEvents = 'none';
  return dust;
}

/** Everything the show adds to the tent, made once and owned by the circus place. */
export interface ShowSet {
  rootEntity: Entity;
  net: Object3D | null;
  unicycle: Group;
  wheel: Object3D;
  pedals: { left: Object3D; right: Object3D };
  /** The player's own body in the memory: the performer she is. */
  body: PerformerBody;
  /** The wire itself, in two lengths that meet under the wheel. */
  cable: Mesh[];
  pole: Group;
  grips: { left: Object3D; right: Object3D };
  weights: Mesh[];
  hoops: FireHoop[];
  level: Mesh;
  spot: Mesh;
  lamp: SpotLight;
  dust: Points;
  /** The follow spot's pool on the sawdust far below her, and her own shadow in it. */
  pool: Group;
  vignette: Vignette;
  flame: CanvasTexture;
  /** Add something to the tent: it belongs to the circus place and is hidden with it. */
  add<T extends Object3D>(object: T): T;
}

function buildSet(d: DirectorSystem, rootEntity: Entity): ShowSet {
  const add = <T extends Object3D>(object: T): T => {
    d.world.createTransformEntity(object, { parent: rootEntity, persistent: true });
    d.stage.own('circus', object);
    return object;
  };
  // The ringside ropes of the old game are not part of this show.
  for (const name of ['rope_handle_left', 'rope_handle_right', 'net_rope_left', 'net_rope_right', 'net_line_left', 'net_line_right']) {
    const node = d.stage.node('circus', name);
    if (node != null) node.visible = false;
  }
  const unicycle = add(buildUnicycle());
  const body = new PerformerBody();
  add(body.root);
  // The tent's own cable is one straight piece: ours gives under the wheel.
  const wire = d.stage.node('circus', 'high_wire');
  if (wire != null) wire.visible = false;
  const cable = [0, 1].map(() => {
    const geometry = new CylinderGeometry(0.008, 0.008, 1, 8);
    geometry.translate(0, 0.5, 0);
    const piece = add(new Mesh(geometry, standard(0x9aa0a6, 0.3, 0.9)));
    piece.pointerEvents = 'none';
    piece.frustumCulled = false;
    return piece;
  });
  const { pole, grips, weights } = buildPole();
  add(pole);
  const flame = flameTexture();
  const hoops = WIRE.stretches.map((s) => {
    const hoop = buildHoop(s.hoopRadius, flame);
    hoop.group.position.set(START_X + s.hoopAt, WIRE_Y + WIRE.hoopAboveWire, 0);
    add(hoop.group);
    return hoop;
  });
  // A thin level line just over the wire ahead: the one thing that never tips.
  const level = add(new Mesh(new BoxGeometry(0.004, 0.004, 0.7), new MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.8, fog: false })));
  level.name = 'LevelLine';
  level.pointerEvents = 'none';
  const spot = add(new Mesh(new CylinderGeometry(0.2, 1.7, 7.4, 24, 1, true), new MeshBasicMaterial({ color: 0xffe0a8, transparent: true, opacity: 0.07, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false })));
  spot.name = 'FollowSpot';
  spot.pointerEvents = 'none';
  // The follow spot itself: one warm lamp from the far platform's side, aimed at the rider every frame.
  const lamp = add(new SpotLight(0xffd9a0, 420, 34, 0.2, 0.6, 1.5));
  lamp.position.set(7.3, 13.2, 3.2);
  add(lamp.target);
  // The house: the tent file seats its own audience now (crowd_near, crowd_far); an older file without one gets the plain seated figures.
  if (d.stage.node('circus', 'crowd_near') == null) {
    const crowd = buildCrowd(d.stage.node('circus', 'sirk_bleacher_planks'), 260);
    add(crowd.bodies);
    add(crowd.heads);
  }
  const dust = add(buildDust(300));
  const pool = add(new Group());
  pool.name = 'SpotPool';
  const soft = (inner: string, outer: string): CanvasTexture => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const g = canvas.getContext('2d');
    if (g != null) {
      const r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      r.addColorStop(0, inner);
      r.addColorStop(0.7, inner);
      r.addColorStop(1, outer);
      g.fillStyle = r;
      g.fillRect(0, 0, 128, 128);
    }
    return new CanvasTexture(canvas);
  };
  const light = new Mesh(new CircleGeometry(2.4, 40), new MeshBasicMaterial({ map: soft('rgba(255,226,170,0.34)', 'rgba(255,226,170,0)'), transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false }));
  light.rotation.x = -Math.PI / 2;
  const shade = new Mesh(new CircleGeometry(0.62, 28), new MeshBasicMaterial({ map: soft('rgba(0,0,0,0.6)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false, fog: false }));
  shade.rotation.x = -Math.PI / 2;
  shade.position.y = 0.01;
  shade.scale.set(1, 2.6, 1);
  pool.add(light, shade);
  pool.position.y = 0.03;
  pool.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return { rootEntity, net: d.stage.node('circus', 'safety_net'), unicycle, wheel: unicycle.getObjectByName('UnicycleWheel') ?? unicycle, pedals: { left: unicycle.getObjectByName('Pedal left') ?? unicycle, right: unicycle.getObjectByName('Pedal right') ?? unicycle }, body, cable, pole, grips, weights, hoops, level, spot, lamp, dust, pool, vignette: new Vignette(d.player.head), flame, add };
}

const zAxis = new Vector3(0, 0, 1);
const yUp = new Vector3(0, 1, 0);
/** The rider faces along the wire. */
export const FORWARD = new Vector3(1, 0, 0);
const wristAt = { left: new Vector3(), right: new Vector3() };

/**
 * Where a sleeve should end: the drawn hand's own wrist joint, a little up
 * the forearm (a joint looks down its fingers along -z), so arm and hand
 * meet. With no hand model (a controller), the grip.
 */
export function wristOf(d: DirectorSystem, side: Side): Vector3 {
  const at = d.player.gripSpaces[side].getWorldPosition(wristAt[side]);
  const joint = wristJoint(at);
  return joint == null ? at : joint.localToWorld(at.set(0, 0, 0.025));
}

/** How far the wire gives under a wheel at `x` (m): most in the middle, nothing at the platforms. */
function sagAt(x: number): number {
  const k = (x - WIRE_ENDS[0]) / (WIRE_ENDS[1] - WIRE_ENDS[0]);
  return WIRE_SAG * 4 * Math.max(0, k * (1 - k));
}

const cableFrom = new Vector3();
const cableTo = new Vector3();

/** Lay the cable from each platform to the point where the wheel presses it down. */
function layCable(set: ShowSet, x: number, y: number): void {
  set.cable.forEach((piece, n) => {
    cableFrom.set(WIRE_ENDS[n], WIRE_Y, 0);
    cableTo.set(x, y, 0).sub(cableFrom);
    const length = cableTo.length();
    piece.position.copy(cableFrom);
    piece.scale.set(1, length, 1);
    piece.quaternion.setFromUnitVectors(yUp, cableTo.divideScalar(length));
  });
}
const across = new Vector3();
const middle = new Vector3();

/** Put the pole in the two hands: its middle between them, its length along the line from the left hand to the right. */
function poleInHands(pole: Group, hands: Hands): void {
  middle.copy(hands.left).add(hands.right).multiplyScalar(0.5);
  across.copy(hands.right).sub(hands.left);
  if (across.lengthSq() < 1e-6) return;
  pole.position.copy(middle);
  pole.quaternion.setFromUnitVectors(zAxis, across.normalize());
}

/**
 * A fall from `from` into the net, which the crew has under the faller:
 * straight down, the view closing, the net giving and throwing back twice.
 * With less motion: a short fade, and the faller is in the net.
 */
async function fallToNet(d: DirectorSystem, set: ShowSet, from: Vector3): Promise<void> {
  const eye = from.clone();
  const drop = from.y - (NET_TOP + EYE_IN_NET);
  if (set.net != null) set.net.position.x = from.x;
  if (lessMotion()) {
    await d.rig.fadeTo(1);
    eye.y = NET_TOP + EYE_IN_NET;
    d.rig.place(eye, ALONG);
    await d.rig.fadeTo(0);
    d.sounds.play('net_twang', 1);
    d.sounds.play('cheer', 0.7, 1, 0.2);
    await d.wait(1.2);
    return;
  }
  set.vignette.set(FALL_VIEW);
  // Everything else drops away: the rush of air and her own heart.
  d.sounds.play('fall_whoosh', 0.8);
  d.sounds.bed('heartbeat_loop', 0.9);
  d.sounds.bed('tent_crowd_loop', 0.05);
  d.sounds.bed('drum_roll_loop', 0);
  let t = 0;
  let give: Give | null = null;
  let rest = 0;
  await new Promise<void>((done) => {
    const stop = d.each((delta) => {
      t += delta;
      if (give == null) {
        eye.y = from.y - fallen(t, FALL_SECONDS, drop);
        if (t >= FALL_SECONDS) {
          give = land((2 * drop) / FALL_SECONDS);
          set.vignette.set(1);
          d.sounds.bed('heartbeat_loop', 0);
          d.sounds.bed('tent_crowd_loop', 0.4);
          d.sounds.play('net_twang', 1);
          d.sounds.play('cymbal_hit', 0.7);
          d.sounds.play('cheer', 0.8, 1, 0.25);
          if (import.meta.env.DEV) console.info(`[circus] in the net at x ${from.x.toFixed(2)}`);
        }
      } else {
        stepGive(give, delta);
        eye.y = NET_TOP + EYE_IN_NET - give.depth;
        if (set.net != null) set.net.position.y = -Math.max(0, give.depth) * 0.6;
        rest += delta;
        if (rest >= 2.2) {
          if (set.net != null) set.net.position.y = 0;
          stop();
          done();
          return;
        }
      }
      d.rig.ride(eye, ALONG);
    });
  });
}

/** Act 1: the unicycle on the high wire through three hoops of fire. Resolves at the far platform. */
async function wireAct(d: DirectorSystem, set: ShowSet, paused: () => boolean): Promise<void> {
  const hands: Hands = { left: new Vector3(), right: new Vector3(), pinching: { left: false, right: false } };
  const eye = new Vector3();
  const lean: Lean = { angle: 0, rate: 0 };
  let along = 0;
  let stretchAt = 0;
  let taken = false;
  let tilt = 0;
  let clock = 0;
  let logAt = 0;
  const falls = [0, 0, 0];
  const toEye = new Quaternion();

  const neck = new Vector3();
  const seat = new Vector3();
  const foot = new Vector3();
  const knee = new Vector3();
  const place = (): void => {
    const x = START_X + along;
    // The wire gives under the wheel and hums a little as it rolls.
    const dip = taken ? sagAt(x) + (lessMotion() ? 0 : 0.004 * Math.sin(clock * 23)) : 0;
    const sway = lessMotion() ? 0 : WIRE.eyeShift * Math.sin((lean.angle * Math.PI) / 180);
    eye.set(x, WIRE_Y - dip + WIRE.eyeAboveWire, sway);
    d.rig.ride(eye, ALONG);
    layCable(set, x - SEAT_BACK, WIRE_Y - dip);
    set.unicycle.position.set(x - SEAT_BACK, WIRE_Y - dip, 0);
    set.unicycle.rotation.x = (lean.angle * Math.PI) / 180;
    set.wheel.rotation.z = -along / 0.25;
    set.pedals.left.rotation.z = -set.wheel.rotation.z;
    set.pedals.right.rotation.z = -set.wheel.rotation.z;
    set.unicycle.updateMatrixWorld(true);
    // Her body: hips on the saddle, head where the eye is, feet on the pedals, sleeves to her hands.
    neck.set(eye.x - SEAT_BACK, eye.y - 0.17, eye.z);
    set.body.spine(neck, set.unicycle.localToWorld(seat.set(0, SADDLE_TOP, 0)), FORWARD);
    for (const side of ['left', 'right'] as const) {
      set.pedals[side].getWorldPosition(foot);
      foot.y += 0.035;
      set.body.leg(side, foot, knee.set(1, 0.35, side === 'left' ? -0.45 : 0.45));
      set.body.arm(side, wristOf(d, side));
    }
    set.level.position.set(x + 1.1, WIRE_Y + WIRE.eyeAboveWire - 0.42, 0);
    set.spot.position.set(x, WIRE_Y + 5.2, 0);
    set.pool.position.set(x - 1.6, 0.03, -0.7);
    set.lamp.target.position.set(x, WIRE_Y + 1, 0);
    d.player.head.getWorldQuaternion(toEye);
  };
  const rest = (): void => {
    set.pole.position.set(START_X + along + POLE_AHEAD, WIRE_Y + WIRE.eyeAboveWire - POLE_DOWN, 0);
    set.pole.quaternion.identity();
  };
  place();
  rest();

  setGoal({ where: `${BIG_TOP} · ACT 1 OF 3`, now: 'Take the pole in both hands.' });
  // The pole: wait for both hands on its grips.
  setV2Targets([set.grips.left, set.grips.right]);
  const gripAt = new Vector3();
  let near = 0;
  const watch = d.each((delta) => {
    clock += delta;
    readHands(d, hands);
    let both = true;
    for (const side of ['left', 'right'] as const) {
      const reach = hands[side].distanceTo(set.grips[side].getWorldPosition(gripAt));
      if (!(reach <= TAKE_REACH && (hands.pinching[side] || reach <= TAKE_REACH * 0.6))) both = false;
    }
    near = both ? near + delta : 0;
    for (const side of ['left', 'right'] as const) set.body.arm(side, wristOf(d, side));
    for (const hoop of set.hoops) flicker(hoop, clock, toEye);
    set.vignette.update(delta);
  });
  await d.until(() => near >= 0.25);
  watch();
  taken = true;
  setV2Targets([]);
  d.sounds.play('grab_soft', 0.6);
  if (import.meta.env.DEV) console.info('[circus] pole taken');

  // Dev: a skip ends the act. The director forgets its skips whenever a wait ends, so each wait is armed afresh.
  let skipped = false;
  const arm = (): void =>
    d.onSkip(() => {
      skipped = true;
    });

  // A glass tube on the pole between her hands, level in the tent, with a ball in it that rolls to the side she is falling to. Tilt the pole the other way and it rolls back to the middle. It shows the lean (and where the lean is going), which the view itself never does.
  const spirit = set.add(new Group());
  spirit.name = 'SpiritLevel';
  const LEVEL_HALF = 0.13;
  const glass = new Mesh(new CylinderGeometry(0.016, 0.016, LEVEL_HALF * 2, 16), new MeshStandardMaterial({ color: 0xbfe9c8, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.45, emissive: 0x3aa860, emissiveIntensity: 0.25 }));
  glass.rotation.x = Math.PI / 2;
  spirit.add(glass);
  for (const end of [-1, 1]) {
    const cap = new Mesh(new CylinderGeometry(0.02, 0.02, 0.03, 16), standard(0xc9a04a, 0.35, 0.6));
    cap.rotation.x = Math.PI / 2;
    cap.position.z = end * (LEVEL_HALF + 0.012);
    spirit.add(cap);
    // The two lines the bubble should sit between.
    const mark = new Mesh(new TorusGeometry(0.0165, 0.0022, 6, 20), new MeshBasicMaterial({ color: 0x14110c, fog: false }));
    mark.position.z = end * 0.03;
    spirit.add(mark);
  }
  const bubble = new Mesh(new SphereGeometry(0.013, 16, 12), new MeshBasicMaterial({ color: 0xfff3a0, fog: false }));
  spirit.add(bubble);
  spirit.traverse((o) => {
    o.pointerEvents = 'none';
  });
  spirit.visible = false;
  const flatAcross = new Vector3();
  const showCue = (): void => {
    spirit.visible = taken;
    if (!taken) return;
    // On the pole's middle, a little above it, lying along the line between the hands but always level.
    spirit.position.copy(hands.left).add(hands.right).multiplyScalar(0.5);
    // High enough over the pole to sit inside a headset's view while she looks ahead (about 25 degrees under the eye line, not 38).
    spirit.position.y += 0.14;
    flatAcross.copy(hands.right).sub(hands.left).setY(0);
    if (flatAcross.lengthSq() > 1e-6) spirit.quaternion.setFromUnitVectors(zAxis, flatAcross.normalize());
    // A ball in the tube, rolling to the side she is falling to (and a little ahead of the lean, to where it is going): she tilts the pole away from it and it rolls back to the middle.
    const coming = lean.angle + lean.rate * 0.35;
    const run = Math.max(-1, Math.min(1, coming / 14));
    bubble.position.z = run * (LEVEL_HALF - 0.022);
    const level = Math.abs(coming) < 3;
    (glass.material as MeshStandardMaterial).emissiveIntensity = level ? 0.9 : 0.25;
    (bubble.material as MeshBasicMaterial).color.set(level ? 0xb8ff9a : Math.abs(run) > 0.7 ? 0xff7a5a : 0xfff3a0);
  };
  let seated = 1;
  // One frame of balance on a stretch; true while still on the wire.
  const balance = (stretch: WireStretch, delta: number): void => {
    readHands(d, hands);
    if (taken) poleInHands(set.pole, hands);
    showCue();
    across.copy(hands.right).sub(hands.left);
    tilt = poleTilt(hands.left.y, hands.right.y, Math.hypot(across.x, across.z));
    // Finding her seat: for the first moments on the wire the pole has little say and the lean little pull, so a hand that was not level at the start does not throw her off before she has seen where she is.
    seated = Math.min(1, seated + delta / SEAT_SECONDS);
    stepLean(lean, poleInput(tilt) * seated, { ...stretch, instability: stretch.instability * seated }, delta);
  };

  setGoal({ where: `${BIG_TOP} · ACT 1 OF 3`, now: 'The ball rolls where you fall. Move the other way.' });
  // The rehearsal: tipped each way on the platform, held by the line; dip the other end and come level (a third of a second upright is enough: the lesson is the one move, not holding still).
  for (const side of [-1, 1] as const) {
    lean.angle = side * REHEARSAL_TIP;
    lean.rate = 0;
    let steady = 0;
    const stop = d.each((delta) => {
      if (paused()) return;
      clock += delta;
      balance(REHEARSAL, delta);
      // The line holds: never further than the tip it started from.
      if (Math.abs(lean.angle) > REHEARSAL_TIP * 1.5) {
        lean.angle = Math.sign(lean.angle) * REHEARSAL_TIP * 1.5;
        lean.rate = 0;
      }
      steady = Math.abs(lean.angle) < 3 ? steady + delta : 0;
      place();
      for (const hoop of set.hoops) flicker(hoop, clock, toEye);
      set.vignette.update(delta);
      if (import.meta.env.DEV && clock >= logAt) {
        logAt = clock + 0.1;
        console.info(`[circus] rehearsal lean ${lean.angle.toFixed(1)} tilt ${tilt.toFixed(1)}`);
      }
    });
    arm();
    await d.until(() => steady >= 0.35 || skipped);
    stop();
    for (const w of set.weights) (w.material as MeshStandardMaterial).emissiveIntensity = 0.9;
    d.sounds.play('ear_click', 0.5);
    arm();
    await d.wait(0.4);
    for (const w of set.weights) (w.material as MeshStandardMaterial).emissiveIntensity = 0;
  }
  lean.angle = 0;
  lean.rate = 0;

  // The ride.
  seated = 0;
  const rideGoal = (): void => setGoal({ where: `${BIG_TOP} · ACT 1 OF 3`, now: 'Cross the wire through three hoops. Do not fall.', steps: [Math.min(stretchAt, 3), 3] });
  rideGoal();
  d.sounds.bed('tent_crowd_loop', 0.4);
  d.sounds.bed('wind_loop', 0.15);
  d.sounds.play('wire_creak', 0.7);
  let fallen = 0;
  let gasped = 0;
  let roll = 0;
  let nextGust = 2.5;
  let fire = 0;
  while (along < WIRE.length && !skipped) {
    let fell: string | null = null;
    let burnt = false;
    const stop = d.each((delta) => {
      if (paused() || fell != null) return;
      clock += delta;
      const stretch = WIRE.stretches[Math.min(stretchAt, WIRE.stretches.length - 1)];
      balance(stretch, delta);
      nextGust -= delta;
      if (nextGust <= 0 && falls[stretchAt] < MERCY_FALLS) {
        const side: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
        gust(lean, stretch, side);
        d.sounds.play('wind_gust', 0.55, 0.9 + Math.random() * 0.3);
        nextGust = stretch.gustEvery * (0.7 + Math.random() * 0.6);
      }
      along = Math.min(WIRE.length, along + rideSpeed(lean, stretch) * delta);
      // The hoops: lit as the rider comes within 5 m, swaying, judged while the wheel is in their plane.
      set.hoops.forEach((hoop, n) => {
        const s = WIRE.stretches[n];
        const off = s.hoopAt - along;
        if (off < 5) hoop.lit = Math.min(1, hoop.lit + delta * 1.5);
        const side = hoopSide(s, clock);
        hoop.group.position.z = side;
        flicker(hoop, clock, toEye);
        if (n === stretchAt && Math.abs(off) <= WIRE.hoopDepth) {
          const verdict = throughHoop(lean, tilt, s, side);
          if (verdict !== 'clear') {
            burnt = true;
            fell = verdict;
          }
        }
        if (n === stretchAt && off < -WIRE.hoopDepth && fell == null) {
          stretchAt += 1;
          rideGoal();
          d.sounds.play('cheer', 0.55);
          if (import.meta.env.DEV) console.info(`[circus] hoop ${n + 1}: clear`);
        }
      });
      const nearest = Math.min(...WIRE.stretches.map((s) => Math.abs(s.hoopAt - along)));
      const want = Math.max(0, 1 - nearest / 4) * 0.8;
      if (Math.abs(want - fire) > 0.05) {
        fire = want;
        d.sounds.bed('fire_loop', fire);
      }
      // The house holds its breath as she tips: the drum rolls harder, and past half way there is a gasp.
      const tip = Math.abs(lean.angle) / stretch.maxLean;
      const wantRoll = Math.max(0, (tip - 0.25) / 0.75) * 0.7;
      if (Math.abs(wantRoll - roll) > 0.05) {
        roll = wantRoll;
        d.sounds.bed('drum_roll_loop', roll);
      }
      gasped -= delta;
      if (tip > 0.6 && gasped <= 0) {
        d.sounds.play('crowd_gasp', 0.6);
        gasped = 3;
      }
      if (fell == null && slipped(lean, stretch)) fell = 'slipped';
      place();
      set.vignette.update(delta);
      if (import.meta.env.DEV && clock >= logAt) {
        logAt = clock + 0.1;
        console.info(`[circus] wire at ${along.toFixed(2)} lean ${lean.angle.toFixed(1)} tilt ${tilt.toFixed(1)} hoop ${stretchAt + 1}`);
      }
    });
    arm();
    await d.until(() => fell != null || along >= WIRE.length || skipped);
    stop();
    if (fell == null) break;
    // A fall: the pole stays up there, the net is under her, then back before the hoop she had not passed.
    falls[Math.min(stretchAt, 2)] += 1;
    fallen += 1;
    // The net forgives twice: the third fall sends her back to the first platform.
    const backToStart = fallen % 3 === 0;
    setGoal({ where: `${BIG_TOP} · ACT 1 OF 3`, now: backToStart ? 'Three falls: back to the first platform.' : `The net caught you. ${3 - (fallen % 3)} more and you start again.`, steps: [Math.min(stretchAt, 3), 3] });
    if (import.meta.env.DEV) console.info(`[circus] ${burnt ? `burnt (${fell})` : 'slipped'} at ${along.toFixed(2)}, hoop ${stretchAt + 1}`);
    d.sounds.play('crowd_gasp', 0.9);
    taken = false;
    const vignetteOn = d.each((delta) => set.vignette.update(delta));
    arm();
    await fallToNet(d, set, eye);
    arm();
    await d.rig.fadeTo(1);
    vignetteOn();
    if (backToStart) stretchAt = 0;
    along = stretchAt === 0 ? 0 : WIRE.stretches[stretchAt - 1].hoopAt + 0.6;
    lean.angle = 0;
    lean.rate = 0;
    seated = 0;
    nextGust = 2.5;
    place();
    taken = true;
    rideGoal();
    arm();
    await d.rig.fadeTo(0);
  }
  d.sounds.bed('fire_loop', 0);
  d.sounds.bed('drum_roll_loop', 0);
  d.sounds.play('cymbal_hit', 0.8);
  d.sounds.play('cheer', 0.9);
  d.sounds.play('applause', 0.9, 1, 0.4);
  spirit.visible = false;
  if (import.meta.env.DEV) console.info('[circus] wire done');
  arm();
  await d.wait(1.5);
}

/** S06: the circus memory. */
export async function s06(d: DirectorSystem): Promise<void> {
  d.chapter('S06');
  await d.stage.show('circus', DARK);
  d.rain.on = false;
  stowWing(true);
  const rootEntity = d.stage.entity('circus');
  if (rootEntity == null) return;
  await loadCircusProps();
  const set = buildSet(d, rootEntity);
  const minis = d.world.getSystem(MiniGameSystem);
  const paused = () => minis?.playPaused ?? false;
  // What all this is for, in view from the first second: the word's feather over the far platform, and a lamp for each act.
  const prize = set.add(new Group());
  prize.name = 'PrizeFeather';
  prize.position.set(START_X + WIRE.length + 0.9, WIRE_Y + 2.3, 0);
  const plume = featherMesh(FEATHER.safetyNet, 0.9, 0.3);
  (plume.material as MeshStandardMaterial).emissive = new Color(FEATHER.safetyNet);
  (plume.material as MeshStandardMaterial).emissiveIntensity = 0.9;
  plume.rotation.set(0, Math.PI / 2, Math.PI / 2);
  plume.position.set(0, 0.45, 0);
  prize.add(plume);
  prize.add(new PointLight(0xffd98a, 14, 7, 1.6));
  const actLamps = [0, 1, 2].map((k) => {
    const lamp = new Mesh(new SphereGeometry(0.11, 14, 10), new MeshStandardMaterial({ color: 0x3a3226, emissive: 0xffc83d, emissiveIntensity: 0, roughness: 0.4 }));
    lamp.position.set(0, -0.35, (k - 1) * 0.34);
    prize.add(lamp);
    return lamp;
  });
  prize.traverse((o) => {
    o.pointerEvents = 'none';
  });
  const spin = d.each((delta) => {
    plume.rotation.y += delta * 0.9;
  });
  void d.captions.say('S06-0', new Vector3(START_X + 1.6, WIRE_Y + WIRE.eyeAboveWire + 0.25, -0.9), 0);
  const game = playMiniGame(new MiniGame(WORDS.safetyNet, [{ name: 'the wire' }, { name: 'the cannon' }, { name: 'the trapeze' }]));
  const acts = [wireAct, cannonAct, trapezeAct];
  const modes = ['pole', 'handles', 'ropes'] as const;
  // Dev: ?act=2 or ?act=3 starts at that act.
  const from = import.meta.env.DEV ? Math.max(1, Math.min(3, Number(new URLSearchParams(window.location.search).get('act') ?? (window.sessionStorage.getItem('v2jump') ?? '').split(' ')[1] ?? 1))) - 1 : 0;
  for (let n = 0; n < acts.length; n += 1) {
    await d.until(() => game.phase === 'playing' || game.phase === 'won');
    if (game.phase !== 'playing') break;
    if (n >= from) {
      setDeskMode(modes[n]);
      await acts[n](d, set, paused);
      setDeskMode('one');
      if (n < acts.length - 1) await d.rig.fadeTo(1);
    }
    // The first act's things leave the tent for the next (also when a dev jump starts past it: nothing of an act not played is left standing, drawn and counted).
    set.unicycle.visible = false;
    set.pole.visible = false;
    set.level.visible = false;
    set.pool.visible = false;
    for (const piece of set.cable) piece.visible = false;
    const ownWire = d.stage.node('circus', 'high_wire');
    if (ownWire != null) ownWire.visible = true;
    for (const hoop of set.hoops) hoop.group.visible = false;
    game.win();
    (actLamps[n].material as MeshStandardMaterial).emissiveIntensity = 2.2;
    if (n < acts.length - 1) void d.rig.fadeTo(0);
  }
  endMiniGame(game);
  spin();
  setGoal({ where: BIG_TOP, now: 'The word is yours: SAFETY NET.', steps: [3, 3] });
  setV2Targets([]);
  set.vignette.dispose();
  stowWing(false);
  d.sounds.bed('wind_loop', 0);
  d.sounds.bed('tent_crowd_loop', 0);

  // The word, called out; the parrot learns it by hearing it.
  // The word, called out once: if the ringmaster already called the net into the light in the dark flight, he does not say it again.
  if (!ringmasterCalled()) await d.captions.say('S06-2', new Vector3(START_X + WIRE.length, WIRE_Y + 1.2, 2), 0.3);
  parrotWords.learn(WORDS.safetyNet, FEATHER.safetyNet);
  d.rain.on = true;
  const start = d.now;
  await d.until(() => {
    const k = Math.min(1, (d.now - start) / 1.6);
    d.stage.blendWeather(DARK, WEATHER.rain2008, k);
    return k >= 1;
  });
}
