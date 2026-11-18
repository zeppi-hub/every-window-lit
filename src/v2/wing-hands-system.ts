import { AnimatedHand, Color, createSystem, Group, InstancedMesh, Matrix4, Object3D, type SkinnedMesh, Vector3 } from '@iwsdk/core';
import { featherMesh, wingStowed } from './parrot-system.js';

/**
 * The player's hands in the city are a bird's wing tips: no hand is drawn;
 * a long feather lies along each finger from its knuckle (thumb and
 * forefinger the longest, so a pinch is two feathers closing like
 * tweezers) and a tuft of small ones covers the back of the hand. Inside a
 * memory the player is its keeper, and the hand itself is drawn instead.
 */
const FINGERS: readonly [string, number, number][] = [
  ['thumb-phalanx-proximal', 0.11, 0x2a66c4],
  ['index-finger-phalanx-proximal', 0.14, 0x2a66c4],
  ['middle-finger-phalanx-proximal', 0.12, 0x2f6fd0],
  ['ring-finger-phalanx-proximal', 0.1, 0xe9c63a],
  ['pinky-finger-phalanx-proximal', 0.08, 0xd8281c],
];
const drawn = new Set<{ hand: Object3D | null }>();
/**
 * Where each feather lies (a point on its joint, scaled to its size) and its
 * colour. The feathers of both hands are drawn as one instanced mesh, so
 * sixteen feathers cost one draw instead of sixteen.
 */
const slots: { at: Object3D; colour: Color }[] = [];
/** A feather's place on its joint: along the finger, lying on top, `long` by `wide`. */
function featherSlot(holder: Object3D, colour: number, long: number, wide: number): void {
  const at = new Object3D();
  at.position.x = -long / 2;
  at.rotation.x = -Math.PI / 2;
  at.scale.set(long, wide, 1);
  holder.add(at);
  slots.push({ at, colour: new Color(colour) });
}

class WingHand extends AnimatedHand {
  init(): void {
    const mesh = this.model.getObjectByProperty('type', 'SkinnedMesh') as SkinnedMesh | undefined;
    let count = 0;
    for (const [joint, long, colour] of FINGERS) {
      const at = this.model.getObjectByName(joint);
      if (at == null) continue;
      const holder = new Group();
      // A joint looks along its finger down -z, the back of the hand up +y: the feather's tip that way, lying on top.
      holder.rotation.y = -Math.PI / 2;
      holder.position.y = 0.006;
      at.add(holder);
      featherSlot(holder, colour, long, 0.034);
      count += 1;
    }
    const wrist = this.model.getObjectByName('wrist');
    if (wrist != null) {
      wrists.push(wrist);
      for (const [turn, long] of [[-0.5, 0.09], [0, 0.11], [0.5, 0.09]] as const) {
        const holder = new Group();
        holder.rotation.y = -Math.PI / 2 + turn;
        holder.position.set(0, 0.012, -0.02);
        wrist.add(holder);
        featherSlot(holder, 0xd8281c, long, 0.05);
        count += 1;
      }
    }
    if (mesh != null) mesh.frustumCulled = false;
    drawn.add({ hand: mesh ?? null });
    if (import.meta.env.DEV) console.info(`[wing hands] ${count} feathers on a hand`);
  }
}

/** The wrist joints of the hands as they are drawn (one for each hand model made so far). */
const wrists: Object3D[] = [];
const wristPlace = new Vector3();

/**
 * The drawn hand's own wrist joint nearest to a point (a hand's grip), or
 * null when no hand model is there. A sleeve that ends at this joint meets
 * the hand; one that ends at the grip does not, by a few centimetres.
 */
export function wristJoint(near: Vector3): Object3D | null {
  let best: Object3D | null = null;
  let reach = 0.25;
  for (const joint of wrists) {
    const away = joint.getWorldPosition(wristPlace).distanceTo(near);
    if (away < reach) {
      reach = away;
      best = joint;
    }
  }
  return best;
}

/** While the player is shown herself from outside (the first seconds), her own hands are not drawn at all. */
let unseen = false;
export function hideHands(on: boolean): void {
  unseen = on;
}

/** Enough for both hands, and for a hand model made again. */
const MOST = 48;

export class WingHandsSystem extends createSystem({}) {
  private feathers!: InstancedMesh;
  private readonly toRig = new Matrix4();
  private readonly place = new Matrix4();

  init(): void {
    const adapters = this.input.xr.visualAdapters;
    for (const side of ['left', 'right'] as const) adapters.hand[side].updateVisualImplementation(WingHand);
    // One unit feather (the feather picture, white so each instance's colour shows) for all of them.
    const unit = featherMesh(0xffffff, 1, 1);
    this.feathers = new InstancedMesh(unit.geometry, unit.material, MOST);
    this.feathers.name = 'WingFeathers';
    this.feathers.count = 0;
    this.feathers.frustumCulled = false;
    this.feathers.pointerEvents = 'none';
    // Kept in the rig's own frame, so when the rig is carried later in the frame the feathers go with the hands.
    this.player.add(this.feathers);
  }

  update(): void {
    const keeper = wingStowed();
    for (const d of drawn) if (d.hand != null) d.hand.visible = keeper && !unseen;
    const show = !keeper && !unseen;
    this.feathers.visible = show;
    if (!show) return;
    this.player.updateWorldMatrix(true, false);
    this.toRig.copy(this.player.matrixWorld).invert();
    let n = 0;
    for (const slot of slots) {
      if (n >= MOST) break;
      // Only a feather whose hand is drawn now: every holder up to the scene visible.
      let up: Object3D | null = slot.at.parent;
      let seen = true;
      while (up != null && up !== this.world.scene) {
        if (!up.visible) {
          seen = false;
          break;
        }
        up = up.parent;
      }
      if (!seen || up == null) continue;
      slot.at.updateWorldMatrix(true, false);
      this.place.multiplyMatrices(this.toRig, slot.at.matrixWorld);
      this.feathers.setMatrixAt(n, this.place);
      this.feathers.setColorAt(n, slot.colour);
      n += 1;
    }
    this.feathers.count = n;
    this.feathers.instanceMatrix.needsUpdate = true;
    if (this.feathers.instanceColor != null) this.feathers.instanceColor.needsUpdate = true;
  }
}
