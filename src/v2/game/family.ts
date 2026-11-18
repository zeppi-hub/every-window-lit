import { AdditiveBlending, AssetManager, BoxGeometry, CanvasTexture, CylinderGeometry, DoubleSide, FrontSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, PlaneGeometry, PointLight, Quaternion, Raycaster, RepeatWrapping, SphereGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';
import type { Actor } from './actors.js';
import type { DirectorSystem } from './director.js';
import type { Wires } from './fire.js';
import { mergeByMaterial } from './fx.js';
import type { PersonaId } from './lines.js';
import { mergeFlatParts } from './opening.js';
import type { Person } from './people.js';

/**
 * The family behind the lit window (S11, S16, S30): the chosen person at
 * nine with their young parents, at home on an ordinary evening. They are
 * not lined up at the glass: the father is telling something across the
 * supper table, the mother listens and nods, the child stands by the
 * window between them and keeps looking out at the bird. Each breathes,
 * shifts and turns their head to whoever has their attention; a hanging
 * lamp lights them (a real light), and bread and a pot are on the table.
 */

const UP = new Vector3(0, 1, 0);
const parentTurn = new Quaternion();
const turnBy = new Quaternion();
const turned = new Quaternion();
const headAt = new Vector3();
const side = new Vector3();

/** Turn a bone by `angle` about an axis given in the world, over whatever its clip has it doing. */
function turn(bone: Object3D | undefined, about: Vector3, angle: number): void {
  if (bone?.parent == null || angle === 0) return;
  bone.parent.getWorldQuaternion(parentTurn);
  turnBy.setFromAxisAngle(about, angle);
  turned.copy(parentTurn).invert().multiply(turnBy).multiply(parentTurn).multiply(bone.quaternion);
  bone.quaternion.copy(turned);
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));

/**
 * Give someone the small movements of a person at ease, over their clip:
 * breath in the chest, a slow shift of weight, and the head (neck and head
 * sharing the turn) following whatever `mind` says they attend to: a point
 * in the world, or null for straight ahead. `nods` adds a listener's nod
 * now and then. A stylized stand-in has no bones and is left as it is.
 */
export function enliven(person: Person, mind: () => Vector3 | null, phase = 0, nods = false): void {
  const actor = person as Partial<Actor> & Person;
  if (!('adjust' in actor)) return;
  let yaw = 0;
  let pitch = 0;
  let t = phase * 9;
  actor.adjust = (bones, delta) => {
    t += delta;
    const head = bones.get('Head');
    if (head == null) return;
    const target = mind();
    let wantYaw = 0;
    let wantPitch = 0;
    if (target != null) {
      head.getWorldPosition(headAt);
      const dx = target.x - headAt.x;
      const dz = target.z - headAt.z;
      // As far as a neck turns; beyond that they would turn the body.
      wantYaw = clamp(wrap(Math.atan2(dx, dz) - person.yaw), -1.05, 1.05);
      wantPitch = clamp(Math.atan2(target.y - headAt.y, Math.hypot(dx, dz)), -0.45, 0.35);
    }
    const ease = 1 - Math.exp(-delta * 3);
    yaw += (wantYaw - yaw) * ease;
    pitch += (wantPitch - pitch) * ease;
    // Their own right, for leaning forward and back.
    side.set(Math.cos(person.yaw), 0, -Math.sin(person.yaw));
    const breath = Math.sin(t * 1.6) * 0.016;
    turn(bones.get('LowerBack'), side, Math.sin(t * 0.41) * 0.012);
    turn(bones.get('Spine1'), side, -breath);
    turn(bones.get('Neck'), UP, yaw * 0.4);
    turn(head, UP, yaw * 0.6 + Math.sin(t * 0.83) * 0.03);
    side.set(Math.cos(person.yaw + yaw), 0, -Math.sin(person.yaw + yaw));
    // A nod: a few quick dips every so often.
    const nod = nods ? Math.pow(Math.max(0, Math.sin(t * 0.55)), 10) * Math.sin(t * 6.5) * 0.09 : 0;
    turn(head, side, -pitch + breath * 0.5 + nod);
  };
}

/** What the family's window gives the scenes: the glass to bring a feather to, a way to warm its light, the child, and where the person stands. */
export interface FamilyRoom {
  glass: Mesh;
  warm: () => void;
  child: Person;
  /** The young parents, for a scene that has one of them speak or turn. */
  mother: Person;
  father: Person;
  front: Vector3;
}

interface Family {
  /** Everything built for them (the room, the things on the table): shown and hidden together. */
  things: Object3D[];
  people: [child: Person, mother: Person, father: Person];
  lamp: PointLight;
  /** The lamp's strength when on. */
  glow: number;
  shown: boolean;
  /** Seconds left of their delight at the bird's word (all three look at it; the child's arms go up). */
  joy: number;
  clock: number;
}

let family: Family | null = null;

/** Show or hide the family's place and the three in it: seen only when the bird is there (S11, S16, S30). */
export function showFamily(on: boolean): void {
  if (family == null) return;
  family.shown = on;
  for (const thing of family.things) thing.visible = on;
  const [child, mother, father] = family.people;
  child.pose = on ? 'idle' : 'hidden';
  mother.pose = on ? 'idle' : 'hidden';
  // He is in the middle of telling them something.
  father.pose = on ? 'talk' : 'hidden';
  // The lamp is never taken away, only turned down: taking a light out of the scene would have every lit surface's shader built again.
  family.lamp.intensity = on ? family.glow : 0;
}

/** The bird's word reached them: all three turn to the window, the child throws both arms up, the lamp burns warmer. */
export function familyDelight(): void {
  if (family == null) return;
  family.joy = 4.5;
  family.people[0].pose = 'wave';
  family.glow *= 1.35;
  family.lamp.intensity = family.glow;
}

/** The glass of the family's window: its middle, the way it faces (out to the street) and its size (m); null before noon. */
export function familyGlass(): { at: Vector3; facing: Vector3; wide: number; tall: number } | null {
  if (family == null || glassOf == null) return null;
  return glassOf;
}
let glassOf: { at: Vector3; facing: Vector3; wide: number; tall: number } | null = null;

/** Where the person stands to look in at them (on the pavement, the ground's height); null before noon. */
export function familyFront(): Vector3 | null {
  return family == null ? null : standAt;
}
const standAt = new Vector3();

/** A soft round pool of light, white at the middle and fading to nothing: laid on the ground where a lamp or a lit window throws its light. */
let poolMap: CanvasTexture | null = null;
export function lightPoolTexture(): CanvasTexture {
  if (poolMap != null) return poolMap;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g != null) {
    const fall = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    fall.addColorStop(0, 'rgba(255,255,255,1)');
    fall.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    fall.addColorStop(0.7, 'rgba(255,255,255,0.14)');
    fall.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = fall;
    g.fillRect(0, 0, 128, 128);
  }
  poolMap = new CanvasTexture(canvas);
  poolMap.colorSpace = SRGBColorSpace;
  return poolMap;
}

/** The window's light on the pavement in front of it. */
function spill(wide: number, deep: number): Mesh {
  const mesh = new Mesh(new PlaneGeometry(wide, deep), new MeshBasicMaterial({ map: lightPoolTexture(), color: 0xffc98f, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  mesh.name = 'WindowLightOnThePavement';
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/** Brick courses for the bay's outside, drawn once. */
function brickwork(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = '#5a4034';
    g.fillRect(0, 0, 128, 64);
    const tones = ['#8f5a44', '#874f3c', '#96624a', '#7f4a38'];
    for (let row = 0; row < 4; row += 1)
      for (let k = -1; k < 4; k += 1) {
        g.fillStyle = tones[(row * 3 + k + 4) % tones.length];
        g.fillRect(k * 32 + (row % 2) * 16 + 1, row * 16 + 1, 30, 14);
      }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(3, 9);
  return texture;
}

/** Curtain cloth hanging in folds: dark red, lighter along each fold's crest. */
function drapes(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 16;
  const g = canvas.getContext('2d');
  if (g != null) {
    for (let x = 0; x < 128; x += 1) {
      const fold = 0.5 + 0.5 * Math.sin((x / 128) * Math.PI * 2 * 5);
      const light = Math.round(38 + 46 * fold);
      g.fillStyle = `rgb(${light + 70}, ${Math.round(light * 0.5)}, ${Math.round(light * 0.5)})`;
      g.fillRect(x, 0, 1, 16);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Striped wallpaper, drawn once. */
function wallpaper(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.fillStyle = '#e9d3a8';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#dcc08c';
    g.fillRect(0, 0, 22, 64);
    g.fillStyle = '#b98a5a';
    g.fillRect(22, 0, 2, 64);
    g.fillRect(62, 0, 2, 64);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(8, 1);
  return texture;
}

/** The picture on the wall: hills under an evening sky. */
function painting(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  if (g != null) {
    const sky = g.createLinearGradient(0, 0, 0, 96);
    sky.addColorStop(0, '#6f8fb5');
    sky.addColorStop(0.6, '#e9b98a');
    sky.addColorStop(1, '#e6a05c');
    g.fillStyle = sky;
    g.fillRect(0, 0, 128, 96);
    g.fillStyle = '#f6e3a8';
    g.beginPath();
    g.arc(88, 50, 9, 0, Math.PI * 2);
    g.fill();
    for (const [colour, top, swell] of [['#5f7f58', 62, 10], ['#3f5f44', 74, 7]] as const) {
      g.fillStyle = colour;
      g.beginPath();
      g.moveTo(0, 96);
      for (let x = 0; x <= 128; x += 8) g.lineTo(x, top + Math.sin(x * 0.06 + top) * swell);
      g.lineTo(128, 96);
      g.fill();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Supper on a table top at `top` (m, the room's frame): a cloth runner, a loaf on its board, a pot, three plates and cups. */
function supper(room: Group, x: number, top: number, z: number, wide: number, deep: number): void {
  const white = new MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.55 });
  const crust = new MeshStandardMaterial({ color: 0xb9783a, roughness: 0.85 });
  const board = new MeshStandardMaterial({ color: 0x8a6238, roughness: 0.7 });
  const enamel = new MeshStandardMaterial({ color: 0x2f5d7a, roughness: 0.35, metalness: 0.3 });
  const put = (mesh: Mesh, px: number, py: number, pz: number): Mesh => {
    mesh.position.set(x + px, top + py, z + pz);
    room.add(mesh);
    return mesh;
  };
  put(new Mesh(new BoxGeometry(wide * 0.42, 0.008, deep + 0.08), white), 0, 0.004, 0);
  put(new Mesh(new BoxGeometry(0.34, 0.02, 0.2), board), -0.06, 0.018, 0.02);
  put(new Mesh(new SphereGeometry(0.1, 14, 10), crust), -0.06, 0.075, 0.02).scale.set(1.5, 0.62, 0.85);
  put(new Mesh(new CylinderGeometry(0.095, 0.085, 0.1, 16), enamel), 0.3, 0.05, -0.12);
  put(new Mesh(new CylinderGeometry(0.1, 0.1, 0.014, 16), enamel), 0.3, 0.107, -0.12);
  put(new Mesh(new SphereGeometry(0.016, 8, 6), enamel), 0.3, 0.128, -0.12);
  for (const [px, pz] of [[-wide * 0.36, 0.02], [wide * 0.36, 0.0], [0.08, deep * 0.3]] as const) {
    put(new Mesh(new CylinderGeometry(0.085, 0.06, 0.012, 16), white), px, 0.006, pz);
    put(new Mesh(new CylinderGeometry(0.03, 0.026, 0.06, 12), white), px + 0.13, 0.03, pz - 0.06);
  }
}

/** The hanging lamp: cord from the ceiling, enamel shade, bulb. Its light is made by the caller. */
function pendant(room: Group, x: number, ceiling: number, z: number, drop: number): Vector3 {
  const dark = new MeshStandardMaterial({ color: 0x1f2a24, roughness: 0.5, metalness: 0.4, side: DoubleSide });
  const cord = new Mesh(new CylinderGeometry(0.006, 0.006, drop, 6), dark);
  cord.position.set(x, ceiling - drop / 2, z);
  const shade = new Mesh(new CylinderGeometry(0.05, 0.21, 0.15, 18, 1, true), dark);
  shade.position.set(x, ceiling - drop - 0.07, z);
  const bulb = new Mesh(new SphereGeometry(0.045, 12, 8), new MeshBasicMaterial({ color: 0xfff0c8, toneMapped: false }));
  bulb.position.set(x, ceiling - drop - 0.13, z);
  room.add(cord, shade, bulb);
  return new Vector3(x, ceiling - drop - 0.2, z);
}

/** The child's size against a grown-up: nine years old, about 1.3 m, so head and shoulders show over a shop's window sill. */
const CHILD = 0.76;

/** The room's size (m): Leo's and Sam's homes have no room behind their fronts, so one is built out from the wall as a bay window. */
const BAY = { wide: 3.0, tall: 2.1, deep: 1.7, sill: 0.75 } as const;

/** Where the three stand in the room (its frame: x to the right seen from the street, z toward the street): the child by the glass, the mother and father either side, all in front of the table and its chairs. */
const STANDS = { child: [0.12, 0.52], mother: [0.88, 0.25], father: [-0.8, 0.28] } as const;
const STAND_SHADOWS: readonly (readonly [number, number, number])[] = [
  [STANDS.child[0], STANDS.child[1], 0.34],
  [STANDS.mother[0], STANDS.mother[1], 0.42],
  [STANDS.father[0], STANDS.father[1], 0.42],
];

/** The modelled room, loaded when the family is first shown (behind a fade); null if it cannot be had, and the room is then built in code. */
async function loadRoom(): Promise<Object3D | null> {
  try {
    await AssetManager.loadGLTF('v2/nesne/family_room.glb', 'v2_prop_family_room');
    return AssetManager.getGLTF('v2_prop_family_room')?.scene ?? null;
  } catch {
    return null;
  }
}

/** The bay: brick outside, a papered room inside, the window with its bars and curtains, supper under the lamp. */
function buildBay(model: Object3D | null): { bay: Group; glass: Mesh; lamp: Vector3 } {
  const { wide: W, tall: H, deep: D, sill } = BAY;
  const high = H + sill;
  const bay = new Group();
  bay.name = 'FamilyWindow';
  if (model != null) {
    // The modelled room (art/v2/nesne, family_room.glb: the same size, its front open toward +z); the game adds the glass, the people's shadows and the light on the pavement.
    bay.add(model);
    bay.updateMatrixWorld(true);
    const centre = model.getObjectByName('room_glass_centre')?.getWorldPosition(new Vector3()) ?? new Vector3(0, sill + H / 2, D / 2);
    const bulb = model.getObjectByName('pendant_bulb')?.getWorldPosition(new Vector3()) ?? new Vector3(0, high - 0.95, -0.32);
    const pane = new Mesh(new PlaneGeometry(W - 0.2, H), new MeshBasicMaterial({ color: 0xcfe6f2, transparent: true, opacity: 0.08, depthWrite: false }));
    pane.name = 'FamilyGlass';
    pane.position.copy(centre);
    bay.add(pane);
    const dark = new MeshBasicMaterial({ map: lightPoolTexture(), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (const [x, z, r] of STAND_SHADOWS) {
      const shade = new Mesh(new PlaneGeometry(r * 2, r * 2), dark);
      shade.rotation.x = -Math.PI / 2;
      shade.position.set(x, 0.03, z);
      bay.add(shade);
    }
    const onPavement = spill(W + 1.2, 2.6);
    onPavement.position.set(0, 0.02, D / 2 + 1.25);
    bay.add(onPavement);
    bay.traverse((o) => {
      o.pointerEvents = 'none';
    });
    return { bay, glass: pane, lamp: bulb.add(new Vector3(0, -0.08, 0)) };
  }
  const paper = new MeshStandardMaterial({ map: wallpaper(), roughness: 0.95, side: FrontSide });
  const plaster = new MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.95 });
  const brick = new MeshStandardMaterial({ map: brickwork(), roughness: 0.9 });
  const wood = new MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.7 });
  const boards = new MeshStandardMaterial({ color: 0x6a4a32, roughness: 0.8 });
  const cloth = new MeshStandardMaterial({ map: drapes(), roughness: 0.95, side: DoubleSide });
  const add = (mesh: Mesh, x: number, y: number, z: number): Mesh => {
    mesh.position.set(x, y, z);
    bay.add(mesh);
    return mesh;
  };
  // Inside: papered walls, a panelled dado, a plaster ceiling, a board floor.
  add(new Mesh(new PlaneGeometry(W, high), paper), 0, high / 2, -D / 2 + 0.002);
  add(new Mesh(new PlaneGeometry(D, high), paper), -W / 2 + 0.002, high / 2, 0).rotation.y = Math.PI / 2;
  add(new Mesh(new PlaneGeometry(D, high), paper), W / 2 - 0.002, high / 2, 0).rotation.y = -Math.PI / 2;
  add(new Mesh(new PlaneGeometry(W, D), plaster), 0, high - 0.002, 0).rotation.x = Math.PI / 2;
  add(new Mesh(new PlaneGeometry(W, D), boards), 0, 0.02, 0).rotation.x = -Math.PI / 2;
  add(new Mesh(new BoxGeometry(W, 0.85, 0.03), wood), 0, 0.425, -D / 2 + 0.018);
  add(new Mesh(new BoxGeometry(W, 0.04, 0.05), wood), 0, 0.87, -D / 2 + 0.03);
  // Outside: brick cheeks and the wall under the sill, a flat roof with a lip.
  add(new Mesh(new BoxGeometry(0.1, high, D), brick), -W / 2 - 0.05, high / 2, 0);
  add(new Mesh(new BoxGeometry(0.1, high, D), brick), W / 2 + 0.05, high / 2, 0);
  add(new Mesh(new BoxGeometry(W + 0.2, sill, 0.12), brick), 0, sill / 2, D / 2);
  add(new Mesh(new BoxGeometry(W + 0.36, 0.12, D + 0.14), wood), 0, high + 0.06, 0.05);
  // The window: sill, lintel, posts, two glazing bars, curtains drawn back.
  add(new Mesh(new BoxGeometry(W + 0.3, 0.08, 0.26), wood), 0, sill, D / 2 + 0.04);
  add(new Mesh(new BoxGeometry(W + 0.2, 0.14, 0.16), wood), 0, high - 0.07, D / 2);
  add(new Mesh(new BoxGeometry(0.1, H, 0.14), wood), -W / 2 + 0.05, sill + H / 2, D / 2);
  add(new Mesh(new BoxGeometry(0.1, H, 0.14), wood), W / 2 - 0.05, sill + H / 2, D / 2);
  add(new Mesh(new BoxGeometry(0.05, H, 0.05), wood), 0, sill + H / 2, D / 2 + 0.01);
  add(new Mesh(new BoxGeometry(W, 0.05, 0.05), wood), 0, sill + H * 0.66, D / 2 + 0.01);
  add(new Mesh(new PlaneGeometry(0.46, H), cloth), -W / 2 + 0.32, sill + H / 2, D / 2 - 0.12);
  add(new Mesh(new PlaneGeometry(0.46, H), cloth), W / 2 - 0.32, sill + H / 2, D / 2 - 0.12);
  // The supper table on its four legs, between the parents.
  const table = { x: 0, z: -0.32, wide: 1.1, deep: 0.6, top: 0.74 };
  add(new Mesh(new BoxGeometry(table.wide, 0.05, table.deep), wood), table.x, table.top - 0.025, table.z);
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) add(new Mesh(new BoxGeometry(0.05, table.top - 0.05, 0.05), wood), table.x + lx * (table.wide / 2 - 0.06), (table.top - 0.05) / 2, table.z + lz * (table.deep / 2 - 0.06));
  supper(bay, table.x, table.top, table.z, table.wide, table.deep);
  // A picture and a shelf with two jars on the back wall.
  add(new Mesh(new BoxGeometry(0.66, 0.5, 0.03), wood), -0.8, 1.75, -D / 2 + 0.02);
  add(new Mesh(new PlaneGeometry(0.58, 0.42), new MeshStandardMaterial({ map: painting(), roughness: 0.8 })), -0.8, 1.75, -D / 2 + 0.037);
  add(new Mesh(new BoxGeometry(0.6, 0.03, 0.16), wood), 0.85, 1.5, -D / 2 + 0.08);
  const jar = new MeshStandardMaterial({ color: 0xc9a23f, roughness: 0.4, metalness: 0.2 });
  add(new Mesh(new CylinderGeometry(0.05, 0.05, 0.13, 12), jar), 0.72, 1.58, -D / 2 + 0.08);
  add(new Mesh(new CylinderGeometry(0.04, 0.04, 0.1, 12), jar), 0.95, 1.565, -D / 2 + 0.08);
  const lamp = pendant(bay, table.x, high, table.z, 0.85);
  const glass = new Mesh(new PlaneGeometry(W - 0.2, H), new MeshBasicMaterial({ color: 0xcfe6f2, transparent: true, opacity: 0.1, depthWrite: false }));
  glass.name = 'FamilyGlass';
  glass.position.set(0, sill + H / 2, D / 2);
  bay.add(glass);
  // Where the three stand and under the table, the floor is darker: they are standing on it.
  const under = new MeshBasicMaterial({ map: lightPoolTexture(), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const [x, z, r] of [...STAND_SHADOWS, [table.x, table.z, 0.75]] as const) {
    const shade = new Mesh(new PlaneGeometry(r * 2, r * 2), under);
    shade.rotation.x = -Math.PI / 2;
    add(shade, x, 0.03, z);
  }
  // Its light lies on the pavement in front.
  add(spill(W + 1.2, 2.6), 0, 0.02, D / 2 + 1.25);
  // Everything plainly coloured (plaster, wood, crockery, bread) becomes one mesh with its colours per vertex: one draw, not eight.
  const plain = new Group();
  plain.name = 'FamilyRoomPlain';
  for (const child of [...bay.children]) {
    const material = (child as Mesh).material;
    if (material instanceof MeshStandardMaterial && material.map == null && material.side === FrontSide && !material.transparent) plain.add(child);
  }
  bay.add(plain);
  mergeFlatParts(plain);
  mergeByMaterial(bay);
  bay.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return { bay, glass, lamp };
}

/**
 * The family's lit window, made at noon (S11). Maya's family is in their
 * own bakery, the one shop of the square with a room behind its glass
 * (art/v2/mahalle: the counter, the baker's spot); Leo's and Sam's get the
 * bay. Either way the three stand as people do at home, turned to each
 * other, under a warm lamp.
 */
export async function familyWindow(d: DirectorSystem, w: Wires, persona: PersonaId): Promise<FamilyRoom> {
  const things: Object3D[] = [];
  let child: Person;
  let mother: Person;
  let father: Person;
  let glass: Mesh;
  let front: Vector3;
  const lampAt = new Vector3();
  let glow = 5;
  if (persona === 'maya') {
    const baker = d.stage.point('city', 'spot_baker', new Vector3());
    // Out to the square is east (+x).
    const east = Math.PI / 2;
    child = d.people.add({ model: 'maya', size: CHILD });
    // Behind the glass of the shop door, in full view, half turned to her parents.
    child.at(-21.75, 0.15, 1.55, east - 0.75);
    mother = d.people.add({ model: 'crowd_woman_b', size: 0.98 });
    mother.at(-22.5, 0.15, -0.55, east);
    father = d.people.add({ model: 'crowd_man_casual' });
    father.at(baker.x, baker.y, baker.z, east);
    // The parents turned most of the way to each other, still open to the window.
    const toEach = (from: Person, to: Person) => east + clamp(wrap(Math.atan2(to.position.x - from.position.x, to.position.z - from.position.z) - east), -1.0, 1.0) * 0.8;
    mother.yaw = toEach(mother, father);
    father.yaw = toEach(father, mother);
    mother.at(mother.position.x, mother.position.y, mother.position.z);
    father.at(father.position.x, father.position.y, father.position.z);
    // The shop's lamp, hung where a ceiling is found over the middle of the three.
    const middle = new Vector3().add(child.position).add(mother.position).add(father.position).multiplyScalar(1 / 3);
    const root = d.stage.root('city');
    const ceiling = root == null ? undefined : new Raycaster(new Vector3(middle.x, 1.7, middle.z), UP, 0, 4).intersectObject(root, true)[0];
    const extras = new Group();
    extras.name = 'BakeryEvening';
    const top = ceiling != null ? ceiling.point.y : 3.0;
    lampAt.copy(pendant(extras, middle.x, top, middle.z, Math.max(0.3, top - 2.25)));
    // Loaves on whatever counter is found in front of the baker.
    if (root != null) {
      const counter = new Raycaster(new Vector3(baker.x + 0.6, 1.5, baker.z), new Vector3(0, -1, 0), 0, 1.3).intersectObject(root, true)[0];
      if (counter != null && counter.point.y > 0.7) {
        const crust = new MeshStandardMaterial({ color: 0xb9783a, roughness: 0.85 });
        for (const [dx, dz, long] of [[0, -0.22, 1.5], [0.05, 0.02, 1.3], [-0.04, 0.26, 1.6]] as const) {
          const loaf = new Mesh(new SphereGeometry(0.09, 12, 8), crust);
          loaf.scale.set(0.8, 0.6, long);
          loaf.position.set(counter.point.x + dx, counter.point.y + 0.05, counter.point.z + dz);
          extras.add(loaf);
        }
      }
    }
    // The shop's light on the pavement outside its door.
    const onPavement = spill(4.2, 2.6);
    onPavement.position.set(-19.9, 0.17, 1.3);
    extras.add(onPavement);
    mergeByMaterial(extras);
    extras.traverse((o) => {
      o.pointerEvents = 'none';
    });
    d.world.createTransformEntity(extras, { persistent: true });
    glass = new Mesh(new PlaneGeometry(1.6, 1.8), new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    glass.name = 'FamilyGlass';
    glass.position.set(-21.15, 1.1, 1.3);
    glass.rotation.y = east;
    glass.pointerEvents = 'none';
    d.world.createTransformEntity(glass, { persistent: true });
    things.push(extras, glass);
    glassOf = { at: glass.position.clone(), facing: new Vector3(1, 0, 0), wide: 1.6, tall: 1.8 };
    front = new Vector3(-19.6, 0.15, 1.2);
    glow = 7;
  } else {
    const built = buildBay(await loadRoom());
    glass = built.glass;
    // Out from the facade, at the ground, facing the square.
    const at = w.family.clone().addScaledVector(w.facing, BAY.deep / 2 + 0.05);
    const facing = Math.atan2(w.facing.x, w.facing.z);
    built.bay.position.copy(at);
    built.bay.rotation.y = facing;
    d.world.createTransformEntity(built.bay, { persistent: true });
    things.push(built.bay);
    const place = (x: number, z: number) => at.clone().add(new Vector3(x, 0, z).applyAxisAngle(UP, facing));
    lampAt.copy(built.lamp).applyAxisAngle(UP, facing).add(at);
    // Supper is over: the three stand between the table and the window, the parents three quarters turned to each other, the child between them by the glass.
    child = d.people.add({ model: persona, size: CHILD });
    const c = place(STANDS.child[0], STANDS.child[1]);
    child.at(c.x, c.y, c.z, facing - 0.85);
    mother = d.people.add({ model: 'crowd_woman_b', size: 0.98 });
    const m = place(STANDS.mother[0], STANDS.mother[1]);
    mother.at(m.x, m.y, m.z, facing - 1.0);
    father = d.people.add({ model: 'crowd_man_casual' });
    const f = place(STANDS.father[0], STANDS.father[1]);
    father.at(f.x, f.y, f.z, facing + 1.05);
    glassOf = { at: place(0, BAY.deep / 2).setY(at.y + BAY.sill + BAY.tall / 2), facing: w.facing.clone(), wide: BAY.wide - 0.2, tall: BAY.tall };
    front = w.family.clone().addScaledVector(w.facing, BAY.deep + 1.7);
  }
  // The lamp's light: real, warm, falling off across the room.
  const lamp = new PointLight(0xffc98f, 0, 7, 1.5);
  lamp.position.copy(lampAt);
  d.world.createTransformEntity(lamp, { persistent: true });
  d.stage.own('city', ...things);
  const kin: Family = { things, people: [child, mother, father], lamp, glow, shown: true, joy: 0, clock: 0 };
  family = kin;
  // Who each of them has their eye on, a few seconds at a time: each other, the child, and (when it is at the glass) the bird.
  const headOf = (p: Person, out: Vector3) => out.set(p.position.x, p.position.y + 1.62 * p.size, p.position.z);
  const eyes = { child: new Vector3(), mother: new Vector3(), father: new Vector3() };
  const turnOf = (period: number, offset: number) => ((kin.clock + offset) % period) / period;
  enliven(child, () => (kin.joy > 0 || turnOf(9, 0) < 0.62 ? d.eyeAt : turnOf(9, 0) < 0.82 ? headOf(father, eyes.father) : headOf(mother, eyes.mother)), 0.1);
  enliven(mother, () => (kin.joy > 0 ? d.eyeAt : turnOf(11, 3) < 0.64 ? headOf(father, eyes.father) : turnOf(11, 3) < 0.9 ? headOf(child, eyes.child) : d.eyeAt), 0.45, true);
  enliven(father, () => (kin.joy > 0 ? d.eyeAt : turnOf(13, 6) < 0.6 ? headOf(mother, eyes.mother) : turnOf(13, 6) < 0.84 ? headOf(child, eyes.child) : d.eyeAt), 0.8);
  d.each((delta) => {
    if (!kin.shown) return;
    kin.clock += delta;
    if (kin.joy <= 0) return;
    kin.joy -= delta;
    // Her arms come down again after a moment.
    if (kin.joy < 2 && child.pose === 'wave') child.pose = 'idle';
  });
  standAt.copy(front);
  showFamily(true);
  const warm = () => familyDelight();
  return { glass, warm, child, mother, father, front };
}
