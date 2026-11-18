import { AssetManager, type BufferGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Material, type Object3D, IcosahedronGeometry, PlaneGeometry, Quaternion, RepeatWrapping, SphereGeometry, TorusGeometry, Vector3 } from '@iwsdk/core';
import { setDeskMode } from '../desk-hands.js';
import { setWindows } from '../goal.js';
import { endMiniGame, HINT_AFTER, MiniGame, playMiniGame } from '../minigame.js';
import { MiniGameSystem } from '../minigame-system.js';
import { startQuake } from '../quake-system.js';
import { BANK, type BailStage, ease, surface } from '../ship-bail.js';
import { setV2Targets } from '../step-targets.js';
import { wordBadge } from '../icons.js';
import { BailPlay, type BailSet, dimSun, Droplets, goal, OVERCAST, Seat } from './bail-play.js';
import { standard } from './circus-show.js';
import type { DirectorSystem } from './director.js';
import { BOSSES, HEADLINES, WORDS } from './lines.js';
import { CITY, type CityCast, mergeFlatParts, prop } from './opening.js';
import type { Person } from './people.js';
import { LAMP_EYE, magpie as makeMagpie, showCard } from './run.js';

/**
 * S15, THE SINKING BANK: the ship's game again, at the size of the square.
 * The flood round the bank is held in by a wall of sandbags with a red line
 * along its top; the people stand on the dry side of it. From the lamp the
 * bird has a small gold bucket on a chain, and whatever that bucket does a
 * giant gold bucket on the same chain does in the flood: plunged, it fills;
 * heaved, it throws its water over the sandbags, onto the people. The bank
 * dries as their side fills. Three rounds, each faster; in the last the
 * bank lurches and takes a gulp. The flood over the red line loses a round
 * and costs a window; each round won lights one of three lamps on the
 * sandbags, and when the bank is afloat the windows it put out come back.
 *
 * The rules are v2/ship-bail.ts (BANK), the hands v2/game/bail-play.ts.
 */

/** The dark water round the bank (S12 on) and on the people's side (S15 on), the sandbags between, and what floats in the flood. */
export interface Flood {
  bank: Mesh;
  square: Mesh;
  wall: Group;
  /** The windows this trouble has put out (S12); they come back on when the bank is afloat. */
  dark: number;
  parachutes: Object3D[];
  fins: Object3D[];
  stop: () => void;
}

/** The third trouble: its name on the goal plate, and how many windows it puts out while it lasts. */
export const TROUBLE = { where: 'TROUBLE 3 OF 6 · THE SINKING BANK', windows: 36 } as const;
const BAIL = 'Bail the bank out: keep the flood under the red line.';
/** The sandbag wall across the square in front of the bank (z), and its ends (x). */
export const WALL = { z: -16.2, from: -15, to: 9, rows: 7, bag: 0.155 } as const;
/** The flood's height: as S12 leaves it, at the brass mark (a round won), and at the red line along the sandbags' top (a round lost). */
export const FLOOD = { from: 0.12, risen: 0.5, dry: 0.28, line: 1.02 } as const;
const floodAt = (level: number): number => FLOOD.dry + (FLOOD.line - FLOOD.dry) * level;
/** The giant bucket: where it floats, how tall it is, and how far it moves for a metre of the hand's (up, and sideways). */
const GIANT = { at: new Vector3(-3.4, 0, -18.6), tall: 2.2, up: 12, side: 7 } as const;
/** The people's water: how high a full bucket raises it, and where it stops (m). */
const SQUARE = { from: 0.12, perBucket: 0.03, most: 0.5 } as const;

/** What S15 leaves standing on the square, taken away once S16 has been seen. */
let afterwards: (() => void) | null = null;

/** What the flood brought and takes away with it (S12's parachutes and fins). */
const flotsam: Object3D[] = [];

export function leavesWithFlood(...objects: Object3D[]): void {
  flotsam.push(...objects);
}

/** After S16: the sandbags, the flood pole, the people and what the flood brought leave the square. */
export function clearSquare(): void {
  afterwards?.();
  afterwards = null;
  for (const object of flotsam) object.visible = false;
  flotsam.length = 0;
}

/**
 * One sandbag, light enough for a wall of them: a stuffed sack one unit long
 * (x), high and deep, 48 triangles. The modelled bag has 300, and 280 of
 * those were the heaviest thing on the square; from the lamp a bag is a few
 * degrees wide, and its cloth is what is seen.
 */
function lightBag(): BufferGeometry {
  // Its ends are the sphere's poles; squared off like a filled sack.
  const bag = new SphereGeometry(0.5, 8, 4);
  bag.rotateZ(Math.PI / 2);
  const at = bag.getAttribute('position');
  const normal = bag.getAttribute('normal');
  const full = 0.62;
  const out = new Vector3();
  for (let i = 0; i < at.count; i += 1) {
    out.set(at.getX(i), at.getY(i), at.getZ(i)).multiplyScalar(2);
    // The normal is the round one's, pushed the way the corners were.
    normal.setXYZ(i, Math.sign(out.x) * Math.abs(out.x) ** (2 - full), Math.sign(out.y) * Math.abs(out.y) ** (2 - full), Math.sign(out.z) * Math.abs(out.z) ** (2 - full));
    at.setXYZ(i, (Math.sign(out.x) * Math.abs(out.x) ** full) / 2, (Math.sign(out.y) * Math.abs(out.y) ** full) / 2, (Math.sign(out.z) * Math.abs(out.z) ** full) / 2);
  }
  bag.normalizeNormals();
  // The weave runs twice round a bag.
  const uv = bag.getAttribute('uv');
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 2);
  bag.computeBoundingSphere();
  return bag;
}

/** The sandbags: seven staggered rows of light bags in the real bag's burlap (art/v2/nesne/sandbag.glb), one draw; the top row is the red line, painted red; a red tape runs along it. */
export async function buildSandbags(d: DirectorSystem): Promise<Group> {
  const group = new Group();
  group.name = 'Sandbags';
  const long = 0.62;
  const perRow = Math.ceil((WALL.to - WALL.from) / long) + 1;
  const shape = lightBag();
  // The real bag's cloth, if it loads; plain cloth otherwise.
  let cloth: Material = standard(0xffffff, 0.95);
  const fit = new Vector3(long * 1.06, WALL.bag * 1.12, 0.38);
  try {
    const gltf = await AssetManager.loadGLTF('v2/nesne/sandbag.glb', 'v2_prop_sandbag');
    let found: Mesh | null = null;
    gltf.scene.traverse((o) => {
      if (found == null && (o as Mesh).isMesh === true) found = o as Mesh;
    });
    const bag = found as Mesh | null;
    if (bag != null && !Array.isArray(bag.material)) {
      cloth = bag.material;
    }
  } catch {
    // Plain cloth stands in.
  }
  const bags = new InstancedMesh(shape, cloth, perRow * WALL.rows);
  bags.name = 'SandbagWall';
  const m = new Matrix4();
  const at = new Vector3();
  const size = new Vector3();
  const turn = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const tones = [0xffffff, 0xe9dcc4, 0xfff4dc, 0xd9ccb2].map((c) => new Color(c));
  const red = new Color(0xd23a3a);
  let n = 0;
  for (let row = 0; row < WALL.rows; row += 1) {
    for (let k = 0; k < perRow; k += 1) {
      at.set(WALL.from + k * long + (row % 2) * long * 0.5, WALL.bag * (row + 0.5), WALL.z + ((k * 7 + row * 3) % 5) * 0.012);
      size.copy(fit);
      turn.setFromAxisAngle(up, (((k * 13 + row * 5) % 7) - 3) * 0.02);
      m.compose(at, turn, size);
      bags.setMatrixAt(n, m);
      bags.setColorAt(n, row === WALL.rows - 1 ? red : tones[(k * 3 + row) % tones.length]);
      n += 1;
    }
  }
  bags.count = n;
  bags.instanceMatrix.needsUpdate = true;
  group.add(bags);
  // The red line: tape along the top of the wall, seen from both sides.
  const tape = new Mesh(new CylinderGeometry(0.035, 0.035, WALL.to - WALL.from, 6), new MeshStandardMaterial({ color: 0xd8212c, emissive: 0xd8212c, emissiveIntensity: 0.7, roughness: 0.5 }));
  tape.name = 'RedLine';
  tape.rotation.z = Math.PI / 2;
  tape.position.set((WALL.from + WALL.to) / 2, FLOOD.line + 0.02, WALL.z);
  group.add(tape);
  group.traverse((o) => {
    o.pointerEvents = 'none';
  });
  d.world.createTransformEntity(group, { persistent: true });
  d.stage.own('city', group);
  return group;
}

/** The bird's own bucket: gold, small enough for a wing tip, its origin at its bottom. */
function buildGoldBucket(): { bucket: Group; water: Mesh; grip: Group } {
  const bucket = new Group();
  bucket.name = 'GoldBucket';
  const gold = new MeshStandardMaterial({ color: 0xe2b54c, roughness: 0.28, metalness: 0.6, side: DoubleSide, emissive: 0x6b4a10, emissiveIntensity: 0.5 });
  const side = new Mesh(new CylinderGeometry(0.078, 0.06, 0.17, 18, 1, true), gold);
  side.position.y = 0.085;
  const bottom = new Mesh(new CylinderGeometry(0.06, 0.06, 0.006, 18), gold);
  bottom.position.y = 0.003;
  const bail = new Mesh(new TorusGeometry(0.076, 0.006, 6, 18, Math.PI), gold);
  bail.position.y = 0.165;
  const water = new Mesh(new CylinderGeometry(0.066, 0.066, 0.004, 14), new MeshStandardMaterial({ color: 0x24404a, roughness: 0.08, metalness: 0.5 }));
  water.visible = false;
  const grip = new Group();
  grip.name = 'GoldBucketGrip';
  grip.position.y = BANK.bottom;
  // Drawn three quarters of its working size: a toy beside the giant one.
  for (const part of [side, bottom, bail, water]) {
    part.position.multiplyScalar(0.75);
    part.scale.setScalar(0.75);
  }
  bucket.add(side, bottom, bail, water, grip);
  bucket.traverse((o) => {
    o.pointerEvents = 'none';
  });
  return { bucket, water, grip };
}

/** Gold links, drawn once: a link, a gap, tiling along the chain. */
function linkTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 32;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.clearRect(0, 0, 8, 32);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 2, 8, 20);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapT = RepeatWrapping;
  return texture;
}

/** A straight run of gold chain between two places: a thin bright line of links, stretched and turned to lie between them. */
function buildChain(thick: number): Mesh {
  const chain = new Mesh(new CylinderGeometry(thick, thick, 1, 6, 1, true), new MeshStandardMaterial({ color: 0xe2b54c, roughness: 0.3, metalness: 0.6, emissive: 0x6b4a10, emissiveIntensity: 0.6, alphaMap: linkTexture(), alphaTest: 0.5, side: DoubleSide }));
  chain.name = 'GoldChain';
  chain.pointerEvents = 'none';
  return chain;
}
const chainUp = new Vector3(0, 1, 0);
const chainAlong = new Vector3();
function layChain(chain: Mesh, from: Vector3, to: Vector3, link: number): void {
  chainAlong.copy(to).sub(from);
  const long = chainAlong.length();
  if (long < 1e-4) return;
  chain.position.copy(from).addScaledVector(chainAlong, 0.5);
  chain.scale.set(1, long, 1);
  chain.quaternion.setFromUnitVectors(chainUp, chainAlong.divideScalar(long));
  (chain.material as MeshStandardMaterial).alphaMap?.repeat.set(1, long / link);
}

/** The swell on the flood: how high it runs with the flood low and at the red line (m), and how many cuts the sheet has along and across. */
const SWELL = { low: 0.05, high: 0.13, along: 44, across: 20 } as const;
/** The downpour: how many streaks, how fast they fall (m/s), how far they lean with the wind, and the room they fall in round the lamp (m). */
const DOWNPOUR = { streaks: 520, fall: 15, lean: 0.16, tall: 9, wide: 20, from: -1, deep: 14 } as const;

/** Foam where the flood meets the sandbags: thick along the wall (the picture's foot), breaking up away from it; tiles along the wall. */
function foamTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.clearRect(0, 0, 512, 64);
    let seed = 11;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let k = 0; k < 420; k += 1) {
      // Nearer the wall (the foot of the picture): more of it, larger, whiter.
      const near = random() ** 1.8;
      const x = random() * 512;
      const y = 64 - near * 60;
      const r = 2 + (1 - near) * 7 * random();
      g.fillStyle = `rgba(236,244,244,${(0.25 + 0.55 * (1 - near)).toFixed(2)})`;
      for (const dx of [-512, 0, 512]) {
        g.beginPath();
        g.ellipse(x + dx, y, r * 1.8, r, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.repeat.set(5, 1);
  return texture;
}

/** S15: the giant gold bucket bails the bank out over the sandbags, onto the people. */
export async function s15(d: DirectorSystem, cast: CityCast, flood: Flood): Promise<void> {
  d.chapter('S15');
  dimSun(d, OVERCAST);
  const head = d.player.head;
  void d.gold.show(WORDS.bailOut.toUpperCase(), CITY.graySays.clone().add(new Vector3(0, 0.15, 0.3)), 1.1, 3.0, new Vector3(0, 0.25, 0.6), head, wordBadge(WORDS.bailOut));
  await d.captions.say('S14-2', CITY.graySays, 0);

  // The people come back to see what is done with their money: a row on the dry side of the sandbags, their backs to the lamp.
  const people: Person[] = cast.crowd.slice(0, 8);
  people.forEach((p, k) => {
    // In knots of two and three, not a rank; each turned a little her own way.
    const knot = [-8.1, -7.5, -6.2, -5.4, -4.9, -2.6, -1.9, -0.4][k] ?? -7 + k;
    const back = [1.35, 1.9, 1.2, 1.75, 1.3, 1.5, 2.0, 1.25][k] ?? 1.4;
    p.at(knot, 0.15, WALL.z + back).face(CITY.grayAt.x + ((k * 37) % 11) - 5, CITY.grayAt.z);
    p.pose = k % 3 === 1 ? 'talk' : 'idle';
  });
  // Onto the street lamp in front of the bank, facing it: the people below, the sandbags, the flood and the bank beyond, all in one view.
  const yaw = 0;
  await d.rig.fadeTo(1);
  // The flood glass and the round lamps (art/v2/nesne): loaded while the view is dark; without them the plain ones below stand in.
  let realGlass: Object3D | null = null;
  let realLamp: Object3D | null = null;
  try {
    realGlass = (await AssetManager.loadGLTF('v2/nesne/flood_glass.glb', 'v2_prop_flood_glass')).scene;
    realLamp = (await AssetManager.loadGLTF('v2/nesne/round_lamp.glb', 'v2_prop_round_lamp')).scene;
  } catch {
    // The plain ones stand in.
  }
  d.rig.place(LAMP_EYE, yaw);
  const seat = new Seat(LAMP_EYE, yaw);
  // Their side is dry until the first bucket comes over.
  flood.square.visible = false;
  flood.square.position.y = SQUARE.from;

  const own = <T extends Object3D>(object: T): T => {
    d.world.createTransformEntity(object, { persistent: true });
    d.stage.own('city', object);
    return object;
  };
  const gold = buildGoldBucket();
  own(gold.bucket);
  const giant = own(prop('giant_bucket'));
  giant.name = 'GiantBucket';
  giant.scale.setScalar(GIANT.tall);
  // Its own length of chain hangs straight up; here the chain runs to the hook over the square instead.
  for (const name of ['chain', 'chain_top']) giant.getObjectByName(name)?.removeFromParent();
  // Pail, bands and handle are plain gold: one draw for the giant bucket and one for its little copy, both faces drawn (a pail is seen into).
  mergeFlatParts(giant);
  giant.traverse((o) => {
    const material = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (material != null && !Array.isArray(material) && material.vertexColors) material.side = DoubleSide;
  });
  // The little bucket is the giant one's own model, made small (the plain one stays only if the copy cannot be made).
  try {
    const small = giant.clone(true);
    small.name = 'GoldBucketModel';
    small.position.set(0, 0, 0);
    small.rotation.set(0, 0, 0);
    small.scale.setScalar(0.17);
    for (const plain of [...gold.bucket.children]) if ((plain as Mesh).isMesh === true && plain !== gold.water) plain.visible = false;
    gold.bucket.add(small);
  } catch (error) {
    console.warn('[bank] the little bucket keeps its plain shape', error);
  }
  // The rims' rings: red empty, amber filling, green full. The giant one is read from across the square.
  const fillRing = new Mesh(new TorusGeometry(0.064, 0.006, 6, 22), new MeshBasicMaterial({ color: 0xc8323a }));
  fillRing.rotation.x = Math.PI / 2;
  fillRing.position.y = 0.13;
  fillRing.visible = false;
  gold.bucket.add(fillRing);
  const giantRing = new Mesh(new TorusGeometry(0.43, 0.035, 6, 28), new MeshBasicMaterial({ color: 0xc8323a }));
  giantRing.rotation.x = Math.PI / 2;
  giantRing.position.y = 1.0;
  giantRing.visible = false;
  giantRing.pointerEvents = 'none';
  fillRing.pointerEvents = 'none';
  giant.add(giantRing);
  const giantWater = own(new Mesh(new CylinderGeometry(0.8, 0.8, 0.03, 20), new MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.1, metalness: 0.3 })));
  giantWater.visible = false;
  giantWater.pointerEvents = 'none';
  // The giant bucket's chain runs up to a hook high over the square.
  const hook = new Vector3(LAMP_EYE.x + 0.25, LAMP_EYE.y + 4.2, LAMP_EYE.z - 2.6);
  const chains = [own(buildChain(0.03))];
  const spray = new Droplets(240, 0xa9c0c9);
  // Drops this small are read by their number: twenty triangles each instead of thirty-six, fewer of them at once, and thinner, so a splash is spray and not a handful of white balls.
  spray.mesh.geometry = new IcosahedronGeometry(1, 0);
  (spray.mesh.material as MeshBasicMaterial).opacity = 0.5;
  own(spray.mesh);
  // The flood as moving water: the same sheet, cut fine enough to carry a swell that runs higher as the flood climbs.
  const calm = flood.bank.geometry as PlaneGeometry;
  const sheet = new PlaneGeometry(calm.parameters.width, calm.parameters.height, SWELL.along, SWELL.across);
  flood.bank.geometry = sheet;
  const sheetAt = sheet.getAttribute('position');
  const sheetUp = sheet.getAttribute('normal');
  const wallEdge = -calm.parameters.height / 2;
  const swell = (t: number, high: number): void => {
    for (let i = 0; i < sheetAt.count; i += 1) {
      const x = sheetAt.getX(i);
      const y = sheetAt.getY(i);
      // Three swells crossing; calmer in the last metre before the sandbags, where the foam lies.
      const a = high * Math.min(1, 0.3 + (y - wallEdge) / 1.4);
      const p1 = x * 1.6 + t * 1.3;
      const p2 = y * 2.3 - t * 1.9 + x * 0.5;
      const p3 = (x - y) * 4.4 + t * 2.9;
      sheetAt.setZ(i, a * (0.5 * Math.sin(p1) + 0.34 * Math.sin(p2) + 0.16 * Math.sin(p3)));
      const dx = a * (0.8 * Math.cos(p1) + 0.17 * Math.cos(p2) + 0.7 * Math.cos(p3));
      const dy = a * (0.78 * Math.cos(p2) - 0.7 * Math.cos(p3));
      const long = Math.hypot(dx, dy, 1);
      sheetUp.setXYZ(i, -dx / long, -dy / long, 1 / long);
    }
    sheetAt.needsUpdate = true;
    sheetUp.needsUpdate = true;
  };
  // Foam along the sandbags on the flood's side, riding the water.
  const foam = own(new Mesh(new PlaneGeometry(WALL.to - WALL.from, 0.9), new MeshBasicMaterial({ map: foamTexture(), transparent: true, opacity: 0.85, depthWrite: false })));
  foam.name = 'FloodFoam';
  foam.rotation.x = -Math.PI / 2;
  foam.pointerEvents = 'none';
  foam.renderOrder = 2;
  // The downpour: long streaks leaning with the wind, in front of the lamp and out over the flood (the day's own rain falls round the bird).
  const streaks = own(new InstancedMesh(new PlaneGeometry(0.012, 0.75), new MeshBasicMaterial({ color: 0xc9d6de, transparent: true, opacity: 0.3, depthWrite: false, side: DoubleSide }), DOWNPOUR.streaks));
  streaks.name = 'Downpour';
  streaks.frustumCulled = false;
  streaks.pointerEvents = 'none';
  const streakAt = new Float32Array(DOWNPOUR.streaks * 3);
  for (let i = 0; i < DOWNPOUR.streaks; i += 1) {
    streakAt[i * 3] = LAMP_EYE.x + (Math.random() - 0.5) * DOWNPOUR.wide;
    streakAt[i * 3 + 1] = Math.random() * DOWNPOUR.tall;
    streakAt[i * 3 + 2] = LAMP_EYE.z + DOWNPOUR.from - Math.random() * DOWNPOUR.deep;
  }
  const streak = new Matrix4();
  const pourDown = (delta: number): void => {
    for (let i = 0; i < DOWNPOUR.streaks; i += 1) {
      let y = streakAt[i * 3 + 1] - delta * DOWNPOUR.fall * (0.85 + (i % 7) * 0.05);
      if (y < 0) y += DOWNPOUR.tall;
      streakAt[i * 3 + 1] = y;
      // Leaning the way it falls: lower is further downwind.
      streak.makeRotationZ(DOWNPOUR.lean);
      streak.setPosition(streakAt[i * 3] + (DOWNPOUR.tall - y) * DOWNPOUR.lean, y, streakAt[i * 3 + 2]);
      streaks.setMatrixAt(i, streak);
    }
    streaks.instanceMatrix.needsUpdate = true;
  };
  const redLine = flood.wall.getObjectByName('RedLine') as Mesh | undefined;
  let slap = 0;
  let pelt = 0;
  // Flood water is not a pool: greyer and less lit from within for as long as it is bailed, so the swell's own light and shade show.
  const murk = flood.bank.material as MeshStandardMaterial;
  const clear = { colour: murk.color.getHex(), glow: murk.emissiveIntensity, rough: murk.roughness };
  murk.color.setHex(0xc6d0cc);
  murk.emissiveIntensity = 0.42;
  murk.roughness = 0.2;
  // The flood pole by the steps: white, with the red line and the brass mark the sandbags carry too.
  const pole = own(new Group());
  pole.name = 'FloodPole';
  pole.position.set(-0.9, 0, -18.1);
  const shaft = new Mesh(new CylinderGeometry(0.07, 0.07, 2.1, 10), standard(0xe9e6dc, 0.7));
  shaft.position.y = 1.05;
  const redBand = new Mesh(new CylinderGeometry(0.078, 0.078, 0.14, 10), new MeshStandardMaterial({ color: 0xd8212c, emissive: 0xd8212c, emissiveIntensity: 0.8 }));
  redBand.position.y = FLOOD.line;
  const brassBand = new Mesh(new CylinderGeometry(0.078, 0.078, 0.1, 10), new MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.6, emissive: 0xffc24a, emissiveIntensity: 0.2 }));
  brassBand.position.y = FLOOD.dry;
  pole.add(shaft, redBand, brassBand);
  pole.traverse((o) => {
    o.pointerEvents = 'none';
  });
  // Three lamps on the sandbags, in front of the bird: one is lit for each round won.
  const posts: Mesh[] = [];
  const steps = [-1.1, 0, 1.1].map((x) => {
    const lampPost = own(new Mesh(new CylinderGeometry(0.03, 0.03, 1.1, 8), standard(0x1a1714, 0.6, 0.6)));
    lampPost.position.set(LAMP_EYE.x + x, FLOOD.line + 0.6, WALL.z);
    lampPost.pointerEvents = 'none';
    posts.push(lampPost);
    const globe = own(new Mesh(new SphereGeometry(0.17, 14, 10), new MeshBasicMaterial({ color: 0x6d6658 })));
    globe.name = 'RoundLamp';
    globe.position.set(LAMP_EYE.x + x, FLOOD.line + 1.3, WALL.z);
    globe.pointerEvents = 'none';
    return globe;
  });
  const lampGlass: MeshStandardMaterial[] = [];
  if (realLamp != null) {
    const model = realLamp;
    steps.forEach((plain, k) => {
      const lamp = model.clone(true);
      lamp.position.set(plain.position.x, WALL.rows * WALL.bag - 0.02, WALL.z);
      lamp.traverse((o) => {
        o.pointerEvents = 'none';
        const frost = (o as Mesh).material as MeshStandardMaterial | undefined;
        if (o.name === 'round_lamp_glass' && frost != null && !Array.isArray(frost)) {
          lampGlass[k] = frost.clone();
          (o as Mesh).material = lampGlass[k];
        }
      });
      own(lamp);
      posts.push(lamp as unknown as Mesh);
      plain.visible = false;
      posts[k].visible = false;
    });
  }
  const lightStep = (n: number): void => {
    for (let k = 0; k < steps.length; k += 1) (steps[k].material as MeshBasicMaterial).color.setHex(k < n ? 0xffd27a : 0x6d6658);
    for (let k = 0; k < lampGlass.length; k += 1) {
      lampGlass[k].emissive.setHex(0xffd27a);
      lampGlass[k].emissiveIntensity = k < n ? 2.2 : 0.02;
    }
  };
  lightStep(0);
  goal({ where: TROUBLE.where, now: 'Plunge the little bucket: at green, heave.' });
  // The flood's height, read at a glance beside the bird: a glass on the lamp's arm with the water in it, red at its top (lost), brass at its foot (won). The same marks as on the sandbags and the pole.
  const glassAt = seat.at(-0.24, -0.3, 0.5);
  const glass = own(new Group());
  glass.name = 'FloodGlass';
  glass.position.copy(glassAt);
  const tube = new Mesh(new CylinderGeometry(0.022, 0.022, 0.3, 14, 1, true), new MeshStandardMaterial({ color: 0xcfe3ea, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.28, side: DoubleSide }));
  tube.position.y = 0.15;
  const column = new Mesh(new CylinderGeometry(0.018, 0.018, 1, 12), new MeshStandardMaterial({ color: 0x3f8f98, roughness: 0.2, emissive: 0x0f3a40, emissiveIntensity: 0.8 }));
  const cap = new Mesh(new CylinderGeometry(0.026, 0.026, 0.045, 14), new MeshStandardMaterial({ color: 0xd8212c, emissive: 0xd8212c, emissiveIntensity: 0.6 }));
  cap.position.y = 0.3;
  const foot = new Mesh(new CylinderGeometry(0.028, 0.03, 0.04, 14), new MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.6 }));
  foot.position.y = -0.02;
  const bracket = new Mesh(new CylinderGeometry(0.006, 0.006, 0.32, 6), standard(0x1a1714, 0.6, 0.6));
  bracket.position.y = -0.2;
  glass.add(tube, column, cap, foot, bracket);
  // The real glass takes the plain one's place; its own water column is stretched as the flood climbs.
  let realColumn: Object3D | null = null;
  if (realGlass != null) {
    realColumn = realGlass.getObjectByName('flood_glass_water') ?? null;
    if (realColumn != null) {
      for (const plain of [tube, column, cap, foot]) plain.visible = false;
      // Its scale is drawn on the far side of the tube: turned to face the bird.
      realGlass.rotation.y = Math.PI;
      glass.add(realGlass);
    }
  }
  glass.traverse((o) => {
    o.pointerEvents = 'none';
  });
  // The rings that show the moves in the first bucket: where to plunge, where to heave.
  const dipMark = d.marker(seat.at(0.27, surface(BANK, 0.5) + 0.03, 0.42), 'BankDip');
  const heaveMark = d.marker(seat.at(0.27, -0.1, 0.5), 'BankHeave');
  const bird = makeMagpie(d);
  bird.visible = false;
  d.stage.own('city', bird);

  const bail: BailSet = {
    rules: BANK,
    tag: 'bank',
    seat,
    bucket: gold.bucket,
    bucketWater: gold.water,
    grip: gold.grip,
    fillMarks: [fillRing, giantRing],
    lid: null,
    overWater: () => true,
    spray,
    fling: (share, out) => seat.turn((Math.random() - 0.5) * 0.3, 1.4 + share, 0.6 + 1.6 * share, out),
    sound: (what, strength) => {
      if (what === 'take') d.sounds.play('grab_soft', 0.6);
      else if (what === 'plunge') d.sounds.play('bucket_splash', 0.5 + 0.3 * strength, 0.7);
      else if (what === 'throw') d.sounds.play('swing_whoosh', 0.6, 0.7);
      else if (what === 'slop') d.sounds.play('water_pour', 0.7, 0.8);
      else if (what === 'full') d.sounds.play('ear_click', 0.7);
    },
  };
  const play = new BailPlay(d, bail);
  const minis = d.world.getSystem(MiniGameSystem);
  const paused = (): boolean => minis?.playPaused ?? false;

  let clock = 0;
  let shown = (flood.bank.position.y - FLOOD.dry) / (FLOOD.line - FLOOD.dry);
  let square: number = SQUARE.from;
  let squareWant: number = SQUARE.from;
  let playing = false;
  let verdict: 'won' | 'lost' | null = null;
  let spill = 0;
  let pour = 0;
  let wasUnder = false;
  const landings: { at: number; out: number; x: number }[] = [];
  const v = new Vector3();
  const w = new Vector3();
  const top = new Vector3();
  const giantAt = new Vector3().copy(GIANT.at);

  const draw = (delta: number): void => {
    clock += delta;
    // The flood, and the pole and the sandbags it climbs.
    shown += (play.hold.level - shown) * Math.min(1, delta * 6);
    const water = floodAt(shown);
    flood.bank.position.y = water;
    const rising = Math.min(1, Math.max(0, shown));
    swell(clock, SWELL.low + (SWELL.high - SWELL.low) * rising);
    foam.position.set((WALL.from + WALL.to) / 2, water + 0.05, WALL.z - 0.62);
    const froth = foam.material as MeshBasicMaterial;
    if (froth.map != null) froth.map.offset.x = clock * 0.03;
    froth.opacity = 0.55 + 0.4 * rising;
    pourDown(delta);
    // The flood slaps the sandbags, harder and more often the higher it stands.
    slap += delta * (1.2 + 5 * rising);
    while (slap >= 1) {
      slap -= 1;
      spray.emit(v.set(LAMP_EYE.x - 7 + Math.random() * 13, water + 0.06, WALL.z - 0.3), w.set(0, 1.3 + 1.6 * rising, 0.5), 0.45, 5, 0.028, 0.6, 0.25);
    }
    // The rain pelts the flood: small splashes all over the water in front of the bank.
    pelt += delta * 34;
    while (pelt >= 1) {
      pelt -= 1;
      spray.emit(v.set(LAMP_EYE.x - 8 + Math.random() * 15, water + 0.03, WALL.z - 0.6 - Math.random() * 5.5), w.set(0, 0.9, 0), 0.25, 1, 0.022, 0.28, 0.05);
    }
    // Close to the red line the line itself beats.
    if (redLine != null) (redLine.material as MeshStandardMaterial).emissiveIntensity = shown > 0.75 ? 0.9 + 0.9 * Math.abs(Math.sin(clock * 5)) : 0.7;
    // The glass beside the bird fills as the flood climbs: brass at 0, the red cap at 1.
    const high = 0.02 + 0.28 * Math.min(1, Math.max(0, shown));
    column.scale.y = high;
    column.position.y = high / 2;
    if (realColumn != null) realColumn.scale.y = high;
    square += (squareWant - square) * Math.min(1, delta * 2);
    flood.square.position.y = square;
    // The giant bucket does what the little one does, twelve times as far: afloat until the little one is taken.
    if (play.taken == null) {
      giantAt.set(GIANT.at.x, water - 0.35 + 0.04 * Math.sin(clock * 1.4), GIANT.at.z);
      giant.rotation.set(0.05 * Math.sin(clock * 1.1), 0, 0.04 * Math.sin(clock * 1.3));
      // The little one hangs on its chain in front of the bird.
      seat.at(0.27, surface(BANK, play.hold.level) - 0.06 + 0.012 * Math.sin(clock * 2), 0.42, gold.bucket.position);
    } else {
      const hand = play.local[play.taken];
      const over = hand.y - BANK.bottom - surface(BANK, play.hold.level);
      giantAt.set(GIANT.at.x + (hand.x - 0.27) * GIANT.side, Math.max(0.12, water + over * GIANT.up), GIANT.at.z - (hand.z - 0.42) * GIANT.side * 0.6);
      // Tipped toward the people (+z) as it throws; and it swings on its chain as the little one swings in the hand.
      const tip = 1.3 * Math.max(0, 1 - play.sinceThrow / 0.45);
      giant.rotation.set(tip - play.swing.z * 0.7, 0, -play.swing.x * 0.7);
      const under = giantAt.y < water - 0.2;
      if (under && !wasUnder) {
        // It goes in: a ring of spray where it breaks the flood.
        for (let k = 0; k < 4; k += 1) spray.emit(v.set(giantAt.x, water + 0.1, giantAt.z), w.set(0, 3.2, 0), 1.6, 12, 0.04, 0.9, 0.5);
      }
      wasUnder = under;
    }
    giant.position.copy(giantAt);
    giantWater.visible = play.bucket.fill > 0.05 && play.sinceThrow > 0.4;
    giantWater.position.set(giantAt.x, giantAt.y + GIANT.tall * (0.2 + 0.7 * play.bucket.fill), giantAt.z);
    // The chain: giant bucket to hook, hook to the little bucket.
    top.set(giantAt.x, giantAt.y + GIANT.tall * 1.55, giantAt.z);
    layChain(chains[0], top, hook, 0.22);
    dipMark.position.copy(seat.at(0.27, surface(BANK, play.hold.level) + 0.03, 0.42, v));

    // A heave: the giant bucket's water goes over the sandbags and comes down on the people's side; a weak one falls back in the flood.
    if (play.thrown != null) {
      const t = play.thrown;
      const total = t.out + t.back;
      const share = total > 0 ? t.out / total : 0;
      v.set(giantAt.x, giantAt.y + GIANT.tall * 0.9, giantAt.z + 0.6);
      for (let k = 0; k < 5; k += 1) spray.emit(v, w.set((Math.random() - 0.5) * 1.2, 4.2 + share, 1.2 + 3.4 * share), 0.9, Math.round(6 + 10 * total), 0.036, 1.5, 0.5);
      if (t.out > 0.05) landings.push({ at: clock + 0.95, out: t.out, x: giantAt.x });
    }
    for (let k = landings.length - 1; k >= 0; k -= 1) {
      if (landings[k].at > clock) continue;
      const land = landings[k];
      landings.splice(k, 1);
      flood.square.visible = true;
      squareWant = Math.min(SQUARE.most, squareWant + SQUARE.perBucket * land.out);
      d.sounds.play('bucket_splash', 0.5 + 0.4 * land.out, 0.6);
      spray.emit(v.set(land.x, square + 0.1, WALL.z + 1.4), w.set(0, 1.8, 0.4), 1.2, 16, 0.03, 0.6, 0.7);
      // The people it lands on: an arm goes up, then more of them, as the water climbs their legs.
      const wet = (squareWant - SQUARE.from) / (SQUARE.most - SQUARE.from);
      people.forEach((p, i) => {
        if (wet > 0.25 + (i % 4) * 0.18) p.pose = 'arm';
      });
      if (import.meta.env.DEV) console.info(`[bank] a bucket lands on the people's side: their water ${squareWant.toFixed(2)} m`);
    }
    // Over the line the flood comes over the sandbags by itself.
    if (shown > 0.97) {
      spill += delta * 60;
      while (spill >= 1) {
        spill -= 1;
        spray.emit(v.set(WALL.from + Math.random() * (WALL.to - WALL.from), FLOOD.line + 0.1, WALL.z + 0.2), w.set(0, 0.4, 1.4), 0.4, 2, 0.035, 0.7, 0.1);
      }
    }
    // While it is high the flood runs off the bank's portico in two falls; bailed down, they thin and stop.
    pour += delta * 40 * Math.max(0, shown - 0.15);
    while (pour >= 1) {
      pour -= 1;
      spray.emit(v.set(CITY.grayAt.x + (Math.random() < 0.5 ? -2.6 : 2.6), 1.25, CITY.grayAt.z + 0.9), w.set(0, 0.3, 1.3), 0.25, 2, 0.03, 0.55, 0.25);
    }
    // Near the red line her heart is heard (as at the ship's hatch).
    d.sounds.bed('heartbeat_loop', playing ? Math.min(0.9, Math.max(0, (shown - 0.72) / 0.22)) : 0);
    // The bank's gulp (the last round): seen coming as a groan and a sway, then the flood jumps.
    spray.floor = Math.min(square, water) - 0.2;
    spray.update(delta);
  };

  const frames = d.each((delta) => {
    if (playing && !paused()) {
      play.frame(delta);
      if (play.step.coming) {
        d.sounds.play('bank_creak', 1);
        startQuake({ kind: 'sway', strength: 'medium', seconds: 2.4 });
      }
      if (play.step.hit > 0) {
        d.sounds.play('bucket_splash', 1, 0.5);
        for (let k = 0; k < 5; k += 1) spray.emit(v.set(-6 + k * 2.2, floodAt(play.hold.level), -19.6), w.set(0, 3.4, 0.6), 1.4, 12, 0.045, 0.9, 0.6);
      }
      if (play.step.won) verdict = 'won';
      else if (play.step.lost) verdict = 'lost';
      if (verdict != null) playing = false;
    } else play.carry(delta);
    draw(delta);
  });
  await d.rig.fadeTo(0);
  void d.gold.show(BOSSES.sinkingBank.name, new Vector3(-4.6, 6.4, -17.5), 3.6, 2.6, new Vector3(0, 0.15, 0), head);

  // Dev: a skip ends the fight. The director forgets its skips whenever a wait ends, so each wait is armed afresh.
  let skipped = false;
  const arm = (): void =>
    d.onSkip(() => {
      skipped = true;
    });
  const run = async (stage: BailStage, eased: number): Promise<'won' | 'lost'> => {
    play.begin(stage, eased);
    verdict = null;
    playing = true;
    arm();
    await d.until(() => verdict != null || skipped);
    playing = false;
    return skipped ? 'won' : (verdict ?? 'won');
  };
  setDeskMode('bail');

  // The first bucket, with no clock: take the little bucket, plunge it, heave it. The flood does not climb.
  play.begin(BANK.rehearsal, 1);
  playing = true;
  // (One frame first, so the bucket is where it floats before it is rung.)
  draw(0);
  setV2Targets([gold.grip]);
  const guide = d.each(() => {
    if (play.taken != null) setV2Targets([play.bucket.fill < 0.5 ? dipMark : heaveMark]);
  });
  // (Dev: a skip still on its way from the scene before is not this fight's.)
  const began = d.now;
  while (verdict == null && !skipped) {
    arm();
    await d.until(() => verdict != null || skipped);
    if (skipped && d.now - began < 6) skipped = false;
  }
  guide();
  playing = false;
  setV2Targets([]);
  if (import.meta.env.DEV) console.info('[bank] the first bucket is over the sandbags');

  const game = playMiniGame(new MiniGame(WORDS.bailOut, BANK.stages.map((s) => ({ name: s.name }))));
  while (game.phase !== 'won' && !skipped) {
    arm();
    await d.until(() => game.phase === 'playing' || game.phase === 'won' || skipped);
    if (game.phase !== 'playing' || skipped) break;
    const n = game.stage;
    const losses = game.failuresOf(n);
    goal({ where: TROUBLE.where, now: BAIL, steps: [n, 3] });
    if (n === 2 && losses === 0) {
      // On the sandbags by the people, to be heard.
      bird.position.set(LAMP_EYE.x + 1.4, FLOOD.line + 0.3, WALL.z);
      bird.lookAt(LAMP_EYE);
      bird.visible = true;
      bird.userData.clip = 'talk';
      arm();
      await d.captions.say('S15-1', bird, 0.25);
      bird.userData.clip = 'idle';
    }
    if (n >= 1) d.sounds.play('bank_creak', 0.9, 0.9);
    // The storm is overhead for the first round and the last.
    if (n !== 1 && losses === 0) d.sounds.play('thunder', 0.5, 1, 0.4);
    if (import.meta.env.DEV) console.info(`[bank] round ${n + 1} (${BANK.stages[n].name}) begins, losses ${losses}, eased ${ease(BANK, losses)}`);
    const hint = losses >= HINT_AFTER ? d.each(() => setV2Targets([play.bucket.fill < 0.5 ? dipMark : heaveMark])) : (): boolean => false;
    const result = await run(BANK.stages[n], ease(BANK, losses));
    hint();
    setV2Targets([]);
    if (skipped) break;
    if (import.meta.env.DEV) console.info(`[bank] round ${n + 1} ${result} after ${play.hold.clock.toFixed(1)} s, ${play.hold.thrown.toFixed(1)} buckets over the sandbags`);
    if (result === 'won') {
      d.sounds.play('ship_bell', 0.6);
      lightStep(n + 1);
      goal({ where: TROUBLE.where, now: BAIL, steps: [n + 1, 3] });
      game.win();
    } else {
      // Over the red line: the flood comes over the sandbags all along the wall, the bank shudders and goes under, and the lamps of the rounds won go out. Then the round again.
      play.hold.level = 1.3;
      lightStep(0);
      // The people's side is under water at once, and every arm goes up.
      const dryAgain = squareWant;
      const stood = people.map((p) => p.pose);
      flood.square.visible = true;
      squareWant = SQUARE.most;
      for (const p of people) p.pose = 'wave';
      if (import.meta.env.DEV) console.info(`[bank] the flood is over the sandbags: round ${n + 1} lost at level ${shown.toFixed(2)}, losses ${losses + 1}`);
      goal({ where: TROUBLE.where, now: 'The flood topped the sandbags: a window goes dark.', steps: [n, 3] });
      startQuake({ kind: 'sway', strength: 'medium', seconds: 1.6 });
      for (let k = 0; k < 8; k += 1) spray.emit(v.set(WALL.from + ((k + 0.5) * (WALL.to - WALL.from)) / 8, FLOOD.line + 0.15, WALL.z + 0.2), w.set(0, 2.2, 2.4), 1.6, 16, 0.045, 1.1, 1.2);
      d.sounds.play('bank_creak', 1, 0.7);
      d.sounds.play('bucket_splash', 1, 0.5);
      d.sounds.play('crowd_gasp', 0.8);
      d.sounds.play('crowd_boo', 0.5, 1, 0.6);
      arm();
      await d.wait(1.8);
      arm();
      await d.rig.fadeTo(1);
      play.begin(BANK.stages[n], 1);
      lightStep(n);
      shown = play.hold.level;
      // The round again: their side as it was before the flood came over.
      squareWant = dryAgain;
      square = dryAgain;
      flood.square.visible = dryAgain > SQUARE.from + 0.001;
      people.forEach((p, i) => {
        p.pose = stood[i];
      });
      // A round lost costs the city a window.
      d.day.darkWindows += 1;
      cast.windows.lit = cast.windows.total - d.day.darkWindows;
      setWindows(cast.windows.lit, cast.windows.total);
      game.lose('the flood topped the sandbags');
      arm();
      await d.rig.fadeTo(0);
    }
  }
  endMiniGame(game);
  d.sounds.bed('heartbeat_loop', 0);
  bird.visible = false;
  setV2Targets([]);
  setDeskMode('one');
  if (import.meta.env.DEV) console.info('[bank] done');

  // Won: the flood sinks away from the bank, the windows it put out come back on, the parachutes land safe, fat cats purr on the balcony; the treasury dims.
  lightStep(3);
  d.sounds.play('applause', 0.6);
  d.day.darkWindows = Math.max(0, d.day.darkWindows - flood.dark);
  const relit = cast.windows.total - d.day.darkWindows;
  const from = cast.windows.lit;
  const dawn = d.now;
  const relight = d.each(() => {
    const k = Math.min(1, (d.now - dawn) / 2.5);
    cast.windows.lit = Math.round(from + (relit - from) * k);
    setWindows(cast.windows.lit, cast.windows.total);
    if (k >= 1) relight();
  });
  for (const x of [-3.2, 3.2]) {
    const cat = prop('fat_cat');
    cat.position.set(x, 1.19, -23.2);
    cat.rotation.y = Math.PI;
    own(cat);
  }
  play.hold.level = (FLOOD.from - FLOOD.dry) / (FLOOD.line - FLOOD.dry);
  arm();
  await d.gold.show(BOSSES.sinkingBank.won, new Vector3(-4.6, 5.2, -17.5), 2.8, 2.8, new Vector3(0, 0.2, 0), head);
  for (const p of flood.parachutes) p.position.y = 0.15;
  flood.stop();
  for (const f of flood.fins) f.visible = false;
  // And the people, in water to the knee on their side of the sandbags: every arm up.
  squareWant = Math.max(squareWant, SQUARE.most * 0.8);
  for (const p of people) p.pose = 'wave';
  d.sounds.play('crowd_boo', 0.8);
  arm();
  await d.captions.say('S15-2', people[3]?.head(new Vector3()) ?? CITY.stairsFoot, 0.5);
  arm();
  await d.wait(0.8);
  frames();
  // The flood lies still again, the downpour and the foam are over.
  flood.bank.geometry = calm;
  sheet.dispose();
  murk.color.setHex(clear.colour);
  murk.emissiveIntensity = clear.glow;
  murk.roughness = clear.rough;
  foam.visible = false;
  streaks.visible = false;
  if (redLine != null) (redLine.material as MeshStandardMaterial).emissiveIntensity = 0.7;
  flood.bank.position.y = FLOOD.from;
  flood.square.position.y = squareWant;
  giant.visible = false;
  giantWater.visible = false;
  gold.bucket.visible = false;
  for (const chain of chains) chain.visible = false;
  spray.mesh.visible = false;
  afterwards = () => {
    flood.wall.visible = false;
    pole.visible = false;
    for (const lamp of [...steps, ...posts]) lamp.visible = false;
    glass.visible = false;
    for (const p of people) p.pose = 'hidden';
  };
  d.day.problem = 4;
  d.day.treasury -= 1;
  d.day.wrongStreak = 0;
  d.bear.steps -= 1;
  await d.rig.move(CITY.shoulder, Math.PI);
  await showCard(d, 'bailOut');
  d.notebook.write([
    { text: HEADLINES.run, struck: HEADLINES.runSolved },
    { text: HEADLINES.spreads, struck: HEADLINES.lightsOn },
    { text: HEADLINES.sinks, struck: HEADLINES.afloat },
  ]);
}
