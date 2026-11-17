/**
 * The way into a memory and back (META_VR_V2_TASARIM.md, "Geçişler"): the
 * orb held up to the face grows round the head until all is white, the
 * world is swapped behind the white, and the white opens on the memory.
 * Leaving either cuts on the move (the hand stays where it is, the world
 * changes: no curtain at all) or fades through white the same way.
 * With Less motion the orb does not grow at you: the white simply fades in
 * and out, a little quicker.
 *
 * Pure timing: PortalTimeline says how far the orb has grown round the head
 * (0..1) and how white it is (0..1), and calls `swap` once, at full white.
 */
export const GROW_SECONDS = 0.6;
export const WHITE_SECONDS = 0.2;
export const OPEN_SECONDS = 0.5;
/** With Less motion, and for a fade on the way out: the white fades in this long (s). */
export const FADE_SECONDS = 0.35;

export type PortalPhase = 'idle' | 'closing' | 'white' | 'opening';

export class PortalTimeline {
  phase: PortalPhase = 'idle';
  /** How far the orb has grown round the head (1: all round it). */
  grown = 0;
  /** How white the view is. */
  white = 0;
  private t = 0;
  private growing = true;
  private calm = false;
  private swap: (() => void) | null = null;

  get busy(): boolean {
    return this.phase !== 'idle';
  }

  /** Into a memory: the orb grows round the head (or, `calm`, the white fades in), `swap` at full white, then it opens. */
  enter(calm: boolean, swap: () => void): void {
    this.begin(!calm, calm, swap);
  }

  /** Out through white: a fade in (no orb growing), `swap`, and open. */
  leave(calm: boolean, swap: () => void): void {
    this.begin(false, calm, swap);
  }

  update(dt: number): void {
    if (this.phase === 'idle') return;
    this.t += dt;
    if (this.phase === 'closing') {
      const length = this.growing ? GROW_SECONDS : FADE_SECONDS;
      const k = Math.min(1, this.t / length);
      if (this.growing) {
        this.grown = ease(k);
        this.white = 0.25 + 0.75 * ease(k);
      } else {
        this.grown = 1;
        this.white = ease(k);
      }
      if (k >= 1) this.next('white');
      return;
    }
    if (this.phase === 'white') {
      if (this.t >= WHITE_SECONDS) this.next('opening');
      return;
    }
    const k = Math.min(1, this.t / (this.calm ? FADE_SECONDS : OPEN_SECONDS));
    this.white = 1 - ease(k);
    if (k >= 1) this.next('idle');
  }

  private begin(growing: boolean, calm: boolean, swap: () => void): void {
    if (this.busy) return;
    this.growing = growing;
    this.calm = calm;
    this.swap = swap;
    this.grown = growing ? 0 : 1;
    this.white = 0;
    this.next('closing');
  }

  private next(phase: PortalPhase): void {
    this.phase = phase;
    this.t = 0;
    if (phase === 'white') {
      this.grown = 1;
      this.white = 1;
      const swap = this.swap;
      this.swap = null;
      swap?.();
    }
    if (phase === 'idle') {
      this.white = 0;
      this.grown = 0;
    }
  }
}

function ease(k: number): number {
  return k * k * (3 - 2 * k);
}
