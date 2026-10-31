import { createSystem, type Mesh, type MeshBasicMaterial, type Object3D, type Points, type PointsMaterial } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { festivalLights } from '../season/model.js';
import { currentTown, SEASON_WEEKS } from '../season/store.js';
import { setFarLitShare } from '../station/far-city.js';
import { litShare, setLitShare } from '../station/materials.js';

let night = false;

/** Whether the season's last night is on (the last Sunday, lamp lit): the sound plays Dario's tune if the town earned it. */
export function festivalOn(): boolean {
  return night;
}

/** The share of windows lit on the last night, from the season's model. */
export function festivalShare(): number {
  return festivalLights(currentTown());
}

/**
 * The season's last night (META_VR_FIKIR.md §10): on the last Sunday,
 * once the lamp is lit, strings of bulbs light over the square and as many
 * of the town's windows light up as the season earned (the family helped
 * through hard weeks, builds working, coins kept). Closing the shutters
 * keeps the season; the next morning starts it again.
 */
export class FestivalSystem extends createSystem({
  week: { required: [Week] },
}) {
  private festival: Object3D | null = null;
  private bulbs: Mesh | null = null;
  private halos: Points | null = null;
  private pools: Mesh | null = null;
  private beam: Object3D | null = null;
  /** How far the night's lights have come up (0 to 1), over a couple of seconds. */
  private amount = 0;
  /** The town's own share of lit windows before the night, given back after it. */
  private before = 0.8;

  init(): void {
    this.festival = this.world.scene.getObjectByName('Festival') ?? null;
    const find = (name: string) => this.festival?.getObjectByName(name) ?? null;
    this.bulbs = find('FestivalBulbs') as Mesh | null;
    this.halos = find('FestivalHalos') as Points | null;
    this.pools = find('FestivalPools') as Mesh | null;
    this.beam = find('HarbourBeam');
  }

  update(delta: number): void {
    this.fade(delta);
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    if (week == null) return;
    const on =
      (week.getValue(Week, 'week') ?? 1) === SEASON_WEEKS && week.getValue(Week, 'phase') === Phase.Sunday && (week.getValue(Week, 'lamp') ?? false);
    if (on === night) return;
    night = on;
    // Never fewer windows than the week had: the night only adds light.
    if (on) this.before = litShare.value;
    const share = on ? Math.max(this.before, festivalShare()) : this.before;
    setLitShare(share);
    setFarLitShare(share);
  }

  /** The bulbs, their glow and the pools of light come up together over about two seconds; the harbour beam turns. */
  private fade(delta: number): void {
    const target = night ? 1 : 0;
    if (this.amount === target && !night) return;
    this.amount += (target - this.amount) * Math.min(1, delta * 1.6);
    if (Math.abs(target - this.amount) < 0.003) this.amount = target;
    const a = this.amount;
    if (this.festival != null) this.festival.visible = a > 0;
    (this.bulbs?.material as MeshBasicMaterial | undefined)?.color.setScalar(0.25 + 0.75 * a);
    const halos = this.halos?.material as PointsMaterial | undefined;
    if (halos != null) halos.opacity = 0.8 * a;
    const pools = this.pools?.material as MeshBasicMaterial | undefined;
    if (pools != null) pools.opacity = 0.32 * a;
    if (this.beam != null) this.beam.rotation.y += delta * 0.6;
  }
}
