import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AdditiveBlending, AnimationClip, AnimationMixer, AssetManager, type AudioListener, AudioLoader, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, type Entity, Float32BufferAttribute, Group, InstancedMesh, type Material, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, OneHandGrabbable, PositionalAudio, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from '@iwsdk/core';
import { MemoryOrb } from '../components.js';
import { featherMesh } from '../parrot-system.js';
import { GROUND, KEEPERS, ORB_R, SEAT } from '../square-keepers.js';
import type { DirectorSystem } from './director.js';
import type { Person } from './people.js';

/**
 * The square's six memory keepers as the bird sees them from Gray's
 * shoulder (S05 and every turn after): each on a stand of crates, a small
 * world turning in the orb they hold. Only one calls at a time, the one
 * whose memory holds the word the day needs now: a shaft of light comes
 * down on them, their orb is held up and swung, a line of gold runs to it
 * from the bird's wing, a bell rings from where they stand and the pigeons
 * at their feet go up. The others wait, their orbs held low and dim. A
 * keeper whose memory has been played stays where they were, the orb dim
 * and the feather it gave standing over it: the six and how far the day
 * has come are read at one look.
 */

type Paint = number | ((x: number, y: number, z: number) => number);

/** The light the small worlds are painted in (they are drawn unlit, so they read from across the square in any weather). */
const SUN = new Vector3(0.35, 0.82, 0.45).normalize();

/** A shape with one colour a face (by where the face's middle is), ready to be merged with others into one draw; `lit` paints each face as the sun finds it. */
function painted(g: BufferGeometry, paint: Paint, lit = false): BufferGeometry {
  const flat = g.index != null ? g.toNonIndexed() : g;
  for (const name of Object.keys(flat.attributes)) if (name !== 'position' && name !== 'normal') flat.deleteAttribute(name);
  const at = flat.getAttribute('position');
  const colours = new Float32Array(at.count * 3);
  const c = new Color();
  const a = new Vector3();
  const b = new Vector3();
  const n = new Vector3();
  for (let i = 0; i + 2 < at.count; i += 3) {
    const x = (at.getX(i) + at.getX(i + 1) + at.getX(i + 2)) / 3;
    const y = (at.getY(i) + at.getY(i + 1) + at.getY(i + 2)) / 3;
    const z = (at.getZ(i) + at.getZ(i + 1) + at.getZ(i + 2)) / 3;
    c.setHex(typeof paint === 'number' ? paint : paint(x, y, z));
    if (lit) {
      a.fromBufferAttribute(at, i);
      n.fromBufferAttribute(at, i + 1).sub(a).cross(b.fromBufferAttribute(at, i + 2).sub(a)).normalize();
      // Open shapes are seen from both sides: either face of a wall takes the light.
      c.multiplyScalar(0.6 + 0.4 * Math.abs(n.dot(SUN)));
    }
    for (let k = 0; k < 3; k += 1) colours.set([c.r, c.g, c.b], (i + k) * 3);
  }
  flat.setAttribute('color', new BufferAttribute(colours, 3));
  return flat;
}

/**
 * The world inside an orb of radius `r`, for each memory but the forest
 * (flight.ts dresses that one): a few plain shapes on a round of ground,
 * one mesh. Null for a memory with no world of its own here.
 */
function miniWorld(memory: string, r: number): Mesh | null {
  const floor = -0.45 * r;
  const ground = (colour: number): BufferGeometry => painted(new CircleGeometry(r * 0.84, 24).rotateX(-Math.PI / 2).translate(0, floor, 0), colour, true);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, colour: number): BufferGeometry => painted(new BoxGeometry(w * r, h * r, d * r).translate(x * r, floor + y * r, z * r), colour, true);
  const parts: BufferGeometry[] = [];
  if (memory === 'circus') {
    // The big top: a striped drum and roof, a pennant on its pole.
    const stripe = (x: number, _y: number, z: number): number => (Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 12) % 2 === 0 ? 0xc8322e : 0xf4efe6);
    parts.push(ground(0xd8b47a));
    parts.push(painted(new CylinderGeometry(r * 0.46, r * 0.46, r * 0.3, 12, 1, true).translate(0, floor + r * 0.15, 0), stripe, true));
    parts.push(painted(new ConeGeometry(r * 0.54, r * 0.42, 12, 1, true).translate(0, floor + r * 0.51, 0), stripe, true));
    parts.push(painted(new CylinderGeometry(r * 0.012, r * 0.012, r * 0.22, 5).translate(0, floor + r * 0.83, 0), 0x3a2a1c, true));
    parts.push(box(0.16, 0.08, 0.012, 0.08, 0.9, 0, 0xf2c230));
  } else if (memory === 'ship') {
    // A ship under sail on a round of sea.
    parts.push(ground(0x2f6ea8));
    for (const z of [-0.5, -0.15, 0.3, 0.6]) parts.push(box(0.5, 0.012, 0.04, z * 0.6, 0.006, z, 0x9cc6e6));
    parts.push(box(0.7, 0.16, 0.24, 0, 0.1, 0, 0x5a3a22));
    parts.push(painted(new ConeGeometry(r * 0.13, r * 0.26, 4).rotateZ(-Math.PI / 2).translate(r * 0.48, floor + r * 0.1, 0), 0x5a3a22, true));
    parts.push(box(0.18, 0.1, 0.16, -0.2, 0.23, 0, 0xe8e2d2));
    parts.push(painted(new CylinderGeometry(r * 0.012, r * 0.012, r * 0.6, 5).translate(r * 0.05, floor + r * 0.48, 0), 0x3a2a1c, true));
    parts.push(box(0.02, 0.36, 0.3, 0.08, 0.52, 0, 0xf4efe6));
  } else if (memory === 'mountain') {
    // Three peaks with snow on them.
    parts.push(ground(0xdfe6ee));
    for (const [x, z, wide, tall] of [[-0.25, 0.05, 0.42, 0.95], [0.3, -0.15, 0.36, 0.72], [0.1, 0.38, 0.28, 0.5]] as const) {
      parts.push(painted(new ConeGeometry(r * wide, r * tall, 7, 3).translate(x * r, floor + (r * tall) / 2, z * r), (_x, y) => (y > floor + r * tall * 0.6 ? 0xffffff : 0x7d848f), true));
    }
  } else if (memory === 'farm') {
    // A field in rows, a red barn and its silo.
    parts.push(ground(0x6f9a3e));
    for (let k = -3; k <= 3; k += 1) {
      const x = k * 0.21;
      const half = Math.sqrt(Math.max(0, 0.8 * 0.8 - x * x));
      parts.push(box(0.09, 0.014, half * 2, x, 0.007, 0, 0xc9a84a));
    }
    parts.push(box(0.32, 0.22, 0.26, -0.25, 0.11, -0.12, 0xa8322a));
    parts.push(painted(new ConeGeometry(r * 0.26, r * 0.16, 4).rotateY(Math.PI / 4).translate(-0.25 * r, floor + r * 0.3, -0.12 * r), 0x4a2a22, true));
    parts.push(painted(new CylinderGeometry(r * 0.07, r * 0.07, r * 0.36, 8).translate(0.02 * r, floor + r * 0.18, -0.24 * r), 0xd8d2c4, true));
  } else if (memory === 'valley') {
    // A green valley between two hills, a ring of fence in it and the flock inside.
    parts.push(ground(0x7fa860));
    for (const side of [-1, 1]) parts.push(painted(new SphereGeometry(r * 0.34, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1.2).translate(side * 0.47 * r, floor, -0.1 * r), 0x5f8a4a, true));
    parts.push(painted(new TorusGeometry(r * 0.2, r * 0.008, 4, 16).rotateX(Math.PI / 2).translate(0, floor + r * 0.09, 0.3 * r), 0x8a6a42, true));
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2;
      parts.push(box(0.025, 0.12, 0.025, Math.cos(a) * 0.2, 0.06, 0.3 + Math.sin(a) * 0.2, 0x8a6a42));
    }
    for (const [x, z] of [[-0.06, 0.26], [0.07, 0.33], [0, 0.4]] as const) parts.push(painted(new SphereGeometry(r * 0.045, 6, 4).translate(x * r, floor + r * 0.045, z * r), 0xf4f1ea, true));
  } else return null;
  const merged = mergeGeometries(parts);
  if (merged == null) return null;
  const mesh = new Mesh(merged, new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }));
  mesh.name = 'OrbWorld';
  mesh.pointerEvents = 'none';
  return mesh;
}

/** Give a keeper's orb its world (the forest's is put in by flight.ts): the orb turns to glass round it. */
export function dressOrb(orb: Mesh, memory: string): void {
  const world = miniWorld(memory, ORB_R);
  if (world == null) return;
  const glass = orb.material as MeshBasicMaterial;
  glass.transparent = true;
  glass.opacity = 0.2;
  glass.depthWrite = false;
  orb.renderOrder = 2;
  orb.add(world);
}

/** The stands of the keepers numbered in `which`, each two crates with a band in its keeper's colour: one mesh. */
function buildStands(which: readonly number[]): Mesh {
  const parts: BufferGeometry[] = [];
  const crate = (x: number, y: number, z: number, yaw: number, wide: number, tall: number, colour: number): void => {
    const put = (g: BufferGeometry, paint: number): void => {
      parts.push(painted(g.rotateY(yaw).translate(x, y + tall / 2, z), paint));
    };
    put(new BoxGeometry(wide, tall, wide), colour);
    // Battens at the corners, a little proud of the boards.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(new BoxGeometry(0.07, tall, 0.07).translate(sx * (wide / 2 - 0.02), 0, sz * (wide / 2 - 0.02)), 0x4f3a24);
  };
  for (const i of which) {
    const k = KEEPERS[i];
    const [x, y, z] = k.at;
    const yaw = Math.atan2(SEAT.x - x, SEAT.z - z);
    const low = k.stand * 0.55;
    crate(x, y, z, yaw, 0.7, low, 0x7a5a38);
    crate(x, y + low, z, yaw + 0.3, 0.56, k.stand - low, 0x8a6842);
    parts.push(painted(new BoxGeometry(0.58, 0.07, 0.58).rotateY(yaw + 0.3).translate(x, y + low + (k.stand - low) / 2, z), k.colour));
  }
  const mesh = new Mesh(mergeGeometries(parts) ?? new BufferGeometry(), new MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  mesh.name = which.length > 1 ? 'KeeperStands' : 'KeeperStand';
  mesh.pointerEvents = 'none';
  return mesh;
}

/** A shaft of light: bright at the foot, gone at the top. */
function beamTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g != null) {
    const fade = g.createLinearGradient(0, 0, 0, canvas.height);
    fade.addColorStop(0, 'rgba(255,255,255,0)');
    fade.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    fade.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = fade;
    g.fillRect(0, 0, canvas.width, canvas.height);
  }
  return new CanvasTexture(canvas);
}

/** A pigeon seen from far: a body and two wings whose tips are a unit up, so the height it is drawn at is the beat of its wings. */
function pigeonShape(): BufferGeometry {
  const g = new BufferGeometry();
  // prettier-ignore
  const corners = [
    0, 0, 0.14, 0.035, 0, 0, -0.035, 0, 0,
    0.035, 0, 0, 0, 0, -0.13, -0.035, 0, 0,
    0.03, 0, 0.03, 0.03, 0, -0.07, 0.27, 1, -0.03,
    -0.03, 0, 0.03, -0.27, 1, -0.03, -0.03, 0, -0.07,
  ];
  g.setAttribute('position', new Float32BufferAttribute(corners, 3));
  g.computeVertexNormals();
  return g;
}

const PIGEONS = 10;
const TRAIL = 16;
const ease = (u: number): number => u * u * (3 - 2 * u);

interface Spot {
  person: Person;
  orb: Mesh;
  glow: Mesh | null;
  /** Where the orb waits (held low before the chest), where it is held up to call, and where it rests on the palm with the bird beside it. */
  chest: Vector3;
  up: Vector3;
  rest: Vector3;
  /** How far up the orb is now (0 waiting .. 1 held up), and how much of the shaft's light is on the keeper. */
  lift: number;
  lit: number;
  /** The keeper's own surfaces, lit from within by that much while the shaft is on them. */
  skins: MeshStandardMaterial[];
  /** Their memory has been played: the orb dim and low, its feather turning over it, not to be flown to again. */
  done: boolean;
  feather: Group | null;
}

export class Square {
  private readonly spots: Spot[] = [];
  private calling = -1;
  private aimed = -1;
  private held = -1;
  private t = 0;
  /** The six stands in one draw, and the last keeper's alone (in the evening he waits by himself; the others' crates have gone with them). */
  private readonly stands: Mesh;
  private readonly lastStand: Mesh;
  private readonly beam: Mesh;
  private beamOn = 0;
  private beamAt = -1;
  private readonly trail: InstancedMesh;
  private readonly pigeons: InstancedMesh;
  private readonly birds: { at: Vector3; v: Vector3; left: number; beat: number }[] = [];
  private voice: PositionalAudio | null = null;
  private nextRing = 0;
  private ghost: { group: Group; root: Object3D; home: Object3D | null; mixer: AnimationMixer; was: Map<Mesh, Material | Material[]>; t: number } | null = null;
  private ghostShown = false;
  private ghostIn = -1;
  private wing: Object3D | null = null;
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private readonly at = new Vector3();
  private readonly turn = new Quaternion();
  private readonly size = new Vector3();
  private readonly put = new Matrix4();
  private readonly up = new Vector3(0, 1, 0);

  constructor(
    private readonly d: DirectorSystem,
    people: Person[],
    orbs: Mesh[],
    glows: (Mesh | null)[],
    palms: Group[],
    private readonly entities: Entity[],
  ) {
    const own = (...objects: Object3D[]): void => {
      for (const o of objects) {
        o.traverse((c) => {
          c.pointerEvents = 'none';
        });
        d.world.createTransformEntity(o, { persistent: true });
      }
      d.stage.own('city', ...objects);
    };
    people.forEach((person, i) => {
      const palm = palms[i].position;
      const ahead = new Vector3(Math.sin(person.yaw), 0, Math.cos(person.yaw));
      const skins: MeshStandardMaterial[] = [];
      // A realistic keeper's surfaces can be lit from within by their own picture (no light is added to the square for the shaft).
      (person as unknown as { root?: Object3D }).root?.traverse((o) => {
        const material = (o as Mesh).material as MeshStandardMaterial | MeshStandardMaterial[] | undefined;
        for (const m of Array.isArray(material) ? material : material != null ? [material] : []) {
          if (m.map == null || m.emissive == null || skins.includes(m)) continue;
          m.emissiveMap = m.map;
          m.emissive.setHex(0xfff0d8);
          m.emissiveIntensity = 0;
          m.needsUpdate = true;
          skins.push(m);
        }
      });
      this.spots.push({
        person,
        orb: orbs[i],
        glow: glows[i],
        chest: person.position.clone().add(new Vector3(0, 1.2 * person.size, 0)).addScaledVector(ahead, 0.34),
        up: palm.clone().add(new Vector3(0, ORB_R + 0.2, 0)),
        rest: palm.clone().add(new Vector3(0, ORB_R + 0.03, 0)),
        lift: 0,
        lit: 0,
        skins,
        done: false,
        feather: null,
      });
    });
    this.stands = buildStands(KEEPERS.map((_, i) => i));
    this.lastStand = buildStands([KEEPERS.length - 1]);
    this.lastStand.visible = false;
    this.beam = new Mesh(
      new CylinderGeometry(0.2, 1.05, 7.5, 20, 1, true).translate(0, 3.75, 0),
      new MeshBasicMaterial({ map: beamTexture(), color: 0xffe6a8, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false, toneMapped: false }),
    );
    this.beam.name = 'KeeperBeam';
    this.beam.visible = false;
    this.beam.renderOrder = 3;
    this.trail = new InstancedMesh(new SphereGeometry(1, 8, 6), new MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }), TRAIL);
    this.trail.name = 'KeeperTrail';
    this.trail.frustumCulled = false;
    this.trail.count = 0;
    this.pigeons = new InstancedMesh(pigeonShape(), new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide }), PIGEONS);
    this.pigeons.name = 'SquarePigeons';
    this.pigeons.frustumCulled = false;
    this.pigeons.count = 0;
    const grey = new Color();
    for (let k = 0; k < PIGEONS; k += 1) {
      this.pigeons.setColorAt(k, grey.setHex([0xb9bcc4, 0x8f939c, 0xd8d8dc, 0x777b86][k % 4]));
      this.birds.push({ at: new Vector3(), v: new Vector3(), left: 0, beat: k * 1.7 });
    }
    own(this.stands, this.lastStand, this.beam, this.trail, this.pigeons);
    // The call is heard from where the caller stands.
    const listener = d.player.head.children.find((c) => (c as Object3D & { type: string }).type === 'AudioListener') as AudioListener | undefined;
    if (listener != null) {
      const voice = new PositionalAudio(listener);
      voice.setRefDistance(4);
      voice.setRolloffFactor(1);
      const holder = new Group();
      holder.name = 'KeeperCall';
      holder.add(voice);
      own(holder);
      new AudioLoader().load('./v2/ses/farm_bell.ogg', (buffer) => {
        voice.setBuffer(buffer);
        this.voice = voice;
      });
    }
    d.each((delta) => this.update(delta));
  }

  /** The keeper who calls now (null: nobody calls; the word is already on the wing). */
  call(i: number | null): void {
    const next = i ?? -1;
    if (next === this.calling) return;
    this.calling = next;
    if (next < 0 || !this.spots[next].orb.visible || this.spots[next].done) return;
    const spot = this.spots[next];
    this.flush(spot);
    this.nextRing = 0;
    // The first call of the day: a ghost of the bird flies the way once.
    if (!this.ghostShown) {
      this.ghostShown = true;
      this.ghostIn = 0.9;
    }
    if (import.meta.env.DEV) console.info(`[square] the ${KEEPERS[next].key} calls`);
  }

  /** The keeper pointed at (or -1): their orb comes part of the way up, so the player sees whom she is about to fly to. */
  aim(i: number): void {
    this.aimed = i;
  }

  /** The bird is on keeper `i`'s palm: their orb rests there, still, for the bird to open. */
  hold(i: number): void {
    this.held = i;
    this.calling = -1;
    const spot = this.spots[i];
    spot.person.pose = 'arm';
    spot.orb.position.copy(spot.rest);
    spot.orb.scale.setScalar(1);
    spot.lift = 1;
    if (spot.glow != null) {
      spot.glow.visible = true;
      spot.glow.position.copy(spot.rest);
      spot.glow.scale.setScalar(1);
    }
  }

  /** The bird has left the palm (into the memory, or back to Gray). */
  release(): void {
    this.held = -1;
  }

  /** Keeper `i`'s memory has been played: they stay, the orb dim and low before the chest, the feather it gave standing over it; it opens no more. */
  done(i: number): void {
    const spot = this.spots[i];
    if (spot == null || spot.done) return;
    spot.done = true;
    if (this.held === i) this.held = -1;
    if (this.calling === i) this.calling = -1;
    const entity = this.entities[i];
    if (entity?.hasComponent(MemoryOrb) === true) entity.removeComponent(MemoryOrb);
    if (entity?.hasComponent(OneHandGrabbable) === true) entity.removeComponent(OneHandGrabbable);
    const orb = spot.orb;
    orb.visible = true;
    orb.position.copy(spot.chest);
    orb.scale.setScalar(0.5);
    orb.quaternion.identity();
    spot.lift = 0;
    (orb.material as MeshBasicMaterial).opacity = 0.1;
    // The world inside goes grey and still; what burned in it is out.
    orb.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh !== true || mesh === orb) return;
      const material = mesh.material as MeshBasicMaterial | MeshStandardMaterial;
      if (material.blending === AdditiveBlending) mesh.visible = false;
      else {
        material.color.setHex(0x6e6e6e);
        if ((material as MeshStandardMaterial).emissive != null) (material as MeshStandardMaterial).emissiveIntensity = 0;
      }
    });
    if (spot.glow != null) spot.glow.visible = false;
    // The feather the memory gave, upright over the orb in the word's colour, lit by its own picture.
    const feather = featherMesh(KEEPERS[i].feather, 0.8, 0.28);
    feather.position.set(0, 0.4, 0);
    feather.rotation.set(0, 0, -Math.PI / 2);
    const lit = feather.material as MeshStandardMaterial;
    lit.emissive.setHex(KEEPERS[i].feather);
    lit.emissiveMap = lit.map;
    lit.emissiveIntensity = 0.7;
    const holder = new Group();
    holder.name = 'KeeperFeather';
    holder.add(feather);
    holder.position.set(0, ORB_R * 1.25, 0);
    holder.traverse((o) => {
      o.pointerEvents = 'none';
    });
    orb.add(holder);
    spot.feather = holder;
    if (spot.person.pose === 'arm') spot.person.pose = 'idle';
    if (import.meta.env.DEV) console.info(`[square] the ${KEEPERS[i].key}'s memory is done`);
  }

  /** Pigeons go up from the foot of a keeper's stand. */
  private flush(spot: Spot): void {
    const foot = spot.person.position;
    const toSeat = this.at.set(SEAT.x - foot.x, 0, SEAT.z - foot.z).normalize();
    this.birds.forEach((bird, k) => {
      const a = (k / PIGEONS) * Math.PI * 2 + k;
      bird.at.set(foot.x + toSeat.x * 0.9 + Math.cos(a) * 0.7, GROUND + 0.1, foot.z + toSeat.z * 0.9 + Math.sin(a) * 0.5);
      bird.v.set(Math.cos(a) * (1.2 + (k % 3) * 0.5) - toSeat.z * 1.5, 2.4 + (k % 4) * 0.45, Math.sin(a) * (1.2 + (k % 3) * 0.5) + toSeat.x * 1.5);
      bird.left = 3.4 + (k % 3) * 0.3;
    });
    this.d.sounds.play('wing_flaps', 0.5, 1.1);
  }

  /** Where the gold line starts: the bird's wing if it is out, else low before the eye. */
  private wingAt(out: Vector3): Vector3 {
    this.wing ??= this.d.world.scene.getObjectByName('ParrotWing') ?? null;
    if (this.wing != null && this.wing.visible) return this.wing.getWorldPosition(out);
    const head = this.d.player.head;
    head.getWorldQuaternion(this.turn);
    return head.getWorldPosition(out).add(this.at.set(0.12, -0.22, -0.42).applyQuaternion(this.turn));
  }

  /** A point `u` of the way along the arc from the wing to the calling orb. */
  private along(u: number, out: Vector3): Vector3 {
    out.lerpVectors(this.from, this.to, u);
    out.y += Math.sin(u * Math.PI) * Math.min(1.1, 0.14 * this.from.distanceTo(this.to));
    return out;
  }

  private startGhost(): void {
    const gltf = AssetManager.getGLTF('v2_prop_parrot');
    const root = gltf?.scene;
    if (gltf == null || root == null) return;
    // The bird seen at the day's start, borrowed for a moment: all in one gold, and put back as it was after.
    const gold = new MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
    const was = new Map<Mesh, Material | Material[]>();
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh !== true) return;
      was.set(mesh, mesh.material);
      mesh.material = gold;
    });
    const group = new Group();
    group.name = 'GhostParrot';
    const home = root.parent;
    group.add(root);
    this.d.world.createTransformEntity(group, { persistent: true });
    this.d.stage.own('city', group);
    const mixer = new AnimationMixer(root);
    const flap = AnimationClip.findByName(gltf.animations, 'flap');
    if (flap != null) mixer.clipAction(flap).play();
    this.ghost = { group, root, home, mixer, was, t: 0 };
    this.d.sounds.play('wing_flap', 0.4, 1.2);
  }

  private flyGhost(delta: number): void {
    const ghost = this.ghost;
    if (ghost == null) return;
    const seconds = 2.6;
    ghost.t += delta;
    const u = Math.min(1, ghost.t / seconds);
    ghost.mixer.update(delta * 1.6);
    this.along(ease(u), ghost.group.position);
    // It keeps its size to the eye as it flies away.
    ghost.group.scale.setScalar(1 + 2.2 * ease(u));
    ghost.group.lookAt(this.along(Math.min(1, ease(u) + 0.04), this.at));
    if (u < 1 && this.calling >= 0 && this.held < 0) return;
    // There (or the turn is over): gone, the bird as it was.
    for (const [mesh, material] of ghost.was) mesh.material = material;
    if (ghost.home != null) ghost.home.add(ghost.root);
    else ghost.root.removeFromParent();
    ghost.group.visible = false;
    this.ghost = null;
  }

  private update(delta: number): void {
    this.t += delta;
    // A stand is its keeper's: no crates are left where nobody stands (the wolves run across that ground in the evening).
    const standing = this.spots.filter((spot) => spot.person.pose !== 'hidden').length;
    this.stands.visible = standing > 1;
    this.lastStand.visible = standing === 1 && this.spots[this.spots.length - 1].person.pose !== 'hidden';
    const calling = this.calling >= 0 && this.spots[this.calling].orb.visible && !this.spots[this.calling].done ? this.calling : -1;
    for (let i = 0; i < this.spots.length; i += 1) {
      const spot = this.spots[i];
      const here = spot.orb.visible;
      if (spot.glow != null && !here) spot.glow.visible = false;
      const lit = here && i === calling ? 1 : 0;
      spot.lit += (lit - spot.lit) * Math.min(1, delta * 3);
      for (const m of spot.skins) m.emissiveIntensity = 0.5 * spot.lit;
      if (!here) continue;
      if (spot.done) {
        if (spot.feather != null) spot.feather.rotation.y += delta * 0.9;
        continue;
      }
      const active = i === calling || i === this.held || i === this.aimed;
      // The arm is out for the one who calls, the one pointed at and the one the bird is on; the others stand easy.
      if (spot.person.pose === 'arm' || spot.person.pose === 'idle') spot.person.pose = active ? 'arm' : 'idle';
      const world = spot.orb.children[0];
      if (i === this.held) {
        if (world != null) world.rotation.y += delta * 0.9;
        continue;
      }
      const want = i === calling ? 1 : i === this.aimed ? 0.75 : 0;
      spot.lift += (want - spot.lift) * Math.min(1, delta * 4);
      const k = ease(spot.lift);
      const swing = i === calling ? spot.lift : 0;
      spot.orb.position.lerpVectors(spot.chest, spot.up, k);
      spot.orb.position.x += Math.sin(this.t * 2.6) * 0.09 * swing;
      spot.orb.position.y += Math.sin(this.t * 5.2) * 0.04 * swing;
      spot.orb.scale.setScalar(0.5 + 0.5 * k + 0.07 * swing * Math.sin(this.t * 5.2));
      if (world != null) world.rotation.y += delta * (0.2 + 1.0 * k);
      if (spot.glow != null) {
        spot.glow.visible = spot.lift > 0.05;
        spot.glow.position.copy(spot.orb.position);
        spot.glow.scale.setScalar(spot.orb.scale.x);
        (spot.glow.material as MeshBasicMaterial).opacity = 0.1 + 0.2 * k;
      }
    }
    // The shaft of light: on the caller; out before it moves to another.
    const shaft = this.beam.material as MeshBasicMaterial;
    const wantBeam = calling >= 0 && calling === this.beamAt ? 1 : 0;
    this.beamOn += (wantBeam - this.beamOn) * Math.min(1, delta * 3.5);
    if (calling >= 0 && calling !== this.beamAt && this.beamOn < 0.04) {
      this.beamAt = calling;
      this.beam.position.copy(this.spots[calling].person.position);
    }
    this.beam.visible = this.beamOn > 0.02;
    shaft.opacity = 0.3 * this.beamOn * (1 + 0.12 * Math.sin(this.t * 3.1));
    // The gold line from the wing to the caller's orb, and the bell from where they stand.
    const showLine = calling >= 0 && this.held < 0;
    if (showLine) {
      const spot = this.spots[calling];
      this.wingAt(this.from);
      this.to.copy(spot.orb.position);
      const far = this.from.distanceTo(this.to);
      for (let k = 0; k < TRAIL; k += 1) {
        const u = (this.t * 0.3 + k / TRAIL) % 1;
        this.along(u, this.at);
        // Small by the wing (it is at the eye), full size on the way, gone at the orb.
        this.size.setScalar(Math.max(0.0001, 0.022 * (0.35 + far * u) * Math.min(1, u * 6) * Math.min(1, (1 - u) * 8)));
        this.trail.setMatrixAt(k, this.put.compose(this.at, this.turn.identity(), this.size));
      }
      this.trail.count = TRAIL;
      this.trail.instanceMatrix.needsUpdate = true;
      this.nextRing -= delta;
      if (this.nextRing <= 0 && this.voice != null) {
        const voice = this.voice;
        voice.parent?.position.copy(spot.person.position).setY(spot.person.position.y + 1.6);
        if (voice.isPlaying) voice.stop();
        voice.setVolume(0.7);
        voice.setPlaybackRate([1, 1.12, 0.9, 1.2, 1.06, 0.84][calling] ?? 1);
        voice.play();
        this.nextRing = 7;
      }
      if (this.ghostIn >= 0) {
        this.ghostIn -= delta;
        if (this.ghostIn < 0) this.startGhost();
      }
    } else this.trail.count = 0;
    this.flyGhost(delta);
    // The pigeons that went up.
    let flying = 0;
    this.birds.forEach((bird, k) => {
      if (bird.left <= 0) return;
      bird.left -= delta;
      bird.at.addScaledVector(bird.v, delta);
      bird.v.y += (0.6 - bird.v.y) * Math.min(1, delta * 0.8);
      bird.beat += delta * 16;
      this.turn.setFromAxisAngle(this.up, Math.atan2(bird.v.x, bird.v.z));
      const fade = Math.min(1, bird.left * 2);
      this.size.set(1.3 * fade, 0.22 * Math.sin(bird.beat) * fade, 1.3 * fade);
      this.pigeons.setMatrixAt(k, this.put.compose(bird.at, this.turn, this.size));
      flying = k + 1;
    });
    if (flying > 0 || this.pigeons.count > 0) {
      for (let k = 0; k < PIGEONS; k += 1) if (this.birds[k].left <= 0) this.pigeons.setMatrixAt(k, this.put.makeScale(0, 0, 0));
      this.pigeons.count = flying;
      this.pigeons.instanceMatrix.needsUpdate = true;
    }
  }
}

/**
 * The head of the queue stood on the steps right in front of the bird, its
 * umbrellas across the whole view of the square: those people are at the
 * queue's far end now (and one more from the pavement, for the headset's
 * budget of realistic people near the eye). `crowd` is the queue from the
 * steps outward.
 */
export function partQueue(crowd: Person[]): void {
  const tail = crowd[crowd.length - 1];
  if (tail == null || crowd.length < 8) return;
  const { x, y, z } = tail.position;
  [0, 1, 2, 3, 5].forEach((k, n) => {
    crowd[k].at(x + ((n * 37) % 5) * 0.06 - 0.12, y, z - 0.8 * (n + 1), ((n * 53) % 7) * 0.1 - 0.3);
  });
}
