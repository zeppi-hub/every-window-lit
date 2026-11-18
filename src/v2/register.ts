import type { World } from '@iwsdk/core';
import { GoalSystem } from './goal-system.js';
import { MemoryPortalSystem } from './memory-portal-system.js';
import { MiniGameSystem } from './minigame-system.js';
import { ParrotSystem } from './parrot-system.js';
import { PathHandleSystem } from './path-handle-system.js';
import { QuakeSystem } from './quake-system.js';
import { QuestProbeSystem } from './quest-probe.js';
import { DIAGNOSTICS } from './diagnostics.js';
import { WingHandsSystem } from './wing-hands-system.js';
import { DeskHandsSystem } from '../systems/desk-hands-system.js';

/**
 * The new version's systems. Each acts only on what the new scenes give it
 * (running mini games, entities with its components), so the current game
 * runs unchanged beside them until the new scenes replace it.
 */
/** Whether this page runs in IWER, the browser's XR emulator (the same check the dev badges make; kept here so this module loads nothing of theirs). */
function inEmulator(): boolean {
  return (window as { __IWSDK_EMULATION_PROFILE?: { runtime?: string | null } }).__IWSDK_EMULATION_PROFILE?.runtime === 'IWER';
}

export function registerV2(world: World): void {
  world.registerSystem(MiniGameSystem);
  world.registerSystem(PathHandleSystem);
  world.registerSystem(MemoryPortalSystem);
  world.registerSystem(QuakeSystem);
  world.registerSystem(ParrotSystem);
  world.registerSystem(WingHandsSystem);
  world.registerSystem(GoalSystem);
  // The stand-in for a headset: budgets, reach and comfort written to the console (dev server only, when asked for: diagnostics.ts).
  if (DIAGNOSTICS) world.registerSystem(QuestProbeSystem);
  // The desktop emulator's hands follow the mouse (dev server only).
  if (import.meta.env.DEV && inEmulator()) world.registerSystem(DeskHandsSystem);
}
