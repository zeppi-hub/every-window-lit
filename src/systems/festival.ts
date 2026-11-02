import { createSystem, type Mesh, type MeshBasicMaterial, type Object3D, type Points, type PointsMaterial, Vector3 } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import { festivalLights } from '../season/model.js';
import { currentTown, SEASON_WEEKS } from '../season/store.js';
import { setFarLitShare } from '../station/far-city.js';
import { litShare, setLitShare } from '../station/materials.js';
import { emitSignal, onSignal } from '../signals.js';
import { stance } from '../stance.js';

/** Beats it takes to light the night's windows; the shortest gap between two (slow, like a waltz); seconds without one before the rest light by themselves. */
const BEATS = 6;
/** The share of windows still lit while the town waits for the first beat. */
const WAITING = 0.08;
const MIN_BEAT = 0.6;
const ON_THEIR_OWN = 12;
/** How far a hand comes down, then back up, for a beat (m): a gentle wrist and forearm, never a fast arm. */
const BEAT_DOWN = 0.06;
const BEAT_UP = 0.03;

let night = false;
let lit = false;

/** Whether the season's last night is on (the last Sunday, lamp lit): the sound plays Dario's tune if the town earned it. */
export function festivalOn(): boolean {
  return night;
}

/** Whether the last night's windows have all come on (conducted, or lit by themselves). */
export function festivalLit(): boolean {
  return night && lit;
}

/** Whether the Keeper is conducting the last night's windows now (Tocco shows the beat). */
export function conducting(): boolean {
  return night && !lit;
}

/** The share of windows lit on the last night, from the season's model. */
export function festivalShare(): number {
  return festivalLights(currentTown());
}

/**
 * The season's last night (META_VR_FIKIR.md §10): on the last Sunday,
 * once the lamp is lit, strings of bulbs light over the square and as many
 * of the town's windows light up as the season earned (the family helped
 * through hard weeks, builds working, coins kept). As the lamp lights, the
 * town's windows go dark, waiting; the Keeper conducts them on
 * (META_VR_DINAMIKLER.md item 4): each slow beat of a hand, down then up,
 * lights the next part of them with a note; left alone, the rest come on
 * by themselves. Closing the shutters keeps the season; the next
 * morning starts it again.
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
  private beamTime = 0;
  /** The town's own share of lit windows before the night, given back after it. */
  private before = 0.8;
  /** The share the night ends on, and the beats given so far. */
  private target = 0.8;
  private beats = 0;
  private sinceBeat = 0;
  /** Per tracked hand point (left and right index tips, then grips): its highest point since the last beat, and its lowest after coming down. */
  private top = [0, 0, 0, 0];
  private low = [0, 0, 0, 0];
  private down = [false, false, false, false];
  private point = new Vector3();
  /** The shutters were tried: the rest of the windows come on now, a little faster. */
  private hurried = false;
  private stanceWas = '';

  init(): void {
    this.cleanupFuncs.push(
      onSignal('hurry', () => {
        this.hurried = true;
      }),
      onSignal('restart', () => this.restart()),
    );
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
    if (on !== night) {
      night = on;
      lit = false;
      if (on) {
        // Never fewer windows than the week had: the night only adds light.
        this.before = litShare.value;
        this.target = Math.max(this.before, festivalShare());
        this.beats = 0;
        this.sinceBeat = 0;
        this.hurried = false;
        this.resetHands();
        this.show(WAITING);
      } else {
        setLitShare(this.before);
        setFarLitShare(this.before);
      }
    }
    if (night && !lit) this.conduct(delta);
  }

  /**
   * The season starts over from the start page: a last night still on (the
   * Keeper left before closing its shutters) is over at once, the town's
   * windows back to their share before it, its lights out.
   */
  restart(): void {
    if (night) {
      setLitShare(this.before);
      setFarLitShare(this.before);
    }
    night = false;
    lit = false;
    this.hurried = false;
    this.beats = 0;
    this.sinceBeat = 0;
    this.fade(10);
  }

  /** Beats light the windows a part at a time; with no beat for a while, the rest come on by themselves. */
  private conduct(delta: number): void {
    this.sinceBeat += delta;
    // Going down to the square or back moves the whole rig: start the beat afresh rather than count the jump.
    const now = stance();
    if (now !== this.stanceWas) {
      this.stanceWas = now;
      this.resetHands();
    }
    if (!this.hurried && this.sinceBeat > MIN_BEAT && this.beat()) {
      this.beats += 1;
      this.sinceBeat = 0;
      emitSignal('beat');
      if (import.meta.env.DEV) console.info('[festival] beat', this.beats, 'of', BEATS);
      // Each beat lights another sixth, on from wherever the windows are (never fewer).
      const share = Math.min(this.target, litShare.value + (this.target - WAITING) / BEATS);
      this.show(share);
      if (this.target - share < 0.005) this.finish();
      return;
    }
    if (this.sinceBeat < ON_THEIR_OWN && !this.hurried) return;
    // Left alone (or hurried by the shutters): the rest of the windows come up over a few seconds.
    const share = litShare.value + (this.target - litShare.value) * Math.min(1, delta * (this.hurried ? 2.5 : 0.8));
    this.show(share);
    if (this.target - share < 0.005) this.finish();
  }

  private show(share: number): void {
    setLitShare(share);
    setFarLitShare(share);
  }

  private finish(): void {
    this.show(this.target);
    lit = true;
    emitSignal('lit');
    if (import.meta.env.DEV) console.info('[festival] lit', this.target.toFixed(2), 'after', this.beats, 'beats');
  }

  /** A slow beat from any hand: down by BEAT_DOWN from its highest point, then back up by BEAT_UP. */
  private beat(): boolean {
    let struck = false;
    const spaces = this.player;
    for (let i = 0; i < 4; i += 1) {
      const side = i % 2 === 0 ? 'left' : 'right';
      // Heights in the rig's own frame, so a move of the whole rig is never a beat.
      (i < 2 ? spaces.indexTipSpaces[side] : spaces.gripSpaces[side]).getWorldPosition(this.point);
      const y = this.player.worldToLocal(this.point).y;
      if (!this.down[i]) {
        if (y > this.top[i]) this.top[i] = y;
        else if (this.top[i] - y >= BEAT_DOWN) {
          this.down[i] = true;
          this.low[i] = y;
        }
      } else if (y < this.low[i]) {
        this.low[i] = y;
      } else if (y - this.low[i] >= BEAT_UP) {
        struck = true;
      }
    }
    if (struck) this.resetHands();
    return struck;
  }

  private resetHands(): void {
    for (let i = 0; i < 4; i += 1) {
      const side = i % 2 === 0 ? 'left' : 'right';
      (i < 2 ? this.player.indexTipSpaces[side] : this.player.gripSpaces[side]).getWorldPosition(this.point);
      this.top[i] = this.player.worldToLocal(this.point).y;
      this.down[i] = false;
    }
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
    // Back and forth over the open sea to the west, never over the town or toward the tower.
    this.beamTime += delta;
    if (this.beam != null) this.beam.rotation.y = Math.PI + 0.9 * Math.sin(this.beamTime * 0.3);
  }
}
