import type { World } from '@iwsdk/core';
import { MiniGameSystem } from './minigame-system.js';

/**
 * The new version's systems. Each acts only on what the new scenes give it
 * (running mini games, entities with its components), so the current game
 * runs unchanged beside them until the new scenes replace it.
 */
export function registerV2(world: World): void {
  world.registerSystem(MiniGameSystem);
}
