import {
  BoxGeometry,
  CanvasTexture,
  Color,
  createSystem,
  CylinderGeometry,
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
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
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
const WING_AT = new Vector3(0.08, -0.27, -0.34);
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
    // The plain wing, breast and feet built here stand in until the real ones load, and stay if their file is not there.
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
    // The bird's own breast under the eye, and its two feet on whatever it perches on: looking down, the player sees a parrot.
    // A small dark body, and over it a coat of short feathers laid like tiles from the throat down: yellow at the throat, then greens.
    const breast = new Group();
    breast.name = 'ParrotBreast';
    breast.position.set(-0.08, -0.075, 0.3);
    const under = new Mesh(new SphereGeometry(0.066, 14, 10), new MeshStandardMaterial({ color: 0x6e1410, roughness: 0.9 }));
    under.scale.set(0.95, 1.15, 0.8);
    breast.add(under);
    const ROWS = 7;
    const COLS = 12;
    const plume = featherMesh(0xffffff, 0.062, 0.04);
    plume.updateMatrix();
    const coat = new InstancedMesh(plume.geometry, plume.material, ROWS * COLS);
    coat.name = 'ParrotCoat';
    coat.frustumCulled = false;
    const rowColours = [0xd8281c, 0xd22418, 0xcc2016, 0xc41c14, 0xbc1a12, 0xb01710, 0xa4150e].map((c) => new Color(c));
    const normal = new Vector3();
    const downhill = new Vector3();
    const side = new Vector3();
    const basis = new Matrix4();
    const placeAt = new Matrix4();
    for (let r = 0; r < ROWS; r += 1) {
      const polar = ((18 + r * 21) * Math.PI) / 180;
      for (let c = 0; c < COLS; c += 1) {
        const around = ((c + (r % 2) * 0.5) / COLS) * Math.PI * 2;
        normal.set(Math.sin(polar) * Math.cos(around), Math.cos(polar), Math.sin(polar) * Math.sin(around));
        // The feather's tip runs down the body from its root.
        downhill.set(0, -1, 0).addScaledVector(normal, normal.y).normalize();
        side.crossVectors(downhill.clone().negate(), normal).normalize();
        basis.makeBasis(downhill.clone().negate(), normal, side);
        basis.setPosition(normal.x * 0.066 * 0.95, normal.y * 0.066 * 1.15, normal.z * 0.066 * 0.8);
        placeAt.multiplyMatrices(basis, plume.matrix);
        coat.setMatrixAt(r * COLS + c, placeAt);
        coat.setColorAt(r * COLS + c, rowColours[r]);
      }
    }
    coat.instanceMatrix.needsUpdate = true;
    if (coat.instanceColor != null) coat.instanceColor.needsUpdate = true;
    breast.add(coat);
    plain.add(breast);
    // Six claws, one draw.
    const claws = new InstancedMesh(new CylinderGeometry(0.008, 0.005, 0.06, 6), new MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6 }), 6);
    claws.frustumCulled = false;
    const clawAt = new Object3D();
    let clawN = 0;
    for (const foot of [-1, 1]) {
      for (const toe of [-1, 0, 1]) {
        clawAt.rotation.set(Math.PI / 2 - 0.3, 0, toe * 0.35);
        clawAt.position.set(-0.08 + foot * 0.045 + toe * 0.012, -0.15, 0.24);
        clawAt.updateMatrix();
        claws.setMatrixAt(clawN, clawAt.matrix);
        clawN += 1;
      }
    }
    claws.instanceMatrix.needsUpdate = true;
    plain.add(claws);
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

  update(delta: number): void {
    const wing = this.wing;
    if (wing == null) return;
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
