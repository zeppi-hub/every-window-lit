import { createSystem } from '@iwsdk/core';
import { onSignal, type SignalName } from '../signals.js';

/** How strongly (0 to 1) and how long (ms) each moment is felt in a controller. */
const FEEL: ReadonlyArray<readonly [SignalName, number, number]> = [
  ['latch', 0.5, 40],
  ['rope', 0.6, 50],
  ['lower', 0.7, 70],
  ['strike', 0.5, 120],
  ['lamp', 0.4, 60],
  ['coin', 0.35, 30],
  ['knock', 0.4, 30],
  ['up', 0.3, 25],
  ['down', 0.3, 25],
  ['window', 0.4, 50],
];

/**
 * The game is played with bare hands, which feel nothing; a player using
 * controllers instead (they work too) feels a short buzz at each moment of
 * touch: the latch, a haul on the rope, the brake, the match, a coin, a
 * knock on the glass. Hands are skipped; no source, no buzz.
 */
export class HapticsSystem extends createSystem({}) {
  init(): void {
    this.cleanupFuncs.push(...FEEL.map(([signal, strength, ms]) => onSignal(signal, () => this.buzz(strength, ms))));
  }

  private buzz(strength: number, ms: number): void {
    const session = this.renderer.xr.getSession();
    if (session == null) return;
    for (const source of session.inputSources) {
      if (source.hand != null || source.gamepad == null) continue;
      const pad = source.gamepad as Gamepad & {
        hapticActuators?: ReadonlyArray<{ pulse?: (value: number, duration: number) => Promise<boolean> }>;
      };
      const rumble = pad.vibrationActuator as (GamepadHapticActuator & { playEffect?: (type: string, params: object) => Promise<unknown> }) | null | undefined;
      if (rumble?.playEffect != null) {
        void rumble.playEffect('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength }).catch(() => undefined);
      } else {
        void pad.hapticActuators?.[0]?.pulse?.(strength, ms)?.catch(() => undefined);
      }
    }
  }
}
