import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PointLight,
  Quaternion,
  Shape,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { devParam } from '../dev-param.js';
import { setGoal, setWindows } from '../goal.js';
import { wordBadge } from '../icons.js';
import { endMiniGame, MiniGame, playMiniGame } from '../minigame.js';
import { MiniGameSystem } from '../minigame-system.js';
import { type FogFight, FOG, fogLifted, layFog, prop as setProp, pullBell, ROUTE, stepFog, whisper } from '../mountain-rules.js';
import { featherMesh } from '../parrot-system.js';
import { setV2Targets } from '../step-targets.js';
import { type Hands, readHands } from './circus-show.js';
import { Demo, mouse, MOUSE_GAIN } from './mountain.js';
import type { DirectorSystem } from './director.js';
import type { Wires } from './fire.js';
import { makeSign, mergeByMaterial } from './fx.js';
import { BOSSES, HEADLINES, WORDS } from './lines.js';
import { CITY, type CityCast, FEATHER, type Keepers } from './opening.js';
import { showCard } from './run.js';
import { WEATHER, type Weather } from './stage.js';

/**
 * The fourth problem and its word (S17, S19, S20): fog comes down on the
 * square and three bank fronts stand in it, alike from outside, each with a
 * bell at its door. Nobody can say which of them is sound. Back from the
 * mountain, "stress test" lets the player hang on each bank's bell rope: a
 * sound bank's bell rings and the fog round it goes; the cracked one's wall
 * opens for all to see, takes a gold prop, and then rings too. The magpie
 * steals the word on its way to Gray's ear (S19), and whispers the first
 * bank back into the fog in the fight (S20).
 */

type Side = 'left' | 'right';
const SIDES: readonly Side[] = ['left', 'right'];

/** The square in fog as the fourth problem stands, and when the fog has taken it. */
export const FOGGY: Weather = { sky: 0x9aa2a8, fog: 0xa8b0b6, density: 0.036, light: 0.42 };
const DENSE: Weather = { sky: 0xb6bdc2, fog: 0xbdc4c9, density: 0.15, light: 0.3 };

/** Where the three fronts stand on the square (m; clear of the fountain, the lamp, the screen and the keepers). */
const FRONTS: readonly [number, number][] = [
  [-7.5, -6.5],
  [-3.5, -5.5],
  [7.5, -4.0],
];
const GROUND = 0.15;
/** In a front's own frame (its face toward Gray is +z): the bell rope (on a post two steps out from the columns, so the whole front is in view from it), where it is taken, the bird's eye before it, and where the prop is carried to. */
const ROPE = new Vector3(0.95, 0, 1.75);
const GRIP_Y = 1.6;
const BELL_Y = 2.6;
const EYE = new Vector3(0.85, 1.56, 2.15);
const PROP_TO = new Vector3(0.98, 1.42, 1.62);
const PROP_FROM = new Vector3(1.22, 1.22, 1.72);
/** The prop stood in the crack: its foot and its head against the column. */
const PROP_FOOT = new Vector3(1.6, 0.3, 0.8);
const PROP_HEAD = new Vector3(1.2, 2.15, 0.24);
const TAKE = 0.15;
const LATE_PINCH = 0.3;

const yAxis = new Vector3(0, 1, 0);
const span = new Vector3();

function stretch(rod: Object3D, from: Vector3, to: Vector3): void {
  span.copy(to).sub(from);
  const length = span.length();
  rod.position.copy(from);
  rod.scale.set(1, Math.max(1e-4, length), 1);
  if (length > 1e-5) rod.quaternion.setFromUnitVectors(yAxis, span.divideScalar(length));
}

interface Front {
  group: Group;
  yaw: number;
  /** World places: the bird's eye, the rope's grip, where the prop waits and where it is taken to. */
  eye: Vector3;
  grip: Vector3;
  propFrom: Vector3;
  propTo: Vector3;
  mark: Group;
  perch: Group;
  propMark: Group;
  index: number;
  /** All three fronts' bells and ropes, each kind one draw (set once the fronts stand). */
  bells: InstancedMesh | null;
  ropes: InstancedMesh | null;
  crack: Group;
  beam: Mesh;
  scaffold: Group;
  lantern: PointLight;
  plaque: Mesh;
  /** The front's own stone (one unlit, vertex-coloured draw): without fog once the bank stands clear. */
  face: MeshBasicMaterial;
  /** The bell's swing (radians) and its speed. */
  swing: number;
  rate: number;
}

export interface FogSet {
  fronts: Front[];
  icicles: InstancedMesh | null;
  /** How many windows the fog has put out (they come back as the banks ring clear). */
  out: number;
}

const WHERE = 'TROUBLE 4 OF 6 · THE FOG';

/** What the player is doing now, for the goal plate (and the dev log). */
function goal(now: string, steps?: readonly [number, number]): void {
  setGoal(steps == null ? { where: WHERE, now } : { where: WHERE, now, steps });
  if (import.meta.env.DEV) console.info(`[goal] ${WHERE} | ${now}${steps == null ? '' : ` | ${steps[0]}/${steps[1]}`}`);
}

/** The square's windows as the fog has them: those it put out stay dark until `back` of them are won back. */
function showWindows(d: DirectorSystem, cast: CityCast, out: number, back: number): void {
  const lit = cast.windows.total - d.day.darkWindows - Math.max(0, out - back);
  if (cast.windows.lit !== lit) cast.windows.lit = lit;
  setWindows(cast.windows.lit, cast.windows.total);
  if (import.meta.env.DEV) console.info(`[windows] ${cast.windows.lit} of ${cast.windows.total} lit`);
}

const SUNWARD = new Vector3(0.35, 0.62, 0.7).normalize();

/**
 * One unlit, vertex-coloured mesh from a front's fixed parts: each part's
 * colour (userData.colour) is put on its vertices, shaded by which way each
 * face looks; a `glow` part (a lit pane) keeps its colour whole. A whole
 * bank front is then one draw.
 */
function bake(parts: Mesh[], material: MeshBasicMaterial): Mesh {
  const tint = new Color();
  const made = parts.map((mesh) => {
    mesh.updateMatrix();
    const g = mesh.geometry.index != null ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(mesh.matrix);
    const normal = g.getAttribute('normal');
    const colours = new Float32Array(normal.count * 3);
    tint.setHex(mesh.userData.colour as number);
    const glow = mesh.userData.glow === true;
    for (let k = 0; k < normal.count; k += 1) {
      const lit = glow ? 1 : 0.4 + 0.32 * Math.max(0, normal.getX(k) * SUNWARD.x + normal.getY(k) * SUNWARD.y + normal.getZ(k) * SUNWARD.z);
      colours[k * 3] = tint.r * lit;
      colours[k * 3 + 1] = tint.g * lit;
      colours[k * 3 + 2] = tint.b * lit;
    }
    g.setAttribute('color', new BufferAttribute(colours, 3));
    return g;
  });
  const mesh = new Mesh(mergeGeometries(made) ?? made[0], material);
  mesh.pointerEvents = 'none';
  return mesh;
}

/** A bank front of pale stone: plinth, two columns, a lintel and a pediment, a lit doorway, and a post two steps out before it for its bell. The stone is one draw; the bells and their ropes are drawn for all three fronts together (s17). */
function buildFront(d: DirectorSystem, n: number, x: number, z: number): Front {
  const STONE = 0xb9b2a4;
  const WALL = 0x4a4640;
  const BRONZE = 0x5a4630;
  const PANE = 0xffc070;
  const face = new MeshBasicMaterial({ vertexColors: true });
  const gold = new MeshStandardMaterial({ color: 0xe8c45a, emissive: 0x8a6418, emissiveIntensity: 0.7, roughness: 0.35, metalness: 0.6 });
  const group = new Group();
  group.name = `BankFront ${n + 1}`;
  const yaw = Math.atan2(CITY.grayAt.x - x, CITY.grayAt.z - z);
  group.position.set(x, GROUND, z);
  group.rotation.y = yaw;
  const parts: Mesh[] = [];
  const part = (geometry: BufferGeometry, colour: number, px: number, py: number, pz: number, glow = false): void => {
    const mesh = new Mesh(geometry);
    mesh.position.set(px, py, pz);
    mesh.userData.colour = colour;
    mesh.userData.glow = glow;
    parts.push(mesh);
  };
  part(new BoxGeometry(3.3, 0.3, 1.1), STONE, 0, 0.15, 0);
  for (const side of [-1, 1]) {
    part(new CylinderGeometry(0.19, 0.21, 3.2, 18), STONE, side * 1.15, 1.9, 0);
    part(new BoxGeometry(0.52, 0.14, 0.52), STONE, side * 1.15, 3.57, 0);
    part(new BoxGeometry(0.5, 0.12, 0.5), STONE, side * 1.15, 0.36, 0);
  }
  part(new BoxGeometry(3.3, 0.46, 0.9), STONE, 0, 3.87, 0);
  const gable = new Shape([new Vector2(-1.75, 0), new Vector2(1.75, 0), new Vector2(0, 0.85)]);
  part(new ExtrudeGeometry(gable, { depth: 0.9, bevelEnabled: false }), STONE, 0, 4.1, -0.45);
  part(new BoxGeometry(2.9, 3.3, 0.16), WALL, 0, 1.95, -0.36);
  part(new BoxGeometry(1.15, 2.5, 0.06), BRONZE, 0, 1.55, -0.26);
  // A lit fanlight over the door, and a lit pane in each leaf: somebody is in there.
  part(new BoxGeometry(1.15, 0.42, 0.05), PANE, 0, 3.05, -0.25, true);
  for (const side of [-1, 1]) part(new BoxGeometry(0.32, 0.7, 0.03), PANE, side * 0.28, 2.1, -0.22, true);
  // The bell's post, two steps out in front of the right column, and its arm.
  part(new CylinderGeometry(0.045, 0.06, BELL_Y + 0.5, 10), BRONZE, ROPE.x + 0.42, (BELL_Y + 0.5) / 2 - 0.15, ROPE.z);
  part(new BoxGeometry(0.5, 0.06, 0.06), BRONZE, ROPE.x + 0.2, BELL_Y + 0.32, ROPE.z);
  part(new BoxGeometry(0.5, 0.06, 0.5), STONE, ROPE.x + 0.42, -0.12, ROPE.z);
  const fixed = bake(parts, face);
  fixed.name = `BankFrontStone ${n + 1}`;
  group.add(fixed);
  // The crack up the right column, shut until the rope is hung on: one draw.
  const crack = new Group();
  crack.name = `Crack ${n + 1}`;
  crack.position.set(1.15, 0.5, 0.2);
  const dark = new MeshBasicMaterial({ color: 0x0c0b0b });
  let cx = 0;
  for (let k = 0; k < 9; k += 1) {
    const lean = (k % 2 === 0 ? 1 : -1) * (0.35 + 0.1 * (k % 3));
    const piece = new Mesh(new BoxGeometry(0.045 + 0.02 * (k % 3), 0.34, 0.02), dark);
    piece.position.set(cx + Math.sin(lean) * 0.15, 0.15 + k * 0.28, 0.005 - Math.abs(cx) * 0.3);
    piece.rotation.z = -lean;
    cx += Math.sin(lean) * 0.28;
    crack.add(piece);
  }
  mergeByMaterial(crack);
  crack.visible = false;
  group.add(crack);
  // The gold prop: a beam a hand can carry by its middle.
  const beam = new Mesh(new BoxGeometry(0.075, 1, 0.075), gold);
  beam.geometry.translate(0, 0.5, 0);
  beam.name = `GoldProp ${n + 1}`;
  beam.visible = false;
  group.add(beam);
  // The scaffold a propped bank is left with (two draws).
  const scaffold = new Group();
  scaffold.name = `Scaffold ${n + 1}`;
  const pole = new MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.5, metalness: 0.6 });
  const plank = new MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 });
  for (const [px, pz] of [[0.75, 0.72], [1.75, 0.72], [0.75, 0.28], [1.75, 0.28]]) {
    const upright = new Mesh(new CylinderGeometry(0.025, 0.025, 3.0, 6), pole);
    upright.position.set(px, 1.8, pz);
    scaffold.add(upright);
  }
  for (const py of [2.2, 3.2]) {
    const deck = new Mesh(new BoxGeometry(1.2, 0.04, 0.5), plank);
    deck.position.set(1.25, py, 0.5);
    scaffold.add(deck);
  }
  mergeByMaterial(scaffold);
  scaffold.visible = false;
  group.add(scaffold);
  const lantern = new PointLight(0xffc878, 1.2, 9, 2);
  lantern.position.set(ROPE.x, BELL_Y - 0.25, ROPE.z + 0.15);
  group.add(lantern);
  group.traverse((o) => {
    o.pointerEvents = 'none';
  });
  d.world.createTransformEntity(group, { persistent: true });
  group.updateMatrixWorld(true);
  const out = (local: Vector3): Vector3 => group.localToWorld(local.clone());
  const plaque = makeSign(d.world, 'SOUND', { w: 1.3, h: 0.36 }, { paper: '#e8c45a', ink: '#2a1c08' });
  plaque.position.copy(out(new Vector3(0, 3.36, 0.5)));
  plaque.rotation.y = yaw;
  plaque.visible = false;
  // It is only ever shown on a bank that stands clear of the fog.
  (plaque.material as MeshBasicMaterial).fog = false;
  const grip = out(new Vector3(ROPE.x, GRIP_Y, ROPE.z));
  const mark = d.marker(grip, `BellRopeGrip ${n + 1}`);
  // What is pointed at from across the square: the lit bell.
  const perch = d.marker(out(new Vector3(ROPE.x, BELL_Y, ROPE.z)), `BellPerch ${n + 1}`);
  const propTo = out(PROP_TO);
  const propMark = d.marker(propTo, `PropPlace ${n + 1}`);
  d.stage.own('city', group, plaque, mark, perch, propMark);
  return { index: n, group, yaw, eye: out(EYE), grip, propFrom: out(PROP_FROM), propTo, mark, perch, propMark, bells: null, ropes: null, crack, beam, scaffold, lantern, plaque, face, swing: 0, rate: 0 };
}

/** The three bells, their three ropes and the three BANK signs, each kind drawn once for all the fronts. */
function buildBells(d: DirectorSystem, fronts: Front[]): void {
  const brass = new MeshStandardMaterial({ color: 0xd2a84a, roughness: 0.3, metalness: 0.6, emissive: 0x6a4a10, emissiveIntensity: 0.5, side: DoubleSide });
  const profile = [[0.02, 0], [0.06, -0.02], [0.085, -0.1], [0.1, -0.2], [0.13, -0.27], [0.16, -0.3], [0.145, -0.3], [0.11, -0.25]].map(([r, y]) => new Vector2(r, y));
  const bells = new InstancedMesh(new LatheGeometry(profile, 20), brass, fronts.length);
  bells.name = 'BankBells';
  const cord = new CylinderGeometry(0.011, 0.011, 1, 7);
  cord.translate(0, 0.5, 0);
  const ropes = new InstancedMesh(cord, new MeshStandardMaterial({ color: 0xb9a57a, roughness: 0.9 }), fronts.length);
  ropes.name = 'BankBellRopes';
  for (const mesh of [bells, ropes]) {
    mesh.frustumCulled = false;
    mesh.pointerEvents = 'none';
    d.world.createTransformEntity(mesh, { persistent: true });
    d.stage.own('city', mesh);
  }
  // One sign's writing, on a board over each door: the three boards are one mesh.
  const sign = makeSign(d.world, 'BANK', { w: 1.5, h: 0.34 }, { paper: '#2b2724', ink: '#d9c48a' });
  const boards = fronts.map((front) => {
    const board = sign.geometry.clone();
    board.applyMatrix4(new Matrix4().makeTranslation(0, 3.87, 0.46).premultiply(front.group.matrixWorld));
    return board;
  });
  const all = mergeGeometries(boards);
  if (all != null) sign.geometry = all;
  sign.frustumCulled = false;
  d.stage.own('city', sign);
  for (const front of fronts) {
    front.bells = bells;
    front.ropes = ropes;
  }
}

/** A bank that has rung clear stands out of the fog (its own stone is drawn without it); one still unproven is lost in it. */
function standClear(front: Front, on: boolean): void {
  if (front.face.fog !== !on) {
    front.face.fog = !on;
    front.face.needsUpdate = true;
  }
  front.plaque.visible = on;
  front.lantern.intensity = on ? 3.2 : 1.2;
  // Green for a bank that has rung sound; amber while nobody knows.
  front.lantern.color.setHex(on ? 0x6dff9a : 0xffc878);
}

/**
 * Once the fog has lifted nothing on the fronts moves again: the stone, the
 * cracks, the props and scaffolds, the bells and their ropes of all three
 * banks become one unlit, vertex-coloured draw (as they stand, in the
 * world's own frame), and the SOUND plaques one more. The lanterns stay.
 */
function settle(d: DirectorSystem, set: FogSet): void {
  const stood: BufferGeometry[] = [];
  const done: Object3D[] = [];
  const tint = new Color();
  const glow = new Color();
  /** One part as it stands: its own vertex colours if it has them, or its material's colour shaded by which way each face looks. */
  const take = (source: BufferGeometry, look: MeshBasicMaterial | MeshStandardMaterial, to: Matrix4): void => {
    const g = source.index != null ? source.toNonIndexed() : source.clone();
    g.applyMatrix4(to);
    if (!g.hasAttribute('color')) {
      const normal = g.getAttribute('normal');
      const lit = (look as MeshStandardMaterial).isMeshStandardMaterial === true;
      tint.copy(look.color);
      glow.setRGB(0, 0, 0);
      if (lit) glow.copy((look as MeshStandardMaterial).emissive).multiplyScalar((look as MeshStandardMaterial).emissiveIntensity);
      const colours = new Float32Array(normal.count * 3);
      for (let k = 0; k < normal.count; k += 1) {
        const shade = lit ? 0.4 + 0.32 * Math.max(0, normal.getX(k) * SUNWARD.x + normal.getY(k) * SUNWARD.y + normal.getZ(k) * SUNWARD.z) : 1;
        colours[k * 3] = Math.min(1, tint.r * shade + glow.r);
        colours[k * 3 + 1] = Math.min(1, tint.g * shade + glow.g);
        colours[k * 3 + 2] = Math.min(1, tint.b * shade + glow.b);
      }
      g.setAttribute('color', new BufferAttribute(colours, 3));
    }
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'color') g.deleteAttribute(name);
    stood.push(g);
  };
  for (const front of set.fronts) {
    front.group.updateMatrixWorld(true);
    front.group.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh !== true || Array.isArray(mesh.material)) return;
      // Only what is there to be seen: an unpropped bank has no beam and no scaffold.
      let seen = true;
      for (let up: Object3D | null = mesh; up != null && up !== front.group.parent; up = up.parent) if (!up.visible) seen = false;
      if (!seen) return;
      take(mesh.geometry, mesh.material as MeshBasicMaterial | MeshStandardMaterial, mesh.matrixWorld);
      done.push(mesh);
    });
  }
  const each = new Matrix4();
  for (const hung of [set.fronts[0]?.bells ?? null, set.fronts[0]?.ropes ?? null]) {
    if (hung == null || !hung.visible) continue;
    hung.updateMatrixWorld(true);
    for (let k = 0; k < hung.count; k += 1) {
      hung.getMatrixAt(k, each);
      take(hung.geometry, hung.material as MeshStandardMaterial, each.premultiply(hung.matrixWorld));
    }
    done.push(hung);
  }
  const all = stood.length > 0 ? mergeGeometries(stood) : null;
  if (all != null) {
    // Both sides drawn: a bell is open underneath.
    const one = new Mesh(all, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }));
    one.name = 'BankFronts';
    one.pointerEvents = 'none';
    one.frustumCulled = false;
    d.world.createTransformEntity(one, { persistent: true });
    d.stage.own('city', one);
    for (const o of done) o.visible = false;
  }
  // The plaques that are up say the same word: one mesh with the first one's writing.
  const shown = set.fronts.map((front) => front.plaque).filter((plaque) => plaque.visible);
  if (shown.length > 1) {
    const first = shown[0];
    first.updateMatrixWorld(true);
    const back = first.matrixWorld.clone().invert();
    const boards = shown.map((plaque) => {
      plaque.updateMatrixWorld(true);
      const board = plaque.geometry.clone();
      board.applyMatrix4(new Matrix4().multiplyMatrices(back, plaque.matrixWorld));
      return board;
    });
    const merged = mergeGeometries(boards);
    if (merged != null) {
      first.geometry = merged;
      first.frustumCulled = false;
      for (const plaque of shown.slice(1)) plaque.visible = false;
    }
  }
  if (import.meta.env.DEV) console.info(`[fog] the fronts stand as one draw (${done.length} parts), ${shown.length} plaques as one`);
}

const local = new Vector3();
const low = new Vector3();
const place = new Matrix4();
const turnTo = new Quaternion();
const sized = new Vector3();

/** The rope from the bell down to the hand that hauls it (or hanging free), and the bell tipped by the haul and by its own swing. */
function drawBell(front: Front, hand: Vector3 | null, pull: number, delta: number): void {
  // A bell let go swings itself out.
  const tip = hand == null ? 0 : Math.min(1, pull / FOG.stroke) * 0.5;
  front.rate += (-(front.swing - tip) * 42 - front.rate * (hand == null ? 1.2 : 9)) * delta;
  front.swing += front.rate * delta;
  if (front.bells == null || front.ropes == null) return;
  place.makeRotationX(front.swing).setPosition(ROPE.x, BELL_Y + 0.28, ROPE.z).premultiply(front.group.matrixWorld);
  front.bells.setMatrixAt(front.index, place);
  front.bells.instanceMatrix.needsUpdate = true;
  local.set(ROPE.x, BELL_Y, ROPE.z);
  if (hand == null) low.set(ROPE.x, GRIP_Y - 0.25, ROPE.z + Math.sin(front.swing) * 0.2);
  else front.group.worldToLocal(low.copy(hand));
  // The cord: a rod one metre long from its foot, stretched from the hand (or its hanging end) up to the bell.
  span.copy(local).sub(low);
  const length = Math.max(1e-4, span.length());
  turnTo.setFromUnitVectors(yAxis, span.divideScalar(length));
  place.compose(low, turnTo, sized.set(1, length, 1)).premultiply(front.group.matrixWorld);
  front.ropes.setMatrixAt(front.index, place);
  front.ropes.instanceMatrix.needsUpdate = true;
}

/** S17: the fog comes down; three bank fronts in it, alike; icicles on the bank's doors; the notebook asks who is safe. */
export async function s17(d: DirectorSystem, cast: CityCast, keepers: Keepers, quick = false): Promise<FogSet> {
  d.chapter('S17');
  if (!quick) await d.rig.move(CITY.shoulder, Math.PI);
  d.rain.on = false;
  const fronts = FRONTS.map(([x, z], n) => buildFront(d, n, x, z));
  buildBells(d, fronts);
  for (const front of fronts) drawBell(front, null, 0, 0);
  // Frozen credit: icicles along the heads of the bank's doors.
  let icicles: InstancedMesh | null = null;
  const doors = ['bank_door_left', 'bank_door_right'].map((name) => d.stage.node('city', name)).filter((o): o is Object3D => o != null);
  if (doors.length > 0) {
    icicles = new InstancedMesh(new ConeGeometry(0.035, 0.5, 6), new MeshStandardMaterial({ color: 0xd6ecf6, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85 }), doors.length * 12);
    icicles.name = 'DoorIcicles';
    icicles.pointerEvents = 'none';
    const put = new Matrix4();
    const at = new Vector3();
    const size = new Vector3();
    const down = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI);
    doors.forEach((door, k) => {
      for (let i = 0; i < 12; i += 1) {
        // Along the leaf from its hinge line (the left leaf's free edge is +x, the right's -x).
        const along = (k === 0 ? 1 : -1) * (0.08 + i * 0.125);
        door.localToWorld(at.set(along, 3.75, 0.12));
        const long = 0.5 + ((i * 7) % 5) * 0.22;
        put.compose(at.setY(at.y - 0.25 * long), down, size.set(1, long, 1));
        icicles?.setMatrixAt(k * 12 + i, put);
      }
    });
    d.world.createTransformEntity(icicles, { persistent: true });
    d.stage.own('city', icicles);
  }
  // The trouble shows in the windows: as the fog comes down, four of them go dark one after another.
  const out = Math.min(4, Math.max(0, cast.windows.total - d.day.darkWindows));
  let gone = 0;
  const start = d.now;
  await d.until(() => {
    const k = Math.min(1, (d.now - start) / 3);
    d.stage.blendWeather(WEATHER.rain2008, FOGGY, k);
    if (Math.round(out * k) > gone) {
      gone = Math.round(out * k);
      showWindows(d, cast, gone, 0);
      d.sounds.play('ear_click', 0.5, 0.6);
    }
    return k >= 1;
  });
  showWindows(d, cast, out, 0);
  for (const p of cast.crowd) p.pose = 'idle';
  d.notebook.write([
    { text: HEADLINES.run, struck: HEADLINES.runSolved },
    { text: HEADLINES.spreads, struck: HEADLINES.lightsOn },
    { text: HEADLINES.sinks, struck: HEADLINES.afloat },
    { text: HEADLINES.whoIsSafe },
  ]);
  d.sounds.play('paper', 0.6);
  await d.captions.say('S17-1', CITY.graySays, 0);
  await d.captions.say('S17-2', keepers.people[3].head(new Vector3()), 0.3);
  goal("Find the word: fly to a keeper's hand.");
  return { fronts, icicles, out };
}

/** S19: the word is on its way into Gray's ear when the magpie takes its feather to the wire; the bird goes after it, twice, and takes it back. */
export async function s19(d: DirectorSystem, w: Wires, bird: Group): Promise<void> {
  d.chapter('S19');
  goal('Chase the magpie: point at it and pinch.');
  const feather = featherMesh(FEATHER.stressTest, 0.11, 0.034);
  const held = new Group();
  held.name = 'StolenFeather';
  held.add(feather);
  held.traverse((o) => {
    o.pointerEvents = 'none';
  });
  d.world.createTransformEntity(held, { persistent: true });
  d.stage.own('city', held);
  const ear = CITY.ear.clone();
  const wire = w.spans[0];
  const stops = [0.3, 0.52].map((t) => wire.getPointAt(t, new Vector3()).add(new Vector3(0, 0.02, 0)));
  const fly = async (from: Vector3, to: Vector3, seconds: number, arc: number): Promise<void> => {
    bird.userData.clip = 'flap';
    bird.lookAt(to.x, from.y, to.z);
    const start = d.now;
    await d.until(() => {
      const k = Math.min(1, (d.now - start) / seconds);
      bird.position.lerpVectors(from, to, k);
      bird.position.y += Math.sin(k * Math.PI) * arc;
      return k >= 1;
    });
    bird.userData.clip = 'idle';
  };
  const carry = d.each(() => {
    // In its beak: a little ahead of it and up.
    bird.updateMatrixWorld(true);
    held.position.copy(bird.localToWorld(local.set(0, 0.16, 0.2)));
    held.quaternion.copy(bird.quaternion);
  });
  bird.visible = true;
  held.visible = false;
  d.sounds.play('wing_flaps', 0.8);
  await fly(ear.clone().add(new Vector3(-2.5, 1.6, 3.5)), ear.clone().add(new Vector3(-0.12, 0.05, 0.12)), 0.7, 0.2);
  held.visible = true;
  d.sounds.play('feather_rustle', 0.8);
  await fly(bird.position.clone(), stops[0], 1.3, 1.0);
  bird.lookAt(CITY.shoulder);
  bird.userData.clip = 'talk';
  await d.captions.say('S19-1', bird, 0.25);
  bird.userData.clip = 'idle';
  for (let n = 0; n < stops.length; n += 1) {
    const at = stops[n];
    // Beside it on the wire, an arm's length off, turned to it.
    const along = wire.getTangentAt(n === 0 ? 0.3 : 0.52, new Vector3()).setY(0).normalize();
    const eye = at.clone().addScaledVector(along, -0.42).add(new Vector3(0, 0.14, 0));
    const perch = d.marker(at.clone().add(new Vector3(0, 0.1, 0)), `MagpiePerch ${n + 1}`);
    d.stage.own('city', perch);
    await d.choosePerch([perch]);
    await d.rig.move(eye, Math.atan2(-(at.x - eye.x), -(at.z - eye.z)));
    if (n === 0) {
      // It hops on down the wire.
      d.sounds.play('wing_flap', 0.7);
      await fly(at.clone(), stops[1], 0.8, 0.5);
      bird.lookAt(eye.x, bird.position.y, eye.z);
    } else bird.lookAt(eye.x, bird.position.y, eye.z);
  }
  // The second time it has nowhere left to hop: the feather is taken out of its beak.
  setV2Targets([held]);
  goal('Take the feather back from its beak.');
  const hands: Hands = { left: new Vector3(), right: new Vector3(), pinching: { left: false, right: false } };
  let taken = false;
  const watch = d.each(() => {
    readHands(d, hands);
    for (const side of SIDES) if (hands.pinching[side] && hands[side].distanceTo(held.position) <= TAKE) taken = true;
  });
  d.onSkip(() => {
    taken = true;
  });
  await d.until(() => taken);
  watch();
  carry();
  setV2Targets([]);
  held.visible = false;
  d.sounds.play('feather_rustle', 0.8);
  d.sounds.play('wing_flaps', 0.7);
  if (import.meta.env.DEV) console.info('[fog] the feather is taken back from the magpie');
  bird.visible = false;
  await d.rig.move(CITY.shoulder, Math.PI);
}

/** S20, THE FOG: hang on each bank's bell rope; prop the one that cracks; ring the first again after the magpie's whisper. */
export async function s20(d: DirectorSystem, cast: CityCast, set: FogSet, bird: Group): Promise<void> {
  d.chapter('S20');
  const head = d.player.head;
  const fronts = set.fronts;
  void d.gold.show(WORDS.stressTest.toUpperCase(), CITY.graySays.clone().add(new Vector3(0, 0.15, 0.3)), 1.1, 3.0, new Vector3(0, 0.25, 0.6), head, wordBadge(WORDS.stressTest));
  await d.captions.say('S20-1', CITY.graySays, 0);
  void d.gold.show(BOSSES.fog.name, new Vector3(0, 6.5, -10), 4, 2.6, new Vector3(0, 0.15, 0), head);

  const game = playMiniGame(new MiniGame(WORDS.stressTest, [{ name: 'the fog' }]));
  const minis = d.world.getSystem(MiniGameSystem);
  const paused = (): boolean => minis?.playPaused ?? false;
  const hands: Hands = { left: new Vector3(), right: new Vector3(), pinching: { left: false, right: false } };
  // Seconds since each hand's pinch closed: -1 while open, pushed past the window once it has taken something.
  const since = { left: -1, right: -1 };
  let skipped = false;
  const arm = (): void =>
    d.onSkip(() => {
      skipped = true;
    });
  const dev = Number(devParam('weak') ?? 0);
  // Where the gold prop is taken (its middle), for the ring and the mouse's hand.
  const beamMark = d.marker(new Vector3(0, -50, 0), 'GoldPropGrip');
  d.stage.own('city', beamMark);
  // The gesture, shown by a ghost of a hand when hers have been idle.
  const demo = new Demo();
  d.world.createTransformEntity(demo.hand, { persistent: true });
  d.stage.own('city', demo.hand);

  while (game.phase !== 'won') {
    await d.until(() => game.phase === 'playing' || game.phase === 'won');
    if (game.phase !== 'playing') break;
    const losses = game.failuresOf(0);
    const fight: FogFight = layFog(dev >= 1 && dev <= 3 ? () => (dev - 0.5) / 3 : Math.random);
    for (const front of fronts) {
      standClear(front, false);
      front.crack.visible = false;
      front.beam.visible = false;
      front.scaffold.visible = false;
      front.swing = 0;
      front.rate = 0;
    }
    bird.visible = false;
    if (import.meta.env.DEV) console.info(`[fog] the fight begins (losses ${losses})`);
    // On Gray's shoulder until a bell is picked; then before that bank's rope.
    let at = -1;
    let moving = false;
    let choosing = false;
    let token = 0;
    let firstClear = -1;
    let rope: Side | null = null;
    let ropeFrom = 0;
    let struck = false;
    let carrier: Side | null = null;
    let lost = false;
    let clock = 0;
    const beamPlace = new Vector3();
    beamMark.position.set(0, -50, 0);
    const targets = (): Object3D[] => {
      if (at < 0) return [];
      const front = fronts[at];
      const bank = fight.banks[at];
      if (bank.cracked && !bank.propped) return carrier == null ? [beamMark] : [front.propMark];
      return bank.clear ? [] : [front.mark];
    };
    const go = async (to: number): Promise<void> => {
      moving = true;
      at = to;
      await d.rig.move(fronts[to].eye, fronts[to].yaw);
      moving = false;
      if (import.meta.env.DEV) console.info(`[fog] before bank ${to + 1}`);
      tell();
    };
    // The task now, from where the bird is and how that bank stands; and the windows won back so far.
    const tell = (): void => {
      const clear = fight.banks.filter((b) => b.clear).length;
      const bank = at < 0 ? null : fight.banks[at];
      const now = bank == null ? 'Fly to a bank: point at its bell.' : bank.cracked && !bank.propped ? 'Carry the gold prop to the crack.' : bank.clear ? 'Fly to the next bank: point at its bell.' : 'Hang on the bell rope: pull it down.';
      goal(now, [clear, 3]);
      showWindows(d, cast, set.out, fogLifted(fight) ? set.out : clear);
    };
    tell();
    const frame = d.each((delta) => {
      if (paused() || lost || moving) return;
      clock += delta;
      if (stepFog(fight, delta, losses)) {
        lost = true;
        return;
      }
      d.stage.blendWeather(FOGGY, DENSE, fight.fog);
      d.sounds.bed('wind_loop', 0.1 + 0.3 * fight.fog);
      readHands(d, hands);
      demo.update(delta, hands.pinching.left || hands.pinching.right);
      for (const side of SIDES) since[side] = !hands.pinching[side] ? -1 : since[side] < 0 ? 0 : since[side] + delta;
      const taking = (side: Side): boolean => hands.pinching[side] && since[side] >= 0 && since[side] <= LATE_PINCH;
      // After two losses the cracked bank's lantern gutters.
      fronts.forEach((front, i) => {
        if (losses >= ROUTE.hintAfter && fight.banks[i].weak && !fight.banks[i].clear) front.lantern.intensity = 0.8 + 0.7 * Math.sin(clock * 17) * Math.sin(clock * 5.3);
      });
      let busy = false;
      if (at >= 0) {
        const front = fronts[at];
        const bank = fight.banks[at];
        // The rope: taken, hauled a full stroke.
        if (rope != null && !hands.pinching[rope]) {
          rope = null;
          struck = false;
        }
        if (carrier != null && !hands.pinching[carrier]) carrier = null;
        for (const side of SIDES) {
          if (rope != null || carrier === side || !taking(side)) continue;
          if (bank.cracked && !bank.propped && front.beam.visible && carrier == null && hands[side].distanceTo(beamPlace) <= TAKE + 0.03) {
            carrier = side;
            since[side] = 50;
            d.sounds.play('grab_soft', 0.7);
            setV2Targets([...(choosing ? others() : []), ...targets()]);
            continue;
          }
          if (!bank.clear && hands[side].distanceTo(front.grip) <= TAKE && Math.abs(hands[side].y - front.grip.y) <= TAKE) {
            rope = side;
            ropeFrom = hands[side].y;
            since[side] = 50;
            struck = false;
            d.sounds.play('grab_soft', 0.6);
            d.sounds.play('rope_creak', 0.4);
          }
        }
        const pull = rope == null ? 0 : Math.max(0, ropeFrom - hands[rope].y) * (mouse() ? MOUSE_GAIN : 1);
        if (rope != null && !struck && pull >= FOG.stroke) {
          struck = true;
          const stroke = pullBell(fight, at);
          if (import.meta.env.DEV) console.info(`[fog] bank ${at + 1}: ${stroke} (fog ${fight.fog.toFixed(2)})`);
          if (stroke === 'rings') {
            front.rate += 5;
            d.sounds.play('bell_toll', 1);
            standClear(front, true);
            if (firstClear < 0) firstClear = at;
            tell();
          } else if (stroke === 'cracks') {
            front.crack.visible = true;
            front.crack.scale.set(1, 0.05, 1);
            front.beam.visible = true;
            // Red until it is propped.
            front.lantern.color.setHex(0xff5a4a);
            front.lantern.intensity = 2.6;
            d.sounds.play('bank_creak', 0.9);
            tell();
            d.sounds.play('ice_crack', 0.9, 0.7);
            d.sounds.play('crowd_gasp', 0.6);
          } else if (stroke === 'dull') d.sounds.play('sandbag_drop', 0.6, 0.7);
          setV2Targets([...(choosing ? others() : []), ...targets()]);
        }
        drawBell(front, rope == null ? null : hands[rope], pull, delta);
        // The crack runs up the column.
        if (front.crack.visible && front.crack.scale.y < 1) front.crack.scale.y = Math.min(1, front.crack.scale.y + delta * 1.4);
        // The prop: waiting at the bird's right, carried, stood in the crack.
        if (bank.cracked && !bank.propped) {
          if (carrier != null) {
            beamPlace.copy(hands[carrier]);
            // Played with the mouse: taken, it goes to the crack by itself.
            if (mouse() || beamPlace.distanceTo(front.propTo) <= 0.17) {
              setProp(fight, at);
              carrier = null;
              stretch(front.beam, PROP_FOOT, PROP_HEAD);
              d.sounds.play('sandbag_drop', 0.9, 0.9);
              d.sounds.play('ear_click', 0.8, 0.6);
              front.lantern.color.setHex(0xffc878);
              if (import.meta.env.DEV) console.info(`[fog] bank ${at + 1}: propped`);
              tell();
              setV2Targets([...(choosing ? others() : []), ...targets()]);
            }
          } else beamPlace.copy(front.propFrom).setY(front.propFrom.y + 0.015 * Math.sin(clock * 3));
          beamMark.position.copy(beamPlace);
          if (!bank.propped) {
            // Held by its middle, upright.
            front.group.worldToLocal(local.copy(beamPlace));
            front.beam.position.set(local.x, local.y - 0.5, local.z);
            front.beam.quaternion.identity();
            front.beam.scale.set(1, 1, 1);
          }
        }
        busy = rope != null || carrier != null || SIDES.some((side) => (!bank.clear && hands[side].distanceTo(front.grip) < 0.28) || (front.beam.visible && !bank.propped && hands[side].distanceTo(beamPlace) < 0.28));
      }
      for (const [i, front] of fronts.entries()) if (i !== at) drawBell(front, null, 0, delta);
      // The magpie's whisper, once two banks stand clear.
      const back = whisper(fight, firstClear);
      if (back >= 0) {
        const front = fronts[back];
        standClear(front, false);
        bird.position.copy(front.perch.position).add(local.set(0, 0.42, 0));
        bird.lookAt(d.eyeAt.x, bird.position.y, d.eyeAt.z);
        bird.visible = true;
        bird.userData.clip = 'talk';
        d.sounds.play('wing_flaps', 0.7);
        d.sounds.bed('crowd_murmur_loop', 0.5);
        void d.captions.say('S20-2', d.eyeAt.clone().add(new Vector3(0, 0, -0.01)).lerp(front.perch.position, 0.12), 0).then(() => {
          bird.userData.clip = 'idle';
          d.sounds.bed('crowd_murmur_loop', 0.15);
        });
        if (import.meta.env.DEV) console.info(`[fog] the magpie whispers: bank ${back + 1} is back in the fog (fog ${fight.fog.toFixed(2)})`);
        tell();
      }
      // Another bell can be picked whenever no hand is at work here.
      const want = !busy && !fogLifted(fight);
      if (want && !choosing) {
        choosing = true;
        token += 1;
        const mine = token;
        const open = fronts.map((_, i) => i).filter((i) => i !== at && !fight.banks[i].clear);
        if (open.length === 0) choosing = false;
        else {
          void d.choosePerch(open.map((i) => fronts[i].perch)).then((picked) => {
            if (mine !== token || lost || skipped || fogLifted(fight)) return;
            choosing = false;
            token += 1;
            rope = null;
            carrier = null;
            void go(open[picked]).then(() => setV2Targets(targets()));
          });
          // The director's skip is this fight's skip.
          arm();
          setV2Targets([...open.map((i) => fronts[i].perch), ...targets()]);
        }
      } else if (!want && choosing) {
        d.cancelPerch();
        choosing = false;
        token += 1;
        setV2Targets(targets());
      }
    });
    demo.path = (k, out) => {
      if (at < 0 || moving) return false;
      const bank = fight.banks[at];
      if (bank.cracked && !bank.propped) {
        out.lerpVectors(beamPlace, fronts[at].propTo, k);
        return true;
      }
      if (bank.clear) return false;
      out.copy(fronts[at].grip);
      out.y -= 0.36 * k;
      out.z += 0;
      return true;
    };
    const others = (): Object3D[] => fronts.filter((_, i) => i !== at && !fight.banks[i].clear).map((f) => f.perch);
    arm();
    await d.until(() => lost || fogLifted(fight) || skipped);
    frame();
    demo.path = null;
    demo.update(0, true);
    token += 1;
    d.cancelPerch();
    setV2Targets([]);
    if (skipped || fogLifted(fight)) {
      // Whichever was cracked keeps its prop and a scaffold.
      fronts.forEach((front, i) => {
        standClear(front, true);
        if (fight.banks[i].weak) {
          front.crack.visible = true;
          front.crack.scale.set(1, 1, 1);
          front.beam.visible = true;
          stretch(front.beam, PROP_FOOT, PROP_HEAD);
          front.scaffold.visible = true;
        }
      });
      showWindows(d, cast, set.out, set.out);
      game.win();
      break;
    }
    // The fog takes the square: a lost round costs a window for good.
    d.day.darkWindows += 1;
    showWindows(d, cast, set.out, 0);
    if (import.meta.env.DEV) console.info(`[fog] lost: the fog took the square`);
    d.sounds.play('crowd_boo', 0.5);
    const start = d.now;
    await d.until(() => {
      const k = Math.min(1, (d.now - start) / 1.5);
      d.stage.setWeather({ ...DENSE, density: DENSE.density + 1.2 * k * k });
      return k >= 1;
    });
    await d.rig.move(CITY.shoulder, Math.PI);
    d.stage.setWeather(FOGGY);
    game.lose('the fog took the square');
  }
  endMiniGame(game);
  if (import.meta.env.DEV) console.info('[fog] won');
  // The bells swing themselves out while the fog lifts.
  const swingOut = d.each((delta) => {
    for (const front of fronts) drawBell(front, null, 0, delta);
  });
  bird.visible = false;
  d.sounds.bed('wind_loop', 0);
  d.sounds.bed('crowd_murmur_loop', 0.15);
  d.sounds.play('bell_toll', 0.8, 1.12);
  d.sounds.play('applause', 0.8);
  // The fog lifts; the ice on the bank's doors lets go.
  const lift = d.now;
  const liftOff = d.each(() => {
    const k = Math.min(1, (d.now - lift) / 3);
    d.stage.blendWeather(FOGGY, WEATHER.rain2008, k);
    if (set.icicles != null) {
      set.icicles.position.y = -1.2 * k * k;
      (set.icicles.material as MeshStandardMaterial).opacity = 0.85 * (1 - k);
      if (k >= 1) set.icicles.visible = false;
    }
  });
  await d.gold.show(BOSSES.fog.won, d.eyeAt.clone().add(new Vector3(0, 1.2, -3).applyAxisAngle(yAxis, d.player.rotation.y)), 3, 2.8, new Vector3(0, 0.2, 0), head);
  await d.until(() => d.now - lift >= 3);
  liftOff();
  swingOut();
  for (const front of set.fronts) {
    // Out of the fog for good: drawn as the rest of the square is.
    front.face.fog = true;
    front.face.needsUpdate = true;
    front.lantern.intensity = 1.2;
  }
  settle(d, set);
  for (const p of cast.crowd) p.pose = 'idle';
  d.day.problem = 5;
  d.day.treasury -= 1;
  d.day.wrongStreak = 0;
  d.bear.steps -= 1;
  await d.rig.move(CITY.shoulder, Math.PI);
  await showCard(d, 'stressTest');
  d.notebook.write([
    { text: HEADLINES.run, struck: HEADLINES.runSolved },
    { text: HEADLINES.spreads, struck: HEADLINES.lightsOn },
    { text: HEADLINES.sinks, struck: HEADLINES.afloat },
    { text: HEADLINES.whoIsSafe, struck: HEADLINES.fogLifted },
  ]);
}
