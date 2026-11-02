import { AnimatedController, AnimatedHand, createSystem, type Material, type Mesh, MeshStandardMaterial, type SkinnedMesh } from '@iwsdk/core';
import { stance } from '../stance.js';
import { hintPinch } from '../talk.js';
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
/** Each controller's trigger, in a copy of the controller's material of its own: it glows while the ghost hand shows a pinch. */
const triggers = new Set<MeshStandardMaterial>();
/** The trigger's glow at full (warm, like the sill's other invitations, strong enough on dark plastic). */
const TRIGGER_GLOW = [0.85, 0.6, 0.22] as const;

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

/**
 * The controller as it is, with the coat's cuff behind it where the wrist
 * would be. Its trigger wears a copy of the controller's material, so it
 * alone can glow when the ghost hand shows a pinch (the trigger is the
 * controller's pinch). The controller is drawn in one batch per material,
 * so that copy costs one draw call per controller.
 */
class KeeperController extends AnimatedController {
  init(): void {
    this.markTrigger();
    super.init();
    const cuff = createCuff('KeeperCuff');
    cuff.material = cuffMaterial(outside);
    cuffs.add(cuff);
    cuff.position.set(0, -0.03, 0.05);
    cuff.rotation.x = CONTROLLER_FOREARM;
    this.model.add(cuff);
  }

  /** Gives the trigger's meshes (the input profile's select component) one material copy of their own, before the model is batched. */
  private markTrigger(): void {
    const trigger = this.layout.components[this.layout.selectComponentId];
    const pressed = Object.values(trigger?.visualResponses ?? {}).find((response) => response.componentProperty === 'button');
    const node = this.model.getObjectByName(pressed?.valueNodeName ?? trigger?.rootNodeName ?? '');
    let copy: MeshStandardMaterial | null = null;
    node?.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material) || !(mesh.material instanceof MeshStandardMaterial)) return;
      copy ??= (mesh.material as MeshStandardMaterial).clone();
      mesh.material = copy as Material;
    });
    if (copy != null) {
      // Its own glow is added to whatever the material already gave off.
      (copy as MeshStandardMaterial).userData.restEmissive = (copy as MeshStandardMaterial).emissive.toArray();
      triggers.add(copy);
    }
    if (import.meta.env.DEV) console.info(`[hands] controller trigger ${copy != null ? `marked (${node?.name})` : 'not found: no glow'}`);
  }
}

/**
 * These hands are mine (META_VR_DINAMIKLER.md item 15): there is no cursor,
 * only the Keeper's own hands in one neutral colour, the coat's navy cuffs
 * at the wrists; with controllers, the cuffs sit behind them. In the tower
 * they are lit like the room; down on the square, by the sun like the street.
 */
export class KeeperHandsSystem extends createSystem({}) {
  /** How strongly the triggers glow now. */
  private glow = 0;

  update(): void {
    // With controllers, the trigger glows while the ghost hand shows a pinch.
    const glow = hintPinch();
    if (glow !== this.glow) {
      this.glow = glow;
      for (const material of triggers) {
        const rest = material.userData.restEmissive as number[];
        material.emissive.setRGB(rest[0] + TRIGGER_GLOW[0] * glow, rest[1] + TRIGGER_GLOW[1] * glow, rest[2] + TRIGGER_GLOW[2] * glow);
      }
    }
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
