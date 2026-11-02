import { createSystem, type Object3D, Vector3 } from '@iwsdk/core';
import { Choice, Phase, Week } from '../components.js';
import { solidarityOf } from '../season/store.js';
import { emitSignal } from '../signals.js';
import { GAUGES_FROM } from '../station/gauges.js';
import { type ChoiceStep, choiceStep, jarShown } from '../choice-moment.js';
import { familyVisited, setRevealed } from '../talk.js';
import { sunShown } from '../line-queue.js';

/** A thing that pops in grows from nothing over this long, overshooting a little. */
const POP_SECONDS = 0.45;
/** Hidden things that could be brushed and fire (the key to go down) are parked this far below the town. */
const PARKED = 200;

type When = (week: number, phase: string, choice: ChoiceStep, sun: boolean, was: boolean) => boolean;

/** Phases after the choice: the jar stays from its step in the choice on. */
const AFTER_CHOOSING: ReadonlySet<string> = new Set([Phase.Lowering, Phase.Landed, Phase.Days, Phase.Sunday]);
/** The little model of the square comes with the landing (in the first week the family is found on it). */
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
 * it: the coin jar when the basket brings the choice, the little model as
 * the basket lands, the sun once the family has had its turn, the lamp on
 * Sunday, the key to the stairs and the
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
  /** The family's box: in the first week the sun waits until it is home again. */
  private box: Object3D | null = null;

  init(): void {
    const find = (name: string) => this.world.scene.getObjectByName(name) ?? null;
    this.box = find('FamilyBox');
    const add = (names: readonly string[], when: When, park = false) => {
      const objects = names.map(find).filter((o): o is Object3D => o != null);
      if (objects.length > 0) this.items.push({ objects, when, park, shown: null, pop: POP_SECONDS, homeY: objects.map((o) => o.position.y) });
    };
    // In the first week the jar comes at the choice's second step, after the card has been read (choice-moment.ts).
    add(['CoinJar'], (week, phase, choice) => week > 1 || AFTER_CHOOSING.has(phase) || jarShown(choice));
    // In the first week the sun comes once the family has had its turn (line-queue.ts sunShown), with its chime from
    // the sun itself; once there it stays, the family's box called back meanwhile or not. Put away until then, out of a
    // hand's reach (it lies along the sill's near edge, where hands rest).
    add(['SunKnob', 'SunRail'], (_week, phase, _choice, sun, was) => sun || (was && phase === Phase.Landed), true);
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
    const timer = week.getValue(Week, 'timer') ?? 0;
    const choice = choiceStep(n, phase, timer, chosen, solidarityOf(n) != null);
    const sun = sunShown(n, phase, phase === Phase.Landed ? timer : 0, familyVisited(), this.box?.visible ?? false);
    for (const item of this.items) {
      const shown = item.when(n, phase, choice, sun, item.shown === true);
      if (shown !== item.shown) {
        const appears = shown && item.shown === false;
        item.shown = shown;
        item.objects.forEach((object, i) => {
          object.visible = shown;
          if (item.park && shown) object.position.y = item.homeY[i];
        });
        // A thing that appears while the Keeper is here pops in with a sound; at load everything just is.
        if (appears) {
          item.pop = 0;
          // Its chime comes from the thing itself, where it now stands (SoundSystem).
          setRevealed(item.objects[0]);
          emitSignal('reveal');
        }
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
