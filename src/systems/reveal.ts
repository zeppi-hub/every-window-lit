import { createSystem, type Object3D, Vector3 } from '@iwsdk/core';
import { Choice, Phase, Week } from '../components.js';
import { emitSignal } from '../signals.js';

/** A thing that pops in grows from nothing over this long, overshooting a little. */
const POP_SECONDS = 0.45;
/** Hidden things that could be brushed and fire (the key to go down) are parked this far below the town. */
const PARKED = 200;

type When = (week: number, phase: string) => boolean;

/** Phases from the basket's arrival on: the jar matters from the choice on, the sun from the landing on. */
const FROM_CHOOSING: ReadonlySet<string> = new Set([Phase.Choosing, Phase.Lowering, Phase.Landed, Phase.Days, Phase.Sunday]);
const FROM_LANDED: ReadonlySet<string> = new Set([Phase.Landed, Phase.Days, Phase.Sunday]);

/**
 * One thing at a time (META_VR_DINAMIKLER.md, items 12, 18, 19): in the
 * very first week the sill starts almost bare (the latch, Tocco's door, the
 * nail), and each thing appears, with a soft sound, when the week reaches
 * it: the coin jar when the basket brings the choice, the sun once the
 * basket has gone down, the lamp on Sunday, the key to the stairs from the
 * second week. In every week the three objects come and go with the
 * basket, so the sill never holds more than the moment needs.
 */
export class RevealSystem extends createSystem({
  week: { required: [Week] },
  choices: { required: [Choice] },
}) {
  private items: Array<{ objects: Object3D[]; when: When; park: boolean; shown: boolean | null; pop: number; homeY: number[] }> = [];
  private readonly one = new Vector3(1, 1, 1);

  init(): void {
    const find = (name: string) => this.world.scene.getObjectByName(name) ?? null;
    const add = (names: readonly string[], when: When, park = false) => {
      const objects = names.map(find).filter((o): o is Object3D => o != null);
      if (objects.length > 0) this.items.push({ objects, when, park, shown: null, pop: POP_SECONDS, homeY: objects.map((o) => o.position.y) });
    };
    add(['CoinJar'], (week, phase) => week > 1 || FROM_CHOOSING.has(phase));
    add(['SunRail', 'SunKnob'], (week, phase) => week > 1 || FROM_LANDED.has(phase));
    add(['SundayLamp', 'SundayLampGlass', 'Matchbox', 'Match'], (week, phase) => week > 1 || phase === Phase.Sunday);
    add(['TowerKey'], (week) => week > 1, true);
    add(['Gauges'], (week, phase) => week > 1 || phase !== Phase.Shut);
    add(['CrumbBag'], (week) => week > 1);
    add(['Maquette', 'MaquetteHouse'], (week, phase) => week > 1 || FROM_LANDED.has(phase));
  }

  update(delta: number): void {
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    if (week == null) return;
    const n = week.getValue(Week, 'week') ?? 1;
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    for (const item of this.items) {
      const shown = item.when(n, phase);
      if (shown !== item.shown) {
        // A thing that appears while the Keeper is here pops in with a sound; at load everything just is.
        if (shown && item.shown === false) {
          item.pop = 0;
          emitSignal('reveal');
        }
        item.shown = shown;
        item.objects.forEach((object, i) => {
          object.visible = shown;
          if (item.park) object.position.y = item.homeY[i] - (shown ? 0 : PARKED);
        });
      }
      if (item.pop < POP_SECONDS) {
        item.pop += delta;
        const t = Math.min(1, item.pop / POP_SECONDS);
        // Ease out with a small overshoot.
        const s = 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
        for (const object of item.objects) object.scale.setScalar(Math.max(0.01, s));
        if (t >= 1) for (const object of item.objects) object.scale.copy(this.one);
      }
    }
    // The three objects: with the basket while it waits on the sill, and the chosen one while it rides down and sits on the square.
    const withBasket = phase === Phase.Rising || phase === Phase.Choosing;
    const riding = phase === Phase.Lowering || phase === Phase.Landed || phase === Phase.Days || phase === Phase.Sunday;
    for (const entity of this.queries.choices.entities) {
      const object = entity.object3D;
      if (object == null) continue;
      const index = entity.getValue(Choice, 'index') ?? 0;
      object.visible = withBasket || (riding && index === chosen);
    }
  }
}
