import { createSystem, type Object3D, Vector3 } from '@iwsdk/core';
import { v2Targets } from './step-targets.js';

/**
 * A stand-in for the headset we do not have (dev server only). It cannot
 * say how the game runs on a Quest; it measures the things a Quest is
 * known to be short of and the things a seated, hands-only player needs,
 * and writes them to the console as "[quest] …" lines:
 *
 * - load: draw calls and triangles per frame (both eyes, as the emulator
 *   draws them), textures and geometries held, against the budgets below;
 * - frame time: average and worst over the window (only meaningful when
 *   this computer is not busy with something else);
 * - reach: every hand target the scene sets, where it is from the eye,
 *   and whether a seated arm gets there;
 * - comfort: any stretch where the player is carried fast, and any turn
 *   of the player by the game (which must never happen).
 */

/** Budgets per frame, both eyes together. Green is safe; over amber is expected to drop frames on a Quest 3. */
export const QUEST_BUDGET = {
  drawsGreen: 150,
  drawsAmber: 250,
  trianglesGreen: 400_000,
  trianglesAmber: 600_000,
  /** 72 Hz leaves 13.9 ms a frame. */
  frameMs: 13.9,
} as const;

/** A seated arm from the eye: this far out (m), and between these heights from the eye (m). */
const REACH = { out: 0.68, up: 0.25, down: -0.6 } as const;
/** Carried faster than this (m/s) for longer than this (s) is a comfort risk without a narrowed view. */
const FAST = { speed: 3, seconds: 0.3 } as const;
/** How often a line is written (s). */
const WINDOW = 5;

const verdict = (value: number, green: number, amber: number): string => (value <= green ? 'green' : value <= amber ? 'amber' : 'RED');

export class QuestProbeSystem extends createSystem({}) {
  private clock = 0;
  private frames = 0;
  private sumMs = 0;
  private worstMs = 0;
  private overFrames = 0;
  private maxDraws = 0;
  private maxTriangles = 0;
  private last = 0;
  private seen: readonly Object3D[] = [];
  private readonly head = new Vector3();
  private readonly at = new Vector3();
  private readonly before = new Vector3();
  private placed = false;
  private fastFor = 0;
  private fastTop = 0;
  private yaw = 0;

  update(delta: number): void {
    if (!this.renderer.xr.isPresenting) return;
    const now = performance.now();
    const ms = this.last === 0 ? 0 : now - this.last;
    this.last = now;
    // The last frame's totals (the renderer clears them when it begins the next).
    const drawn = this.renderer.info.render;
    this.maxDraws = Math.max(this.maxDraws, drawn.calls);
    this.maxTriangles = Math.max(this.maxTriangles, drawn.triangles);
    if (ms > 0 && ms < 1000) {
      this.frames += 1;
      this.sumMs += ms;
      this.worstMs = Math.max(this.worstMs, ms);
      if (ms > QUEST_BUDGET.frameMs * 1.5) this.overFrames += 1;
    }
    this.player.head.getWorldPosition(this.head);
    this.comfort(delta);
    this.reach();
    this.clock += delta;
    if (this.clock < WINDOW) return;
    const memory = this.renderer.info.memory;
    const avg = this.frames > 0 ? this.sumMs / this.frames : 0;
    console.info(
      `[quest] load draws ${this.maxDraws} (${verdict(this.maxDraws, QUEST_BUDGET.drawsGreen, QUEST_BUDGET.drawsAmber)}) triangles ${Math.round(this.maxTriangles / 1000)}k (${verdict(this.maxTriangles, QUEST_BUDGET.trianglesGreen, QUEST_BUDGET.trianglesAmber)}) textures ${memory.textures} geometries ${memory.geometries} | frame avg ${avg.toFixed(1)} ms worst ${this.worstMs.toFixed(0)} ms slow ${this.overFrames}/${this.frames} (this computer, not a Quest)`,
    );
    this.clock = 0;
    this.frames = 0;
    this.sumMs = 0;
    this.worstMs = 0;
    this.overFrames = 0;
    this.maxDraws = 0;
    this.maxTriangles = 0;
  }

  /** Being carried: how fast, for how long; and whether the game turned the player. */
  private comfort(delta: number): void {
    if (!this.placed) {
      this.before.copy(this.head);
      this.yaw = this.player.rotation.y;
      this.placed = true;
      return;
    }
    const speed = delta > 0 ? this.before.distanceTo(this.head) / delta : 0;
    this.before.copy(this.head);
    // A jump of many metres in one frame is a cut (a fade and a new place), not a ride.
    if (speed > FAST.speed && speed < 60) {
      this.fastFor += delta;
      this.fastTop = Math.max(this.fastTop, speed);
    } else {
      if (this.fastFor >= FAST.seconds) console.info(`[quest] comfort carried at up to ${this.fastTop.toFixed(1)} m/s for ${this.fastFor.toFixed(1)} s (needs a narrowed view, and a fade with less motion)`);
      this.fastFor = 0;
      this.fastTop = 0;
    }
    const turned = Math.abs(Math.atan2(Math.sin(this.player.rotation.y - this.yaw), Math.cos(this.player.rotation.y - this.yaw)));
    if (turned > 0.02 && speed < 60 && speed > 0.001) console.info(`[quest] comfort the player was turned ${((turned * 180) / Math.PI).toFixed(0)} degrees while moving (never turn the view)`);
    this.yaw = this.player.rotation.y;
  }

  /** Each time the scene sets new hand targets: where they are from the eye, and whether a seated arm reaches. */
  private reach(): void {
    const targets = v2Targets();
    if (targets === this.seen) return;
    this.seen = targets;
    for (const target of targets) {
      target.getWorldPosition(this.at);
      const out = Math.hypot(this.at.x - this.head.x, this.at.z - this.head.z);
      const up = this.at.y - this.head.y;
      const ok = out <= REACH.out && up <= REACH.up && up >= REACH.down;
      console.info(`[quest] reach ${target.name === '' ? 'target' : target.name}: ${out.toFixed(2)} m out, ${up >= 0 ? '+' : ''}${up.toFixed(2)} m from the eye: ${ok ? 'in a seated reach' : out > 1.2 ? 'far (pointed at, not touched)' : 'OUT of a seated reach'}`);
    }
  }
}
