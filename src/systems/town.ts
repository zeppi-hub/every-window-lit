import { createSystem, type InstancedMesh } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { EASE, EMPTY, levels, type RealWeek, type Tier, type Town } from '../season/model.js';
import { currentTown, realWeek } from '../season/store.js';
import { setFarLitShare } from '../station/far-city.js';
import { setLitShare } from '../station/materials.js';
import {
  BIKE_HOME,
  BIKES_SHOWN,
  CAR_HOME,
  CAR_SOLIDS,
  CARS_SHOWN,
  CRATES_FULL,
  CRATES_PER_STALL,
  HIDDEN,
  LIT_SHARE,
  PARASOL_HOME,
  PRODUCE_HOME,
  showFirst,
  STALL_COUNT,
  STALLS_OPEN,
} from '../station/reactions.js';
import { SOLID } from '../station/town.js';
import { OUTCOME_DAY } from './outcomes.js';

/**
 * The square reads the week: for the week's kind, at its pressure once the
 * Keeper's choice has had its effect (season/model.ts levels()), the cars
 * along the kerb and the bicycles in the rack (fuel), how many windows
 * light up in the evening (power), and the market stalls' crates (food).
 * Easing the price shows from the evening its outcome arrives; until then
 * the town shows the week as it came. The other kinds stay calm, except
 * the market while a big fuel week works through.
 */
export class TownSystem extends createSystem({
  week: { required: [Week] },
}) {
  private cars: InstancedMesh[] = [];
  private bikes: InstancedMesh[] = [];
  private produce: InstancedMesh | null = null;
  private parasols: InstancedMesh[] = [];
  private shown = { fuel: 99, power: 99, food: 99 };
  private real: RealWeek | null = null;
  private town: Town | null = null;
  private arrived = false;

  init(): void {
    const scene = this.world.scene;
    const collect = (prefix: string): InstancedMesh[] => {
      const found: InstancedMesh[] = [];
      scene.traverse((object) => {
        if ((object as InstancedMesh).isInstancedMesh && object.name.startsWith(prefix)) found.push(object as InstancedMesh);
      });
      return found;
    };
    this.cars = collect('TrafficCar');
    this.bikes = collect('RackBike');
    this.parasols = collect('StallParasol');
    this.produce = collect('StallProduce')[0] ?? null;
  }

  update(): void {
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    if (week == null) return;
    const real = realWeek(week.getValue(Week, 'week') ?? 1);
    if (real == null) return;
    const phase = week.getValue(Week, 'phase');
    const chosen = week.getValue(Week, 'chosen') ?? EMPTY;
    const day = week.getValue(Week, 'day') ?? -1;
    // The choice takes effect from the evening its outcome arrives; only easing changes the week's pressure.
    const arrived = (phase === Phase.Days || phase === Phase.Sunday) && chosen === EASE && day >= (OUTCOME_DAY[EASE] ?? 7);
    const town = currentTown();
    // The reading changes only with the week, the town or easing arriving; nothing is worked out in between.
    if (real === this.real && town === this.town && arrived === this.arrived) return;
    this.real = real;
    this.town = town;
    this.arrived = arrived;
    const shown = levels(real, town, arrived ? EASE : EMPTY);
    if (shown.fuel !== this.shown.fuel) this.traffic(shown.fuel);
    if (shown.power !== this.shown.power) {
      setLitShare(LIT_SHARE[shown.power]);
      setFarLitShare(LIT_SHARE[shown.power]);
    }
    if (shown.food !== this.shown.food) this.market(shown.food);
    this.shown = shown;
  }

  private traffic(tier: Tier): void {
    const cars = CARS_SHOWN[tier];
    showFirst(this.cars, cars, CAR_HOME);
    showFirst(this.bikes, BIKES_SHOWN[tier], BIKE_HOME);
    CAR_SOLIDS.forEach((solid, index) => {
      const at = SOLID.indexOf(solid);
      if (index < cars && at < 0) SOLID.push(solid);
      if (index >= cars && at >= 0) SOLID.splice(at, 1);
    });
  }

  /** Stalls close from the right; the open ones keep produce in some of their crates, spread along the table. */
  private market(tier: Tier): void {
    const open = STALLS_OPEN[tier];
    showFirst(this.parasols, open, PARASOL_HOME);
    const produce = this.produce;
    if (produce == null) return;
    const full = Math.round(CRATES_FULL[tier] * CRATES_PER_STALL);
    for (let s = 0; s < STALL_COUNT; s += 1) {
      for (let c = 0; c < CRATES_PER_STALL; c += 1) {
        const i = s * CRATES_PER_STALL + c;
        // Emptied in the order 5, 2, 3, 0, 4, 1 so the gaps spread across the table.
        const filled = s < open && FILLING_ORDER.indexOf(c) < full;
        produce.setMatrixAt(i, filled ? PRODUCE_HOME(i) : HIDDEN);
      }
    }
    produce.instanceMatrix.needsUpdate = true;
  }
}

const FILLING_ORDER = [1, 4, 0, 3, 2, 5];
