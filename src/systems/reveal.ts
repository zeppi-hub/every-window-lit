import { createSystem, type Object3D, Vector3 } from '@iwsdk/core';
import { Choice, Phase, Week } from '../components.js';
import { solidarityOf } from '../season/store.js';
import { emitSignal } from '../signals.js';
import { GAUGES_FROM } from '../station/gauges.js';
import { type ChoiceStep, choiceStep, jarShown } from '../choice-moment.js';
import { setRevealed } from '../talk.js';

/** A thing that pops in grows from nothing over this long, overshooting a little. */
const POP_SECONDS = 0.45;
/** Hidden things that could be brushed and fire (the key to go down) are parked this far below the town. */
const PARKED = 200;

type When = (week: number, phase: string, choice: ChoiceStep) => boolean;

/** Phases after the choice: the jar stays from its step in the choice on, the sun from the landing on. */
const AFTER_CHOOSING: ReadonlySet<string> = new Set([Phase.Lowering, Phase.Landed, Phase.Days, Phase.Sunday]);
const FROM_LANDED: ReadonlySet<string> = new Set([Phase.Landed, Phase.Days, Phase.Sunday]);

/**
 * Whether a solidarity week has put the lamp and its matches away: from its
 * morning to its close, and on through its farewell until the next week's
 * morning (so the lamp does not pop back in as the shutters close).
 */
function lampAway(week: number, phase: string): boolean {
  return phase === Phase.Shut ? week > 1 && solidarityOf(week - 1) != null : solidarityOf(week) != null;
}

/**
 * One thing at a time (META_VR_DINAMIKLER.md, items 12, 18, 19): in the
 * very first week the sill starts almost bare (the latch, Tocco's door, the
 * nail), and each thing appears, with a soft sound, when the week reaches
 * it: the coin jar when the basket brings the choice, the sun once the
 * basket has gone down, the lamp on Sunday, the key to the stairs and the
 * spyglass from the second week, the gauges from the third; a solidarity
 * week has no lamp. In every week the three objects come and go with the
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
    // In the first week the jar comes at the choice's second step, after the card has been read (choice-moment.ts).
    add(['CoinJar'], (week, phase, choice) => week > 1 || AFTER_CHOOSING.has(phase) || jarShown(choice));
    add(['SunRail', 'SunKnob'], (week, phase) => week > 1 || FROM_LANDED.has(phase));
    // The glass carries the flame and its glow; its globe itself stays hidden until the third week (ToccoSystem). Not
    // in a solidarity week (no lamp, no answer): put away, out of a ray's reach, from its morning until the week after
    // it opens; a lamp lit the week before still burns down through that week's farewell.
    add(['SundayLamp', 'SundayLampGlass', 'Matchbox', 'Match'], (week, phase) => (week > 1 || phase === Phase.Sunday) && !lampAway(week, phase), true);
    add(['TowerKey'], (week) => week > 1, true);
    // The brass gauges from the third week's morning: the first weeks keep the sill to the week's few things.
    add(['Gauges'], (week, phase) => week > GAUGES_FROM || (week === GAUGES_FROM && phase !== Phase.Shut));
    add(['CrumbBag'], (week) => week > 1);
    add(['Spyglass'], (week) => week > 1, true);
    add(['Maquette', 'MaquetteHouse'], (week, phase) => week > 1 || FROM_LANDED.has(phase));
  }

  update(delta: number): void {
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    if (week == null) return;
    const n = week.getValue(Week, 'week') ?? 1;
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    const choice = choiceStep(n, phase, week.getValue(Week, 'timer') ?? 0, chosen, solidarityOf(n) != null);
    for (const item of this.items) {
      const shown = item.when(n, phase, choice);
      if (shown !== item.shown) {
        // A thing that appears while the Keeper is here pops in with a sound; at load everything just is.
        if (shown && item.shown === false) {
          item.pop = 0;
          // Its chime comes from the thing itself (SoundSystem).
          setRevealed(item.objects[0]);
          emitSignal('reveal');
        }
        item.shown = shown;
        item.objects.forEach((object, i) => {
          object.visible = shown;
          if (item.park && shown) object.position.y = item.homeY[i];
        });
      }
      // Put away, they stay parked whatever else moves them meanwhile (Start at week 1 sets the match back on its box,
      // PullHandleSystem): nothing hidden can be touched by a ray.
      if (item.park && !shown) for (let i = 0; i < item.objects.length; i += 1) item.objects[i].position.y = item.homeY[i] - PARKED;
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
