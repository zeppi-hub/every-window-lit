import type { World } from '@iwsdk/core';
import { MemoryPortalSystem } from './memory-portal-system.js';
import { MiniGameSystem } from './minigame-system.js';
import { ParrotSystem } from './parrot-system.js';
import { PathHandleSystem } from './path-handle-system.js';
import { QuakeSystem } from './quake-system.js';
import { WingHandsSystem } from './wing-hands-system.js';
import { DeskHandsSystem } from '../systems/desk-hands-system.js';

/**
 * The new version's systems. Each acts only on what the new scenes give it
 * (running mini games, entities with its components), so the current game
 * runs unchanged beside them until the new scenes replace it.
 */
export function registerV2(world: World): void {
  world.registerSystem(MiniGameSystem);
  world.registerSystem(PathHandleSystem);
  world.registerSystem(MemoryPortalSystem);
  world.registerSystem(QuakeSystem);
  world.registerSystem(ParrotSystem);
  world.registerSystem(WingHandsSystem);
  // The desktop emulator's hands follow the mouse (dev server only, never a headset's browser).
  const emulated = (window as { __IWSDK_EMULATION_PROFILE?: { runtime?: string | null } }).__IWSDK_EMULATION_PROFILE?.runtime === 'IWER';
  if (import.meta.env.DEV && emulated) world.registerSystem(DeskHandsSystem);
}
