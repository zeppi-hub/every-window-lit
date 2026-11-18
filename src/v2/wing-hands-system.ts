import { AnimatedHand, createSystem, Group, type Object3D, type SkinnedMesh } from '@iwsdk/core';
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
const drawn = new Set<{ hand: Object3D | null; feathers: Object3D[] }>();

class WingHand extends AnimatedHand {
  init(): void {
    const mesh = this.model.getObjectByProperty('type', 'SkinnedMesh') as SkinnedMesh | undefined;
    const feathers: Object3D[] = [];
    for (const [joint, long, colour] of FINGERS) {
      const at = this.model.getObjectByName(joint);
      if (at == null) continue;
      const holder = new Group();
      // A joint looks along its finger down -z, the back of the hand up +y: the feather's tip that way, lying on top.
      holder.rotation.y = -Math.PI / 2;
      holder.position.y = 0.006;
      const feather = featherMesh(colour, long, 0.034);
      feather.rotation.x = -Math.PI / 2;
      feather.pointerEvents = 'none';
      holder.add(feather);
      at.add(holder);
      feathers.push(holder);
    }
    const wrist = this.model.getObjectByName('wrist');
    if (wrist != null) {
      for (const [turn, long] of [[-0.5, 0.09], [0, 0.11], [0.5, 0.09]] as const) {
        const holder = new Group();
        holder.rotation.y = -Math.PI / 2 + turn;
        holder.position.set(0, 0.012, -0.02);
        const feather = featherMesh(0xd8281c, long, 0.05);
        feather.rotation.x = -Math.PI / 2;
        feather.pointerEvents = 'none';
        holder.add(feather);
        wrist.add(holder);
        feathers.push(holder);
      }
    }
    if (mesh != null) mesh.frustumCulled = false;
    drawn.add({ hand: mesh ?? null, feathers });
    if (import.meta.env.DEV) console.info(`[wing hands] ${feathers.length} feathers on a hand`);
  }
}

/** While the player is shown herself from outside (the first seconds), her own hands are not drawn at all. */
let unseen = false;
export function hideHands(on: boolean): void {
  unseen = on;
}

export class WingHandsSystem extends createSystem({}) {
  init(): void {
    const adapters = this.input.xr.visualAdapters;
    for (const side of ['left', 'right'] as const) adapters.hand[side].updateVisualImplementation(WingHand);
  }

  update(): void {
    const keeper = wingStowed();
    for (const d of drawn) {
      if (d.hand != null) d.hand.visible = keeper && !unseen;
      for (const f of d.feathers) f.visible = !keeper && !unseen;
    }
  }
}
