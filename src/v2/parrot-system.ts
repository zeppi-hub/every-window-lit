import {
  BoxGeometry,
  CanvasTexture,
  createSystem,
  type Entity,
  Grabbed,
  GrabSystem,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  OneHandGrabbable,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { drawLine } from '../station/family.js';
import { sharpText, TEXT_ANISOTROPY } from '../station/sharp-text.js';
import { Feather } from './components.js';
import { emitV2 } from './events.js';
import { loadWordIcons, wordBadge } from './icons.js';
import { slotPlace, Vocabulary } from './vocabulary.js';

/** The parrot's words (vocabulary.ts): scenes teach it words and read what was said. */
export const parrotWords = new Vocabulary();

/** The leader's ear: a feather let go within `reach` of it has its word said. */
let listener: { object: Object3D; reach: number } | null = null;

export function setListener(object: Object3D | null, reach = 0.15): void {
  listener = object == null ? null : { object, reach };
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
    // Under the row of feathers, which point ahead from the shoulder line.
    const blade = new Mesh(new BoxGeometry(0.42, 0.006, 0.1), new MeshStandardMaterial({ color: 0x3f8f4a, roughness: 0.7 }));
    blade.position.set(-0.21, -0.015, -0.04);
    blade.pointerEvents = 'none';
    wing.add(blade);
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
      this.queries.held.subscribe('qualify', (entity) => this.taken(entity)),
      this.queries.held.subscribe('disqualify', (entity) => this.letGo(entity)),
    );
  }

  update(delta: number): void {
    const wing = this.wing;
    if (wing == null) return;
    if (parrotWords.version !== this.version) this.sync();
    wing.visible = this.renderer.xr.isPresenting && parrotWords.learned.length > 0;
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
      const vane = new Mesh(new BoxGeometry(0.1, 0.004, 0.02), new MeshStandardMaterial({ color: word.colour, roughness: 0.6 }));
      vane.position.x = -0.05;
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
