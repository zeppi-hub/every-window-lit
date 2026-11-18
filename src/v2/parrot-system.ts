import {
  AssetManager,
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  CanvasTexture,
  Color,
  createSystem,
  DoubleSide,
  type Entity,
  Grabbed,
  GrabSystem,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OneHandGrabbable,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  type SkinnedMesh,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { drawLine } from '../station/family.js';
import { sharpText, TEXT_ANISOTROPY } from '../station/sharp-text.js';
import { Feather } from './components.js';
import { emitV2 } from './events.js';
import { loadWordIcons, wordBadge } from './icons.js';
import { slotPlace, Vocabulary } from './vocabulary.js';

/** One feather drawn in white, to be tinted: the quill's end at the right edge, the tip at the left, the vane's barbs slanting back from the shaft. */
let featherMap: CanvasTexture | null = null;
function featherTexture(): CanvasTexture {
  if (featherMap != null) return featherMap;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 80;
  const g = canvas.getContext('2d');
  if (g != null) {
    g.beginPath();
    g.moveTo(236, 40);
    g.bezierCurveTo(196, 0, 70, -2, 6, 40);
    g.bezierCurveTo(70, 82, 196, 80, 236, 40);
    g.closePath();
    const shade = g.createLinearGradient(0, 0, 0, 80);
    shade.addColorStop(0, '#ffffff');
    shade.addColorStop(0.5, '#e6e6e6');
    shade.addColorStop(1, '#ffffff');
    g.fillStyle = shade;
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(0,0,0,0.2)';
    g.lineWidth = 1.3;
    for (let x = 16; x < 246; x += 7) {
      g.beginPath();
      g.moveTo(x - 20, -4);
      g.lineTo(x, 40);
      g.lineTo(x - 20, 84);
      g.stroke();
    }
    g.restore();
    // The shaft, and the bare quill past the vane.
    g.strokeStyle = 'rgba(40,30,20,0.75)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(8, 40);
    g.lineTo(256, 40);
    g.stroke();
  }
  featherMap = new CanvasTexture(canvas);
  featherMap.colorSpace = SRGBColorSpace;
  featherMap.anisotropy = TEXT_ANISOTROPY;
  return featherMap;
}

/** A feather as a leaf of that drawing: its quill's end at the origin, its tip `long` m out along -x, lying nearly flat and turned a little up to the eye. */
export function featherMesh(colour: number, long: number, wide: number): Mesh {
  const mesh = new Mesh(new PlaneGeometry(long, wide), new MeshStandardMaterial({ map: featherTexture(), color: colour, roughness: 0.6, alphaTest: 0.5, side: DoubleSide }));
  mesh.position.x = -long / 2;
  mesh.rotation.x = -Math.PI / 2 + 0.45;
  return mesh;
}

/** Inside a memory the player is its keeper, not the bird: the wing and its feathers are put away. */
/** How many word feathers are in a hand now (the system counts them as they are taken and let go). */
let feathersHeld = 0;
/** Whether a word feather is being carried: only then does a held thing have an ear to go to. */
export function featherHeld(): boolean {
  return feathersHeld > 0;
}

let stowed = false;
export function stowWing(on: boolean): void {
  stowed = on;
}
export function wingStowed(): boolean {
  return stowed;
}

/** The parrot's words (vocabulary.ts): scenes teach it words and read what was said. */
export const parrotWords = new Vocabulary();

/** The leader's ear: a feather let go within `reach` of it has its word said. */
let listener: { object: Object3D; reach: number } | null = null;

export function setListener(object: Object3D | null, reach = 0.15): void {
  listener = object == null ? null : { object, reach };
}

/** What a feather is taken to now (the leader's ear, the family's glass), or null. */
export function listenerObject(): Object3D | null {
  return listener?.object ?? null;
}

/**
 * The wing's place from the eye, turned with the head's heading only (m): low and forward, its row of feathers running
 * from just right of the middle out to the left. Whoever the bird sits on is to its left (on Gray's shoulder his head and
 * forward arm hide everything more than about 20 cm left at this depth), so the first slots, the ones in use there, stay in view.
 */
const WING_AT = new Vector3(0.3, -0.31, -0.34);
/**
 * The bird's own feet under the eye: the modelled macaw's own (the bird seen from outside on Gray's shoulder), standing
 * on what is under them, a soft shadow with them. Nothing else of the body is drawn: a bird looking ahead and down does
 * not see its own breast, and a made-up one read as anything but a parrot. The feet are `feetDown` under the eye and
 * `feetAhead` of it (m) until a surface is found (GROUND); `lean`, `back` and `tail` pose the rest of the bird, which is
 * drawn only if `only` is off.
 */
interface BodyFit {
  scale: number;
  feetDown: number;
  feetAhead: number;
  lean: number;
  back: number;
  tail: number;
  only?: boolean;
}
const BODY_FIT: BodyFit = { scale: 1.25, feetDown: 0.28, feetAhead: 0.16, lean: -20, back: 0.18, tail: 40, only: true };
/**
 * The feet stand on what is under them: once the bird has been still this long (s) a ray is sent down from under the eye
 * at the feet's place, and the feet are put on what it meets, if that is between `near` and `far` under the eye (m).
 * With nothing there (in flight, over a drop) the feet are tucked away. They keep that height while the head moves.
 */
const GROUND = { still: 0.2, again: 0.4, moved: 0.05, from: 0.1, near: 0.13, far: 0.46, shadow: 0.2 } as const;
const DOWNWARD = new Vector3(0, -1, 0);
/** As modelled: the body bone's place ahead of the grip, the middle of the feet ahead of the grip (m), and the tail bone's turn. */
const SPINE_AHEAD = 0.018;
const FEET_MID = 0.04;
const TAIL_REST = new Quaternion(-0.9972, 0, 0, 0.0747).normalize();
/** The neck's own line as modelled (the body leans 37 degrees forward). */
const NECK_LINE = new Vector3(0, 0.795, 0.606);
const LEAN_AXIS = new Vector3(1, 0, 0);

/**
 * The head taken off a skinned bird: every face that belongs mostly to the `bone` is dropped, and the opening it leaves
 * at the neck is closed with a fan of faces to its middle (feathered like the neck's rim, the middle `rise` m up the
 * neck's own line `up`), so the shoulders end in a round top. The eye is where the head was.
 */
function takeHeadOff(mesh: SkinnedMesh, bone: number, up: Vector3, rise: number): void {
  const g = mesh.geometry;
  const index = g.index;
  const position = g.getAttribute('position');
  const joints = g.getAttribute('skinIndex');
  const weights = g.getAttribute('skinWeight');
  if (index == null || joints == null || weights == null || bone < 0) return;
  const share = (v: number): number => {
    let w = 0;
    for (let c = 0; c < 4; c += 1) if (joints.getComponent(v, c) === bone) w += weights.getComponent(v, c);
    return w;
  };
  const place = (v: number): string => `${Math.round(position.getX(v) * 1e4)},${Math.round(position.getY(v) * 1e4)},${Math.round(position.getZ(v) * 1e4)}`;
  const edge = (a: number, b: number): string => {
    const ka = place(a);
    const kb = place(b);
    return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
  };
  const kept: number[] = [];
  const gone = new Set<string>();
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t);
    const b = index.getX(t + 1);
    const c = index.getX(t + 2);
    if ((share(a) + share(b) + share(c)) / 3 > 0.5) {
      gone.add(edge(a, b));
      gone.add(edge(b, c));
      gone.add(edge(c, a));
    } else kept.push(a, b, c);
  }
  if (kept.length === index.count) return;
  // The rim: the kept faces' edges that a dropped face shared.
  const rim: [number, number][] = [];
  for (let t = 0; t < kept.length; t += 3) {
    for (let k = 0; k < 3; k += 1) {
      const a = kept[t + k];
      const b = kept[t + ((k + 1) % 3)];
      if (gone.has(edge(a, b))) rim.push([a, b]);
    }
  }
  const whole = Object.values(g.attributes).every((attribute) => (attribute as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute !== true);
  if (rim.length >= 3 && whole) {
    // One more vertex, at the rim's middle: everything else about it is the first rim vertex's.
    const middle = position.count;
    const like = rim[0][0];
    const at = new Vector3();
    for (const [a] of rim) at.add(new Vector3().fromBufferAttribute(position, a));
    at.multiplyScalar(1 / rim.length).addScaledVector(up, rise);
    for (const name of Object.keys(g.attributes)) {
      const old = g.getAttribute(name) as BufferAttribute;
      const size = old.itemSize;
      const array = new (old.array.constructor as new (n: number) => typeof old.array)((old.count + 1) * size);
      array.set(old.array as ArrayLike<number>);
      for (let c = 0; c < size; c += 1) array[old.count * size + c] = old.array[like * size + c];
      g.setAttribute(name, new BufferAttribute(array, size, old.normalized));
    }
    g.getAttribute('position').setXYZ(middle, at.x, at.y, at.z);
    for (const [a, b] of rim) kept.push(b, a, middle);
  }
  g.setIndex(kept);
}

/**
 * The feet are made the `root`'s alone and the rest of the bird is freed of it; the faces that joined the two are
 * dropped. The body can then sit back from its feet with no skin stretched between them.
 */
function partFeet(mesh: SkinnedMesh, root: number): void {
  const g = mesh.geometry;
  const index = g.index;
  const joints = g.getAttribute('skinIndex');
  const weights = g.getAttribute('skinWeight');
  if (index == null || joints == null || weights == null || root < 0) return;
  const foot: boolean[] = [];
  for (let v = 0; v < joints.count; v += 1) {
    let w = 0;
    for (let c = 0; c < 4; c += 1) if (joints.getComponent(v, c) === root) w += weights.getComponent(v, c);
    foot[v] = w > 0.5;
    if (foot[v]) {
      joints.setXYZW(v, root, 0, 0, 0);
      weights.setXYZW(v, 1, 0, 0, 0);
      continue;
    }
    let rest = 0;
    for (let c = 0; c < 4; c += 1) {
      if (joints.getComponent(v, c) === root) weights.setComponent(v, c, 0);
      else rest += weights.getComponent(v, c);
    }
    if (rest > 0) for (let c = 0; c < 4; c += 1) weights.setComponent(v, c, weights.getComponent(v, c) / rest);
  }
  const kept: number[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t);
    const b = index.getX(t + 1);
    const c = index.getX(t + 2);
    if (foot[a] === foot[b] && foot[b] === foot[c]) kept.push(a, b, c);
  }
  g.setIndex(kept);
}

/** The faces of a skinned shape that belong wholly to one bone (the feet: the root's). */
function facesOf(mesh: SkinnedMesh, bone: number): number[] {
  const g = mesh.geometry;
  const index = g.index;
  const joints = g.getAttribute('skinIndex');
  const weights = g.getAttribute('skinWeight');
  const faces: number[] = [];
  if (index == null || joints == null || weights == null || bone < 0) return faces;
  const mostly = (v: number): boolean => {
    let w = 0;
    for (let c = 0; c < 4; c += 1) if (joints.getComponent(v, c) === bone) w += weights.getComponent(v, c);
    return w > 0.5;
  };
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t);
    const b = index.getX(t + 1);
    const c = index.getX(t + 2);
    if (mostly(a) && mostly(b) && mostly(c)) faces.push(a, b, c);
  }
  return faces;
}

/**
 * One smooth surface: normals worked out from the faces, then made one wherever a point of the surface is split into
 * several vertices (the seam down the breast, where the two halves of the texture meet).
 */
function smoothAcrossSeams(geometry: BufferGeometry): void {
  geometry.computeVertexNormals();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const groups = new Map<string, number[]>();
  for (let i = 0; i < position.count; i += 1) {
    const key = `${Math.round(position.getX(i) * 1e4)},${Math.round(position.getY(i) * 1e4)},${Math.round(position.getZ(i) * 1e4)}`;
    const group = groups.get(key);
    if (group == null) groups.set(key, [i]);
    else group.push(i);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    let x = 0;
    let y = 0;
    let z = 0;
    for (const i of group) {
      x += normal.getX(i);
      y += normal.getY(i);
      z += normal.getZ(i);
    }
    const length = Math.hypot(x, y, z);
    if (length < 1e-6) continue;
    for (const i of group) normal.setXYZ(i, x / length, y / length, z / length);
  }
  normal.needsUpdate = true;
}
/** A let-go feather flies back to its slot in this long (s). */
const BACK_SECONDS = 0.35;
/** The word's writing over a held feather: its size (m, the lines' 4:1, about Tocco's line) and how far above. */
const LABEL = { w: 0.3, h: 0.075, above: 0.08 } as const;
/** The word's picture over a held feather (the picture first, the writing a moment after), its size and the moment (m, s). */
const ICON = { size: 0.085, writingAfter: 0.35 } as const;
/** A held feather this near the ear slips in by itself (the magnet; m). */
const MAGNET = 0.12;

interface Plume {
  entity: Entity;
  /** Seconds left of its flight back to the slot (0: in it). */
  back: number;
  from: Vector3;
}

/**
 * The parrot's wing at the player's left shoulder (the player is the
 * parrot): one feather per learned word, in learning order, the first grey
 * (vocabulary.ts). Taking a feather (a pinch, the emulator's Pinch button,
 * a controller's trigger near it: they are grabbables) chooses its word,
 * whose writing shows over it; let go within reach of the leader's ear
 * (setListener), the word is said (wordSpoken); let go anywhere, the
 * feather flies back to its slot. Placeholder shapes until the parrot's
 * model comes.
 */
export class ParrotSystem extends createSystem({
  feathers: { required: [Feather] },
  held: { required: [Feather, Grabbed] },
}) {
  private wing: Group | null = null;
  private body: Object3D | null = null;
  private shadow: Mesh | null = null;
  /** The height (world) of what is under the feet, or null when nothing is: found by a ray once the bird has come to rest. */
  private surface: number | null = null;
  private groundOff = false;
  private feetSaid = '';
  private still = 0;
  private sinceCast = 9;
  private readonly lastEye = new Vector3();
  private readonly castAt = new Vector3();
  private readonly caster = new Raycaster();
  private readonly feetAt = new Vector3();
  private spine: Object3D | null = null;
  private shape: SkinnedMesh | null = null;
  private whole: BufferAttribute | null = null;
  private feetOnly: BufferAttribute | null = null;
  private readonly turn = new Quaternion();
  private label: Mesh | null = null;
  private labelTexture: CanvasTexture | null = null;
  private labelFor: Entity | null = null;
  private icon: Mesh | null = null;
  private iconTexture: CanvasTexture | null = null;
  private hasPicture = false;
  private heldFor = 0;
  private readonly plumes = new Map<string, Plume>();
  private version = -1;
  private readonly eye = new Vector3();
  private readonly heading = new Quaternion();
  private readonly yaw = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly at = new Vector3();
  private readonly ear = new Vector3();
  private readonly slotQuat = new Quaternion();
  private readonly lean = new Quaternion();
  private readonly look = new Quaternion();

  init(): void {
    const wing = new Group();
    wing.name = 'ParrotWing';
    // The wing under the row of word feathers: its own flight feathers fanned out ahead from the shoulder line, greens going to blue at the wing's tip, and a row of short coverts over their roots.
    // The bird's own body under the eye is the modelled macaw (dressBody), put on once its file is in.
    const plain = new Group();
    plain.name = 'WingPlain';
    wing.add(plain);
    // Every wing feather is one copy of the same leaf, placed, sized and coloured on its own: one draw for the whole wing.
    const leaves: { place: Matrix4; colour: Color }[] = [];
    const turn = new Matrix4();
    const lie = new Matrix4().makeRotationX(-Math.PI / 2 + 0.45);
    const fan = (count: number, long: number, wide: number, back: number, lift: number, colours: readonly number[]): void => {
      for (let k = 0; k < count; k += 1) {
        const along = k / (count - 1);
        const length = long * (0.85 + 0.25 * along);
        // Tips ahead (-z), spreading a little toward the wing's tip; the leaf's quill at the holder's place.
        const place = new Matrix4().makeTranslation(-0.02 - along * 0.4, lift - 0.02 + (k % 2) * 0.002, back);
        place.multiply(turn.makeRotationY(-Math.PI / 2 - 0.18 + along * 0.5));
        place.multiply(turn.makeTranslation(-length / 2, 0, 0));
        place.multiply(lie);
        place.multiply(turn.makeScale(length, wide, 1));
        leaves.push({ place, colour: new Color(colours[Math.min(colours.length - 1, Math.floor(along * colours.length))]) });
      }
    };
    wing.traverse((o) => {
      o.pointerEvents = 'none';
    });
    // The modelled wing (public/v2/papagan/player_wing.glb) is not used: seen from the eye it reads as a flat strip and a plain ball, and the feathers built here read as a bird.
    fan(11, 0.17, 0.06, 0.02, 0, [0x2a66c4, 0x2f6fd0, 0x2a66c4, 0x2560b8, 0x1f55a8]);
    fan(10, 0.1, 0.05, 0.035, 0.008, [0xe9c63a, 0xf0d040, 0xe9c63a]);
    fan(9, 0.06, 0.05, 0.05, 0.016, [0xd8281c, 0xcc2016, 0xd8281c]);
    const leaf = featherMesh(0xffffff, 1, 1);
    const flight = new InstancedMesh(leaf.geometry, leaf.material, leaves.length);
    flight.name = 'WingFeathers';
    flight.frustumCulled = false;
    flight.pointerEvents = 'none';
    leaves.forEach((one, k) => {
      flight.setMatrixAt(k, one.place);
      flight.setColorAt(k, one.colour);
    });
    flight.instanceMatrix.needsUpdate = true;
    if (flight.instanceColor != null) flight.instanceColor.needsUpdate = true;
    plain.add(flight);
    this.world.createTransformEntity(wing, { persistent: true });
    wing.visible = false;
    this.wing = wing;

    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = TEXT_ANISOTROPY;
    this.labelTexture = texture;
    const label = new Mesh(new PlaneGeometry(LABEL.w, LABEL.h), sharpText(new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })));
    label.name = 'FeatherWord';
    label.renderOrder = 3;
    label.visible = false;
    label.pointerEvents = 'none';
    this.world.createTransformEntity(label, { persistent: true });
    this.label = label;
    loadWordIcons();
    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = 256;
    iconCanvas.height = 256;
    const iconTexture = new CanvasTexture(iconCanvas);
    iconTexture.colorSpace = SRGBColorSpace;
    this.iconTexture = iconTexture;
    const icon = new Mesh(new PlaneGeometry(ICON.size, ICON.size), new MeshBasicMaterial({ map: iconTexture, transparent: true, depthWrite: false }));
    icon.name = 'FeatherPicture';
    icon.renderOrder = 3;
    icon.visible = false;
    icon.pointerEvents = 'none';
    this.world.createTransformEntity(icon, { persistent: true });
    this.icon = icon;

    this.cleanupFuncs.push(
      this.queries.held.subscribe('qualify', (entity) => {
        feathersHeld += 1;
        this.taken(entity);
      }),
      this.queries.held.subscribe('disqualify', (entity) => {
        feathersHeld = Math.max(0, feathersHeld - 1);
        this.letGo(entity);
      }),
    );
  }

  /**
   * The player's own body: a copy of the modelled parrot with its own bones, hung under the eye with the wing. Its head is
   * taken off (the eye is there), its open flight wings are left off (the wing ahead is the row of feathers).
   */
  private dressBody(): void {
    const wing = this.wing;
    if (this.body != null || wing == null) return;
    const gltf = AssetManager.getGLTF('v2_prop_parrot');
    if (gltf == null) return;
    const bird = cloneSkinned(gltf.scene);
    bird.name = 'ParrotBody';
    bird.traverse((o) => {
      o.pointerEvents = 'none';
      o.frustumCulled = false;
      if (o.name === 'parrot_wing_L' || o.name === 'parrot_wing_R') o.visible = false;
      // Its own copy of the shape, made one smooth surface (the bird seen from outside keeps its own).
      const mesh = o as Mesh;
      if (mesh.isMesh === true && o.name === 'parrot_body') {
        mesh.geometry = mesh.geometry.clone();
        // Its own skin too, without the relief picture: mirrored down the middle, it draws a dark line down the breast seen from above.
        if (!Array.isArray(mesh.material)) {
          const skin = (mesh.material as MeshStandardMaterial).clone();
          skin.normalMap = null;
          mesh.material = skin;
        }
        const skinned = mesh as SkinnedMesh;
        if (skinned.isSkinnedMesh === true) {
          const root = skinned.skeleton.bones.findIndex((b) => b.name === 'root');
          partFeet(skinned, root);
          takeHeadOff(skinned, skinned.skeleton.bones.findIndex((b) => b.name === 'head'), NECK_LINE, 0.025);
          this.shape = skinned;
          this.whole = mesh.geometry.index;
          const feet = facesOf(skinned, root);
          this.feetOnly = new BufferAttribute(new Uint16Array(feet), 1);
        }
        smoothAcrossSeams(mesh.geometry);
      }
    });
    bird.visible = true;
    this.body = bird;
    this.spine = bird.getObjectByName('body') ?? null;
    wing.add(bird);
    // A soft shadow under the bird, on what its feet stand on.
    const shade = document.createElement('canvas');
    shade.width = 64;
    shade.height = 64;
    const g = shade.getContext('2d');
    if (g != null) {
      const round = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      round.addColorStop(0, 'rgba(0,0,0,0.55)');
      round.addColorStop(0.6, 'rgba(0,0,0,0.25)');
      round.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = round;
      g.fillRect(0, 0, 64, 64);
    }
    const shadow = new Mesh(new PlaneGeometry(GROUND.shadow, GROUND.shadow * 1.3).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: new CanvasTexture(shade), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    shadow.name = 'ParrotShadow';
    shadow.pointerEvents = 'none';
    shadow.frustumCulled = false;
    shadow.renderOrder = 1;
    shadow.position.set(-WING_AT.x, 0, -WING_AT.z - BODY_FIT.feetAhead + 0.03);
    shadow.visible = false;
    wing.add(shadow);
    this.shadow = shadow;
    this.poseBody(BODY_FIT);
    if (import.meta.env.DEV) console.info(`[parrot] own body on: spine ${this.spine != null}, head ${bird.getObjectByName('head') != null}`);
  }

  /** Whether a thing met by the ray is something to stand on: drawn, solid, and not the bird's or the player's own. */
  private standsOn(object: Object3D): boolean {
    const mesh = object as Mesh;
    if (mesh.isMesh !== true) return false;
    const material = mesh.material as MeshStandardMaterial | MeshStandardMaterial[];
    if (!Array.isArray(material) && material.transparent && !material.depthWrite) return false;
    for (let o: Object3D | null = object; o != null; o = o.parent) {
      if (!o.visible || o === this.wing || o === this.player) return false;
    }
    return true;
  }

  /**
   * The feet on what is under them (see GROUND), a soft shadow with them; tucked away over nothing. A fault in the
   * search turns it off for good and leaves the feet at their own height.
   */
  private groundFeet(delta: number): void {
    const bird = this.body;
    const wing = this.wing;
    if (bird == null || wing == null || this.groundOff) return;
    const moved = this.eye.distanceTo(this.lastEye);
    this.lastEye.copy(this.eye);
    this.still = moved < 0.004 ? this.still + delta : 0;
    // Carried through the air (a flight is metres a second, a head's own sway is not): the feet are tucked away at once.
    if (moved > 0.02) this.surface = null;
    this.sinceCast += delta;
    const under = this.surface == null ? null : this.eye.y - this.surface;
    const lost = under == null || under < GROUND.near || under > GROUND.far;
    const away = Math.hypot(this.eye.x - this.castAt.x, this.eye.z - this.castAt.z) > GROUND.moved;
    if (this.still >= GROUND.still && this.sinceCast >= GROUND.again && (lost || away)) {
      this.sinceCast = 0;
      this.castAt.copy(this.eye);
      // From a little under the eye at the feet's place, straight down.
      this.feetAt.set(0, 0, -BODY_FIT.feetAhead).applyQuaternion(wing.quaternion).add(this.eye);
      this.feetAt.y -= GROUND.from;
      try {
        this.caster.set(this.feetAt, DOWNWARD);
        this.caster.near = 0;
        this.caster.far = GROUND.far - GROUND.from;
        this.caster.camera = this.world.camera;
        const hit = this.caster.intersectObjects(this.world.scene.children, true).find((h) => this.standsOn(h.object));
        this.surface = hit == null ? null : hit.point.y;
        // Over nothing it looks again only after a while (a perch may be stood there after the bird has come).
        if (hit == null) this.sinceCast = -1.1;
        const found = hit == null ? 'nothing under them, tucked away' : `on ${hit.object.name || hit.object.parent?.name || 'a surface'}, ${(this.eye.y - hit.point.y).toFixed(2)} m under the eye`;
        if (import.meta.env.DEV && found !== this.feetSaid) console.info(`[parrot] feet: ${found}`);
        this.feetSaid = found;
      } catch (error) {
        this.groundOff = true;
        bird.visible = true;
        if (this.shadow != null) this.shadow.visible = false;
        if (import.meta.env.DEV) console.info(`[parrot] feet: the search for a surface failed and is off (${String(error)})`);
        return;
      }
    }
    const down = this.surface == null ? null : this.eye.y - this.surface;
    const on = down != null && down >= GROUND.near && down <= GROUND.far;
    bird.visible = on;
    if (this.shadow != null) this.shadow.visible = on;
    if (!on || down == null) return;
    bird.position.y = -WING_AT.y - down;
    if (this.shadow != null) this.shadow.position.y = -WING_AT.y - down + 0.006;
  }

  private poseBody(fit: BodyFit): void {
    const bird = this.body;
    const spine = this.spine;
    if (bird == null || spine == null) return;
    // The body leans back and sits back from its feet (the feet are the root's, and stay); the tail is turned to hang behind.
    spine.quaternion.setFromAxisAngle(LEAN_AXIS, (fit.lean * Math.PI) / 180);
    spine.position.z = SPINE_AHEAD - fit.back;
    bird.getObjectByName('tail')?.quaternion.copy(TAIL_REST).premultiply(this.turn.setFromAxisAngle(LEAN_AXIS, (fit.tail * Math.PI) / 180));
    // The model looks along +z; the player looks along -z. The grip is put so the feet's middle is at its place from the eye.
    bird.rotation.set(0, Math.PI, 0);
    bird.scale.setScalar(fit.scale);
    bird.position.set(-WING_AT.x, -WING_AT.y - fit.feetDown, -WING_AT.z - fit.feetAhead + FEET_MID * fit.scale);
    this.groundFeet(0);
    const faces = fit.only === true ? this.feetOnly : this.whole;
    if (this.shape != null && faces != null) this.shape.geometry.setIndex(faces);
  }

  update(delta: number): void {
    const wing = this.wing;
    if (wing == null) return;
    if (this.body == null) this.dressBody();
    if (parrotWords.version !== this.version) this.sync();
    wing.visible = this.renderer.xr.isPresenting && parrotWords.learned.length > 0 && !stowed;
    for (const plume of this.plumes.values()) if (plume.entity.object3D != null) plume.entity.object3D.visible = wing.visible;
    if (!wing.visible) return;
    // The wing follows the eye, turned with the head's heading only, so it stays put as the player looks round.
    this.player.head.getWorldPosition(this.eye);
    this.player.head.getWorldQuaternion(this.heading);
    this.yaw.set(0, 0, -1).applyQuaternion(this.heading).setY(0);
    if (this.yaw.lengthSq() < 1e-6) this.yaw.set(0, 0, -1);
    this.heading.setFromUnitVectors(this.at.set(0, 0, -1), this.yaw.normalize());
    wing.position.copy(WING_AT).applyQuaternion(this.heading).add(this.eye);
    wing.quaternion.copy(this.heading);
    this.groundFeet(delta);
    wing.updateMatrixWorld();
    for (const plume of this.plumes.values()) this.place(plume, delta);
    this.heldFor += delta;
    this.magnet();
    this.drawLabel();
  }

  /** A held feather near enough the ear is taken in: let go of it there, and its word is said. */
  private magnet(): void {
    const entity = this.labelFor;
    const object = entity?.object3D;
    if (entity == null || object == null || listener == null) return;
    object.getWorldPosition(this.at);
    listener.object.getWorldPosition(this.ear);
    if (this.at.distanceTo(this.ear) > MAGNET) return;
    if (import.meta.env.DEV) console.info('[parrot] the ear takes the feather in');
    this.world.getSystem(GrabSystem)?.forceRelease(entity);
  }

  /** A feather for every learned word, and none for a forgotten one (a restart). */
  private sync(): void {
    this.version = parrotWords.version;
    const words = parrotWords.learned;
    for (const [text, plume] of this.plumes) {
      if (words.some((w) => w.text === text)) continue;
      plume.entity.dispose();
      this.plumes.delete(text);
    }
    words.forEach((word, slot) => {
      if (this.plumes.has(word.text)) return;
      const feather = new Group();
      feather.name = `Feather ${word.text}`;
      // A word's feather: longer and brighter than the wing's own, standing a little proud of them.
      const vane = featherMesh(word.colour, 0.15, 0.05);
      vane.position.y = 0.012;
      feather.add(vane);
      const entity = this.world.createTransformEntity(feather).addComponent(OneHandGrabbable, { rotate: true, translate: true }).addComponent(Feather, { word: word.text, slot });
      this.plumes.set(word.text, { entity, back: 0, from: new Vector3() });
    });
  }

  /** A free feather sits in its slot on the wing, or flies back to it. */
  private place(plume: Plume, delta: number): void {
    const entity = plume.entity;
    const object = entity.object3D;
    const wing = this.wing;
    if (object == null || wing == null || entity.hasComponent(Grabbed)) return;
    const slot = slotPlace(entity.getValue(Feather, 'slot') ?? 0);
    wing.localToWorld(this.at.set(slot.x, slot.y, slot.z));
    this.lean.setFromAxisAngle(this.up, slot.lean);
    this.slotQuat.copy(wing.quaternion).multiply(this.lean);
    if (plume.back > 0) {
      plume.back = Math.max(0, plume.back - delta);
      const k = 1 - plume.back / BACK_SECONDS;
      object.position.lerpVectors(plume.from, this.at, k * k * (3 - 2 * k));
      object.quaternion.slerp(this.slotQuat, Math.min(1, k * 1.5));
      return;
    }
    object.position.copy(this.at);
    object.quaternion.copy(this.slotQuat);
  }

  private taken(entity: Entity): void {
    const word = entity.getValue(Feather, 'word') ?? '';
    parrotWords.select(word);
    emitV2('featherTaken', { word });
    this.labelFor = entity;
    this.heldFor = 0;
    const texture = this.labelTexture;
    // The feather turns into its word's picture, then its writing ("SAFETY NET").
    if (texture != null) drawLine(texture, word.toUpperCase());
    const badge = wordBadge(word);
    this.hasPicture = badge != null;
    const iconTexture = this.iconTexture;
    if (badge != null && iconTexture != null) {
      const canvas = iconTexture.image as HTMLCanvasElement;
      const g = canvas.getContext('2d');
      if (g != null) {
        g.clearRect(0, 0, canvas.width, canvas.height);
        g.drawImage(badge, 0, 0, canvas.width, canvas.height);
      }
      iconTexture.needsUpdate = true;
    }
    if (import.meta.env.DEV) console.info(`[parrot] feather taken: ${word}`);
  }

  private letGo(entity: Entity): void {
    const word = entity.getValue(Feather, 'word') ?? '';
    const object = entity.object3D;
    if (object != null && listener != null) {
      object.getWorldPosition(this.at);
      listener.object.getWorldPosition(this.ear);
      if (this.at.distanceTo(this.ear) <= listener.reach) {
        parrotWords.speak(word);
        if (import.meta.env.DEV) console.info(`[parrot] said into the ear: ${word}`);
      }
    }
    parrotWords.select(null);
    if (this.labelFor === entity) this.labelFor = null;
    const plume = this.plumes.get(word);
    if (plume != null && object != null) {
      plume.from.copy(object.position);
      plume.back = BACK_SECONDS;
    }
  }

  /** The held feather's word, over it, facing the eye. */
  private drawLabel(): void {
    const label = this.label;
    if (label == null) return;
    const object = this.labelFor?.object3D;
    const icon = this.icon;
    // The picture first; the writing a moment after (at once for a word with no picture).
    label.visible = object != null && (!this.hasPicture || this.heldFor >= ICON.writingAfter);
    if (icon != null) icon.visible = object != null && this.hasPicture;
    if (object == null) return;
    this.player.head.getWorldQuaternion(this.look);
    object.getWorldPosition(label.position);
    label.position.y += LABEL.above + (this.hasPicture ? ICON.size + 0.01 : 0);
    label.quaternion.copy(this.look);
    if (icon != null) {
      object.getWorldPosition(icon.position);
      icon.position.y += LABEL.above + ICON.size * 0.4;
      icon.quaternion.copy(this.look);
    }
  }
}
