import { createSystem, type Object3D } from '@iwsdk/core';
import { Week } from '../components.js';
import { type Kind, SCAFFOLD, WORKING } from '../season/model.js';
import { currentTown } from '../season/store.js';
import { TRAM_SOLIDS } from '../station/builds.js';
import { WORKS_SOLID } from '../station/outcomes.js';
import { type Box, SOLID } from '../station/town.js';

const KINDS: readonly Kind[] = ['fuel', 'power', 'food'];
/** How fast the roof turbines turn, radians per second. */
const SPIN = 1.6;

/**
 * Shows each build at its stage as the week begins (season/model.ts):
 * scaffolding from the week after it was chosen, working three weeks
 * after, and nothing before. The tram's scaffolding is the works on the
 * square; once it runs, the Keeper cannot walk through the tram or its
 * shelter. The roof turbines turn while they work.
 */
export class BuildSystem extends createSystem({
  week: { required: [Week] },
}) {
  private stages: Record<Kind, { scaffold: Object3D | null; working: Object3D | null }> = {
    fuel: { scaffold: null, working: null },
    power: { scaffold: null, working: null },
    food: { scaffold: null, working: null },
  };
  private rotors: Object3D[] = [];
  private shown: Record<Kind, number> = { fuel: -1, power: -1, food: -1 };

  init(): void {
    const find = (name: string) => this.world.scene.getObjectByName(name) ?? null;
    this.stages = {
      fuel: { scaffold: find('OutcomeWorks'), working: find('BuildTram') },
      power: { scaffold: find('BuildMasts'), working: find('BuildTurbines') },
      food: { scaffold: find('BuildGardenFrame'), working: find('BuildGarden') },
    };
    for (let i = 0; ; i += 1) {
      const rotor = find(`TurbineRotor${i}`);
      if (rotor == null) break;
      this.rotors.push(rotor);
    }
  }

  update(delta: number): void {
    const builds = currentTown().builds;
    for (const kind of KINDS) {
      const stage = builds[kind];
      if (stage === this.shown[kind]) continue;
      this.shown[kind] = stage;
      const { scaffold, working } = this.stages[kind];
      if (scaffold != null) scaffold.visible = stage === SCAFFOLD;
      if (working != null) working.visible = stage === WORKING;
      if (kind === 'fuel') {
        solid([WORKS_SOLID], stage === SCAFFOLD);
        solid(TRAM_SOLIDS, stage === WORKING);
      }
    }
    if (builds.power === WORKING) for (const rotor of this.rotors) rotor.rotation.z += SPIN * delta;
  }
}

/** Keeps the walk out of these boxes, or lets it back in. */
function solid(boxes: readonly Box[], on: boolean): void {
  for (const box of boxes) {
    const at = SOLID.indexOf(box);
    if (on && at < 0) SOLID.push(box);
    if (!on && at >= 0) SOLID.splice(at, 1);
  }
}
