import { AnimatedController, AnimatedHand, createSystem, type MeshStandardMaterial, type SkinnedMesh } from '@iwsdk/core';
import { createCuff } from '../station/cuff.js';
import { interior } from '../station/materials.js';

/** The forearm's direction in a controller's grip frame, whose z runs along the handle: back toward the Keeper, tipped toward the handle's foot (radians about x). */
const CONTROLLER_FOREARM = Math.PI / 2 - 0.5;

/** One neutral colour for both hands, lit like the room. */
let skin: MeshStandardMaterial | null = null;

/** A hand drawn solid in that colour (in place of the outline), with the coat's cuff at the wrist. */
class KeeperHand extends AnimatedHand {
  init(): void {
    const mesh = this.model.getObjectByProperty('type', 'SkinnedMesh') as SkinnedMesh | undefined;
    if (mesh == null) return;
    mesh.frustumCulled = false;
    skin ??= interior(0xb5ada3, 0.7);
    mesh.material = skin;
    this.model.getObjectByName('wrist')?.add(createCuff('KeeperCuff'));
  }
}

/** The controller as it is, with the coat's cuff behind it where the wrist would be. */
class KeeperController extends AnimatedController {
  init(): void {
    super.init();
    const cuff = createCuff('KeeperCuff');
    cuff.position.set(0, -0.03, 0.05);
    cuff.rotation.x = CONTROLLER_FOREARM;
    this.model.add(cuff);
  }
}

/**
 * These hands are mine (META_VR_DINAMIKLER.md item 15): there is no cursor,
 * only the Keeper's own hands in one neutral colour, the coat's navy cuffs
 * at the wrists; with controllers, the cuffs sit behind them.
 */
export class KeeperHandsSystem extends createSystem({}) {
  init(): void {
    const adapters = this.input.xr.visualAdapters;
    for (const side of ['left', 'right'] as const) {
      adapters.hand[side].updateVisualImplementation(KeeperHand);
      adapters.controller[side].updateVisualImplementation(KeeperController);
    }
  }
}
