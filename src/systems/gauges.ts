import { createSystem, type Object3D } from '@iwsdk/core';
import { Phase, Week } from '../components.js';
import type { Kind } from '../season/model.js';
import { realWeek } from '../season/store.js';
import { emitSignal, onSignal } from '../signals.js';
import { GAUGE_KINDS, needleAngle } from '../station/gauges.js';

/** How stiff and how damped the needles' spring is: a quick swing with one small overshoot. */
const STIFF = 60;
const DAMP = 9;

/**
 * Swings the sill's brass dials (station/gauges.ts). Each shows the last
 * real week of its kind the Keeper has seen; the week's own dial swings to
 * its new reading as the shutters open on the morning, with a tick.
 */
export class GaugeSystem extends createSystem({
  week: { required: [Week] },
}) {
  private needles: Array<Object3D | null> = [];
  private angle: number[] = [0, 0, 0];
  private speed: number[] = [0, 0, 0];
  private target: number[] = [0, 0, 0];
  private key = '';

  init(): void {
    this.needles = GAUGE_KINDS.map((kind) => this.world.scene.getObjectByName(`GaugeNeedle_${kind}`) ?? null);
    const calm = needleAngle(0);
    this.angle = [calm, calm, calm];
    this.target = [calm, calm, calm];
    this.cleanupFuncs.push(onSignal('restart', () => this.restart()));
  }

  /** The season starts over from the start page: the dials read the new season at once, as at load, without a click. */
  restart(): void {
    this.key = '';
    this.speed.fill(0);
  }

  update(delta: number): void {
    let week = null;
    for (const entity of this.queries.week.entities) week = entity;
    if (week == null) return;
    const n = week.getValue(Week, 'week') ?? 1;
    const phase = week.getValue(Week, 'phase') ?? Phase.Shut;
    // This week's reading counts from its morning; before that the dials show the weeks before.
    const upTo = phase === Phase.Shut ? n - 1 : n;
    const key = `${upTo}`;
    if (key !== this.key) {
      const first = this.key === '';
      this.key = key;
      const last: Partial<Record<Kind, number>> = {};
      for (let k = 1; k <= upTo; k += 1) {
        const real = realWeek(k);
        if (real != null) last[real.kind] = real.tier;
      }
      let moved = false;
      GAUGE_KINDS.forEach((kind, i) => {
        const next = needleAngle(last[kind] ?? 0);
        if (Math.abs(next - this.target[i]) > 1e-4) moved = true;
        this.target[i] = next;
        // At load the dials simply read what they read.
        if (first) this.angle[i] = next;
      });
      if (moved && !first) emitSignal('gauge');
    }
    for (let i = 0; i < 3; i += 1) {
      const pull = (this.target[i] - this.angle[i]) * STIFF - this.speed[i] * DAMP;
      this.speed[i] += pull * delta;
      this.angle[i] += this.speed[i] * delta;
      const needle = this.needles[i];
      if (needle != null) needle.rotation.z = -this.angle[i];
    }
  }
}
