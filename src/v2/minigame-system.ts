import { createSystem, VisibilityState } from '@iwsdk/core';
import { pinchPoint } from '../systems/pinch-reach.js';
import { runningGames } from './minigame.js';

const SIDES = ['left', 'right'] as const;

/**
 * Steps the mini games being played (minigame.ts) every frame, paused
 * while the headset is off or blurred (a system menu over it), or while no
 * hand or controller is tracked: a hand lost for a moment never costs the
 * player their stage's time.
 */
export class MiniGameSystem extends createSystem({}) {
  update(delta: number): void {
    const games = runningGames();
    if (games.size === 0) return;
    const paused = this.paused();
    for (const game of games) game.update(delta, paused);
  }

  private paused(): boolean {
    if (this.world.visibilityState.peek() !== VisibilityState.Visible) return true;
    const xr = this.input.xr;
    for (const side of SIDES) {
      if (pinchPoint(side) != null) return false;
      if (xr.isPrimary('controller', side)) return false;
    }
    return true;
  }
}
