import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  type Entity,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
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
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  SpotLight,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { lessMotion } from '../../comfort.js';
import { setDeskCarry, setDeskLook, setDeskMode } from '../desk-hands.js';
import { devParam } from '../dev-param.js';
import { setGoal } from '../goal.js';
import { endMiniGame, MiniGame, playMiniGame } from '../minigame.js';
import { MiniGameSystem } from '../minigame-system.js';
import {
  type Climb,
  climbHeight,
  clipVerdict,
  eased,
  fallen,
  type Grip,
  gust,
  haulRise,
  holdShift,
  iceCovered,
  ICEFALL,
  iceHits,
  knocks,
  layRopes,
  layRows,
  type Pitch,
  pitonBelow,
  proven,
  ripped,
  type Rope,
  ROPE,
  ropeGive,
  ropeKnown,
  ropeLoad,
  ROUTE,
  type Row,
  stepClimb,
  stepRope,
  storm,
  torn,
} from '../mountain-rules.js';
import { featherMesh, parrotWords, stowWing } from '../parrot-system.js';
import { setV2Targets } from '../step-targets.js';
import { type BodyLook, PerformerBody } from './circus-body.js';
import { type Hands, readHands, standard, Vignette } from './circus-show.js';
import type { DirectorSystem } from './director.js';
import { mergeByMaterial } from './fx.js';
import { WORDS } from './lines.js';
import { FEATHER, mergeFlatParts } from './opening.js';
import type { Person } from './people.js';
import type { Weather } from './stage.js';

/**
 * S18, the mountain memory. Inside it the player is the guide on her first
 * climb as one, a party of three roped up behind her, the ropes on the face
 * left there by another team. Three pitches, each read with less to go on
 * and less time before the storm:
 * 1. the ropes, in wind: hang on each (take it, haul it down); a sound one
 *    goes taut and holds, the rotten one opens strand by strand and parts
 *    in the hand. Clip the party's line to one. Trusted untried and rotten,
 *    it parts under them and they hang on the guide's own line;
 * 2. the rock, in driving snow: rows of holds, climbed hand over hand. One
 *    hand stays on the hold that has borne her while the other puts her
 *    weight on the next: a sound one takes it and lifts her a row; a loose
 *    one shifts, scrapes, and tears out. Torn out with her other hand still
 *    on, it is a fright; with no hand on, she is off, two and a half
 *    metres onto her rope, and back at the last piton;
 * 3. the ice, at dusk, by her lamp: three holds a row, up to two of them
 *    loose, telling half as much, and ice breaking off overhead that she
 *    has to lean out from under.
 * Doubt costs too, and so does every fall: the storm closes each pitch
 * after its seconds, and its front can be seen coming up the valley.
 *
 * What it is all for is in view from the first second: the word's feather
 * shines at the flag on top of the face, and three storm lanterns hang up
 * the face, one at the end of each pitch, lit as she passes them.
 *
 * The camera is never turned by the game, and on the face it is moved only
 * by the player's own haul and by a fall (with less motion: a fade in place
 * of the fall). Her head is left free: she can lean out, and look down past
 * her own boots at the party on the line below.
 */

type Side = 'left' | 'right';
const SIDES: readonly Side[] = ['left', 'right'];

/** The three ropes: the middle one's place across the face, and how far apart they hang (m). */
const ROPES_X = -1.1;
const ROPE_APART = 0.34;
/** Where a rope is taken, and where its strands open, above the snow (m). */
const GRIP_Y = 1.18;
const FRAY_Y = 1.72;
/** The guide's eye at the foot of the ropes (seated on her pack), and how far she sits from them (m). */
const FOOT_EYE_Y = 1.25;
const FOOT_STAND = 0.42;
/** The column of holds: its middle across the face, and the eye's height as the rock and the ice begin (m). */
const HOLDS_X = 0.45;
const ROCK_EYE_Y = 1.45;
const ICE_EYE_Y = 5.0;
/** The three lanterns up the face (across, up), one where each pitch ends. */
const LANTERNS: readonly [number, number][] = [
  [-0.3, 1.9],
  [HOLDS_X - 0.55, 4.55],
  [HOLDS_X - 0.55, 7.75],
];
/** The opening look at the whole face: this far back from it (m), and the eye above the snow there. */
const LOOK_BACK = 10.5;
const WHERE = 'MEMORY · THE MOUNTAIN';
/** A carabiner this near a rope clips onto it (m). */
const CLIP_REACH = 0.11;
/** A pinch counts as taking something for this long after it closes (s), so the hand may close a moment before it arrives. */
const LATE_PINCH = 0.3;
/** Played with the mouse: what going for a hold in a gust costs (s of the storm's time). */
const SLIP_SECONDS = 4;

/** The three pitches' weather when the storm is still far off, and when it is on top of the party. */
const CLEAR: readonly Weather[] = [
  { sky: 0x9fbcd6, fog: 0xc8d0d8, density: 0.006, light: 0.3 },
  { sky: 0x8e98a2, fog: 0xaab2ba, density: 0.05, light: 0.24 },
  { sky: 0x232a40, fog: 0x2e3650, density: 0.045, light: 0.07 },
];
const CLOSED: readonly Weather[] = [
  { sky: 0x7c8690, fog: 0xa4acb4, density: 0.09, light: 0.2 },
  { sky: 0x6c747c, fog: 0x98a0a8, density: 0.2, light: 0.16 },
  { sky: 0x10131f, fog: 0x1c2032, density: 0.2, light: 0.04 },
];
const SUMMIT: Weather = { sky: 0xd9a27a, fog: 0xc9a48c, density: 0.004, light: 0.6 };
/** The low sun's strength on each pitch, and its colour at dusk. */
const SUN = [3.4, 1.5, 0.4] as const;
/** The guide's own clothes: a blue-green parka, dark climbing trousers, brown boots; her sleeves end at her real hands. */
const GUIDE_LOOK: BodyLook = { suit: 0x1d5568, trim: 0x1d5568, tights: 0x1c3a48, shoes: 0x5a3a22, skin: 0xd9a983, head: false };
/** Whether the hands are a desktop emulator's (played with the mouse): a carried thing then goes to its place by itself, and a hand that is still closed takes the next thing it comes to (dev: ?hands=1 plays the emulator as a headset's two hands). */
export const mouse = (): boolean => devParam('hands') !== '1' && (window as { IWER_DEVICE?: unknown }).IWER_DEVICE != null;
/** A haul made with the mouse counts for this much more: the emulator's window is shorter than an arm's pull. */
export const MOUSE_GAIN = 3;

const yAxis = new Vector3(0, 1, 0);
const span = new Vector3();

/** Stretch a rod (a cylinder one metre tall, its foot at its origin) from one point to another. */
function stretch(rod: Object3D, from: Vector3, to: Vector3): void {
  span.copy(to).sub(from);
  const length = span.length();
  rod.position.copy(from);
  rod.scale.set(1, Math.max(1e-4, length), 1);
  if (length > 1e-5) rod.quaternion.setFromUnitVectors(yAxis, span.divideScalar(length));
}

function rod(radius: number, material: MeshStandardMaterial): Mesh {
  const geometry = new CylinderGeometry(radius, radius, 1, 7);
  geometry.translate(0, 0.5, 0);
  const mesh = new Mesh(geometry, material);
  mesh.pointerEvents = 'none';
  return mesh;
}

/** An old laid rope's look: three strands twisted round one another, each one rounded (light along its crown, dark in the grooves between). */
let laid: CanvasTexture | null = null;
function laidRope(): CanvasTexture {
  if (laid != null) return laid;
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const g = canvas.getContext('2d');
  if (g != null) {
    const image = g.createImageData(48, 48);
    for (let y = 0; y < 48; y += 1) {
      for (let x = 0; x < 48; x += 1) {
        // Three strands round the rope, slanting as they go along it.
        const across = ((x / 48) * 3 + y / 48) % 1;
        const crown = Math.sin(Math.PI * across);
        // The yarns within a strand: a fine grain along it.
        const yarn = 0.94 + 0.06 * Math.sin((x / 48) * Math.PI * 24 + (y / 48) * Math.PI * 8);
        const shade = Math.round(255 * (0.42 + 0.58 * crown) * yarn);
        const at = (y * 48 + x) * 4;
        image.data[at] = shade;
        image.data[at + 1] = shade;
        image.data[at + 2] = shade;
        image.data[at + 3] = 255;
      }
    }
    g.putImageData(image, 0, 0);
  }
  laid = new CanvasTexture(canvas);
  laid.wrapS = RepeatWrapping;
  laid.wrapT = RepeatWrapping;
  laid.colorSpace = SRGBColorSpace;
  return laid;
}

/** The lay keeps its pitch however far a rope's rod is stretched (one turn of the strands every 9 cm). */
function keepLay(rodMesh: Mesh): void {
  const turns = Math.round((rodMesh.scale.y / 0.09) * 20) / 20;
  if (rodMesh.userData.turns === turns) return;
  rodMesh.userData.turns = turns;
  const uv = rodMesh.geometry.getAttribute('uv') as BufferAttribute;
  let base = rodMesh.userData.along as Float32Array | undefined;
  if (base == null) {
    base = new Float32Array(uv.count);
    for (let i = 0; i < uv.count; i += 1) base[i] = uv.getY(i);
    rodMesh.userData.along = base;
  }
  for (let i = 0; i < uv.count; i += 1) uv.setY(i, base[i] * turns);
  uv.needsUpdate = true;
}

/** A soft round speck, for the points (a point without one is drawn as a square). */
let speck: CanvasTexture | null = null;
function speckTexture(): CanvasTexture {
  if (speck != null) return speck;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const g = canvas.getContext('2d');
  if (g != null) {
    const r = g.createRadialGradient(16, 16, 1, 16, 16, 15);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.6, 'rgba(255,255,255,0.8)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);
  }
  speck = new CanvasTexture(canvas);
  return speck;
}

/** Short-lived specks: snow shaken off a rope, grit from a loose hold, fibres from a parted rope. One draw for all of them. */
class Puffs {
  readonly points: Points;
  private readonly at: Float32Array;
  private readonly colour: Float32Array;
  private readonly speed: Float32Array;
  private readonly life: Float32Array;
  private next = 0;

  constructor(private readonly count: number) {
    this.at = new Float32Array(count * 3).fill(-999);
    this.colour = new Float32Array(count * 3);
    this.speed = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.at, 3));
    geometry.setAttribute('color', new BufferAttribute(this.colour, 3));
    this.points = new Points(geometry, new PointsMaterial({ map: speckTexture(), size: 0.009, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
    this.points.name = 'MountainPuffs';
    this.points.frustumCulled = false;
    this.points.pointerEvents = 'none';
  }

  burst(from: Vector3, n: number, colour: Color, spread: number, up = 0): void {
    for (let k = 0; k < n; k += 1) {
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      this.at[i * 3] = from.x + (Math.random() - 0.5) * 0.04;
      this.at[i * 3 + 1] = from.y + (Math.random() - 0.5) * 0.04;
      this.at[i * 3 + 2] = from.z + (Math.random() - 0.5) * 0.04;
      this.speed[i * 3] = (Math.random() - 0.5) * spread;
      this.speed[i * 3 + 1] = up + (Math.random() - 0.3) * spread;
      this.speed[i * 3 + 2] = (Math.random() - 0.2) * spread;
      this.colour[i * 3] = colour.r;
      this.colour[i * 3 + 1] = colour.g;
      this.colour[i * 3 + 2] = colour.b;
      this.life[i] = 0.9 + Math.random() * 0.8;
    }
    this.points.geometry.getAttribute('color').needsUpdate = true;
  }

  update(delta: number): void {
    for (let i = 0; i < this.count; i += 1) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= delta;
      if (this.life[i] <= 0) {
        this.at[i * 3 + 1] = -999;
        continue;
      }
      this.speed[i * 3 + 1] -= 3.2 * delta;
      this.at[i * 3] += this.speed[i * 3] * delta;
      this.at[i * 3 + 1] += this.speed[i * 3 + 1] * delta;
      this.at[i * 3 + 2] += this.speed[i * 3 + 2] * delta;
    }
    this.points.geometry.getAttribute('position').needsUpdate = true;
  }
}

/** Snow on the wind, in a box that stays round the eye: the near layer that shows how hard it blows. */
class BlowingSnow {
  readonly points: Points;
  private readonly at: Float32Array;
  private readonly box = { x: 6, y: 5, z: 5 };
  /** How many flakes are in the air (of the whole count). */
  share = 0.2;
  /** The wind's speed across the face (m/s). */
  wind = 1.5;

  constructor(private readonly count: number) {
    this.at = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      this.at[i * 3] = (Math.random() - 0.5) * this.box.x;
      this.at[i * 3 + 1] = (Math.random() - 0.5) * this.box.y;
      this.at[i * 3 + 2] = (Math.random() - 0.5) * this.box.z;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.at, 3));
    this.points = new Points(geometry, new PointsMaterial({ map: speckTexture(), color: 0xf4f8ff, size: 0.016, sizeAttenuation: true, transparent: true, opacity: 0.85, depthWrite: false }));
    this.points.name = 'BlowingSnow';
    this.points.frustumCulled = false;
    this.points.pointerEvents = 'none';
  }

  update(delta: number, eye: Vector3): void {
    this.points.position.copy(eye);
    this.points.geometry.setDrawRange(0, Math.round(this.count * Math.min(1, this.share)));
    const half = this.box;
    for (let i = 0; i < this.count; i += 1) {
      let x = this.at[i * 3] + this.wind * delta * (0.7 + (i % 5) * 0.12);
      let y = this.at[i * 3 + 1] - (0.5 + (i % 3) * 0.25) * delta;
      if (x > half.x / 2) x -= half.x;
      if (y < -half.y / 2) y += half.y;
      this.at[i * 3] = x;
      this.at[i * 3 + 1] = y;
    }
    this.points.geometry.getAttribute('position').needsUpdate = true;
  }
}

/**
 * A ghost of a hand that shows the gesture when the player's own hands have
 * done nothing for a while: it appears at the start of `path`, follows it,
 * fades, and comes again; the moment a hand closes, it is gone. No words.
 */
export class Demo {
  readonly hand: Group;
  private readonly material: MeshBasicMaterial;
  private idle = 0;
  private t = 0;
  private readonly at = new Vector3();
  /** Where the hand is `k` of the way through the gesture (0 to 1), into `out`; false when there is nothing to show. */
  path: ((k: number, out: Vector3) => boolean) | null = null;

  constructor() {
    this.material = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.hand = new Group();
    this.hand.name = 'GhostHand';
    const palm = new Mesh(new SphereGeometry(0.045, 12, 10), this.material);
    palm.scale.set(1, 1.25, 0.6);
    const thumb = new Mesh(new SphereGeometry(0.02, 8, 6), this.material);
    thumb.position.set(0.045, 0.01, 0.01);
    const wrist = new Mesh(new CylinderGeometry(0.028, 0.032, 0.08, 10), this.material);
    wrist.position.y = -0.085;
    this.hand.add(palm, thumb, wrist);
    this.hand.visible = false;
    this.hand.traverse((o) => {
      o.pointerEvents = 'none';
    });
  }

  /** `busy`: a hand of hers is closed. */
  update(delta: number, busy: boolean): void {
    if (busy || this.path == null) {
      this.idle = 0;
      this.t = 0;
      this.hand.visible = false;
      return;
    }
    this.idle += delta;
    if (this.idle < 3.5) return;
    this.t = (this.t + delta / 2.8) % 1.25;
    const k = Math.min(1, this.t);
    if (!this.path(k, this.at)) {
      this.hand.visible = false;
      return;
    }
    this.hand.visible = true;
    this.hand.position.copy(this.at);
    // Open as it comes, closed as it carries; in at the start, out at the end.
    this.hand.scale.setScalar(k < 0.12 ? 1.15 : 1);
    this.material.opacity = 0.55 * Math.min(1, k / 0.1) * (this.t > 1 ? Math.max(0, 1 - (this.t - 1) / 0.25) : 1);
  }
}

/** One of the party: a climber of simple solids in a hooded parka, goggles on, a pack on the back. Feet at the origin, facing +z. */
function buildClimber(parka: number): Group {
  const g = new Group();
  g.name = 'PartyClimber';
  const coat = standard(parka, 0.85);
  const dark = standard(0x23262c, 0.9);
  const skin = standard(0xc99a7a, 0.7);
  const glass = standard(0xc9812a, 0.12, 0.7);
  const pack = standard(0x4a4034, 0.9);
  const part = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  for (const side of [-1, 1]) {
    part(new Mesh(new CylinderGeometry(0.085, 0.075, 0.82, 8), dark), side * 0.1, 0.41, 0);
    part(new Mesh(new BoxGeometry(0.11, 0.09, 0.26), dark), side * 0.1, 0.045, 0.05);
    const arm = part(new Mesh(new CylinderGeometry(0.065, 0.055, 0.56, 8), coat), side * 0.27, 1.16, 0.03);
    arm.rotation.z = side * 0.14;
    part(new Mesh(new SphereGeometry(0.07, 8, 6), dark), side * 0.31, 0.86, 0.04);
  }
  const trunk = part(new Mesh(new CapsuleGeometry(0.2, 0.36, 5, 12), coat), 0, 1.14, 0);
  trunk.scale.z = 0.78;
  part(new Mesh(new SphereGeometry(0.145, 12, 10), coat), 0, 1.6, -0.01);
  part(new Mesh(new SphereGeometry(0.105, 12, 10), skin), 0, 1.585, 0.055);
  const lens = part(new Mesh(new SphereGeometry(0.062, 12, 8), glass), 0, 1.612, 0.105);
  lens.scale.set(1.45, 0.62, 0.7);
  // A harness at the waist, the line's colour.
  const belt = part(new Mesh(new TorusGeometry(0.19, 0.022, 6, 16), standard(0x2f6fb0, 0.8)), 0, 0.93, 0);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, 0.8, 1);
  part(new Mesh(new BoxGeometry(0.32, 0.44, 0.17), pack), 0, 1.2, -0.22);
  // One draw for the whole climber: the colours go onto the vertices.
  mergeFlatParts(g);
  g.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return g;
}

interface RopeSet {
  /** Where it hangs from, where it lies on the snow, and where it is taken (all at rest). */
  top: Vector3;
  foot: Vector3;
  grip: Vector3;
  fray: Vector3;
  rods: [Mesh, Mesh, Mesh];
  material: MeshStandardMaterial;
  whiskers: Group;
  mark: Group;
  /** A small light by its grip once it has been tried: green if it held, red if it opened. */
  tag: Mesh;
  /** Seconds since it parted (the loose end whipping up), or -1. */
  whip: number;
}

interface HoldSet {
  group: Group;
  entity: Entity;
  base: Vector3;
  row: number;
  at: number;
  ice: boolean;
  /** A ring round it once it has been tried: green if it bore her, red if it gave. */
  mark: Mesh;
  /** Where its knob sits inside the group (the knobs of a kind are drawn together, one draw). */
  shape: Matrix4;
}

/** All the knobs of one kind (rock, ice), drawn as one instanced mesh; each follows its hold's group. */
interface HoldPool {
  mesh: InstancedMesh;
  holds: HoldSet[];
}

interface MountainSet {
  root: Object3D;
  rootEntity: Entity;
  ropes: RopeSet[];
  carabiner: Group;
  line: Mesh[];
  party: Group[];
  holds: HoldSet[];
  pools: HoldPool[];
  own: Mesh;
  /** Her own body, below her eyes: trunk, legs to the rock, sleeves to her real hands. */
  self: Group;
  body: PerformerBody;
  /** The piece of ice that breaks off overhead. */
  ice: Mesh;
  /** The storm's front, coming up the valley behind her. */
  front: Mesh;
  /** The storm glass at her side: green while there is time, amber, then red as the front comes on. */
  gauge: Mesh;
  demo: Demo;
  lanterns: { glass: MeshStandardMaterial; light: PointLight; group: Group }[];
  /** The lanterns' ironwork, all three in one. */
  irons: Group;
  prize: Group;
  prizeAt: Vector3;
  lookFrom: Vector3;
  puffs: Puffs;
  snow: BlowingSnow;
  sun: DirectionalLight;
  lamp: SpotLight;
  vignette: Vignette;
  /** The face's distance ahead (-z) at a height, along the holds' column, smoothed. */
  wallZ(y: number): number;
  add<T extends Object3D>(object: T): T;
}

const LEAN = Math.tan((12 * Math.PI) / 180);
/** What a try has shown, kept in view: green for what has borne her, red for what gave. */
const HELD_GREEN = 0x3fca6b;
const GAVE_RED = 0xe5484d;
const AMBER = new Color(0xf0b429);
const RED = new Color(GAVE_RED);
const FROST = new Color(0xe9eef4);
const GRIT = new Color(0x4a4038);
const CHIP = new Color(0xd6ecf6);
const FIBRE = new Color(0xe8d9a8);

function buildSet(d: DirectorSystem, rootEntity: Entity, root: Object3D): MountainSet {
  // The face is read before anything is added to it: a line dropped onto the rock wherever a rope or a hold will be.
  const ray = new Raycaster();
  ray.far = 12;
  const from = new Vector3();
  const into = new Vector3(0, 0, -1);
  const theirs = /^(rope_|hold_|ice_hold_)/;
  const wall = (x: number, y: number, out: Vector3): Vector3 => {
    ray.set(from.set(x, y, 0.6), into);
    for (const hit of ray.intersectObject(root, true)) {
      let named: Object3D | null = hit.object;
      let skip = false;
      while (named != null && named !== root) {
        if (theirs.test(named.name)) skip = true;
        named = named.parent;
      }
      if (!skip) return out.copy(hit.point);
    }
    // Off the face (above the ledge): the lean it was built with.
    return out.set(x, y, -(1.2 + y * LEAN));
  };
  const heights: number[] = [];
  const raw: number[] = [];
  const probe = new Vector3();
  for (let y = 0.6; y <= 8.41; y += 0.2) {
    heights.push(y);
    raw.push(wall(HOLDS_X, y, probe).z);
  }
  const smooth = raw.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, i - 2); k <= Math.min(raw.length - 1, i + 2); k += 1) {
      sum += raw[k];
      n += 1;
    }
    return sum / n;
  });
  const wallZ = (y: number): number => {
    const f = Math.max(0, Math.min(heights.length - 1.001, (y - heights[0]) / 0.2));
    const i = Math.floor(f);
    return smooth[i] + (smooth[i + 1] - smooth[i]) * (f - i);
  };
  // Every place on the face the game needs, read now, while nothing of the game's own is in the way of the line.
  const ropeLines = [0, 1, 2].map((i) => {
    const x = ROPES_X + (i - 1) * ROPE_APART;
    return { top: wall(x, 8.2, new Vector3()).add(new Vector3(0, 0.05, 0.06)), foot: wall(x, 0.35, new Vector3()).setY(0.03).add(new Vector3(0, 0, 0.3)) };
  });
  const lanternPlaces = LANTERNS.map(([x, y]) => wall(x, y, new Vector3()).add(new Vector3(0, 0, 0.14)));
  const prizeAt = new Vector3(HOLDS_X, 10.2, wall(HOLDS_X, 8.3, new Vector3()).z + 0.15);
  // Where the whole face is looked at from, at the start: back on the snow, the eye above whatever ground is there.
  const lookFrom = new Vector3(-0.4, 1.6, LOOK_BACK);
  ray.far = 80;
  ray.set(from.set(lookFrom.x, 40, lookFrom.z), new Vector3(0, -1, 0));
  const ground = ray.intersectObject(root, true)[0];
  if (ground != null) lookFrom.y = ground.point.y + 1.6;
  ray.far = 12;
  // Outcrops of rock all over the face, clear of the ropes and the holds: something for the eye to slide past as she rises.
  const reliefPlaces: Vector3[] = [];
  let seed = 23;
  const random = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let k = 0; k < 60 && reliefPlaces.length < 34; k += 1) {
    const x = HOLDS_X - 2.6 + random() * 4.6;
    const y = 0.7 + random() * 7.4;
    if (Math.abs(x - HOLDS_X) < 0.52 || (Math.abs(x - ROPES_X) < 0.62 && y < 2.6)) continue;
    reliefPlaces.push(wall(x, y, new Vector3()));
  }
  const groundAt = (x: number, z: number): number => {
    ray.far = 80;
    ray.set(from.set(x, 40, z), new Vector3(0, -1, 0));
    const hit = ray.intersectObject(root, true)[0];
    ray.far = 12;
    return hit != null ? hit.point.y : 0;
  };
  const campPlaces = ([[-3.4, 2.6], [2.6, 3.4], [-0.6, 5.0]] as const).map(([x, z]) => new Vector3(x, groundAt(x, z), z));
  const ownLine = [wall(HOLDS_X + 0.62, 0.4, new Vector3()).add(new Vector3(0, 0, 0.08)), wall(HOLDS_X + 0.62, 8.2, new Vector3()).add(new Vector3(0, 0, 0.08))];
  const holdPlace = (n: 1 | 2, row: number, at: number): Vector3 => {
    const pitch = ROUTE.pitches[n];
    const eyeY = (n === 2 ? ICE_EYE_Y : ROCK_EYE_Y) + row * ROUTE.rowRise;
    const place = wall(HOLDS_X + (at - (pitch.across - 1) / 2) * ROUTE.holdApart, eyeY + ROUTE.holdAbove, new Vector3());
    // Never further than a seated arm from where she will be.
    place.z = Math.max(place.z, wallZ(eyeY) + ROUTE.standOff - 0.4);
    return place;
  };
  // A piton where she is clipped in: at the foot of each pitch and every third row.
  const pitonPlaces: Vector3[] = [];
  for (const n of [1, 2] as const) for (let row = 0; row < ROUTE.pitches[n].rows; row += ROUTE.pitonEvery) pitonPlaces.push(wall(HOLDS_X + 0.47, (n === 2 ? ICE_EYE_Y : ROCK_EYE_Y) + row * ROUTE.rowRise + 0.02, new Vector3()));
  const holdPlaces = ([1, 2] as const).map((n) => Array.from({ length: ROUTE.pitches[n].rows }, (_, row) => Array.from({ length: ROUTE.pitches[n].across }, (__, at) => holdPlace(n, row, at))));

  const add = <T extends Object3D>(object: T): T => {
    d.world.createTransformEntity(object, { parent: rootEntity, persistent: true });
    d.stage.own('mountain', object);
    return object;
  };

  // The world's own ropes and holds are stand-ins: the game hangs its own, so they can stretch, part and tear out.
  const firstMesh = (node: Object3D | null): Mesh | null => {
    let found: Mesh | null = null;
    node?.traverse((o) => {
      if (found == null && (o as Mesh).isMesh === true) found = o as Mesh;
    });
    return found;
  };
  const ropeLook = firstMesh(d.stage.node('mountain', 'rope_1'))?.material as MeshStandardMaterial | undefined;
  const rock = d.stage.node('mountain', 'hold_01')?.clone() ?? null;
  const ice = d.stage.node('mountain', 'ice_hold_01')?.clone() ?? null;
  for (const proto of [rock, ice]) proto?.position.set(0, 0, 0);
  root.traverse((o) => {
    if (theirs.test(o.name) && !o.name.endsWith('_grip')) o.visible = false;
  });

  const ropes: RopeSet[] = [0, 1, 2].map((i) => {
    const { top, foot } = ropeLines[i];
    const at = (y: number) => new Vector3().lerpVectors(foot, top, (y - foot.y) / (top.y - foot.y));
    const material = (ropeLook?.clone() ?? standard(0xbf5220, 0.85)) as MeshStandardMaterial;
    // Its strands are seen: an old laid rope, not a smooth pole.
    material.map = laidRope();
    material.roughness = 0.95;
    material.userData.base = material.color.clone();
    material.color.lerp(FROST, 0.3);
    const rods: [Mesh, Mesh, Mesh] = [add(rod(0.008, material)), add(rod(0.008, material)), add(rod(0.008, material))];
    for (const r of rods) r.name = `OldRope ${i + 1}`;
    // The strands that open where it is rotten: fine pale fibres, folded along the rope until it is loaded.
    const whiskers = new Group();
    whiskers.name = `RopeFibres ${i + 1}`;
    const straw = new MeshStandardMaterial({ color: 0xe8d9a8, roughness: 0.9, emissive: 0xffe9a0, emissiveIntensity: 0 });
    for (let k = 0; k < 16; k += 1) {
      const fibre = new Mesh(new CylinderGeometry(0.0022, 0.0012, 0.07 + (k % 4) * 0.02, 4), straw);
      fibre.geometry.translate(0, 0.045, 0);
      fibre.userData.turn = (k / 16) * Math.PI * 2;
      fibre.userData.along = ((k % 5) - 2) * 0.022;
      whiskers.add(fibre);
    }
    whiskers.traverse((o) => {
      o.pointerEvents = 'none';
    });
    add(whiskers);
    const mark = add(new Group());
    mark.name = `RopeGrip ${i + 1}`;
    const tag = add(new Mesh(new CylinderGeometry(0.0115, 0.0115, 0.05, 10), new MeshBasicMaterial({ color: HELD_GREEN, fog: false })));
    tag.name = `RopeTag ${i + 1}`;
    tag.pointerEvents = 'none';
    tag.position.copy(at(GRIP_Y + 0.26));
    tag.visible = false;
    return { top, foot, grip: at(GRIP_Y), fray: at(FRAY_Y), rods, material, whiskers, mark, tag, whip: -1 };
  });

  // The party's line ends in a steel carabiner on the guide's harness; three clients behind her on it.
  const carabiner = new Group();
  carabiner.name = 'Carabiner';
  const ring = new Mesh(new TorusGeometry(0.036, 0.0065, 8, 22), new MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.25, metalness: 0.95, emissive: 0xffd27a, emissiveIntensity: 0 }));
  ring.scale.set(1, 1.5, 1);
  carabiner.add(ring);
  const gate = new Mesh(new CylinderGeometry(0.0055, 0.0055, 0.085, 6), standard(0xc8442c, 0.4, 0.5));
  gate.position.x = 0.03;
  carabiner.add(gate);
  carabiner.traverse((o) => {
    o.pointerEvents = 'none';
  });
  add(carabiner);
  const cord = standard(0x2f6fb0, 0.8);
  const line = [0, 1, 2].map(() => add(rod(0.007, cord)));
  const party = [0xb3202e, 0xe2a93a, 0x2f7d6b].map((colour) => add(buildClimber(colour)));

  // The holds: a pool for the rock pitch and one for the ice, placed afresh for every attempt.
  const holds: HoldSet[] = [];
  const solids = new Map<boolean, Mesh>();
  const stone = standard(0x5b534b, 0.95);
  const glaze = new MeshStandardMaterial({ color: 0xbfe3f2, roughness: 0.08, metalness: 0.1 });
  const makeHold = (iceHold: boolean, row: number, at: number): HoldSet => {
    const group = new Group();
    group.name = `Hold ${iceHold ? 'ice' : 'rock'} ${row + 1}-${at + 1}`;
    const proto = iceHold ? ice : rock;
    let knob: Object3D;
    if (proto != null) {
      knob = proto.clone();
      knob.scale.multiplyScalar(0.5);
    } else {
      knob = new Mesh(new IcosahedronGeometry(0.07, 1), iceHold ? glaze : stone);
    }
    knob.rotation.z += row * 1.3 + at * 2.1;
    knob.visible = true;
    knob.traverse((o) => {
      o.visible = true;
      o.pointerEvents = 'none';
    });
    group.add(knob);
    const tried = new Mesh(new TorusGeometry(0.085, 0.008, 6, 22), new MeshBasicMaterial({ color: HELD_GREEN, fog: false }));
    tried.position.z = 0.07;
    tried.pointerEvents = 'none';
    tried.visible = false;
    group.add(tried);
    group.position.copy(holdPlaces[iceHold ? 1 : 0][row][at]);
    // The knob itself is not drawn here: where it sits in the group is kept, and all the knobs of its kind are one draw.
    group.updateMatrixWorld(true);
    const shape = new Matrix4();
    const solid = firstMesh(knob);
    if (solid != null) {
      shape.copy(group.matrixWorld).invert().multiply(solid.matrixWorld);
      if (!solids.has(iceHold)) solids.set(iceHold, solid);
      group.remove(knob);
    }
    const entity = d.world.createTransformEntity(group, { parent: rootEntity, persistent: true });
    d.stage.own('mountain', group);
    return { group, entity, base: holdPlaces[iceHold ? 1 : 0][row][at], row, at, ice: iceHold, mark: tried, shape };
  };
  for (const [n, iceHold] of [[1, false], [2, true]] as const) {
    const pitch = ROUTE.pitches[n];
    for (let r = 0; r < pitch.rows; r += 1) for (let k = 0; k < pitch.across; k += 1) holds.push(makeHold(iceHold, r, k));
  }
  const pools: HoldPool[] = [];
  for (const iceHold of [false, true]) {
    const solid = solids.get(iceHold);
    const mine = holds.filter((h) => h.ice === iceHold);
    if (solid == null || mine.length === 0) continue;
    const mesh = new InstancedMesh(solid.geometry, solid.material, mine.length);
    mesh.name = iceHold ? 'IceHolds' : 'RockHolds';
    mesh.pointerEvents = 'none';
    mesh.frustumCulled = false;
    pools.push({ mesh, holds: mine });
  }
  // The guide's own rope, hanging beside the holds from the top of the face: what she ends up on if a hold goes.
  const own = add(rod(0.009, standard(0xd8d2c4, 0.8)));
  own.name = 'GuideRope';
  stretch(own, ownLine[0], ownLine[1]);

  // The outcrops: the world's own rock knob, larger, one draw. (The snow caps on them read as white pills from her place, and are gone.)
  const knobMesh = firstMesh(rock);
  if (knobMesh != null) {
    const crags = new InstancedMesh(knobMesh.geometry, knobMesh.material, reliefPlaces.length);
    crags.name = 'FaceOutcrops';
    const put = new Matrix4();
    const turn = new Quaternion();
    const size = new Vector3();
    reliefPlaces.forEach((place, k) => {
      const big = 0.9 + ((k * 37) % 10) / 9;
      turn.setFromAxisAngle(yAxis, k * 1.7).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), k * 0.9));
      crags.setMatrixAt(k, put.compose(place, turn, size.setScalar(big)));
    });
    crags.pointerEvents = 'none';
    crags.frustumCulled = false;
    add(crags);
  }
  for (const pool of pools) add(pool.mesh);
  drawHolds(pools);
  // The pitons: a steel eye in the rock and a red sling through it, beside the row where a torn hold cannot drop her. All the eyes are one draw and all the slings one.
  const steel = standard(0xc8ccd0, 0.3, 0.9);
  const sling = standard(0xc02a2a, 0.8);
  const pitons = new Group();
  pitons.name = 'Pitons';
  for (const place of pitonPlaces) {
    const eyeRing = new Mesh(new TorusGeometry(0.03, 0.008, 6, 14), steel);
    eyeRing.position.set(place.x, place.y, place.z + 0.03);
    const loop = new Mesh(new TorusGeometry(0.06, 0.012, 6, 14), sling);
    loop.position.set(place.x, place.y - 0.07, place.z + 0.04);
    loop.scale.set(0.55, 1.2, 1);
    pitons.add(eyeRing, loop);
  }
  mergeByMaterial(pitons);
  pitons.traverse((o) => {
    o.pointerEvents = 'none';
  });
  add(pitons);
  // Three storm lanterns up the face, one where each pitch ends: a faint pilot flame until she gets there.
  const iron = standard(0x1d1f22, 0.5, 0.7);
  // The ironwork of all three is one draw; each glass keeps its own (it is lit by itself).
  const irons = new Group();
  irons.name = 'PitchLanternIron';
  const BIG = 1.7;
  const lanterns = lanternPlaces.map((place, k) => {
    const lantern = new Group();
    lantern.name = `PitchLantern ${k + 1}`;
    const glass = new MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.25, emissive: 0xffb347, emissiveIntensity: 0.6 });
    lantern.add(new Mesh(new CylinderGeometry(0.075, 0.075, 0.2, 12), glass));
    lantern.scale.setScalar(BIG);
    const ironAt = (mesh: Mesh, y: number): void => {
      mesh.position.set(place.x, place.y + y * BIG, place.z);
      mesh.scale.setScalar(BIG);
      irons.add(mesh);
    };
    ironAt(new Mesh(new CylinderGeometry(0.02, 0.095, 0.07, 12), iron), 0.135);
    ironAt(new Mesh(new CylinderGeometry(0.09, 0.09, 0.03, 12), iron), -0.115);
    ironAt(new Mesh(new TorusGeometry(0.07, 0.006, 6, 16, Math.PI), iron), 0.17);
    const light = new PointLight(0xffb060, 0, 6, 2);
    lantern.add(light);
    lantern.position.copy(place);
    lantern.traverse((o) => {
      o.pointerEvents = 'none';
    });
    add(lantern);
    return { glass, light, group: lantern };
  });
  mergeByMaterial(irons);
  irons.traverse((o) => {
    o.pointerEvents = 'none';
  });
  add(irons);
  // The word's feather, shining at the flag on top of the face: what all three pitches are for.
  const prize = new Group();
  prize.name = 'PrizeFeather';
  const plumeLook = featherMesh(FEATHER.stressTest, 1, 0.3).material as MeshStandardMaterial;
  plumeLook.emissive = new Color(FEATHER.stressTest);
  plumeLook.emissiveIntensity = 0.35;
  plumeLook.fog = false;
  const plume = new Mesh(new PlaneGeometry(1, 0.3), plumeLook);
  plume.rotation.z = -Math.PI / 2;
  const halo = new Mesh(new SphereGeometry(0.45, 16, 12), new MeshBasicMaterial({ color: 0xa8e0f0, transparent: true, opacity: 0.14, blending: AdditiveBlending, depthWrite: false, fog: false }));
  prize.add(plume, halo, new PointLight(0xa8e0f0, 3, 9, 1.5));
  prize.traverse((o) => {
    o.pointerEvents = 'none';
  });
  prize.position.copy(prizeAt);
  d.world.createTransformEntity(prize, { parent: rootEntity, persistent: true });
  d.stage.own('mountain', prize);

  // Her own body, seen when she looks down: posed every frame from her neck, her feet on the rock and her real hands.
  const body = new PerformerBody(GUIDE_LOOK);
  const self = body.root;
  self.traverse((o) => {
    o.pointerEvents = 'none';
    const cloth = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (cloth?.map != null) {
      cloth.map = null;
      cloth.color.setHex(GUIDE_LOOK.suit);
      cloth.metalness = 0;
      cloth.roughness = 0.9;
      cloth.needsUpdate = true;
    }
  });
  self.visible = false;
  add(self);
  // The piece of ice that breaks off overhead: pale and bright enough to be seen coming through the snow.
  const chunk = add(new Mesh(new IcosahedronGeometry(ICEFALL.size, 0), new MeshStandardMaterial({ color: 0xd6ecf6, roughness: 0.1, emissive: 0x9fd4ea, emissiveIntensity: 0.55, fog: false })));
  chunk.name = 'FallingIce';
  chunk.pointerEvents = 'none';
  chunk.visible = false;
  // The storm's front: a wall of dark cloud that comes up the valley behind her as a pitch runs out of time.
  const front = add(new Mesh(new SphereGeometry(1, 24, 14), new MeshBasicMaterial({ color: 0x3a434d, transparent: true, opacity: 0.94, side: DoubleSide, fog: false, depthWrite: false })));
  front.name = 'StormFront';
  front.scale.set(90, 55, 34);
  front.pointerEvents = 'none';
  front.frustumCulled = false;
  // The camp at the foot of the face: three tents on the snow, small from up on the rock.
  const cloths = [0xd86a1e, 0xe2b93a, 0x2f7d6b];
  const camp = new Group();
  camp.name = 'Camp';
  campPlaces.forEach((place, k) => {
    const tent = new Mesh(new ConeGeometry(1.15, 1.25, 4), standard(cloths[k], 0.9));
    tent.name = `Tent ${k + 1}`;
    tent.position.copy(place).add(new Vector3(0, 0.6, 0));
    tent.rotation.y = 0.5 + k * 0.9;
    tent.scale.set(1, 1, 1.4);
    camp.add(tent);
  });
  // The three tents are one draw, their cloth colours on the vertices.
  mergeFlatParts(camp);
  camp.traverse((o) => {
    o.pointerEvents = 'none';
  });
  add(camp);
  const demo = new Demo();
  add(demo.hand);
  // The storm glass: a small lamp that hangs by her at eye height wherever she is on the face, and says how near the storm is by its colour.
  const gauge = add(new Mesh(new SphereGeometry(0.035, 14, 10), new MeshBasicMaterial({ color: HELD_GREEN, fog: false })));
  gauge.name = 'StormGlass';
  gauge.pointerEvents = 'none';
  const hood = new Mesh(new CylinderGeometry(0.012, 0.04, 0.03, 10), standard(0x1d1f22, 0.5, 0.7));
  hood.position.y = 0.045;
  hood.pointerEvents = 'none';
  gauge.add(hood);
  gauge.visible = false;

  const puffs = new Puffs(260);
  add(puffs.points);
  const snow = new BlowingSnow(700);
  add(snow.points);
  // A cold sun low in the south, behind the party, on the face.
  const sun = add(new DirectionalLight(0xfff0dc, SUN[0]));
  sun.position.set(-6, 7, 12);
  add(sun.target);
  sun.target.position.set(0, 3, -2);
  // Her head lamp, for the dusk: what she looks at is what she sees.
  const lamp = new SpotLight(0xffe6c0, 0, 7, 0.62, 0.7, 2);
  lamp.position.set(0, 0.08, 0);
  lamp.target.position.set(0, -0.15, -1);
  d.player.head.add(lamp);
  d.player.head.add(lamp.target);
  return { root, rootEntity, ropes, carabiner, line, party, holds, pools, own, self, body, ice: chunk, front, gauge, demo, lanterns, irons, prize, prizeAt, lookFrom, puffs, snow, sun, lamp, vignette: new Vignette(d.player.head), wallZ, add };
}

interface HandState {
  /** Seconds since this hand's pinch closed (-1 while open). */
  since: number;
  rope: number;
  hold: HoldSet | null;
  carabiner: boolean;
  /** Where the hand was (in the player's own frame) when it took what it holds. */
  from: Vector3;
  rise: number;
  knocked: boolean;
  told: boolean;
  /** The hold has taken her whole weight in this hand. */
  proved: boolean;
  /** This hand has stayed on the hold of the row behind her: her anchor while the other tries the next. */
  anchor: boolean;
}

interface Play {
  d: DirectorSystem;
  set: MountainSet;
  hands: Hands;
  local: Record<Side, Vector3>;
  state: Record<Side, HandState>;
  paused: () => boolean;
  eye: Vector3;
  clock: number;
  gusting: boolean;
  /** The party has called out the ice once. */
  warned: boolean;
  /** The party as real people, for when they stand beside her (the coded climbers stand in for them on the line below her boots). */
  people: Person[];
  /** Played with the mouse: a click this frame, wherever the pointer is. How long each hand has been closed, and how long since the last click (s). */
  clicked: boolean;
  press: Record<Side, number>;
  sinceClick: number;
}

type Result = 'won' | 'the storm' | 'the rope parted';

const tmp = new Vector3();
const tmp2 = new Vector3();
const neck = new Vector3();
const hipsTo = new Vector3();
const sole = new Vector3();
const kneeTo = new Vector3();
const wrist = new Vector3();
const FACING = new Vector3(0, 0, -1);

const holdAt = new Matrix4();
const NOWHERE = new Matrix4().makeScale(0, 0, 0);
const pullAt = new Vector3();

/** Every knob goes where its hold's group is (tried aside, hauled on, hidden once torn out): two draws for all the holds on the face. */
function drawHolds(pools: HoldPool[]): void {
  for (const pool of pools) {
    for (let k = 0; k < pool.holds.length; k += 1) {
      const hold = pool.holds[k];
      if (hold.group.visible) {
        hold.group.updateMatrix();
        pool.mesh.setMatrixAt(k, holdAt.multiplyMatrices(hold.group.matrix, hold.shape));
      } else pool.mesh.setMatrixAt(k, NOWHERE);
    }
    pool.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** What the player is doing now, for the goal plate (and the dev log). */
function goal(now: string, done: number): void {
  setGoal({ where: WHERE, now, steps: [done, ROUTE.pitches.length] });
  if (import.meta.env.DEV) console.info(`[goal] ${WHERE} | ${now} | ${done}/${ROUTE.pitches.length}`);
}

/** The lanterns are seen from afar and from the top; on the face, a hand from her head, they are only dark boxes in the way. */
function showLanterns(set: MountainSet, on: boolean): void {
  set.irons.visible = on;
  for (const lantern of set.lanterns) lantern.group.visible = on;
}

/** The lanterns of the pitches behind her burn; the others keep their pilot flame. */
function lightLanterns(set: MountainSet, done: number): void {
  set.lanterns.forEach((lantern, k) => {
    lantern.glass.emissiveIntensity = k < done ? 3.2 : 0.6;
    lantern.light.intensity = k < done ? 0.45 : 0;
  });
}

/** The party as real people where the coded climbers are (beside her: those are then not drawn), looking at her; or put away. */
function showPeople(p: Play, on: boolean): void {
  p.people.forEach((person, k) => {
    const c = p.set.party[k];
    if (!on) {
      person.pose = 'hidden';
      return;
    }
    person.at(c.position.x, c.position.y, c.position.z, c.rotation.y);
    if (person.pose === 'hidden') person.pose = 'idle';
    person.gaze = p.eye;
    c.visible = false;
  });
}

/** Where the party stands at the foot of the ropes: to the guide's right, a step apart. */
function standParty(set: MountainSet): Vector3[] {
  const z = set.ropes[1].grip.z + FOOT_STAND;
  return set.party.map((_, k) => new Vector3(ROPES_X + 1.15 + 0.5 * k, 0, z - 0.35 + 0.42 * k));
}

/** The hands this frame: where they are in the world and in the player's own frame, and how long each has been closed. */
function readPlay(p: Play, delta: number): void {
  readHands(p.d, p.hands);
  for (const side of SIDES) {
    p.d.player.worldToLocal(p.local[side].copy(p.hands[side]));
    const s = p.state[side];
    // -1 while open; from 0 as it closes; pushed past the window once it has taken something.
    s.since = !p.hands.pinching[side] ? -1 : s.since < 0 ? 0 : s.since + delta;
  }
  // A click of the mouse, wherever the pointer is: a hand has just closed, or a hand that had stayed closed (it took something with a click) has just been opened by one.
  p.clicked = false;
  p.sinceClick += delta;
  for (const side of SIDES) {
    const closed = p.hands.pinching[side];
    const was = p.press[side];
    if (((closed && was === 0) || (!closed && was > 0.35)) && p.sinceClick > 0.2) {
      p.clicked = true;
      p.sinceClick = 0;
    }
    p.press[side] = closed ? was + Math.max(delta, 1e-4) : 0;
  }
}

/** Whether `side` may take something now: its pinch has just closed, or closed a moment ago. */
const taking = (p: Play, side: Side): boolean => p.hands.pinching[side] && p.state[side].since >= 0 && (p.state[side].since <= LATE_PINCH || mouse());

function drop(p: Play, side: Side): void {
  const s = p.state[side];
  s.rope = -1;
  s.hold = null;
  s.carabiner = false;
  s.anchor = false;
  s.proved = false;
}

/** The storm on a pitch (0 far, 1 on top of the party) and the gust blowing: the weather, the wind and the snow in the air. */
function weather(p: Play, n: number, pitch: Pitch, closing: number, delta: number): void {
  const d = p.d;
  d.stage.blendWeather(CLEAR[n], CLOSED[n], closing * closing);
  const g = gust(p.clock, pitch);
  if (g > 0 && !p.gusting) d.sounds.play('wind_gust', 0.5 + 0.3 * closing, 0.85 + Math.random() * 0.3);
  p.gusting = g > 0;
  d.sounds.bed('wind_loop', Math.min(1, 0.22 + 0.2 * n + 0.5 * closing));
  p.set.snow.share = [0.12, 0.75, 0.45][n] + 0.4 * closing + 0.2 * g;
  p.set.snow.wind = [1.6, 4.2, 3.0][n] * (1 + 0.8 * closing + 1.2 * g);
  p.set.snow.update(delta, p.eye);
  p.set.puffs.update(delta);
  p.set.vignette.update(delta);
  // The storm glass beside her: green, through amber, to red; it flutters once the front is nearly on her.
  const glass = p.set.gauge;
  // Only once the storm is on its way: until then nothing but the thing to take shines.
  glass.visible = closing > 0.12;
  if (n === 0) glass.position.set(p.eye.x + 0.2, p.eye.y + 0.12, p.eye.z - 0.4);
  else glass.position.set(p.eye.x + 0.44, p.eye.y + 0.04, p.set.wallZ(p.eye.y) + 0.1);
  const hue = (glass.material as MeshBasicMaterial).color;
  if (closing < 0.5) hue.setHex(HELD_GREEN).lerp(AMBER, closing / 0.5);
  else hue.copy(AMBER).lerp(RED, (closing - 0.5) / 0.5);
  if (closing > 0.8 && Math.sin(p.clock * 22) > 0.2) hue.multiplyScalar(0.45);
  // The front: far down the valley at first, over the camp as the time runs out; lit from inside now and then once it is near.
  p.set.front.position.set(p.eye.x, 14, p.eye.z + 135 - 100 * closing);
  (p.set.front.material as MeshBasicMaterial).color.setHex(closing > 0.45 && Math.sin(p.clock * 1.9) * Math.sin(p.clock * 7.3) > 0.93 ? 0x9aa6b4 : 0x3a434d);
  p.set.sun.intensity = SUN[n] * (1 - 0.6 * closing);
  p.set.lamp.intensity = n === 2 ? 0.8 : 0;
}

/** The storm arrives: the air goes white round the party. */
async function whiteOut(p: Play, n: number): Promise<void> {
  const d = p.d;
  d.sounds.play('wind_gust', 0.9, 0.7);
  d.sounds.bed('wind_loop', 1);
  const start = d.now;
  const stop = d.each((delta) => {
    const k = Math.min(1, (d.now - start) / 1.4);
    d.stage.setWeather({ ...CLOSED[n], density: CLOSED[n].density + 2.6 * k * k });
    p.set.snow.share = 1;
    p.set.snow.wind = 9;
    p.set.snow.update(delta, p.eye);
  });
  await d.wait(1.6);
  stop();
}

/** Draw rope `i`: taut or slack above the hand that hauls it, its strands open as far as it has frayed, its tail to the snow. */
function drawRope(set: MountainSet, i: number, rope: Rope, kink: Vector3 | null, load: number, sway: number, hint: boolean): void {
  const r = set.ropes[i];
  // The fibres: folded along the rope when whole, standing out all round as it frays.
  const open = Math.min(1, rope.fray * 1.4);
  r.whiskers.visible = rope.fray > 0.01;
  for (const fibre of r.whiskers.children) {
    const turn = fibre.userData.turn as number;
    fibre.position.set(0, fibre.userData.along as number, 0);
    fibre.rotation.set(Math.cos(turn) * open * 1.2, 0, Math.sin(turn) * open * 1.2);
    ((fibre as Mesh).material as MeshStandardMaterial).emissiveIntensity = hint ? 0.9 : 0;
  }
  if (rope.parted) {
    // The upper end has whipped up out of reach; the rest lies in the snow.
    const up = Math.min(1, Math.max(0, r.whip) / 0.25);
    tmp.copy(r.fray).setY(r.fray.y + 1.3 * up);
    tmp.x += 0.05 * Math.sin(r.whip * 7) * Math.exp(-r.whip);
    stretch(r.rods[0], r.top, tmp);
    keepLay(r.rods[0]);
    r.whiskers.position.copy(tmp);
    r.rods[1].visible = false;
    r.rods[2].visible = r.whip < 0.5;
    if (r.rods[2].visible) {
      tmp2.copy(r.foot).setY(Math.max(0.05, r.fray.y - 6 * r.whip * r.whip));
      stretch(r.rods[2], r.foot, tmp2);
      keepLay(r.rods[2]);
    }
    return;
  }
  r.rods[1].visible = true;
  r.rods[2].visible = true;
  // Slack hangs out from the face; weight takes it out of the rope.
  const slack = 0.16 * (1 - load);
  const give = ropeGive(rope, load);
  const low = kink ?? tmp2.copy(r.grip).add(tmp.set(sway * 0.02, 0, slack * 0.5));
  tmp.copy(r.fray).add(span.set(sway * 0.03, -give - (kink != null ? (r.grip.y - kink.y) * 0.55 : 0), slack));
  r.whiskers.position.copy(tmp);
  stretch(r.rods[0], r.top, tmp);
  const mid = tmp.clone();
  stretch(r.rods[1], mid, low);
  stretch(r.rods[2], low, r.foot);
  for (const rodMesh of r.rods) keepLay(rodMesh);
}

/** Pitch 1: the three old ropes. */
async function ropesPitch(p: Play, pitchIn: Pitch, losses: number): Promise<Result> {
  const { d, set } = p;
  const pitch = eased(pitchIn, losses);
  const dev = Number(devParam('rotten') ?? 0);
  // The first time, the rope in front of her is sound (one haul and she knows what a good rope does) and one of the two beside it is rotten; after a loss they are laid by chance.
  const beside = Math.random() < 0.5 ? 0 : 2;
  const ropes: Rope[] =
    dev >= 1 && dev <= 3
      ? layRopes(() => (dev - 0.5) / 3)
      : losses === 0
        ? [0, 1, 2].map((i) => ({ rotten: i === beside, fray: 0, held: false, parted: false }))
        : layRopes(Math.random);
  // After three losses the rotten one shows before it is touched.
  if (losses >= ROUTE.mercyAfter) for (const rope of ropes) if (rope.rotten) rope.fray = 0.3;
  const hint = losses >= ROUTE.hintAfter;
  set.ropes.forEach((r) => {
    r.whip = -1;
    r.material.color.copy(r.material.userData.base as Color).lerp(FROST, 0.3);
    for (const rodMesh of r.rods) rodMesh.visible = true;
    r.mark.position.copy(r.grip);
    r.tag.visible = false;
  });
  set.own.visible = false;
  set.self.visible = true;
  set.ice.visible = false;
  const middle = set.ropes[1].grip;
  p.eye.set(ROPES_X, FOOT_EYE_Y, middle.z + FOOT_STAND);
  d.rig.place(p.eye, 0);
  // The party stands to her right, roped one to the next; the line's end is the carabiner at her hip.
  const stand = standParty(set);
  set.party.forEach((c, k) => {
    c.visible = true;
    c.position.copy(stand[k]);
    c.rotation.set(0, Math.PI + 0.5, 0);
  });
  for (const person of p.people) person.pose = 'idle';
  showPeople(p, true);
  showLanterns(set, false);
  const hip = new Vector3(0.2, -0.36, -0.26);
  // (With the mouse it is shown nearer the middle of the view: the pointer at the view's edge turns the head.)
  const shown = mouse() ? new Vector3(0.1, -0.1, -0.38) : new Vector3(0.17, -0.2, -0.34);
  /** Played with the mouse: the rope she is hanging on since her click, and for how long. */
  let pulling: { i: number; t: number } | null = null;
  setDeskCarry(null);
  const rest = hip.clone();
  set.carabiner.visible = true;
  set.carabiner.position.copy(p.eye).add(rest);
  const ringMesh = set.carabiner.children[0] as Mesh;
  let clipped = -1;
  let started = false;
  let elapsed = 0;
  let logAt = 0;
  let skipped = false;
  let creak = 0;
  const arm = (): void =>
    d.onSkip(() => {
      skipped = true;
    });
  // One thing at a time is ringed: the next rope to try (the one in front of her first), and once every rope is known, the carabiner.
  const ORDER = [1, 0, 2];
  const nextRope = (): number => ORDER.find((i) => !ropes[i].parted && ropeKnown(ropes[i]) === 'untried') ?? -1;
  let ringed = -2;
  const targets = (): void => {
    const next = nextRope();
    const sound = ropes.some((r) => ropeKnown(r) === 'sound');
    const now = next >= 0 ? next : sound ? 3 : -1;
    setV2Targets(next >= 0 ? [set.ropes[next].mark] : sound ? [set.carabiner] : []);
    if (now === ringed) return;
    ringed = now;
    if (import.meta.env.DEV) console.info(`[mountain] stage ropes: the ring is on ${now === 3 ? 'the carabiner' : now >= 0 ? `rope ${now + 1} (${ropes[now].rotten ? 'rotten' : 'sound'})` : 'nothing'}`);
  };
  /** The plate's one sentence, after what the last rope did. */
  const tell = (after: 'start' | 'held' | 'rotten'): void => {
    const more = nextRope() >= 0;
    const lead = after === 'held' ? 'It holds. ' : after === 'rotten' ? 'It frays: rotten. ' : '';
    if (more) goal(`${lead}${mouse() ? 'Click to test the glowing rope.' : 'Pull the glowing rope down to test it.'}`, 0);
    else goal(`${lead}${mouse() ? 'Click to clip in to the rope that held.' : 'Clip the carabiner to a rope that held.'}`, 0);
  };
  targets();
  tell('start');
  if (losses === 0) void d.captions.say('S18-2', new Vector3(p.eye.x + 0.17, p.eye.y + 0.2, p.eye.z - 0.44), 0);
  // The gesture, shown by a ghost of a hand when hers have been idle: onto a rope and down; once a rope has held, the carabiner onto it.
  set.demo.path = (k, out) => {
    const held = ropes.findIndex((r) => ropeKnown(r) === 'sound');
    if (clipped >= 0) return false;
    const untried = nextRope();
    if (untried >= 0) {
      out.copy(set.ropes[untried].grip).add(tmp2.set(0, -0.4 * k, 0.09));
      return true;
    }
    if (held < 0) return false;
    out.lerpVectors(set.carabiner.position, set.ropes[held].grip, k);
    out.z += 0.06;
    return true;
  };
  if (import.meta.env.DEV) console.info(`[mountain] pitch 1: three ropes (losses ${losses})`);

  const frame = d.each((delta) => {
    if (p.paused()) return;
    p.clock += delta;
    readPlay(p, delta);
    // Played with the mouse: a click anywhere works on the one thing that is ringed. The glowing rope is hung on; the carabiner, once it is its turn, goes onto a rope that held.
    if (mouse() && p.clicked && clipped < 0 && pulling == null) {
      if (ringed >= 0 && ringed < 3) {
        pulling = { i: ringed, t: 0 };
        d.sounds.play('grab_soft', 0.6);
        d.sounds.play('rope_creak', 0.35);
        if (import.meta.env.DEV) console.info(`[mountain] rope ${ringed + 1} taken (a click)`);
      } else if (ringed === 3) {
        clipped = ropes.findIndex((r) => ropeKnown(r) === 'sound');
        if (clipped >= 0) {
          started = true;
          d.sounds.play('ear_click', 1, 0.55);
          d.sounds.play('grab_soft', 0.7);
          setV2Targets([]);
          if (import.meta.env.DEV) console.info(`[mountain] clipped to rope ${clipped + 1} (${ropeKnown(ropes[clipped])}): it ${clipVerdict(ropes[clipped])}`);
        }
      }
    }
    if (pulling != null) pulling.t += delta;
    // The first time there is no storm to lose to: the ropes are a rehearsal, untimed.
    if (started && clipped < 0 && losses > 0) elapsed += delta;
    weather(p, 0, pitch, storm(elapsed, pitch), delta);
    const sway = Math.sin(p.clock * 1.7) + 2 * gust(p.clock, pitch);
    // Her own body, seated on her pack at the foot of the ropes: boots in the snow, sleeves to her hands.
    neck.set(p.eye.x, p.eye.y - 0.17, p.eye.z + 0.05);
    set.body.spine(neck, hipsTo.set(p.eye.x, p.eye.y - 1, p.eye.z + 0.12), FACING);
    for (const side of SIDES) {
      const out = side === 'left' ? -0.15 : 0.15;
      set.body.leg(side, sole.set(p.eye.x + out, 0.07, p.eye.z - 0.42), kneeTo.set(out, 1, -0.4));
      set.body.arm(side, d.player.gripSpaces[side].getWorldPosition(wrist));
    }
    set.demo.update(delta, p.hands.pinching.left || p.hands.pinching.right);
    // Take a rope, or the carabiner (with her own hands; the mouse's clicks are taken above).
    for (const side of SIDES) {
      const s = p.state[side];
      if (!p.hands.pinching[side] || mouse()) {
        drop(p, side);
        continue;
      }
      if (s.rope >= 0 || s.carabiner || clipped >= 0 || !taking(p, side)) continue;
      // The carabiner: by a fresh pinch, or (a hand still closed coming to it) once a rope is known to hold; never picked up in passing before that.
      // (With the mouse the fingertip is on it and the palm a hand's length off: it is taken from farther, once it is its turn.)
      if (p.hands[side].distanceTo(set.carabiner.position) <= (mouse() && ringed === 3 ? 0.3 : ROUTE.takeReach) && (s.since <= LATE_PINCH || ropes.some((r) => ropeKnown(r) === 'sound'))) {
        s.carabiner = true;
        s.from.copy(p.local[side]);
        s.since = 50;
        d.sounds.play('grab_soft', 0.6);
        setDeskCarry(null);
        if (import.meta.env.DEV) console.info(`[mountain] carabiner taken by ${side}`);
        continue;
      }
      let best = -1;
      let bestAt: number = ROUTE.takeReach + 0.03;
      set.ropes.forEach((r, i) => {
        if (ropes[i].parted) return;
        const h = p.hands[side];
        if (h.y < 0.7 || h.y > 1.75) return;
        const k = (h.y - r.foot.y) / (r.top.y - r.foot.y);
        const off = Math.hypot(h.x - (r.foot.x + (r.top.x - r.foot.x) * k), h.z - (r.foot.z + (r.top.z - r.foot.z) * k) - 0.08);
        if (off < bestAt) {
          best = i;
          bestAt = off;
        }
      });
      if (best >= 0) {
        s.rope = best;
        s.since = 50;
        s.from.copy(p.local[side]);
        d.sounds.play('grab_soft', 0.6);
        d.sounds.play('rope_creak', 0.35);
        // Played with the mouse: one click takes it, and the hand hauls it down by itself and lets go.
        if (mouse()) {
          const g = set.ropes[best].grip;
          setDeskCarry([g.x, g.y - 0.45, g.z + 0.08]);
        }
        if (import.meta.env.DEV) console.info(`[mountain] rope ${best + 1} taken by ${side}`);
      }
    }
    // The ropes under the hands that haul them.
    creak -= delta;
    ropes.forEach((rope, i) => {
      const r = set.ropes[i];
      if (rope.parted) r.whip += delta;
      let holder: Side | null = null;
      for (const side of SIDES) if (p.state[side].rope === i) holder = side;
      // The one rope to try now glows; nothing else does.
      r.material.emissive.setHex(0xffb640);
      const hung = pulling != null && pulling.i === i;
      r.material.emissiveIntensity = ringed === i && holder == null && !hung ? 0.75 + 0.45 * Math.sin(p.clock * 5) : 0;
      const pull = holder == null ? 0 : Math.max(0, p.state[holder].from.y - p.local[holder].y);
      // (Clicked with the mouse, her weight comes onto it over half a second.)
      const load = clipped === i ? 1 : hung && pulling != null ? Math.min(1, pulling.t / 0.5) : ropeLoad(pull);
      const event = clipped === i ? 'nothing' : stepRope(rope, load, delta);
      if (hung && (event === 'held' || event === 'parted')) pulling = null;
      if (event === 'held') {
        started = true;
        // It takes her whole weight: the frost flies off its length, the bolt rings, it stands like a bar.
        r.material.color.copy(r.material.userData.base as Color);
        for (let k = 0; k < 6; k += 1) set.puffs.burst(tmp.lerpVectors(r.grip, r.top, 0.05 + k * 0.07), 9, FROST, 0.5);
        d.sounds.play('wire_creak', 0.7, 1.2);
        d.sounds.play('ear_click', 0.8, 0.7);
        (r.tag.material as MeshBasicMaterial).color.setHex(HELD_GREEN);
        r.tag.visible = true;
        if (import.meta.env.DEV) console.info(`[mountain] rope ${i + 1}: held`);
        targets();
        tell('held');
      } else if (event === 'fraying') {
        if (ropeKnown(rope) === 'rotten' && !r.tag.visible) {
          (r.tag.material as MeshBasicMaterial).color.setHex(GAVE_RED);
          r.tag.visible = true;
          if (import.meta.env.DEV) console.info(`[mountain] rope ${i + 1}: rotten (it frays)`);
          targets();
          tell('rotten');
        }
        if (creak <= 0) {
          creak = 0.22;
          d.sounds.play('rope_creak', 0.55 * pitch.tellSound, 1.5 + rope.fray);
          set.puffs.burst(r.whiskers.position, 4, FIBRE, 0.35);
        }
        if (import.meta.env.DEV && p.clock >= logAt) {
          logAt = p.clock + 0.15;
          console.info(`[mountain] rope ${i + 1}: fraying ${rope.fray.toFixed(2)}`);
        }
      } else if (event === 'parted') {
        started = true;
        r.whip = 0;
        d.sounds.play('rope_snap', 1);
        set.puffs.burst(r.whiskers.position, 40, FIBRE, 1.6, 0.6);
        for (const side of SIDES) if (p.state[side].rope === i) drop(p, side);
        if (import.meta.env.DEV) console.info(`[mountain] rope ${i + 1}: parted in the hand`);
        targets();
        tell('rotten');
      }
      // Hung on with a click, it is hauled down as a hand would haul it.
      if (hung) pullAt.set(r.grip.x, r.grip.y - 0.3 * load, r.grip.z + 0.07);
      drawRope(set, i, rope, rope.parted ? null : hung ? pullAt : holder == null ? null : p.hands[holder], load, sway, hint && rope.rotten);
    });
    // The carabiner: at her hip; lifted into view once a rope is known to hold; in the hand; on a rope.
    const known = ropes.some((r) => ropeKnown(r) === 'sound');
    let carrier: Side | null = null;
    for (const side of SIDES) if (p.state[side].carabiner) carrier = side;
    const itsTurn = ringed === 3 || (known && !mouse());
    (ringMesh.material as MeshStandardMaterial).emissiveIntensity = ringed === 3 && carrier == null && clipped < 0 ? 0.35 + 0.3 * Math.sin(p.clock * 5) : 0;
    if (clipped < 0) {
      if (carrier != null) {
        set.carabiner.position.copy(p.hands[carrier]);
        // Played with the mouse: taken, it goes to a rope that has held by itself.
        const to = mouse() ? ropes.findIndex((r) => ropeKnown(r) === 'sound') : -1;
        if (to >= 0) clipped = to;
        set.ropes.forEach((r, i) => {
          if (clipped >= 0 || ropes[i].parted) return;
          const h = p.hands[carrier as Side];
          const k = (h.y - r.foot.y) / (r.top.y - r.foot.y);
          const off = Math.hypot(h.x - (r.foot.x + (r.top.x - r.foot.x) * k), h.z - (r.foot.z + (r.top.z - r.foot.z) * k) - 0.06);
          // Only once it has been carried from where it hung: never clipped by being picked up beside a rope.
          if (off <= CLIP_REACH && h.y > 0.6 && h.y < 1.9 && p.local[carrier as Side].distanceTo(p.state[carrier as Side].from) >= 0.12) clipped = i;
        });
        if (clipped >= 0) {
          started = true;
          drop(p, carrier);
          d.sounds.play('ear_click', 1, 0.55);
          d.sounds.play('grab_soft', 0.7);
          setV2Targets([]);
          if (import.meta.env.DEV) console.info(`[mountain] clipped to rope ${clipped + 1} (${ropeKnown(ropes[clipped])}): it ${clipVerdict(ropes[clipped])}`);
        }
      } else {
        rest.lerp(itsTurn ? shown : hip, Math.min(1, delta * 4));
        set.carabiner.position.copy(p.eye).add(rest);
      }
    }
    // The party's line: from the carabiner to the first of them, then one to the next. They shift their weight and look about while they wait.
    set.party.forEach((c, k) => {
      if (!(clipped >= 0 && k === 0)) {
        c.rotation.y = Math.PI + 0.5 + 0.12 * Math.sin(p.clock * 0.6 + k * 2);
        c.position.y = stand[k].y + 0.01 * Math.abs(Math.sin(p.clock * 1.4 + k));
      }
      const a = k === 0 ? set.carabiner.position : tmp.copy(set.party[k - 1].position).add(tmp2.set(0, 1.0, 0));
      stretch(set.line[k], a, span.copy(c.position).add(tmp2.set(0, 1.0, 0)).clone());
    });
    showPeople(p, true);
  });
  arm();
  await d.until(() => clipped >= 0 || storm(elapsed, pitch) >= 1 || skipped);
  setDeskCarry(null);
  for (const r of set.ropes) r.material.emissiveIntensity = 0;
  if (skipped) {
    frame();
    return 'won';
  }
  if (clipped < 0) {
    if (import.meta.env.DEV) console.info(`[mountain] pitch 1 lost to the storm at ${elapsed.toFixed(1)} s`);
    frame();
    await whiteOut(p, 0);
    return 'the storm';
  }
  // The first of the party goes to the rope and starts up it.
  const rope = ropes[clipped];
  const r = set.ropes[clipped];
  set.carabiner.position.copy(r.grip).add(tmp.set(0, -0.12, 0.04));
  const client = set.party[0];
  const foot = r.foot.clone().add(new Vector3(0.05, 0, 0.32));
  const fromAt = client.position.clone();
  let t = 0;
  let parted = false;
  let hang = 0;
  const climb = d.each((delta) => {
    if (p.paused()) return;
    t += delta;
    // The first of them walks to the rope, then goes up it with a hand above his head.
    if (p.people[0] != null) p.people[0].pose = t < 1.4 ? 'walk' : 'arm';
    showPeople(p, true);
    if (t < 1.4) {
      client.position.lerpVectors(fromAt, foot, t / 1.4);
      client.rotation.y = Math.PI;
      return;
    }
    const up = t - 1.4;
    if (!parted) {
      client.position.set(foot.x, Math.min(2.2, up * 0.75), foot.z - 0.08 * Math.min(1, up));
      if (clipVerdict(rope) === 'parts') {
        rope.fray = Math.min(1, Math.max(rope.fray, up / ROPE.partyParts));
        if (rope.fray >= 1) {
          rope.parted = true;
          parted = true;
          r.whip = 0;
          hang = client.position.y;
          d.sounds.play('rope_snap', 1);
          d.sounds.play('crowd_gasp', 0.8);
          d.sounds.bed('heartbeat_loop', 0.8);
          set.puffs.burst(r.whiskers.position, 50, FIBRE, 1.8, 0.6);
          if (import.meta.env.DEV) console.info(`[mountain] rope ${clipped + 1} parted under the party: they hang on her line`);
        }
      }
    } else {
      // Caught on the guide's own line: a short drop, then swinging a hand above the snow. Nobody falls.
      hang = Math.max(0.35, hang - 2.5 * delta);
      client.position.y = hang;
      client.position.x = foot.x + 0.12 * Math.sin((t - 1.4) * 3.1);
      client.rotation.z = 0.12 * Math.sin((t - 1.4) * 3.1);
    }
  });
  arm();
  await d.until(() => (parted && t > 1.4 + ROPE.partyParts + 2.6) || (!parted && clipVerdict(rope) === 'holds' && t > 4.2) || skipped);
  climb();
  frame();
  client.rotation.z = 0;
  d.sounds.bed('heartbeat_loop', 0);
  if (parted && !skipped) return 'the rope parted';
  d.sounds.play('wire_creak', 0.5, 1.1);
  if (import.meta.env.DEV) console.info(`[mountain] pitch 1 won in ${elapsed.toFixed(1)} s`);
  return 'won';
}

/** Pitches 2 and 3: rows of holds up the rock, then up the ice, climbed hand over hand. */
async function climbPitch(p: Play, n: 1 | 2, pitchIn: Pitch, losses: number): Promise<Result> {
  const { d, set } = p;
  // Dev: ?ice=0 keeps the ice up on the face (a bot's hands are too slow in a loaded emulator to play under it).
  const pitch = devParam('ice') === '0' ? { ...eased(pitchIn, losses), iceEvery: 0 } : eased(pitchIn, losses);
  const iceHold = n === 2;
  // Played with the mouse, the wind is the game: it gusts often, and a haul begun in a gust slips. (Dev: ?wind=0 plays without it, one click a hold.)
  const timing = mouse() && devParam('wind') !== '0';
  const wind: Pitch = timing && pitch.rattle > 0 ? { ...pitch, gustEvery: iceHold ? 2.8 : 3.2, gustSeconds: iceHold ? 1.5 : 1.4 } : pitch;
  const ownX = set.own.position.x;
  const rows: Row[] = layRows(pitch, Math.random);
  // The very first row of the climb is a lesson: one of its two holds is loose, and nothing is timed until it is behind her.
  const lesson = n === 1 && losses === 0;
  if (lesson) rows[0] = Math.random() < 0.5 ? [true, false] : [false, true];
  const base = iceHold ? ICE_EYE_Y : ROCK_EYE_Y;
  for (const r of set.ropes) for (const m of [...r.rods, r.whiskers]) m.visible = false;
  showPeople(p, false);
  showLanterns(set, false);
  // Played with the mouse, the view looks up the face: the row to climb is in its middle, not in the edge band that turns the head.
  setDeskLook(0.28);
  set.carabiner.visible = false;
  set.own.visible = true;
  set.self.visible = true;
  for (const l of set.line) l.visible = true;
  const mine = set.holds.filter((h) => h.ice === iceHold);
  for (const hold of mine) {
    hold.group.position.copy(hold.base);
    hold.group.rotation.set(0, 0, 0);
    hold.group.visible = true;
    hold.mark.visible = false;
  }
  const climb: Climb = { row: 0, rise: 0 };
  // The seat is put once; from then on only her own haul (and a fall) moves it, so her head is free to lean and look down.
  const eyeAt = (height: number): Vector3 => p.eye.set(HOLDS_X, base + height, set.wallZ(base + height) + ROUTE.standOff);
  d.rig.place(eyeAt(0), 0);
  const origin = d.player.position.clone();
  const eye0 = p.eye.clone();
  let sag = 0;
  const seat = (): void => {
    eyeAt(Math.min(climbHeight(climb), pitch.rows * ROUTE.rowRise));
    p.eye.y -= sag;
    d.player.position.copy(origin).add(tmp.copy(p.eye).sub(eye0));
    d.player.updateMatrixWorld(true);
    // Her own body below her eyes: hips out from the rock, boots on it, sleeves to her hands. Then the party on the line under her boots, looking up.
    neck.set(p.eye.x, p.eye.y - 0.17, p.eye.z + 0.04);
    set.body.spine(neck, hipsTo.set(p.eye.x, p.eye.y - 1, p.eye.z + 0.16), FACING);
    for (const side of SIDES) {
      const out = side === 'left' ? -0.13 : 0.13;
      const footY = p.eye.y - 1.28 + (side === 'left' ? 0.09 : 0);
      set.body.leg(side, sole.set(p.eye.x + out, footY, set.wallZ(Math.max(0.6, footY)) + 0.1), kneeTo.set(out * 2.5, 0.25, -1));
      set.body.arm(side, p.d.player.gripSpaces[side].getWorldPosition(wrist));
    }
    set.party.forEach((c, k) => {
      const y = p.eye.y - 3.0 - 1.35 * k;
      c.visible = y > -0.6;
      c.position.set(HOLDS_X - 0.3 + 0.12 * k, Math.max(0, y), set.wallZ(Math.max(0.6, y + 1)) + 0.26);
      c.rotation.set(-0.22, Math.PI, 0);
      const from = k === 0 ? tmp.copy(p.eye).add(tmp2.set(0, -0.72, -0.08)) : tmp.copy(set.party[k - 1].position).add(tmp2.set(0, 1.0, 0.05));
      stretch(set.line[k], from, span.copy(c.position).add(tmp2.set(0, 1.05, 0.05)).clone());
    });
  };
  seat();
  const loose = (hold: HoldSet): boolean => rows[hold.row]?.[hold.at] ?? false;
  const gone = new Set<HoldSet>();
  const rowHolds = (): HoldSet[] => mine.filter((h) => h.row === climb.row && !gone.has(h));
  // The gold ring is only on holds that may still be the right one: not on one that has shown it gives.
  const shaky = new Set<HoldSet>();
  // One hold at a time is ringed: the next one to try.
  let ringedHold: HoldSet | null = null;
  const ring = (): void => {
    const next = rowHolds().filter((h) => !shaky.has(h))[0] ?? null;
    setV2Targets(next != null ? [next.group] : []);
    if (next === ringedHold) return;
    ringedHold = next;
    if (import.meta.env.DEV && next != null) console.info(`[mountain] stage ${iceHold ? 'ice' : 'rock'}: the ring is on hold ${next.row + 1}-${next.at + 1} (${loose(next) ? 'loose' : 'sound'})`);
  };
  ring();
  /** The plate's one sentence, after what the last hold did. */
  const tell = (after: 'start' | 'gives' | 'bore'): void => {
    const lead = after === 'gives' ? 'It gives: leave it. ' : after === 'bore' ? 'It bears you. ' : '';
    goal(`${lead}${mouse() ? 'Click to test the ringed hold.' : 'Tug the ringed hold, then haul down on it.'}`, n);
  };
  let elapsed = 0;
  let timed = !lesson;
  let skipped = false;
  let dribble = 0;
  let falling = false;
  let falls = 0;
  let slips = 0;
  let windy = false;
  /** Played with the mouse: the hold her click is trying, the sound hold she waits on for the wind to drop, and the haul under way once she has gone for it. */
  let trying: { hold: HoldSet; t: number } | null = null;
  let waiting: HoldSet | null = null;
  let hauling: { hold: HoldSet; side: Side; from: number; t: number } | null = null;
  setDeskCarry(null);
  let hurried = false;
  let iceIn = pitch.iceEvery * (0.6 + Math.random() * 0.5);
  let iceT = -1;
  let iceX = 0;
  let iceFrom = 0;
  const arm = (): void =>
    d.onSkip(() => {
      skipped = true;
    });
  const grit = iceHold ? CHIP : GRIT;
  if (import.meta.env.DEV) console.info(`[mountain] pitch ${n + 1}: ${pitch.rows} rows of ${pitch.across} (losses ${losses}); tell ${(pitch.tell * 100).toFixed(1)} cm, ${pitch.seconds} s`);
  const grip: Grip = { off: 0, down: 0 };
  tell('start');
  const coachAt = (): Vector3 => new Vector3(p.eye.x - 0.16, p.eye.y + 0.36, p.eye.z - ROUTE.standOff + 0.08);
  // With two hands, the climber's way; with the mouse's one hand, the try before the haul.
  if (losses === 0 && !iceHold) void d.captions.say(mouse() ? 'S18-6' : 'S18-3', coachAt(), 0);
  // The gesture, shown by a ghost of a hand when hers have been idle: onto a hold, a small try, then the haul.
  set.demo.path = (k, out) => {
    const first = ringedHold ?? rowHolds()[0];
    if (first == null) return false;
    out.copy(first.base).add(tmp2.set(0, 0, 0.05));
    if (k < 0.35) out.x += 0.05 * Math.sin((k / 0.35) * Math.PI * 2);
    else out.y -= 0.42 * ((k - 0.35) / 0.65);
    return true;
  };

  /** Off the rock and onto her rope: the drop under gravity, the rope's catch, and back on at the last piton. The storm does not wait. */
  const takeFall = async (cause: string): Promise<void> => {
    falling = true;
    falls += 1;
    for (const side of SIDES) drop(p, side);
    setV2Targets([]);
    ringedHold = null;
    trying = null;
    waiting = null;
    hauling = null;
    // Whatever ice was in the air has gone by.
    iceT = -1;
    set.ice.visible = false;
    iceIn = Math.max(iceIn, 4);
    if (import.meta.env.DEV) console.info(`[mountain] she is off (${cause}) on row ${climb.row + 1}: onto her rope, back to the piton at row ${pitonBelow(climb.row) + 1}`);
    const dropSeconds = Math.sqrt((2 * ROUTE.fall) / 9.81);
    d.sounds.play('fall_whoosh', 0.9);
    d.sounds.play('crowd_gasp', 0.8);
    d.sounds.play('wire_creak', 1, 0.7, dropSeconds);
    d.sounds.play('net_twang', 0.5, 0.6, dropSeconds);
    d.sounds.bed('heartbeat_loop', 0.95);
    let t = 0;
    const still = lessMotion();
    if (!still) set.vignette.set(0.55);
    const going = d.each((delta) => {
      t += delta;
      if (timed) elapsed += delta;
      if (!still) {
        const after = t - dropSeconds;
        // The rope stretches and throws her back a little, twice, then she hangs.
        sag = fallen(t) + (after > 0 ? 0.22 * Math.exp(-after * 3.2) * Math.sin(after * 9) : 0);
        seat();
      }
      set.puffs.update(delta);
      set.snow.wind = 7;
      set.snow.update(delta, p.eye);
      set.vignette.update(delta);
    });
    if (still) await d.rig.fadeTo(1);
    await d.wait(dropSeconds + 2.1);
    await d.rig.fadeTo(1);
    going();
    sag = 0;
    climb.row = pitonBelow(climb.row);
    climb.rise = 0;
    set.vignette.set(1);
    set.vignette.update(1);
    d.sounds.bed('heartbeat_loop', 0);
    seat();
    ring();
    await d.rig.fadeTo(0);
    falling = false;
    if (import.meta.env.DEV) console.info(`[mountain] back on the rock at row ${climb.row + 1}`);
  };

  /** A row is behind her: the hand that hauled may stay as her anchor, the next row is ringed. */
  const rowDone = (hold: HoldSet, side: Side): void => {
    timed = true;
    // This hand may stay where it is: the hold that bore her is her anchor for the next. (The mouse has one hand: it is let go, to take the next.)
    p.state[side].anchor = true;
    drop(p, side === 'left' ? 'right' : 'left');
    if (mouse()) drop(p, side);
    d.sounds.play('rope_creak', 0.3, 0.9);
    set.puffs.burst(hold.base, 6, FROST, 0.3);
    ring();
    if (climb.row < pitch.rows) tell('bore');
    if (import.meta.env.DEV) console.info(`[mountain] row ${climb.row} of ${pitch.rows} done at ${elapsed.toFixed(1)} s`);
  };

  const frame = d.each((delta) => {
    if (p.paused() || falling) return;
    p.clock += delta;
    readPlay(p, delta);
    if (timed) elapsed += delta;
    const g = gust(p.clock, wind);
    // The wind covers what a hold says: in a gust its scrape or its knock is all but lost.
    const hush = 1 - 0.85 * g;
    const closing = storm(elapsed, pitch);
    weather(p, n, wind, closing, delta);
    if (timing) {
      // The wind is seen and heard, not signalled: in a gust the snow streams white across the face and her own rope whips; between gusts the air is all but still.
      set.snow.share = 0.14 + 0.86 * g;
      set.snow.wind = 1.1 + 8 * g;
      set.own.position.x = ownX + 0.06 * g * Math.sin(p.clock * 13);
      d.sounds.bed('wind_loop', Math.min(1, 0.12 + 0.88 * g));
      if (g > 0.3 && Math.random() < 0.5) set.puffs.burst(tmp.set(p.eye.x - 0.5 + Math.random(), p.eye.y - 0.2 + 0.7 * Math.random(), set.wallZ(p.eye.y) + 0.12), 2, FROST, 1.4);
      const blowing = g > 0.1;
      if (blowing !== windy) {
        windy = blowing;
        if (import.meta.env.DEV) console.info(`[mountain] wind: ${windy ? 'gust' : 'calm'}`);
      }
    }
    if (mouse() && p.clicked) {
      // A click anywhere works on the one hold that is ringed: the first tries it; on a hold that answered sound, the next goes for it.
      if (waiting != null && hauling == null) {
        const hold = waiting;
        if (timing && windy && !(lesson && climb.row === 0)) {
          slips += 1;
          elapsed += SLIP_SECONDS;
          d.sounds.play(iceHold ? 'ice_crack' : 'rock_scrape', 0.8, 1.3);
          d.sounds.play('crowd_gasp', 0.45);
          set.puffs.burst(tmp.copy(hold.base).add(tmp2.set(0, -0.9, 0.1)), 30, grit, 0.9);
          goal('A gust took your feet. Wait for the wind to drop, then click.', n);
          if (import.meta.env.DEV) console.info(`[mountain] slip: she went for hold ${hold.row + 1}-${hold.at + 1} in a gust (${slips} slips, ${SLIP_SECONDS} s lost)`);
        } else {
          waiting = null;
          hauling = { hold, side: 'right', from: climb.rise, t: 0 };
          d.sounds.play('grab_soft', 0.5, 0.8);
          if (import.meta.env.DEV) console.info(`[mountain] hold ${hold.row + 1}-${hold.at + 1}: she hauls up in the calm`);
        }
      } else if (trying == null && hauling == null && ringedHold != null) {
        trying = { hold: ringedHold, t: 0 };
        d.sounds.play('grab_soft', 0.55);
        if (import.meta.env.DEV) console.info(`[mountain] hold ${ringedHold.row + 1}-${ringedHold.at + 1} taken (a click)`);
      }
    }
    if (hauling != null) {
      // She goes up on the hold she let go for: half a second's haul.
      hauling.t += delta;
      const k = Math.min(1, hauling.t / 0.6);
      if (stepClimb(climb, hauling.from, { off: 0, down: ROUTE.haulFrom + ROUTE.rowRise * k * k * (3 - 2 * k) })) {
        const went = hauling;
        hauling = null;
        rowDone(went.hold, went.side);
      }
    }
    if (closing >= 0.6 && !hurried) {
      hurried = true;
      void d.captions.say('S18-5', coachAt(), 0);
    }
    set.demo.update(delta, p.hands.pinching.left || p.hands.pinching.right);
    const row = rowHolds();
    // After three losses the loose ones shed a little grit by themselves.
    dribble -= delta;
    if (losses >= ROUTE.mercyAfter && dribble <= 0) {
      dribble = 0.7;
      for (const hold of row) if (loose(hold)) set.puffs.burst(hold.base, 3, grit, 0.15);
    }
    for (const hold of row) {
      // Everything rattles in a gust: a tell is read between them.
      hold.group.position.copy(hold.base);
      if (g > 0) hold.group.position.add(tmp.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0).multiplyScalar(pitch.rattle * g));
      hold.group.rotation.z = 0;
    }
    if (trying != null) {
      // The try her click began: a third of a second's tug sideways. A loose hold shifts and sheds grit; a sound one answers with a knock.
      trying.t += delta;
      const hold = trying.hold;
      const k = Math.min(1, trying.t / 0.3);
      if (loose(hold)) {
        const shift = Math.max(0.03, pitch.tell * 2) * k;
        hold.group.position.x += shift;
        hold.group.rotation.z = shift * 5;
      }
      if (k >= 1) {
        trying = null;
        if (loose(hold)) {
          d.sounds.play(iceHold ? 'ice_crack' : 'rock_scrape', 0.85, iceHold ? 1.3 : 1);
          set.puffs.burst(hold.base, 26, grit, 0.5);
          (hold.mark.material as MeshBasicMaterial).color.setHex(GAVE_RED);
          hold.mark.visible = true;
          shaky.add(hold);
          ring();
          tell('gives');
          if (import.meta.env.DEV) console.info(`[mountain] hold ${hold.row + 1}-${hold.at + 1} tried: gives (loose)`);
        } else {
          d.sounds.play('sandbag_drop', 0.7, 1.7);
          (hold.mark.material as MeshBasicMaterial).color.setHex(HELD_GREEN);
          hold.mark.visible = true;
          if (import.meta.env.DEV) console.info(`[mountain] hold ${hold.row + 1}-${hold.at + 1} tried: solid`);
          if (timing) {
            waiting = hold;
            goal(lesson && climb.row === 0 ? 'It holds. Click again to haul up.' : 'It holds. Wait for the wind to drop, then click to haul up.', n);
          } else hauling = { hold, side: 'right', from: climb.rise, t: 0 };
        }
      }
    }

    // Ice breaks off overhead and comes down her line: lean out of its way.
    if (pitch.iceEvery > 0 && timed) {
      if (iceT < 0) {
        iceIn -= delta;
        if (iceIn <= 0) {
          iceIn = pitch.iceEvery * (0.75 + Math.random() * 0.5);
          iceT = 0;
          // At her head as it is now: sitting still is being under it.
          iceX = Math.max(HOLDS_X - 0.35, Math.min(HOLDS_X + 0.35, d.eyeAt.x));
          iceFrom = p.eye.y + ICEFALL.above;
          set.ice.visible = true;
          d.sounds.play('ice_crack', 1, 0.55);
          // (With the mouse there is nothing to do about it, so nothing is said.)
          if (!p.warned && !mouse()) {
            p.warned = true;
            void d.captions.say('S18-4', coachAt(), 0);
          }
          if (import.meta.env.DEV) console.info(`[mountain] ice above her, coming down x ${iceX.toFixed(2)} (her head at ${d.eyeAt.x.toFixed(2)})`);
        }
      } else {
        const before = iceT;
        iceT += delta;
        const y = iceFrom - (ICEFALL.above / ICEFALL.warning) * iceT;
        set.ice.position.set(iceX, y, set.wallZ(Math.max(0.6, Math.min(8.2, y))) + 0.2);
        set.ice.rotation.x += delta * 7;
        set.ice.rotation.z += delta * 4;
        if (Math.floor(iceT / 0.12) !== Math.floor(before / 0.12)) set.puffs.burst(set.ice.position, 3, CHIP, 0.4);
        if (before < ICEFALL.warning && iceT >= ICEFALL.warning) {
          // A hand over her head takes it on the glove; a head leant out of its line lets it by.
          const covered = SIDES.some((side) => iceCovered(p.hands[side].x, p.hands[side].y, d.eyeAt.y, iceX));
          // Played with the mouse, the head cannot lean out of its line: it only passes her.
          const hit = !covered && !mouse() && iceHits(iceX, d.eyeAt.x);
          if (import.meta.env.DEV) console.info(`[mountain] the ice ${hit ? 'hits her' : covered ? 'breaks on her glove' : 'passes her'} (her head ${Math.abs(d.eyeAt.x - iceX).toFixed(2)} m from its line)`);
          if (covered) {
            set.puffs.burst(set.ice.position, 40, CHIP, 1.4, 0.4);
            d.sounds.play('ice_crack', 0.9, 1.5);
            set.ice.visible = false;
            iceT = -1;
            return;
          }
          if (hit) {
            set.puffs.burst(set.ice.position, 50, CHIP, 1.6);
            d.sounds.play('ice_crack', 1, 1);
            set.ice.visible = false;
            iceT = -1;
            void takeFall('the ice hit her');
            return;
          }
          d.sounds.play('swing_whoosh', 0.7, 1.2);
        }
        if (iceT > ICEFALL.warning + 0.8) {
          set.ice.visible = false;
          iceT = -1;
        }
      }
    }

    for (const side of SIDES) {
      const s = p.state[side];
      const other = p.state[side === 'left' ? 'right' : 'left'];
      // (With her own hands; the mouse's clicks are taken above.)
      if (!p.hands.pinching[side] || mouse()) {
        drop(p, side);
        continue;
      }
      if (s.hold == null && taking(p, side)) {
        let best: HoldSet | null = null;
        let bestAt: number = ROUTE.takeReach;
        for (const hold of row) {
          const off = p.hands[side].distanceTo(hold.base);
          if (off <= bestAt && other.hold !== hold) {
            best = hold;
            bestAt = off;
          }
        }
        if (best != null) {
          s.hold = best;
          s.anchor = false;
          s.proved = false;
          s.since = 50;
          s.from.copy(p.local[side]);
          s.rise = climb.rise;
          s.knocked = false;
          s.told = false;
          d.sounds.play('grab_soft', 0.55);
          if (import.meta.env.DEV) console.info(`[mountain] hold ${best.row + 1}-${best.at + 1} taken by ${side}${other.anchor ? ' (the other hand stays on)' : ''}`);
        }
      }
      const hold = s.hold;
      // A hand that stays on the hold behind her is only that: her anchor.
      if (hold == null || s.anchor) continue;
      const now = p.local[side];
      grip.down = Math.max(0, s.from.y - now.y);
      grip.off = Math.hypot(now.x - s.from.x, now.z - s.from.z) + Math.max(0, now.y - s.from.y);
      if (loose(hold)) {
        // It moves with the hand, as far as its tell.
        const shift = holdShift(true, grip, pitch);
        tmp.copy(now).sub(s.from);
        if (tmp.lengthSq() > 1e-8) hold.group.position.addScaledVector(tmp.normalize(), shift);
        hold.group.rotation.z = shift * 5;
        if (!s.told && shift >= pitch.tell * 0.7) {
          s.told = true;
          d.sounds.play(iceHold ? 'ice_crack' : 'rock_scrape', 0.75 * pitch.tellSound * hush, iceHold ? 1.3 : 1);
          set.puffs.burst(hold.base, Math.round(6 + pitch.tell * 400), grit, 0.25);
          (hold.mark.material as MeshBasicMaterial).color.setHex(GAVE_RED);
          hold.mark.visible = true;
          shaky.add(hold);
          ring();
          tell('gives');
          if (import.meta.env.DEV) console.info(`[mountain] hold ${hold.row + 1}-${hold.at + 1} tried: gives (loose)`);
        }
        // With the mouse: a hold that has shown it gives is let go of by moving the hand off it, to take another without a click.
        if (mouse() && s.told && grip.off > 0.14 && grip.down < ROUTE.haulFrom) {
          drop(p, side);
          continue;
        }
        // Weight goes onto it all the same: she rises with her hand, until it lets go.
        if (climb.row % ROUTE.pitonEvery !== 0 || other.anchor) climb.rise = Math.max(climb.rise, Math.min(ROUTE.rowRise - 0.01, s.rise + haulRise(grip)));
        if (ripped(true, grip)) {
          const how = torn(other.anchor && other.hold != null, climb.row);
          gone.add(hold);
          hold.group.visible = false;
          d.sounds.play(iceHold ? 'ice_crack' : 'rock_scrape', 1, 0.75);
          set.puffs.burst(hold.base, 45, grit, 1.2, 0.2);
          if (how === 'caught') {
            // It comes away in her hand: her other hand (or the ledge she stands on) has her. A fright, and the time it cost.
            climb.rise = s.rise;
            drop(p, side);
            d.sounds.play('crowd_gasp', 0.5);
            ring();
            if (import.meta.env.DEV) console.info(`[mountain] hold ${hold.row + 1}-${hold.at + 1} tore out: caught (${other.anchor ? 'her other hand is on' : 'clipped to the piton'})`);
          } else {
            void takeFall(`hold ${hold.row + 1}-${hold.at + 1} tore out with no hand on`);
            return;
          }
        }
      } else {
        if (!s.knocked && knocks(false, grip)) {
          s.knocked = true;
          d.sounds.play('sandbag_drop', 0.3 * hush, 1.7);
          if (import.meta.env.DEV) console.info(`[mountain] hold ${hold.row + 1}-${hold.at + 1} tried: solid`);
        }
        if (!s.proved && proven(false, grip)) {
          // It has her whole weight and has not moved: the other hand may let go.
          s.proved = true;
          d.sounds.play('ear_click', 0.7, 0.8);
          set.puffs.burst(hold.base, 5, FROST, 0.2);
          (hold.mark.material as MeshBasicMaterial).color.setHex(HELD_GREEN);
          hold.mark.visible = true;
          if (import.meta.env.DEV) console.info(`[mountain] hold ${hold.row + 1}-${hold.at + 1}: bears her weight`);
        }
        const before = climb.rise;
        const done = stepClimb(climb, s.rise, grip);
        if (done) {
          rowDone(hold, side);
        } else if (climb.rise > before + 0.004 && Math.floor(climb.rise / 0.14) !== Math.floor(before / 0.14)) d.sounds.play('grab_soft', 0.25, 0.7);
      }
    }
    seat();
  });
  arm();
  await d.until(() => climb.row >= pitch.rows || (storm(elapsed, pitch) >= 1 && !falling) || skipped);
  frame();
  setV2Targets([]);
  setDeskCarry(null);
  setDeskLook(0);
  set.own.position.x = ownX;
  set.demo.path = null;
  set.demo.update(0, true);
  set.ice.visible = false;
  for (const side of SIDES) drop(p, side);
  if (skipped || climb.row >= pitch.rows) {
    if (import.meta.env.DEV) console.info(`[mountain] pitch ${n + 1} won in ${elapsed.toFixed(1)} s (${falls} falls, ${slips} slips)`);
    return 'won';
  }
  if (import.meta.env.DEV) console.info(`[mountain] pitch ${n + 1} lost to the storm on row ${climb.row + 1} at ${elapsed.toFixed(1)} s (${falls} falls)`);
  await whiteOut(p, n);
  return 'the storm';
}

/** S18: the mountain memory. */
export async function s18(d: DirectorSystem): Promise<void> {
  d.chapter('S18');
  await d.stage.show('mountain', CLEAR[0]);
  d.rain.on = false;
  stowWing(true);
  const rootEntity = d.stage.entity('mountain');
  const root = d.stage.root('mountain');
  if (rootEntity == null || root == null) return;
  const set = buildSet(d, rootEntity, root);
  // The knobs follow their holds for as long as the memory runs.
  const holdsDrawn = d.each(() => drawHolds(set.pools));
  const minis = d.world.getSystem(MiniGameSystem);
  const play: Play = {
    d,
    set,
    hands: { left: new Vector3(), right: new Vector3(), pinching: { left: false, right: false } },
    local: { left: new Vector3(), right: new Vector3() },
    state: {
      left: { since: -1, rope: -1, hold: null, carabiner: false, from: new Vector3(), rise: 0, knocked: false, told: false, proved: false, anchor: false },
      right: { since: -1, rope: -1, hold: null, carabiner: false, from: new Vector3(), rise: 0, knocked: false, told: false, proved: false, anchor: false },
    },
    paused: () => minis?.playPaused ?? false,
    eye: new Vector3(),
    clock: 0,
    gusting: false,
    warned: false,
    // Real people (the square's own, as they are dressed): the partner and two more.
    people: [d.people.add({ model: 'crowd_man_casual' }), d.people.add({ model: 'crowd_woman_a' }), d.people.add({ model: 'crowd_woman_b', size: 0.98 })],
    clicked: false,
    press: { left: 0, right: 0 },
    sinceClick: 9,
  };
  const game = playMiniGame(new MiniGame(WORDS.stressTest, ROUTE.pitches.map((pitch) => ({ name: pitch.name }))));
  setDeskMode('one');
  // Dev: ?pitch=2 or ?pitch=3 starts at that pitch.
  const from = Math.max(1, Math.min(3, Number(devParam('pitch') ?? 1))) - 1;
  d.sounds.bed('wind_loop', 0.25);

  // The first look: the whole face from back on the snow. Three lanterns up it, the feather shining at the flag, the party at its foot; her own one line says what it is for.
  const fresh: Rope = { rotten: false, fray: 0, held: false, parted: false };
  set.ropes.forEach((_, i) => drawRope(set, i, fresh, null, 0, 0, false));
  set.carabiner.visible = false;
  for (const l of set.line) l.visible = false;
  standParty(set).forEach((at, k) => {
    set.party[k].position.copy(at);
    set.party[k].rotation.set(0, Math.PI + 0.5, 0);
  });
  showPeople(play, true);
  lightLanterns(set, 0);
  set.self.visible = false;
  set.front.position.set(0, 14, 135);
  // Dev, in the emulator: Q and E lean her head to the left and right (the mouse cannot), to get out from under the ice.
  const device = import.meta.env.DEV ? (window as { IWER_DEVICE?: { position: { x: number } } }).IWER_DEVICE : undefined;
  let leant = 0;
  const lean = (event: KeyboardEvent): void => {
    if (device == null || (event.code !== 'KeyQ' && event.code !== 'KeyE')) return;
    const want = event.type === 'keydown' ? (event.code === 'KeyQ' ? -0.26 : 0.26) : 0;
    device.position.x += want - leant;
    leant = want;
  };
  if (device != null) {
    window.addEventListener('keydown', lean);
    window.addEventListener('keyup', lean);
  }
  // She begins at the foot of the ropes: what she is (a climber, her party beside her) and what is in front of her are plain from there. (The look from afar showed the face as a small block.)
  play.eye.set(ROPES_X, FOOT_EYE_Y, set.ropes[1].grip.z + FOOT_STAND);
  d.rig.place(play.eye, 0);
  let turn = 0;
  const shine = d.each((delta) => {
    turn += delta;
    set.prize.rotation.y = 0.5 * Math.sin(turn * 0.9);
    set.prize.position.y = set.prizeAt.y + 0.06 * Math.sin(turn * 1.7);
  });
  const look = d.each((delta) => {
    set.snow.share = 0.15;
    set.snow.update(delta, play.eye);
  });
  goal('Earn the word STRESS TEST: three pitches to the flag.', 0);
  if (import.meta.env.DEV) console.info('[mountain] the first look');
  await d.wait(0.2);
  look();
  await d.rig.fadeTo(1);
  for (const l of set.line) l.visible = true;
  for (let n = 0; n < ROUTE.pitches.length; n += 1) {
    for (;;) {
      await d.until(() => game.phase === 'playing' || game.phase === 'won');
      if (game.phase !== 'playing') break;
      if (n < from) {
        lightLanterns(set, n + 1);
        game.win();
        break;
      }
      const losses = game.failuresOf(n);
      void d.rig.fadeTo(0);
      const result = n === 0 ? await ropesPitch(play, ROUTE.pitches[0], losses) : await climbPitch(play, n as 1 | 2, ROUTE.pitches[n], losses);
      await d.rig.fadeTo(1);
      set.demo.path = null;
      set.demo.update(0, true);
      if (result === 'won') {
        // The pitch's lantern is lit behind her.
        lightLanterns(set, n + 1);
        d.sounds.play('ear_click', 0.9, 0.5);
        game.win();
        break;
      }
      if (import.meta.env.DEV) console.info(`[mountain] pitch ${n + 1} lost: ${result}`);
      game.lose(result);
    }
  }
  endMiniGame(game);
  setV2Targets([]);

  // The top: the storm passes below; the party comes up onto the ledge beside her; the word, called out; its feather comes to her hand.
  const top = d.stage.point('mountain', 'climb_top', new Vector3());
  set.self.visible = false;
  set.front.visible = false;
  set.gauge.visible = false;
  set.ice.visible = false;
  for (const l of set.line) l.visible = false;
  window.removeEventListener('keydown', lean);
  window.removeEventListener('keyup', lean);
  set.lamp.intensity = 0;
  set.sun.intensity = 1.6;
  set.sun.color.setHex(0xffc890);
  d.stage.setWeather(SUMMIT);
  set.snow.share = 0.08;
  set.snow.wind = 1.2;
  play.eye.set(top.x, top.y + 1.2, top.z);
  // Turned round, under the fade: the way they came, and the valley.
  d.rig.place(play.eye, Math.PI);
  set.party.forEach((c, k) => {
    c.visible = true;
    c.position.set(top.x - 1.25 + 1.15 * k, top.y, top.z + [1.7, 2.5, 1.9][k]);
    c.rotation.set(0, Math.PI - 0.5 + 0.45 * k, 0);
  });
  showLanterns(set, true);
  // On the top they stand round her as themselves.
  for (const person of play.people) person.pose = 'idle';
  showPeople(play, true);
  const calm = d.each((delta) => {
    set.snow.update(delta, play.eye);
    set.puffs.update(delta);
  });
  d.sounds.bed('wind_loop', 0.2);
  goal('Take the feather: the word is yours.', 3);
  await d.rig.fadeTo(0);
  if (import.meta.env.DEV) console.info('[mountain] the top');
  const partner = set.party[1].position.clone().add(new Vector3(0, 1.75, 0));
  await d.captions.say('S18-1', partner, 0.25);
  // The feather comes down from the flag to within her reach, and is taken.
  shine();
  const reach = play.eye.clone().add(new Vector3(0.05, -0.12, 0.4));
  const fromAt = set.prize.position.clone();
  const glide = d.now;
  let taken = false;
  let ringed = false;
  const bring = d.each((delta) => {
    const k = Math.min(1, (d.now - glide) / 1.6);
    // Ringed as something to take only once it has come within her reach.
    if (k >= 1 && !ringed) {
      ringed = true;
      setV2Targets([set.prize]);
    }
    const ease = k * k * (3 - 2 * k);
    set.prize.position.lerpVectors(fromAt, reach, ease);
    set.prize.scale.setScalar(1 - 0.8 * ease);
    // Its glow draws in as it comes to hand, so the feather itself is what is taken.
    ((set.prize.children[1] as Mesh).material as MeshBasicMaterial).opacity = 0.14 * (1 - ease);
    set.prize.rotation.y += delta * 1.2;
    readHands(d, play.hands);
    for (const side of SIDES) if (k >= 1 && play.hands.pinching[side] && play.hands[side].distanceTo(reach) <= 0.16) taken = true;
  });
  d.onSkip(() => {
    taken = true;
  });
  // Nobody is left on the mountain: untaken, it comes to her by itself.
  const waited = d.now;
  await d.until(() => taken || d.now - waited > 14);
  bring();
  setV2Targets([]);
  set.prize.visible = false;
  d.sounds.play('feather_rustle', 0.8);
  if (import.meta.env.DEV) console.info(`[mountain] the feather is ${taken ? 'taken' : 'given'}: the word is learned`);
  parrotWords.learn(WORDS.stressTest, FEATHER.stressTest);
  await d.wait(0.8);
  calm();
  holdsDrawn();
  showPeople(play, false);
  set.vignette.dispose();
  set.lamp.removeFromParent();
  set.lamp.target.removeFromParent();
  stowWing(false);
  d.sounds.bed('wind_loop', 0);
}
