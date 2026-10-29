import { type CanvasTexture, createSystem, type Entity, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, type Object3D } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { load, save, type Saved } from '../save.js';
import { onSignal } from '../signals.js';
import { drawLine } from '../station/family.js';
import { setRoomGlow } from '../station/materials.js';
import { NOTCHES, TOCCO_IN, TOCCO_OUT } from '../station/tocco.js';

/**
 * PLACEHOLDER until M3 brings the real weekly series: made-up changes in
 * mainland pump prices, per cent, one per week. Never shown as real data;
 * only the direction is used, to settle the Sunday calls.
 */
const PLACEHOLDER_CHANGES = [4.0, 1.2, -0.8, 2.3, -1.5, 0.6, -2.1, 1.8, 0.3, -0.9, 2.6, -1.1];

const CHOICE_LINES = [
  'Pumps full, road busy. It costs.',
  'Help where it hurts. Others notice.',
  'A tram pays later, not this week.',
] as const;
/** Seconds a line stays up, and the least it stays before the next one in line replaces it. */
const LINE_SECONDS = 7;
const MIN_SECONDS = 3.2;
/** Seconds Tocco takes to ride out or back, and how far his door swings. */
const RIDE_SECONDS = 0.8;
const DOOR_OPEN = -1.6;

/**
 * Tocco, the Keeper's wooden advisor and rival. He rides out of his door
 * when the shutters open and back in when they close, and says one short
 * line at each turn of the week: the bell, the choice, the basket going
 * down, Tessa's window, the evenings, Sunday. On Sunday two brass arrows
 * rise for the Keeper's call on next week's prices (Tocco makes his own),
 * and the lamp waits to be lit. Closing the shutters on Sunday keeps the
 * week; the next morning Tocco settles the calls and a notch is carved on
 * the jamb for each side that was right. Poke him to hear his line again.
 * Progress is saved in the browser (save.ts).
 */
export class ToccoSystem extends createSystem({
  week: { required: [Week] },
}) {
  private saved: Saved = load();
  private tocco: Object3D | null = null;
  private door: Object3D | null = null;
  private up: Object3D | null = null;
  private down: Object3D | null = null;
  private lamp: Mesh | null = null;
  private glass: Mesh | null = null;
  private notches: Object3D[] = [];
  private line: Object3D | null = null;
  private lineTexture: CanvasTexture | null = null;
  private text = '';
  private lineTimer = 0;
  private shownFor = 0;
  private lines: string[] = [];
  private out = 0;
  private glow = 0;
  private elapsed = 0;
  private lastPhase = '';
  private lastChosen = -1;
  private visitedHint = false;
  private toccoCall = 0;

  init(): void {
    const find = (name: string) => this.world.scene.getObjectByName(name) ?? null;
    this.tocco = find('Tocco');
    this.door = find('ToccoDoor');
    this.up = find('ArrowUp');
    this.down = find('ArrowDown');
    this.lamp = find('SundayLamp') as Mesh | null;
    this.glass = find('SundayLampGlass') as Mesh | null;
    this.line = find('ToccoLine');
    this.lineTexture = ((this.line as Mesh | null)?.material as MeshBasicMaterial | undefined)?.map as CanvasTexture | null;
    for (let row = 0; row < 2; row += 1) {
      for (let k = 0; k < NOTCHES; k += 1) {
        const notch = find(`Notch${row}${k}`);
        if (notch != null) this.notches.push(notch);
      }
    }
    this.carve();
    this.say('');
    // Open on the week the Keeper last kept.
    for (const week of this.queries.week.entities) week.setValue(Week, 'week', this.saved.week);

    this.cleanupFuncs.push(
      onSignal('tocco', () => {
        if (this.text !== '') this.show(this.text);
      }),
      onSignal('up', () => this.call(1)),
      onSignal('down', () => this.call(0)),
      onSignal('lamp', () => {
        const week = this.weekEntity();
        if (week == null || week.getValue(Week, 'phase') !== Phase.Sunday || week.getValue(Week, 'lamp')) return;
        week.setValue(Week, 'lamp', true);
        this.say('Close the shutters. Week kept.');
      }),
      onSignal('kept', () => this.keep()),
    );
  }

  update(delta: number): void {
    this.elapsed += delta;
    const week = this.weekEntity();
    if (week == null) return;
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    const open = week.getValue(Week, 'shuttersOpen') ?? false;
    const chosen = week.getValue(Week, 'chosen') ?? -1;
    if (phase !== this.lastPhase) {
      this.onPhase(week, phase, this.lastPhase);
      this.lastPhase = phase;
    }
    if (phase === Phase.Choosing && chosen !== this.lastChosen && chosen >= 0) this.say(CHOICE_LINES[chosen] ?? '');
    this.lastChosen = chosen;

    // Out with the shutters open, in once they close and he has had his say.
    const wantOut = open || (this.lineTimer > 0 && phase === Phase.Shut && this.text !== '');
    this.out += ((wantOut ? 1 : 0) - this.out) * Math.min(1, delta / (RIDE_SECONDS / 4));
    if (this.tocco != null) {
      this.tocco.position.x = TOCCO_IN.x + (TOCCO_OUT.x - TOCCO_IN.x) * this.out;
      this.tocco.position.y = TOCCO_OUT.y + (this.lineTimer > 0 ? 0.004 * Math.abs(Math.sin(this.elapsed * 9)) : 0);
    }
    if (this.door != null) this.door.rotation.y = DOOR_OPEN * Math.min(1, this.out * 3);

    if (this.lineTimer > 0) {
      this.lineTimer -= delta;
      this.shownFor += delta;
      const next = this.lines.length > 0 && this.shownFor >= MIN_SECONDS;
      if (next) this.show(this.lines.shift() ?? '');
      else if (this.lineTimer <= 0 && this.lineTexture != null) drawLine(this.lineTexture, '');
    }
    if (this.line != null) this.line.visible = this.out > 0.9 && this.lineTimer > 0;

    const sunday = phase === Phase.Sunday;
    const called = (week.getValue(Week, 'forecast') ?? -1) >= 0;
    if (this.up != null) this.up.visible = sunday;
    if (this.down != null) this.down.visible = sunday;
    const lit = week.getValue(Week, 'lamp') ?? false;
    this.glow += ((lit ? 1 : 0) - this.glow) * Math.min(1, delta * 2);
    setRoomGlow(this.glow);
    const glass = this.glass?.material as MeshBasicMaterial | undefined;
    if (glass != null) {
      glass.color.setRGB(0.6 + 0.4 * this.glow, 0.64 + 0.2 * this.glow, 0.66 - 0.2 * this.glow);
      glass.opacity = 0.35 + 0.55 * this.glow;
    }
    const pulse = 0.5 + 0.5 * Math.sin(this.elapsed * 3.2);
    shine(this.up as Mesh | null, sunday && !called ? pulse : 0);
    shine(this.down as Mesh | null, sunday && !called ? pulse : 0);
    shine(this.lamp, sunday && called && !lit ? pulse : 0);
  }

  private weekEntity(): Entity | null {
    for (const entity of this.queries.week.entities) return entity;
    return null;
  }

  private onPhase(week: Entity, phase: string, previous: string): void {
    const n = week.getValue(Week, 'week') ?? 1;
    switch (phase) {
      case Phase.Morning:
        if (previous === Phase.Shut) this.morning(n);
        break;
      case Phase.Bell:
        this.say("Hear the bell? Pull the rope.");
        break;
      case Phase.Choosing:
        this.say('Pick one, or send it empty.');
        break;
      case Phase.Lowering:
        this.say('Lean out. Watch it land.');
        break;
      case Phase.Landed:
        this.say("That's Tessa's window. Reach for it.");
        this.visitedHint = false;
        break;
      case Phase.Days:
        if (!this.visitedHint) this.say('Each notch is an evening.');
        this.visitedHint = true;
        break;
      case Phase.Sunday: {
        // Tocco's own call: right about two weeks in three.
        const actual = this.direction(n + 1);
        this.toccoCall = hash(n) < 0.66 ? actual : 1 - actual;
        this.say('Sunday. Prices next week: up or down?');
        this.say(this.toccoCall === 1 ? 'I say up.' : 'I say down.');
        break;
      }
      default:
        break;
    }
  }

  /** The morning greeting, and last Sunday's calls settled against the week now starting. */
  private morning(week: number): void {
    const pending = this.saved.pending;
    if (pending == null || pending.week !== week) {
      this.say(week === 1 ? "Morning, Keeper. The road's too quiet." : 'Morning, Keeper.');
      return;
    }
    const change = PLACEHOLDER_CHANGES[(week - 1) % PLACEHOLDER_CHANGES.length] ?? 0;
    const actual = change > 0 ? 1 : 0;
    const keeper = pending.call === actual;
    const tocco = pending.tocco === actual;
    if (keeper) this.saved.keeper += 1;
    if (tocco) this.saved.tocco += 1;
    this.saved.pending = null;
    save(this.saved);
    this.carve();
    this.say(`Morning. Prices went ${actual === 1 ? 'up' : 'down'}.`);
    this.say(pending.call < 0 ? (tocco ? 'I called it. A notch for me.' : 'Wrong, both of us. Next time.') : keeper && tocco ? 'We both called it.' : keeper ? 'You called it. A notch for you.' : tocco ? 'I called it. A notch for me.' : 'Wrong, both of us.');
  }

  private call(direction: number): void {
    const week = this.weekEntity();
    if (week == null || week.getValue(Week, 'phase') !== Phase.Sunday) return;
    week.setValue(Week, 'forecast', direction);
    this.say(`${direction === 1 ? 'Up' : 'Down'}, you say. Noted.`);
    this.say('Now light the lamp.');
  }

  /** The shutters closed on Sunday: remember the week and the calls for next morning. */
  private keep(): void {
    const week = this.weekEntity();
    if (week == null) return;
    const next = week.getValue(Week, 'week') ?? 1;
    const call = week.getValue(Week, 'forecast') ?? -1;
    week.setValue(Week, 'forecast', -1);
    this.saved.week = next;
    this.saved.pending = { week: next, call, tocco: this.toccoCall };
    save(this.saved);
    this.say(`Week ${next - 1} kept.`);
  }

  /** Up (1) or down (0) for a week's placeholder change. */
  private direction(week: number): number {
    return (PLACEHOLDER_CHANGES[(week - 1) % PLACEHOLDER_CHANGES.length] ?? 0) > 0 ? 1 : 0;
  }

  /** Queues a line; it shows once the one before has been up long enough. An empty line clears them all. */
  private say(text: string): void {
    if (text === '') {
      this.lines.length = 0;
      this.show('');
      return;
    }
    if (this.lineTimer > 0) this.lines.push(text);
    else this.show(text);
  }

  private show(text: string): void {
    this.text = text;
    this.lineTimer = text === '' ? 0 : LINE_SECONDS;
    this.shownFor = 0;
    if (this.lineTexture != null) drawLine(this.lineTexture, text);
  }

  private carve(): void {
    this.notches.forEach((notch, index) => {
      const row = Math.floor(index / NOTCHES);
      const k = index % NOTCHES;
      notch.visible = k < (row === 0 ? this.saved.keeper : this.saved.tocco);
    });
  }
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function shine(mesh: Mesh | null, amount: number): void {
  const material = mesh?.material as MeshStandardMaterial | undefined;
  if (material?.emissive == null) return;
  material.emissive.setRGB(0.32 * amount, 0.24 * amount, 0.1 * amount);
}
