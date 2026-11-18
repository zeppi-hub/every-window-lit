import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { featherMesh } from '../parrot-system.js';
import type { Field, PumpStage } from '../pump-rules.js';
import type { Hands } from './circus-show.js';
import type { DirectorSystem } from './director.js';
import { mergeByMaterial } from './fx.js';
import { contactShadow, mergeStill, type RunningWater, runningWater, woodMaterial } from './pump-looks.js';
import { between, type Side } from './pump-set.js';

/**
 * The drought farm's yard as the game plays it (S22): a wooden tub under
 * the pump's spout, a sluice lever that sends its water down one of two
 * flumes, and at the end of each a bed of six rows that darkens and
 * sprouts as the water reaches them, and cracks again from its far end
 * when the water stops. A sun that climbs to noon, and steam off the wet
 * rows then. Only drawing and the lever's hand here; the rules are
 * pump-rules.ts.
 *
 * World coordinates (the farm's own: the old pump stood at the origin,
 * north is -z, the plank platform's top is 0.12 m up).
 */

export const ROWS = 6;
const BEDS = 2;
const PLANTS = 14;
/** The tub under the spout: its middle, half its width, its rim and its water (m). */
// Under the made pump's own mouth (0.27 to the right of the seat's middle): the stream falls well inside the near wall.
const TUB = { x: 0.35, z: 0.66, half: 0.17, floor: 0.12, rim: 0.52, water: 0.46 } as const;
/** Each bed's ditch runs north from here for this far; its rows start this far to its side. */
const DITCH = { x: 0.62, from: -1.55, length: 7.65 } as const;
const ROW = { first: -2.1, apart: 1.25, long: 3.3, deep: 0.78, high: 0.09, inner: 0.8 } as const;
/** The sluice lever: its pivot on a bracket before the tub, its length, and how far it leans either way (radians). */
// Near enough that its knob is inside a seated arm's reach at both ends (0.65 m out from the eye when thrown right).
const LEVER = { x: 0.46, y: 0.5, z: 0.95, long: 0.5, lean: 0.17 } as const;
const LEVER_TAKE = 0.13;
const SIDES: readonly Side[] = ['left', 'right'];

/** A row's tint over the yard's own cracked-mud picture: bleached while dry, dark and rich once the water is in it. */
const DRY = new Color(1.04, 0.96, 0.84);
const WET = new Color(0.36, 0.27, 0.2);
const WILTED = new Color(0.72, 0.6, 0.25);
const GREEN = new Color(0.42, 0.78, 0.3);

/** A young plant: a stem and a fan of blades from one root, on a clear ground; pale, so each plant's own tint shows. */
function sproutLeaves(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 160;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.lineCap = 'round';
    const blades: [number, number, number][] = [
      [-56, 70, 11],
      [54, 60, 11],
      [-38, 30, 12],
      [36, 22, 12],
      [-14, 8, 11],
      [16, 4, 11],
      [0, 2, 9],
    ];
    for (const [dx, top, width] of blades) {
      // Darker at the root and down the middle, light at the edge and the tip: a leaf with a rib.
      const shade = g.createLinearGradient(64, 158, 64 + dx, top);
      shade.addColorStop(0, '#8d9a84');
      shade.addColorStop(0.5, '#dfe8d4');
      shade.addColorStop(1, '#ffffff');
      g.strokeStyle = shade;
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(64, 158);
      g.quadraticCurveTo(64 + dx * 0.15, 90, 64 + dx, top);
      g.stroke();
      g.strokeStyle = 'rgba(90,110,80,0.55)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(64, 158);
      g.quadraticCurveTo(64 + dx * 0.15, 90, 64 + dx, top);
      g.stroke();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A soft glow: white at its middle, clear at its rim (the sun's glare, a puff of cloud). */
function glare(inner: string, outer: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g != null) {
    const r = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    r.addColorStop(0, inner);
    r.addColorStop(0.12, inner);
    r.addColorStop(0.3, outer);
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A fair-weather cloud: a heap of soft puffs, flat and a little grey underneath. */
function cloud(seed: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g != null) {
    let s = seed;
    const rnd = (): number => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let k = 0; k < 16; k += 1) {
      const x = 40 + rnd() * 176;
      const y = 50 + rnd() * 34 - Math.abs(x - 128) * 0.08;
      const r = 22 + rnd() * 26;
      const puffOf = g.createRadialGradient(x, y - r * 0.2, 1, x, y, r);
      puffOf.addColorStop(0, 'rgba(255,255,255,0.95)');
      puffOf.addColorStop(0.6, 'rgba(244,244,246,0.6)');
      puffOf.addColorStop(1, 'rgba(225,228,235,0)');
      g.fillStyle = puffOf;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** The axis a plant leans about in the wind (its own, before it is turned). */
const LEAN = new Vector3(0, 0, 1);
/** From the yard toward the sun: high, ahead and to the left. */
const SUN_FROM = new Vector3(-0.42, 0.8, -0.43).normalize();
/** The sky at the horizon and overhead, in the morning and at noon. */
const HAZE = [new Color(0xdfe3df), new Color(0xf6efdc)] as const;
const ZENITH = [new Color(0x3f7fc4), new Color(0x8fb6dc)] as const;

/** Multiply a shape's picture coordinates, so a picture made for a metre or so repeats along something longer. */
function stretch(shape: BufferGeometry, v: number, u = 1): void {
  const uv = shape.getAttribute('uv') as BufferAttribute;
  for (let k = 0; k < uv.count; k += 1) uv.setXY(k, uv.getX(k) * u, uv.getY(k) * v);
}

export class Yard {
  /** Which bed the sluice feeds: 0 the left, 1 the right. */
  fed = 0;
  /** The hand on the sluice lever, if any. */
  busy: Side | null = null;
  /** The lever's knob (a ring can show it), and its two ends (world) for the desk hands. */
  readonly knob = new Group();
  readonly knobEnds: [Vector3, Vector3];
  /** Where the tub's water is (the spout's stream falls to it). */
  readonly tubWater = TUB.water;
  readonly sun: DirectionalLight;
  /** The word's feather, hung in the air past the last rows from the first second: what the work is for. */
  readonly prize = new Group();
  private readonly prizeGlow: Mesh;
  private readonly rows: InstancedMesh;
  private readonly sprouts: InstancedMesh;
  private readonly ditchWater: Mesh[] = [];
  private readonly flumeWater: Mesh[] = [];
  private readonly spills: Mesh[] = [];
  private readonly tub: Mesh;
  private readonly lever = new Group();
  private readonly paddle: Mesh;
  private readonly steam: Points;
  private readonly dust: Points;
  private readonly sky: Mesh;
  private readonly glare: Mesh;
  private readonly ripples: Mesh[] = [];
  private readonly rippleAge = [9, 9];
  private readonly water: RunningWater;
  private readonly shown = [0, 0];
  private readonly drawn = new Float32Array(BEDS * ROWS).fill(-1);
  private readonly plants: { x: number; z: number; yaw: number; tall: number }[] = [];
  private lean = -LEVER.lean;
  private pulse = 0;
  private clock = 0;
  private heat = 0;
  private skyHeat = -1;
  private gushWas = 0;
  private readonly flumeEnds: Vector3[] = [];
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly q2 = new Quaternion();
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly c = new Color();
  private readonly c2 = new Color();
  private readonly up = new Vector3(0, 1, 0);
  private readonly a = new Vector3();
  private readonly b = new Vector3();

  /** `ground` is the yard's own cracked-mud material (the rows wear its picture); `eye` the seat, which the sky's pictures face. */
  constructor(d: DirectorSystem, ground: MeshStandardMaterial | null, feather: number, eye: Vector3, madeTub: Object3D | null = null) {
    const root = new Group();
    root.name = 'FarmYard';
    const wood = woodMaterial(0x8b6a45, 3);
    const darkWood = woodMaterial(0x5e4630, 5);
    const iron = new MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.55, metalness: 0.6 });
    this.water = runningWater(0x2f7fb6, 0.16);
    const water = this.water.material;
    const statics = new Group();
    statics.name = 'FarmYard wood';
    // The tub's own boards are kept apart: the made tub (art/v2/ciftlik/tub.glb) stands in for them when it has loaded.
    const tubParts = new Group();
    tubParts.name = 'FarmYard tub';
    let into: Group = tubParts;
    const box = (w: number, h: number, dp: number, x: number, y: number, z: number, material = wood): Mesh => {
      const mesh = new Mesh(new BoxGeometry(w, h, dp), material);
      mesh.position.set(x, y, z);
      into.add(mesh);
      return mesh;
    };
    // The tub: four staves' walls round a floor, lower on the north side where the flumes leave; two iron hoops.
    const wallH = TUB.rim - TUB.floor;
    const mid = TUB.floor + wallH / 2;
    box(TUB.half * 2, 0.03, TUB.half * 2, TUB.x, TUB.floor + 0.015, TUB.z, darkWood);
    box(TUB.half * 2 + 0.04, wallH, 0.025, TUB.x, mid, TUB.z + TUB.half);
    box(TUB.half * 2 + 0.04, wallH - 0.1, 0.025, TUB.x, mid - 0.05, TUB.z - TUB.half);
    box(0.025, wallH, TUB.half * 2, TUB.x - TUB.half, mid, TUB.z);
    box(0.025, wallH, TUB.half * 2, TUB.x + TUB.half, mid, TUB.z);
    for (const y of [TUB.floor + 0.08, TUB.rim - 0.06]) {
      box(TUB.half * 2 + 0.06, 0.02, 0.008, TUB.x, y, TUB.z + TUB.half + 0.015, iron);
      box(0.008, 0.02, TUB.half * 2 + 0.03, TUB.x + TUB.half + 0.015, y, TUB.z, iron);
      box(0.008, 0.02, TUB.half * 2 + 0.03, TUB.x - TUB.half - 0.015, y, TUB.z, iron);
    }
    into = statics;
    mergeByMaterial(tubParts);
    if (madeTub != null) {
      madeTub.position.set(TUB.x, TUB.floor, TUB.z);
      const madeWater = madeTub.getObjectByName('tub_water');
      if (madeWater != null) madeWater.visible = false;
      tubParts.visible = false;
    }
    this.tub = new Mesh(new PlaneGeometry(TUB.half * 2 - 0.03, TUB.half * 2 - 0.03), water);
    this.tub.rotation.x = -Math.PI / 2;
    this.tub.position.set(TUB.x, TUB.floor + 0.05, TUB.z);
    // Rings spreading on the tub's water where each gush lands.
    for (let k = 0; k < 2; k += 1) {
      const ring = new Mesh(new RingGeometry(0.03, 0.042, 24), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(TUB.x - 0.07, TUB.water + 0.004, TUB.z + 0.05);
      ring.visible = false;
      this.ripples.push(ring);
    }
    // The paddle between the two outlets: it swings to shut the one the water is not sent down.
    this.paddle = new Mesh(new BoxGeometry(0.16, 0.14, 0.014), darkWood);
    this.paddle.position.set(TUB.x, TUB.rim - 0.09, TUB.z - TUB.half + 0.03);
    // The two flumes: plank troughs on trestles from the tub's north side to the head of each bed's ditch.
    for (let bed = 0; bed < BEDS; bed += 1) {
      const sign = bed === 0 ? -1 : 1;
      const from = new Vector3(TUB.x + sign * 0.08, TUB.rim - 0.1, TUB.z - TUB.half);
      const to = new Vector3(sign * DITCH.x, 0.34, DITCH.from);
      const flume = new Group();
      flume.position.copy(from);
      flume.lookAt(to);
      const length = from.distanceTo(to);
      const floor = new Mesh(new BoxGeometry(0.16, 0.018, length), wood);
      floor.position.set(0, -0.03, length / 2);
      flume.add(floor);
      for (const x of [-0.08, 0.08]) {
        const board = new Mesh(new BoxGeometry(0.018, 0.085, length), wood);
        board.position.set(x, 0.005, length / 2);
        flume.add(board);
      }
      statics.add(flume);
      for (const k of [0.38, 0.86]) {
        const at = from.clone().lerp(to, k);
        box(0.3, 0.03, 0.04, at.x, at.y - 0.055, at.z, darkWood);
        for (const x of [-0.13, 0.13]) box(0.035, at.y - 0.06, 0.035, at.x + x, (at.y - 0.06) / 2, at.z, darkWood);
      }
      // Its water: a strip lying in it, shown while the spout runs into this flume; the streaks run its length.
      const lying = new PlaneGeometry(0.13, length);
      lying.rotateX(-Math.PI / 2);
      lying.translate(0, 0, length / 2);
      stretch(lying, 2.4);
      const strip = new Mesh(lying, water);
      strip.position.copy(from);
      strip.lookAt(to);
      strip.visible = false;
      this.flumeWater.push(strip);
      const spill = new Mesh(new CylinderGeometry(1, 1, 1, 8, 1, true), water);
      spill.visible = false;
      this.spills.push(spill);
      this.flumeEnds.push(to);
      // The ditch along the bed's inner edge, and the water in it.
      box(0.3, 0.05, DITCH.length + 0.3, sign * DITCH.x, 0.022, DITCH.from - DITCH.length / 2, darkWood);
      const lyingRun = new PlaneGeometry(0.2, 1);
      lyingRun.rotateX(-Math.PI / 2);
      lyingRun.translate(0, 0, -0.5);
      stretch(lyingRun, 6);
      const run = new Mesh(lyingRun, water);
      run.position.set(sign * DITCH.x, 0.052, DITCH.from + 0.1);
      run.scale.z = 0.001;
      run.visible = false;
      this.ditchWater.push(run);
      // The bed's plank frame on its three outer sides (the ditch runs along the fourth).
      const near = ROW.first + ROW.deep / 2 + 0.06;
      const far = ROW.first - (ROWS - 1) * ROW.apart - ROW.deep / 2 - 0.06;
      const outer = sign * (ROW.inner + ROW.long + 0.05);
      box(0.04, 0.17, near - far, outer, 0.085, (near + far) / 2);
      for (const z of [near, far]) box(ROW.long + 0.1, 0.17, 0.04, sign * (ROW.inner + ROW.long / 2), 0.085, z);
    }
    // The sluice lever: an iron rod on a bracket before the tub, a red knob at its top.
    box(0.04, 0.04, LEVER.z - (TUB.z + TUB.half) + 0.04, LEVER.x, LEVER.y - 0.02, (LEVER.z + TUB.z + TUB.half) / 2, iron);
    this.lever.position.set(LEVER.x, LEVER.y, LEVER.z);
    const rod = new Mesh(new CylinderGeometry(0.011, 0.011, LEVER.long, 8), iron);
    rod.position.y = LEVER.long / 2;
    const knobMesh = new Mesh(new SphereGeometry(0.034, 14, 10), new MeshStandardMaterial({ color: 0xb3261e, roughness: 0.45 }));
    knobMesh.position.y = LEVER.long;
    this.knob.position.y = LEVER.long;
    this.knob.name = 'SluiceKnob';
    this.lever.add(rod, knobMesh, this.knob);
    this.knobEnds = [-1, 1].map((sign) => new Vector3(LEVER.x + Math.sin(sign * LEVER.lean) * LEVER.long, LEVER.y + Math.cos(LEVER.lean) * LEVER.long, LEVER.z)) as [Vector3, Vector3];

    // The rows of both beds, one drawing: each a rounded ridge of the yard's own cracked earth, bleached until the water reaches it.
    const earth = ground != null ? ground.clone() : new MeshStandardMaterial({ color: 0xb9a57e });
    earth.color.setRGB(1, 1, 1);
    earth.roughness = 1;
    earth.metalness = 0;
    const ridge = new CylinderGeometry(ROW.deep / 2, ROW.deep / 2, ROW.long, 10, 1, false, 0, Math.PI);
    ridge.rotateZ(Math.PI / 2);
    ridge.scale(1, ROW.high / (ROW.deep / 2), 1);
    stretch(ridge, 2.2, 0.6);
    this.rows = new InstancedMesh(ridge, earth, BEDS * ROWS);
    this.rows.name = 'FarmRows';
    this.rows.frustumCulled = false;
    // The plants: two crossed leaves each, one drawing for all.
    const leaf = new PlaneGeometry(0.3, 0.38);
    leaf.translate(0, 0.19, 0);
    const crossed = leaf.clone().rotateY(Math.PI / 2);
    const both = new BufferGeometry();
    const join = (name: 'position' | 'normal' | 'uv', size: number): void => {
      const one = leaf.getAttribute(name).array as Float32Array;
      const two = crossed.getAttribute(name).array as Float32Array;
      const all = new Float32Array(one.length + two.length);
      all.set(one, 0);
      all.set(two, one.length);
      both.setAttribute(name, new BufferAttribute(all, size));
    };
    join('position', 3);
    join('normal', 3);
    join('uv', 2);
    const index = leaf.getIndex();
    if (index != null) {
      const ids = Array.from(index.array as ArrayLike<number>);
      both.setIndex([...ids, ...ids.map((i) => i + 4)]);
    }
    this.sprouts = new InstancedMesh(both, new MeshStandardMaterial({ map: sproutLeaves(), alphaTest: 0.4, side: DoubleSide, roughness: 0.8 }), BEDS * ROWS * PLANTS);
    this.sprouts.name = 'FarmSprouts';
    this.sprouts.frustumCulled = false;
    let seed = 11;
    const rnd = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let bed = 0; bed < BEDS; bed += 1) {
      const sign = bed === 0 ? -1 : 1;
      for (let row = 0; row < ROWS; row += 1) {
        const z = ROW.first - row * ROW.apart;
        this.m.compose(this.p.set(sign * (ROW.inner + ROW.long / 2), 0, z), this.q.identity(), this.s.set(1, 1, 1));
        this.rows.setMatrixAt(bed * ROWS + row, this.m);
        this.rows.setColorAt(bed * ROWS + row, DRY);
        for (let k = 0; k < PLANTS; k += 1) {
          this.plants.push({ x: sign * (ROW.inner + 0.15 + ((k + 0.2 + rnd() * 0.6) / PLANTS) * (ROW.long - 0.3)), z: z + (rnd() - 0.5) * 0.3, yaw: rnd() * Math.PI, tall: 0.55 + rnd() * 0.9 });
          this.sprouts.setMatrixAt((bed * ROWS + row) * PLANTS + k, this.m.makeScale(0, 0, 0));
          this.sprouts.setColorAt((bed * ROWS + row) * PLANTS + k, GREEN);
        }
      }
    }
    // Steam off the wet rows at noon, and dust in the dry air all day.
    const steamShape = new BufferGeometry();
    steamShape.setAttribute('position', new BufferAttribute(new Float32Array(60 * 3), 3));
    this.steam = new Points(steamShape, new PointsMaterial({ map: glare('rgba(255,255,255,0.9)', 'rgba(255,255,255,0.35)'), size: 0.7, transparent: true, opacity: 0, depthWrite: false, color: 0xffffff, sizeAttenuation: true }));
    this.steam.name = 'FarmSteam';
    this.steam.frustumCulled = false;
    const motes = new Float32Array(90 * 3);
    for (let k = 0; k < 90; k += 1) {
      motes[k * 3] = -7 + rnd() * 14;
      motes[k * 3 + 1] = 0.15 + rnd() * 2.6;
      motes[k * 3 + 2] = -11 + rnd() * 12;
    }
    const dustShape = new BufferGeometry();
    dustShape.setAttribute('position', new BufferAttribute(motes, 3));
    this.dust = new Points(dustShape, new PointsMaterial({ map: glare('rgba(255,244,214,0.9)', 'rgba(255,240,200,0.3)'), size: 0.045, transparent: true, opacity: 0.55, depthWrite: false, color: 0xfff0cc, sizeAttenuation: true }));
    this.dust.name = 'FarmDust';
    this.dust.frustumCulled = false;

    // The sun: one hard light from high ahead and to the left. (A shadow map was tried and drew nothing in the emulator, so
    // where things meet the ground is shown by soft dark patches under them instead.)
    this.sun = new DirectionalLight(0xfff0d2, 2.3);
    const focus = new Vector3(0, 0, -3.2);
    this.sun.position.copy(focus).add(SUN_FROM.clone().multiplyScalar(34));
    this.sun.add(this.sun.target);
    this.sun.target.position.copy(SUN_FROM).multiplyScalar(-34);
    const under = new Group();
    under.name = 'FarmYard contact';
    const patchAt = (wide: number, deep: number, x: number, z: number, y = 0.128, turn = 0): void => {
      const patch = contactShadow(wide, deep);
      patch.position.set(x, y, z);
      patch.rotation.y = turn;
      under.add(patch);
    };
    // Under what the yard's own file stands on the ground (nothing in it throws a shadow, and it read as floating): the barn
    // (9 by 12 m, turned 75 degrees), the three dead trees in sight and the windmill's tower, a little down-sun of each.
    patchAt(12.5, 15.5, -20.7, -15.7, 0.014, (75 * Math.PI) / 180);
    for (const [x, z, wide] of [[8, -7, 2.6], [-9, -5, 2.3], [24, -10, 2.8], [17, -34, 5.5]] as const) patchAt(wide, wide, x + 0.25, z + 0.2, 0.014);
    // Under the tub and the lever's bracket (on the planks), under each trestle and along each bed's frame (on the ground).
    patchAt(0.75, 0.8, TUB.x + 0.06, TUB.z + 0.05);
    for (const end of this.flumeEnds) {
      for (const k of [0.38, 0.86]) patchAt(0.6, 0.3, TUB.x + (end.x - TUB.x) * k + 0.05, TUB.z - TUB.half + (end.z - (TUB.z - TUB.half)) * k + 0.04, k < 0.5 ? 0.128 : 0.012);
      const sign = Math.sign(end.x);
      patchAt(ROW.long + 0.9, 0.7, sign * (ROW.inner + ROW.long / 2), ROW.first + ROW.deep / 2 + 0.3, 0.012);
      patchAt(0.7, (ROWS - 1) * ROW.apart + ROW.deep + 0.6, sign * (ROW.inner + ROW.long + 0.3), ROW.first - ((ROWS - 1) * ROW.apart) / 2, 0.012);
    }
    mergeByMaterial(under);
    // The sky: deep blue overhead paling to haze at the horizon (whiter at noon), the sun's glare, a few fair-weather clouds.
    const dome = new SphereGeometry(840, 24, 12);
    dome.setAttribute('color', new BufferAttribute(new Float32Array(dome.getAttribute('position').count * 3), 3));
    this.sky = new Mesh(dome, new MeshBasicMaterial({ vertexColors: true, side: BackSide, depthWrite: false, fog: false, toneMapped: false }));
    this.sky.name = 'FarmSky';
    this.sky.renderOrder = -0.5;
    this.sky.position.set(eye.x, 0, eye.z);
    this.glare = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: glare('rgba(255,255,250,1)', 'rgba(255,236,190,0.55)'), transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    this.glare.position.copy(eye).add(SUN_FROM.clone().multiplyScalar(600));
    this.glare.scale.setScalar(260);
    this.glare.lookAt(eye);
    this.glare.renderOrder = -0.4;
    const clouds = new Group();
    clouds.name = 'FarmClouds';
    const cloudLook = new MeshBasicMaterial({ map: cloud(21), transparent: true, opacity: 0.92, depthWrite: false, fog: false, toneMapped: false });
    [
      [18, 14, 560, 150],
      [-34, 20, 620, 190],
      [52, 11, 640, 170],
      [-68, 13, 600, 160],
      [-8, 30, 700, 210],
      [96, 17, 610, 150],
    ].forEach(([bearing, lift, far, wide]) => {
      const b = (bearing * Math.PI) / 180;
      const l = (lift * Math.PI) / 180;
      const one = new Mesh(new PlaneGeometry(wide, wide / 2), cloudLook);
      one.position.set(eye.x + Math.sin(b) * Math.cos(l) * far, Math.sin(l) * far, eye.z - Math.cos(b) * Math.cos(l) * far);
      one.lookAt(eye);
      clouds.add(one);
    });
    mergeByMaterial(clouds);
    clouds.traverse((o) => {
      o.renderOrder = -0.3;
    });
    // The feather: large enough to be seen from the pump, over the old channel between the two beds' far ends.
    const plume = featherMesh(feather, 2.4, 0.66);
    plume.rotation.set(0, 0, -1.1);
    plume.position.set(0.5, 1.0, 0);
    (plume.material as MeshStandardMaterial).emissive = new Color(feather);
    (plume.material as MeshStandardMaterial).emissiveIntensity = 0.55;
    this.prize.add(plume);
    this.prize.name = 'FarmPrize';
    this.prize.position.set(0, 1.2, ROW.first - ROWS * ROW.apart - 0.6);
    // Its light: a soft halo behind it, facing the seat (a ball of light read as a balloon).
    this.prizeGlow = new Mesh(new PlaneGeometry(5.5, 5.5), new MeshBasicMaterial({ map: glare('rgba(255,255,235,0.9)', 'rgba(210,255,190,0.35)'), color: feather, transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    this.prizeGlow.position.copy(this.prize.position).setY(this.prize.position.y + 1.0);
    this.prizeGlow.position.z -= 0.4;
    this.prizeGlow.lookAt(eye);
    // One drawing for each material of the fixed woodwork; it shades the ground.
    mergeByMaterial(statics);
    // And what is of plain colour among them (trestles, brackets, frames of different paint) into one drawing; the made tub's parts likewise.
    mergeStill(statics);
    if (madeTub != null) {
      mergeStill(madeTub);
      root.add(madeTub);
    }
    root.add(this.sky, this.glare, clouds, under, this.prize, this.prizeGlow, statics, tubParts, this.tub, ...this.ripples, this.paddle, ...this.flumeWater, ...this.spills, ...this.ditchWater, this.lever, this.rows, this.sprouts, this.steam, this.dust, this.sun);
    root.traverse((o: Object3D) => {
      o.pointerEvents = 'none';
    });
    d.world.createTransformEntity(root, { persistent: true });
    d.stage.own('farm', root);
    this.poseLever();
    this.paintSky();
  }

  /** The sluice lever: taken by a pinch at its knob (when `open`), thrown left or right, and it falls to the side it is nearer. */
  hand(delta: number, hands: Hands, open: boolean): boolean {
    let thrown = false;
    if (this.busy != null && (!open || !hands.pinching[this.busy])) this.busy = null;
    if (this.busy == null && open) {
      this.knob.getWorldPosition(this.a);
      for (const side of SIDES) if (hands.pinching[side] && hands[side].distanceTo(this.a) <= LEVER_TAKE) this.busy = side;
    }
    if (this.busy != null) {
      const want = Math.asin(Math.max(-1, Math.min(1, (hands[this.busy].x - LEVER.x) / LEVER.long)));
      this.lean = Math.max(-LEVER.lean, Math.min(LEVER.lean, want));
    } else this.lean += ((this.fed === 0 ? -LEVER.lean : LEVER.lean) - this.lean) * Math.min(1, delta * 12);
    // Past a third of the way to the other side, the water goes there.
    const next = this.fed === 0 ? (this.lean > LEVER.lean * 0.33 ? 1 : 0) : this.lean < -LEVER.lean * 0.33 ? 0 : 1;
    if (next !== this.fed) {
      this.fed = next;
      thrown = true;
    }
    this.poseLever();
    return thrown;
  }

  /** Lock the sluice to one bed (stage 1 has only the left). */
  setFed(bed: number): void {
    this.fed = bed;
    this.lean = bed === 0 ? -LEVER.lean : LEVER.lean;
    this.poseLever();
  }

  private poseLever(): void {
    this.lever.rotation.z = -this.lean;
    // The paddle stands across the outlet the water is not sent down.
    const k = this.lean / LEVER.lean;
    this.paddle.position.x = TUB.x - k * 0.08;
  }

  /** The sky's colours for the heat of the day: every point by its height, haze at the horizon, blue overhead. */
  private paintSky(): void {
    const at = this.sky.geometry.getAttribute('position') as BufferAttribute;
    const colour = this.sky.geometry.getAttribute('color') as BufferAttribute;
    const haze = this.c.copy(HAZE[0]).lerp(HAZE[1], this.heat);
    const blue = this.c2.copy(ZENITH[0]).lerp(ZENITH[1], this.heat);
    for (let k = 0; k < at.count; k += 1) {
      const up = Math.max(0, at.getY(k) / 840) ** 0.55;
      colour.setXYZ(k, haze.r + (blue.r - haze.r) * up, haze.g + (blue.g - haze.g) * up, haze.b + (blue.b - haze.b) * up);
    }
    colour.needsUpdate = true;
    this.skyHeat = this.heat;
  }

  /** The feather leaves its place (it is won): where it was, for whatever flies to the player from there. */
  takePrize(out: Vector3): Vector3 {
    this.prize.visible = false;
    this.prizeGlow.visible = false;
    return out.copy(this.prize.position).setY(this.prize.position.y + 1.0);
  }

  /** The beds leap up green for a moment (a stage won). */
  cheer(): void {
    this.pulse = 1;
  }

  /** How hot the day is drawn: 0 morning, 1 noon. */
  setHeat(heat: number): void {
    this.heat = heat;
  }

  /** Draw the water and the rows as the field has them; `flow` is the spout's (0..1) and `gush` the heave of its last down stroke (1 fading to 0). */
  draw(delta: number, field: Field | null, stage: PumpStage | null, flow: number, gush: number): void {
    this.clock += delta;
    this.pulse = Math.max(0, this.pulse - delta * 1.4);
    this.prize.rotation.y = Math.sin(this.clock * 0.7) * 0.5;
    this.prize.position.y = 1.2 + 0.1 * Math.sin(this.clock * 1.3);
    this.prizeGlow.scale.setScalar(1 + 0.12 * Math.sin(this.clock * 2.1));
    this.tub.position.y += ((flow > 0 ? TUB.water : TUB.floor + 0.05) - this.tub.position.y) * Math.min(1, delta * (flow > 0 ? 4 : 0.6));
    this.sun.intensity = 2.3 + 1.6 * this.heat;
    this.glare.scale.setScalar(260 * (1 + 0.55 * this.heat + 0.02 * Math.sin(this.clock * 2.3) * this.heat));
    if (Math.abs(this.heat - this.skyHeat) > 0.02) this.paintSky();
    this.water.run(delta * (0.25 + 1.6 * flow));
    // A ring spreads on the tub's water where each gush lands.
    if (gush > 0.9 && this.gushWas <= 0.9 && flow > 0) {
      const k = this.rippleAge[0] > this.rippleAge[1] ? 0 : 1;
      this.rippleAge[k] = 0;
    }
    this.gushWas = gush;
    this.ripples.forEach((ring, k) => {
      this.rippleAge[k] += delta;
      const age = this.rippleAge[k] / 0.55;
      ring.visible = age < 1;
      if (!ring.visible) return;
      ring.scale.setScalar(1 + age * 2.6);
      ring.position.y = this.tub.position.y + 0.004;
      (ring.material as MeshBasicMaterial).opacity = 0.7 * (1 - age);
    });
    const running = this.tub.position.y > TUB.water - 0.05 && flow > 0;
    for (let bed = 0; bed < BEDS; bed += 1) {
      const fedNow = running && bed === this.fed;
      this.flumeWater[bed].visible = fedNow;
      this.spills[bed].visible = fedNow;
      if (fedNow) {
        const to = this.flumeEnds[bed];
        between(this.spills[bed], this.a.copy(to).setY(to.y - 0.03), this.b.copy(to).setY(0.05).setZ(to.z - 0.06), (0.012 + 0.03 * flow) * (0.8 + 0.4 * gush));
      }
      const front = field != null && stage != null && bed < stage.beds ? field.fronts[bed] : 0;
      // What is drawn follows the field a little behind, so a jump (a new stage's start) is seen happening.
      this.shown[bed] += (front - this.shown[bed]) * Math.min(1, delta * 3.5);
      const share = Math.min(1, this.shown[bed] / ROWS);
      this.ditchWater[bed].visible = share > 0.01;
      this.ditchWater[bed].scale.z = Math.max(0.001, share * DITCH.length);
      for (let row = 0; row < ROWS; row += 1) {
        const id = bed * ROWS + row;
        const wet = Math.max(0, Math.min(1, this.shown[bed] - row));
        const pulse = this.pulse * wet;
        const key = wet + pulse * 2;
        // A dry row is drawn once; a row with plants up is drawn every frame, for they stir in the wind.
        if (Math.abs(key - this.drawn[id]) < 0.004 && wet < 0.05) continue;
        this.drawn[id] = key;
        this.rows.setColorAt(id, this.c.copy(DRY).lerp(WET, wet));
        const grown = wet * wet * (3 - 2 * wet);
        for (let k = 0; k < PLANTS; k += 1) {
          const plant = this.plants[id * PLANTS + k];
          const tall = grown * plant.tall * (1 + 0.35 * pulse);
          this.q.setFromAxisAngle(this.up, plant.yaw).multiply(this.q2.setFromAxisAngle(LEAN, 0.09 * Math.sin(this.clock * 1.9 + plant.x * 1.4 + plant.z) + 0.04 * Math.sin(this.clock * 4.3 + k)));
          this.m.compose(this.p.set(plant.x, ROW.high - 0.02, plant.z), this.q, this.s.set(0.5 + 0.5 * grown, tall, 0.5 + 0.5 * grown));
          if (grown < 0.02) this.m.makeScale(0, 0, 0);
          this.sprouts.setMatrixAt(id * PLANTS + k, this.m);
          this.sprouts.setColorAt(id * PLANTS + k, this.c.copy(WILTED).lerp(GREEN, grown).multiplyScalar(0.78 + 0.4 * ((k * 37) % 10) / 10));
        }
        this.sprouts.instanceMatrix.needsUpdate = true;
        if (this.sprouts.instanceColor != null) this.sprouts.instanceColor.needsUpdate = true;
        if (this.rows.instanceColor != null) this.rows.instanceColor.needsUpdate = true;
      }
    }
    // Dust drifts across the yard on the wind and comes round again.
    const motes = this.dust.geometry.getAttribute('position') as BufferAttribute;
    for (let k = 0; k < motes.count; k += 1) {
      let x = motes.getX(k) + delta * (0.22 + (k % 7) * 0.03);
      if (x > 7) x = -7;
      motes.setX(k, x);
      motes.setY(k, motes.getY(k) + delta * 0.04 * Math.sin(this.clock * 0.6 + k));
    }
    motes.needsUpdate = true;
    // Steam: puffs rising off the wet stretch of both beds, only in the heat.
    const material = this.steam.material as PointsMaterial;
    const wetRows = this.shown[0] + this.shown[1];
    material.opacity += ((this.heat > 0.5 && wetRows > 0.5 ? 0.16 : 0) - material.opacity) * Math.min(1, delta * 2);
    this.steam.visible = material.opacity > 0.005;
    if (this.steam.visible) {
      const at = this.steam.geometry.getAttribute('position') as BufferAttribute;
      for (let k = 0; k < at.count; k += 1) {
        let y = at.getY(k) + delta * (0.35 + (k % 5) * 0.06);
        if (y > 1.6 || y <= 0) {
          const bed = k % 2;
          const reach = Math.max(0.3, this.shown[bed]);
          const row = ((k * 7919) % 1000) / 1000;
          at.setX(k, (bed === 0 ? -1 : 1) * (ROW.inner + (((k * 104729) % 1000) / 1000) * ROW.long));
          at.setZ(k, ROW.first + ROW.deep / 2 - row * reach * ROW.apart);
          y = ROW.high + 0.02 + (y > 1.6 ? 0 : ((k * 31) % 100) / 70);
        }
        at.setY(k, y);
      }
      at.needsUpdate = true;
    }
  }
}
