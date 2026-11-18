import { AdditiveBlending, type AnimationAction, AnimationClip, AnimationMixer, AssetManager, type Bone, CanvasTexture, CircleGeometry, ConeGeometry, type DirectionalLight, DoubleSide, Group, LoopRepeat, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D, PlaneGeometry, Quaternion, Skeleton, type SkinnedMesh, SphereGeometry, Vector3 } from '@iwsdk/core';
import { pinchPoint } from '../../systems/pinch-reach.js';
import { lessMotion } from '../../comfort.js';
import { featherMesh, parrotWords } from '../parrot-system.js';
import { slotPlace } from '../vocabulary.js';
import type { DirectorSystem } from './director.js';
import { makeGlow } from './fx.js';
import { KEEPERS, type Keepers } from './opening.js';

/**
 * The ways between the city and a memory, made readable:
 * - the bird flies to a keeper's palm in a short arc (it no longer simply
 *   appears there), the view narrowed a little while it moves;
 * - the forest's orb is glass with the forest inside it, small: firs on a
 *   patch of ground and a fire among them;
 * - the memory opens on the last of the way down into it;
 * - back in the city, the word's feather drifts down onto the wing.
 * The camera is never turned by the game: the flight keeps the heading the
 * player had, and the turn to face out from the palm is behind a blink.
 * With less motion every move is a fade.
 */

const ease = (k: number): number => k * k * (3 - 2 * k);

export type Side = 'left' | 'right';
export const SIDES = ['left', 'right'] as const satisfies readonly Side[];
const handNow = new Vector3();
const rayFrom = new Vector3();
const rayWay = new Vector3();
const rayTurn = new Quaternion();
const rayTo = new Vector3();

/** Where a hand is: its pinch point if it is tracked, else its controller's grip. */
export function handPoint(d: DirectorSystem, side: Side, out: Vector3): Vector3 {
  const point = pinchPoint(side);
  return point != null ? out.copy(point) : d.player.gripSpaces[side].getWorldPosition(out);
}

/** Whether a hand's ray passes within `within` m of `point`, ahead of the hand. */
export function pointsAt(d: DirectorSystem, side: Side, point: Vector3, within: number): boolean {
  const space = d.player.raySpaces[side];
  space.getWorldPosition(rayFrom);
  space.getWorldQuaternion(rayTurn);
  rayWay.set(0, 0, -1).applyQuaternion(rayTurn);
  const along = rayTo.copy(point).sub(rayFrom).dot(rayWay);
  if (along <= 0) return false;
  return rayTo.copy(rayFrom).addScaledVector(rayWay, along).distanceTo(point) <= within;
}

/**
 * Whether a hand takes the thing at `grip` now: the hand is on it (the
 * emulator's mouse hand settles there by itself), or pinches within reach
 * of it, or pinches while pointing at it. One move, no hold.
 */
export function takes(d: DirectorSystem, side: Side, grip: Vector3, reach = 0.13): boolean {
  const near = handPoint(d, side, handNow).distanceTo(grip);
  if (near <= reach * 0.5) return true;
  if (!d.input.xr.getSelectState(side).active) return false;
  return near <= reach || pointsAt(d, side, grip, reach * 1.4);
}

/** A soft flame drawn once: white at the root, through yellow and orange, to nothing at the tip and edges (the circus hoops' flame). */
export function softFlame(): CanvasTexture {
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

/** The view closing in from its edges while the player is moved, or as the fire arrives: a dark card just ahead of the eye with a clear round middle. */
export class ViewEdge {
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
    this.card.name = 'ViewEdge';
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
    // The clear middle is 40/128 of the card: at this scale it spans about 110 degrees at 0.25 m when half closed.
    this.card.scale.setScalar(1.6 * (0.35 + 0.65 * ((this.open - 0.5) / 0.5)) * 2.2);
  }

  dispose(): void {
    this.card.removeFromParent();
  }
}
/** A flight no longer than this is flown whole; a longer one shows only its take-off, this far, and the rest is behind the blink (m). */
const WHOLE_FLIGHT = 10;
const TAKE_OFF = 4.5;

/**
 * Fly from where the bird is to `eye`, then face `yaw` there. A short hop
 * (to a keeper's palm) is flown all the way in an arc; across the square,
 * the bird is seen to take off toward the place, and lands behind a blink.
 */
export async function flyToPerch(d: DirectorSystem, eye: Vector3, yaw: number): Promise<void> {
  const from = d.eyeAt.clone();
  d.player.head.getWorldPosition(from);
  const far = from.distanceTo(eye);
  if (lessMotion() || far < 0.5) {
    await d.rig.move(eye, yaw);
    return;
  }
  const whole = far <= WHOLE_FLIGHT;
  // The take-off climbs toward the place and stops short of it.
  const to = whole ? eye : from.clone().lerp(eye, TAKE_OFF / far).add(new Vector3(0, 0.9, 0));
  const vignette = new ViewEdge(d.player.head);
  vignette.set(0.78);
  const seconds = whole ? Math.max(0.9, Math.min(1.8, far / 4.5)) : 1.0;
  const lift = whole ? 0.3 + far * 0.07 : 0;
  d.sounds.play('swing_whoosh', 0.3, 0.8, 0.1);
  const last = from.clone();
  const now = new Vector3();
  let t = 0;
  let flap = 0.3;
  let skipped = false;
  let dimming = false;
  const stop = d.each((delta) => {
    t += delta;
    const u = Math.min(1, t / seconds);
    const k = whole ? ease(u) : u * u;
    now.lerpVectors(from, to, k);
    now.y += Math.sin(k * Math.PI) * lift;
    if (!whole && !dimming && u > 0.6) {
      dimming = true;
      void d.rig.fadeTo(1);
    }
    d.player.position.add(last.sub(now).negate());
    d.player.updateMatrixWorld(true);
    last.copy(now);
    vignette.update(delta);
    flap -= delta;
    if (flap <= 0) {
      flap = 0.34;
      d.sounds.play('wing_flap', 0.45, 0.95 + Math.random() * 0.15);
    }
  });
  d.onSkip(() => {
    skipped = true;
  });
  await d.until(() => t >= seconds || skipped);
  stop();
  if (import.meta.env.DEV) console.info(`[flight] ${far.toFixed(1)} m in ${seconds.toFixed(1)} s`);
  // Landed: turned to look out from the perch, behind a blink.
  await d.rig.move(eye, yaw);
  vignette.dispose();
}

/**
 * Into a memory: the player is at the place the memory starts; begin `from`
 * away (an offset) and come the last of the way in. `move` shifts the
 * player and whatever goes with her.
 */
export async function glideIn(d: DirectorSystem, from: Vector3, move: (by: Vector3) => void, seconds = 2.4): Promise<void> {
  if (lessMotion()) return;
  move(from);
  const step = new Vector3();
  let t = 0;
  let skipped = false;
  const stop = d.each((delta) => {
    const before = ease(Math.min(1, t / seconds));
    t += delta;
    const after = ease(Math.min(1, t / seconds));
    move(step.copy(from).multiplyScalar(before - after));
  });
  d.onSkip(() => {
    skipped = true;
  });
  await d.until(() => t >= seconds || skipped);
  stop();
  if (t < seconds) move(step.copy(from).multiplyScalar(ease(Math.min(1, t / seconds)) - 1));
}

/** The forest inside its keeper's orb: the orb turns to glass, and in it stand a few firs on a patch of earth with a fire among them. */
export function dressForestOrb(d: DirectorSystem, keepers: Keepers): void {
  const i = KEEPERS.findIndex((k) => k.memory === 'forest');
  const orb = keepers.orbs[i];
  if (orb == null || orb.getObjectByName('OrbForest') != null) return;
  const r = (orb.geometry as SphereGeometry).parameters.radius;
  const glass = orb.material as MeshBasicMaterial;
  glass.transparent = true;
  glass.opacity = 0.2;
  glass.depthWrite = false;
  orb.renderOrder = 2;
  const inside = new Group();
  inside.name = 'OrbForest';
  const earth = new Mesh(new CircleGeometry(r * 0.8, 20), new MeshStandardMaterial({ color: 0x4a3a28, roughness: 1, side: DoubleSide }));
  earth.rotation.x = -Math.PI / 2;
  earth.position.y = -r * 0.5;
  inside.add(earth);
  const fir = new MeshStandardMaterial({ color: 0x2f5a34, roughness: 0.9, emissive: 0x1a2a10, emissiveIntensity: 0.6 });
  const spots: [number, number, number][] = [[-0.45, 0.25, 1], [-0.1, -0.4, 1.25], [0.35, 0.3, 0.9], [0.5, -0.2, 1.1], [-0.5, -0.25, 0.8], [0.05, 0.45, 1.05]];
  for (const [x, z, tall] of spots) {
    const tree = new Mesh(new ConeGeometry(r * 0.16, r * 0.62 * tall, 7), fir);
    tree.position.set(x * r, -r * 0.5 + (r * 0.62 * tall) / 2, z * r);
    inside.add(tree);
  }
  // The fire: crossed cards of flame at the back of the little wood, and its glow.
  const flame = new MeshBasicMaterial({ map: softFlame(), color: 0xffa040, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, toneMapped: false });
  const flames: Mesh[] = [];
  for (const [x, z] of [[-0.25, -0.1], [0.15, -0.3], [0.3, 0.05]] as const) {
    for (const turn of [0, Math.PI / 2]) {
      const card = new Mesh(new PlaneGeometry(r * 0.42, r * 0.8), flame);
      card.position.set(x * r, -r * 0.5 + r * 0.32, z * r);
      card.rotation.y = turn;
      inside.add(card);
      flames.push(card);
    }
  }
  const glow = new Mesh(new SphereGeometry(r * 0.45, 12, 8), new MeshBasicMaterial({ color: 0xff7a22, transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  glow.position.y = -r * 0.15;
  inside.add(glow);
  inside.traverse((o) => {
    o.pointerEvents = 'none';
  });
  orb.add(inside);
  // The orb shows its own world now; the word's picture on its front would hide it.
  const picture = keepers.pictures[i];
  if (picture != null) {
    picture.visible = false;
    keepers.pictures[i] = null;
  }
  let t = 0;
  d.each((delta) => {
    if (!orb.visible) return;
    t += delta;
    flames.forEach((card, k) => {
      card.scale.y = 0.8 + 0.3 * Math.sin(t * (9 + (k >> 1)) + k);
    });
    (glow.material as MeshBasicMaterial).opacity = 0.3 + 0.12 * Math.sin(t * 7);
  });
}

/** A word learned in a memory: its feather is given once the bird is home, where the wing can be seen. */
let owed: { word: string; colour: number; then?: () => void } | null = null;

/** `then` runs once the feather is on the wing (the scene's next task for the player). */
export function giveFeather(word: string, colour: number, then?: () => void): void {
  owed = { word, colour, then };
}

/** Back from a memory: the new word's feather drifts down from above and settles in its place on the wing. */
export async function featherLands(d: DirectorSystem): Promise<void> {
  const gift = owed;
  owed = null;
  if (gift == null || parrotWords.has(gift.word)) return;
  const wing: Object3D | undefined = d.world.scene.getObjectByName('ParrotWing');
  if (wing == null) {
    parrotWords.learn(gift.word, gift.colour);
    return;
  }
  const feather = new Group();
  feather.name = 'FeatherComing';
  feather.add(featherMesh(gift.colour, 0.15, 0.05));
  feather.traverse((o) => {
    o.pointerEvents = 'none';
  });
  const entity = d.world.createTransformEntity(feather, { persistent: true });
  const glow = makeGlow(d.world, gift.colour, 0.035);
  (glow.material as MeshBasicMaterial).opacity = 0.5;
  const slot = slotPlace(parrotWords.learned.length);
  const goal = new Vector3();
  const from = new Vector3();
  const off = new Vector3();
  const seconds = 1.7;
  let t = 0;
  let skipped = false;
  d.sounds.play('feather_rustle', 0.7);
  const stop = d.each((delta) => {
    t += delta;
    const k = ease(Math.min(1, t / seconds));
    wing.localToWorld(goal.set(slot.x, slot.y + 0.012, slot.z));
    // From above and ahead of the wing, swaying as a feather falls.
    from.copy(goal).add(off.set(0, 0.34, -0.12).applyQuaternion(wing.quaternion));
    feather.position.lerpVectors(from, goal, k);
    feather.position.addScaledVector(off.set(1, 0, 0).applyQuaternion(wing.quaternion), Math.sin(t * 5) * 0.05 * (1 - k));
    feather.quaternion.copy(wing.quaternion);
    feather.rotateY(slot.lean + (1 - k) * Math.sin(t * 4) * 0.8);
    feather.rotateZ((1 - k) * 0.6);
    glow.position.copy(feather.position);
    glow.scale.setScalar(1 + 0.3 * Math.sin(t * 9));
  });
  d.onSkip(() => {
    skipped = true;
  });
  await d.until(() => t >= seconds || skipped);
  stop();
  entity.dispose();
  glow.visible = false;
  parrotWords.learn(gift.word, gift.colour);
  d.sounds.play('ear_click', 0.4);
  if (import.meta.env.DEV) console.info(`[flight] the feather for "${gift.word}" is on the wing`);
  gift.then?.();
  await d.wait(0.5);
}

type ExtraClip = 'idle' | 'talk' | 'cheer';

/**
 * One of the city's people drawn a second time, on bones of its own (the
 * city's copy stays where it is): the same photo-textured body and clips.
 * For a memory's bystander: stand it somewhere, tell it what to do.
 */
export class Extra {
  readonly root: Object3D;
  private readonly mixer: AnimationMixer;
  private readonly actions: Partial<Record<ExtraClip, AnimationAction>> = {};
  private playing: ExtraClip | null = null;
  private head: Object3D | null = null;

  /** Null when that person's file is not loaded. */
  static make(name: string): Extra | null {
    const gltf = AssetManager.getGLTF(`v2_person_${name}`);
    return gltf == null ? null : new Extra(gltf.scene, gltf.animations);
  }

  private constructor(source: Object3D, clips: AnimationClip[]) {
    const copy = source.clone(true);
    // Each skinned mesh of the copy is bound to the copy's own bones (a plain clone would still move with the first body's).
    const from: Object3D[] = [];
    const to: Object3D[] = [];
    source.traverse((o) => from.push(o));
    copy.traverse((o) => to.push(o));
    const twin = new Map<Object3D, Object3D>();
    from.forEach((o, i) => twin.set(o, to[i]));
    from.forEach((o, i) => {
      const first = o as SkinnedMesh;
      if (first.isSkinnedMesh !== true) return;
      const mesh = to[i] as SkinnedMesh;
      const bones = first.skeleton.bones.map((bone) => (twin.get(bone) ?? bone) as Bone);
      mesh.bind(new Skeleton(bones, first.skeleton.boneInverses), first.bindMatrix);
    });
    copy.position.set(0, 0, 0);
    copy.rotation.set(0, 0, 0);
    copy.scale.setScalar(1);
    copy.visible = true;
    copy.name = `Extra ${source.name}`;
    copy.traverse((o) => {
      o.pointerEvents = 'none';
      if (o.name === 'Head') this.head = o;
      const mesh = o as SkinnedMesh;
      if (mesh.isSkinnedMesh !== true) return;
      // Its bounds are the bind pose's: never culled, it is always beside the player.
      mesh.frustumCulled = false;
      if (mesh.geometry.userData.smoothed !== true) {
        mesh.geometry.computeVertexNormals();
        mesh.geometry.userData.smoothed = true;
      }
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as MeshStandardMaterial[];
      for (const m of materials) {
        // Brow and lash cards break up into shards; hair cards are cut out, not blended (as the city's people are drawn).
        if (m.name.includes('eyebrow') || m.name.includes('eyelash')) mesh.visible = false;
        if (!m.transparent) continue;
        m.transparent = false;
        m.alphaTest = 0.5;
        m.depthWrite = true;
        m.needsUpdate = true;
      }
    });
    this.root = copy;
    this.mixer = new AnimationMixer(copy);
    for (const clip of ['idle', 'talk', 'cheer'] as const) {
      const found = AnimationClip.findByName(clips, clip);
      if (found != null) this.actions[clip] = this.mixer.clipAction(found);
    }
    this.play('idle');
  }

  /** What it does from now on (one clip runs into the next over a third of a second). */
  play(clip: ExtraClip): void {
    if (clip === this.playing) return;
    const next = this.actions[clip];
    if (next == null) return;
    const before = this.playing == null ? null : this.actions[this.playing];
    next.reset();
    next.setLoop(LoopRepeat, Infinity);
    next.fadeIn(0.3);
    next.play();
    if (before != null && before !== next) before.fadeOut(0.3);
    this.playing = clip;
  }

  update(delta: number): void {
    this.mixer.update(delta);
  }

  /** A little over the top of its head (world): where its words are shown. */
  over(out: Vector3): Vector3 {
    if (this.head == null) return this.root.getWorldPosition(out).setY(out.y + 1.95);
    this.head.getWorldPosition(out);
    out.y += 0.3;
    return out;
  }
}

const FIRE_PROPS = ['burlap_sack', 'pull_stake', 'hurricane_lantern', 'gold_brick_wall', 'street_lamp'] as const;
export type FireProp = (typeof FIRE_PROPS)[number];
let fireLoading: Promise<unknown> | null = null;

/** The modelled things of the forest and the cold fire (art/v2/nesne), loaded once; a file that is not there leaves the plain shape in its place. */
export function loadFireProps(): Promise<unknown> {
  fireLoading ??= Promise.all(FIRE_PROPS.map((name) => AssetManager.loadGLTF(`v2/nesne/${name}.glb`, `v2_fire_${name}`).catch(() => null)));
  return fireLoading;
}

/** A fresh copy of one of them, or of one node of it (which keeps its place in the file), or null. */
export function fireProp(name: FireProp, node?: string): Object3D | null {
  const scene = AssetManager.getGLTF(`v2_fire_${name}`)?.scene;
  const from = scene == null ? null : node == null ? scene : scene.getObjectByName(node);
  if (from == null) return null;
  const copy = from.clone(true);
  copy.traverse((o) => {
    o.pointerEvents = 'none';
    o.frustumCulled = false;
  });
  return copy;
}

let sunLight: DirectionalLight | null = null;

/**
 * The main scene's one sun (its key light). A night scene turns it down for
 * as long as it lasts and gives it back; it is never added or taken away,
 * so nothing is compiled again for it.
 */
export function keyLight(d: DirectorSystem): DirectionalLight | null {
  if (sunLight == null) {
    d.world.scene.traverse((o) => {
      if (sunLight == null && (o as DirectionalLight).isDirectionalLight === true) sunLight = o as DirectionalLight;
    });
  }
  return sunLight;
}
