import type { World } from '@iwsdk/core';
import { CARD_NOTES, CARD_TITLE, DEV_KEYS, devAction } from './dev-keys.js';
import { emitSignal } from './signals.js';
import { stance } from './stance.js';
import { BasketSystem } from './systems/basket.js';
import { ChoiceSystem } from './systems/choice.js';
import { WalkSystem } from './systems/walk.js';

/**
 * Dev server only (index.ts imports this module only there, so none of it
 * ships): the 2D page's "Emulator controls" card, and the keyboard
 * shortcuts it lists (dev-keys.ts), for testing in the desktop emulator,
 * where reaching the latch with an emulated hand is slow.
 */

/**
 * The card on the 2D page: how Play mode plays the game, and the shortcuts,
 * which skip the gestures. In a corner, folded to its title in a small
 * window so it never covers the page (a click on the title opens it).
 */
export function showEmulatorCard(): void {
  const landing = document.getElementById('landing');
  if (landing == null || document.getElementById('emulator-card') != null) return;
  const card = document.createElement('details');
  card.id = 'emulator-card';
  card.open = window.innerWidth >= 1100 && window.innerHeight >= 700;
  card.style.cssText =
    'position:fixed;left:12px;bottom:12px;max-width:21em;padding:8px 12px;border-radius:10px;background:rgba(20,18,16,0.86);' +
    'color:#f6ecd9;font:12px/1.35 system-ui,sans-serif;text-align:left;z-index:2;max-height:calc(100vh - 24px);overflow:auto;';
  const title = document.createElement('summary');
  title.style.cssText = 'cursor:pointer;font-weight:600;';
  title.textContent = `${CARD_TITLE} (dev server only)`;
  card.append(title);
  for (const note of CARD_NOTES) {
    const p = document.createElement('p');
    p.style.margin = '5px 0';
    p.textContent = note;
    card.append(p);
  }
  const list = document.createElement('dl');
  list.style.cssText = 'display:grid;grid-template-columns:max-content 1fr;gap:1px 10px;margin:5px 0 0;';
  for (const k of DEV_KEYS) {
    const name = document.createElement('dt');
    name.style.fontWeight = '600';
    name.textContent = k.key;
    const does = document.createElement('dd');
    does.style.margin = '0';
    does.textContent = k.does;
    list.append(name, does);
  }
  card.append(list);
  landing.append(card);
}

/** The shortcuts: each key press carries out its action (dev-keys.ts DEV_KEYS). */
export function wireDevKeys(world: World): void {
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const action = devAction(event.code, event.shiftKey);
    if (action == null) return;
    switch (action) {
      case 'stairs':
        emitSignal(stance() === 'seat' ? 'descend' : 'ascend');
        break;
      case 'turnLeft':
        world.getSystem(WalkSystem)?.snapTurn(-1);
        break;
      case 'turnRight':
        world.getSystem(WalkSystem)?.snapTurn(1);
        break;
      case 'choose0':
      case 'choose1':
      case 'choose2':
        world.getSystem(ChoiceSystem)?.devTap(Number(action.slice(-1)));
        break;
      case 'skipWeek':
        world.getSystem(BasketSystem)?.devSkipWeek();
        break;
      default:
        emitSignal(action);
    }
  });
}
