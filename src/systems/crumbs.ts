import { createSystem, type Object3D } from '@iwsdk/core';
import { Week } from '../components.js';
import { solidarityOf } from '../season/store.js';
import { onSignal } from '../signals.js';
import { stance } from '../stance.js';
import { PIGEON_SPOTS } from '../station/crumbs.js';
import { LifeSystem } from './life.js';

/** How long crumbs lie on the sill, and how soon the bag can be shaken again. */
const CRUMBS_LAST = 28;
const AGAIN = 35;

/**
 * The bag of crumbs (station/crumbs.ts): touched while the shutters are
 * open, it scatters crumbs on the sill and calls the pigeons in through the
 * window (LifeSystem.feedAtSill); they peck until a hand comes near. A
 * harmless bit of play, not part of the week; not in a solidarity week.
 */
export class CrumbsSystem extends createSystem({
  week: { required: [Week] },
}) {
  private crumbs: Object3D | null = null;
  private left = 0;
  private again = 0;

  init(): void {
    this.crumbs = this.world.scene.getObjectByName('Crumbs') ?? null;
    this.cleanupFuncs.push(
      onSignal('crumbs', () => this.scatter()),
      onSignal('restart', () => this.restart()),
    );
  }

  /** The season starts over from the start page: no crumbs left on the sill, and the bag ready for the next. */
  restart(): void {
    this.left = 0;
    this.again = 0;
    if (this.crumbs != null) this.crumbs.visible = false;
  }

  update(delta: number): void {
    this.again -= delta;
    if (this.left > 0) {
      this.left -= delta;
      if (this.left <= 0 && this.crumbs != null) this.crumbs.visible = false;
    }
  }

  private scatter(): void {
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    // From the second week, when the bag is on the sill (RevealSystem).
    if (week == null || this.again > 0 || stance() !== 'seat' || (week.getValue(Week, 'week') ?? 1) < 2) return;
    if (!(week.getValue(Week, 'shuttersOpen') ?? false) || solidarityOf(week.getValue(Week, 'week') ?? 1) != null) return;
    this.again = AGAIN;
    this.left = CRUMBS_LAST;
    if (this.crumbs != null) this.crumbs.visible = true;
    this.world.getSystem(LifeSystem)?.feedAtSill(PIGEON_SPOTS);
  }
}
