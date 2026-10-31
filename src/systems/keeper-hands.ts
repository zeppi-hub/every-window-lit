import { AnimatedController, AnimatedHand, createSystem, type Mesh, MeshStandardMaterial, type SkinnedMesh } from '@iwsdk/core';
import { stance } from '../stance.js';
import { createCuff, cuffMaterial } from '../station/cuff.js';
import { interior, outdoors } from '../station/materials.js';

/** The forearm's direction in a controller's grip frame, whose z runs along the handle: back toward the Keeper, tipped toward the handle's foot (radians about x). */
const CONTROLLER_FOREARM = Math.PI / 2 - 0.5;

/** One neutral colour for both hands. */
const SKIN = 0xb5ada3;
const skins: { inside: MeshStandardMaterial | null; outside: MeshStandardMaterial | null } = { inside: null, outside: null };
/** Whether the Keeper is down on the square, lit by the sun, rather than in the tower room. */
let outside = false;
/** Every hand and cuff drawn, to relight them when the Keeper goes down or comes back. */
const hands = new Set<Mesh>();
const cuffs = new Set<Mesh>();

function skinMaterial(): MeshStandardMaterial {
  if (outside) return (skins.outside ??= outdoors(new MeshStandardMaterial({ color: SKIN, roughness: 0.7 })));
  return (skins.inside ??= interior(SKIN, 0.7));
}

/** A hand drawn solid in that colour (in place of the outline), with the coat's cuff at the wrist. */
class KeeperHand extends AnimatedHand {
  init(): void {
    const mesh = this.model.getObjectByProperty('type', 'SkinnedMesh') as SkinnedMesh | undefined;
    if (mesh == null) return;
    mesh.frustumCulled = false;
    mesh.material = skinMaterial();
    hands.add(mesh);
    const cuff = createCuff('KeeperCuff');
    cuff.material = cuffMaterial(outside);
    cuffs.add(cuff);
    this.model.getObjectByName('wrist')?.add(cuff);
  }
}

/** The controller as it is, with the coat's cuff behind it where the wrist would be. */
class KeeperController extends AnimatedController {
  init(): void {
    super.init();
    const cuff = createCuff('KeeperCuff');
    cuff.material = cuffMaterial(outside);
    cuffs.add(cuff);
    cuff.position.set(0, -0.03, 0.05);
    cuff.rotation.x = CONTROLLER_FOREARM;
    this.model.add(cuff);
  }
}

/**
 * These hands are mine (META_VR_DINAMIKLER.md item 15): there is no cursor,
 * only the Keeper's own hands in one neutral colour, the coat's navy cuffs
 * at the wrists; with controllers, the cuffs sit behind them. In the tower
 * they are lit like the room; down on the square, by the sun like the street.
 */
export class KeeperHandsSystem extends createSystem({}) {
  update(): void {
    const now = stance() === 'walk';
    if (now === outside) return;
    outside = now;
    const skin = skinMaterial();
    const wool = cuffMaterial(outside);
    for (const mesh of hands) mesh.material = skin;
    for (const mesh of cuffs) mesh.material = wool;
  }

  init(): void {
    const adapters = this.input.xr.visualAdapters;
    for (const side of ['left', 'right'] as const) {
      adapters.hand[side].updateVisualImplementation(KeeperHand);
      adapters.controller[side].updateVisualImplementation(KeeperController);
    }
  }
}
