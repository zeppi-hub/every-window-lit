import type { World } from '@iwsdk/core';
import { inEmulator, KeyBadgeSystem } from './dev-badges.js';
import { BADGES_NOTE, CARD_KEYS, CARD_NOTES, CARD_TITLE, devAction } from './dev-keys.js';
import { badgesShown, toggleBadges } from './key-badges.js';
import { emitSignal } from './signals.js';
import { stance } from './stance.js';
import { BasketSystem } from './systems/basket.js';
import { ChoiceSystem } from './systems/choice.js';
import { WalkSystem } from './systems/walk.js';

/**
 * Dev server only (index.ts imports this module only there, so none of it
 * ships): the 2D page's "Emulator controls" card, and the keyboard
 * shortcuts it lists (dev-keys.ts), for testing in the desktop emulator,
 * where reaching the latch with an emulated hand is slow; and in the
 * emulator, each step's key on a badge beside its instruction
 * (dev-badges.ts), with one line on the 2D page saying so.
 */

/**
 * The card on the 2D page: how Play mode plays the game, and the shortcuts,
 * which skip the gestures. In a corner, folded to its title in a small
 * window so it never covers the page (a click on the title opens it).
 */
export function showEmulatorCard(): void {
  const landing = document.getElementById('landing');
  if (landing == null || document.getElementById('emulator-card') != null) return;
  // Under the five points, where the eye goes before Enter VR: the badges, and the key that hides them.
  if (inEmulator()) {
    const note = document.createElement('p');
    note.id = 'badges-note';
    note.className = 'hook';
    note.style.textWrap = 'balance';
    note.textContent = BADGES_NOTE;
    landing.querySelector('.how')?.after(note);
  }
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
  for (const k of CARD_KEYS) {
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

/** The emulator's two controllers, as its injected script leaves them on the window (IWER, in the emulator only). */
function emulatedControllers(): { connected: boolean }[] {
  const device = (window as { IWER_DEVICE?: { controllers?: { left?: { connected: boolean }; right?: { connected: boolean } } } }).IWER_DEVICE;
  return [device?.controllers?.left, device?.controllers?.right].filter((c) => c != null);
}

function controllersOn(): boolean {
  return emulatedControllers().some((c) => c.connected);
}

/** The emulator's own panels for them, hidden while they are away. */
const hiddenPanels = new Set<HTMLElement>();
let controllersAway = false;

/** Each panel, in the emulator's shadow root, is found by its disconnect button: the widest thing round it that is still a panel's width. */
function hidePanels(): void {
  for (const host of document.querySelectorAll('div')) {
    if (host.shadowRoot == null) continue;
    for (const button of host.shadowRoot.querySelectorAll<HTMLElement>('[title^="Click to disconnect"]')) {
      if (button.getBoundingClientRect().width === 0) continue;
      let panel = button;
      while (panel.parentElement != null && panel.parentElement.getBoundingClientRect().width < 320) panel = panel.parentElement;
      panel.style.display = 'none';
      hiddenPanels.add(panel);
    }
  }
}

/** Connected, each draws a model and gizmos over the view, and its panel covers the sill's ends. */
function setControllers(on: boolean): void {
  controllersAway = !on;
  for (const controller of emulatedControllers()) controller.connected = on;
  if (on) {
    for (const panel of hiddenPanels) panel.style.display = '';
    hiddenPanels.clear();
  } else hidePanels();
  console.info(`[keys] the emulator's controllers ${on ? 'back (Y)' : 'put away'}`);
}

/** The shortcuts: each key press carries out its action (dev-keys.ts DEV_KEYS); and the badges that show them. */
export function wireDevKeys(world: World): void {
  world.registerSystem(KeyBadgeSystem);
  // The keys play every step: the emulator's controllers stay away until Y asks for them.
  if (inEmulator()) {
    setControllers(false);
    // Its panels mount later, and again when its interface redraws.
    window.setInterval(() => {
      if (controllersAway) hidePanels();
    }, 500);
  }
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const action = devAction(event.code, event.shiftKey, event.metaKey || event.ctrlKey || event.altKey);
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
      case 'badges':
        toggleBadges(() => window.localStorage);
        console.info(`[badges] ${badgesShown() ? 'shown' : 'hidden'} (H)`);
        break;
      case 'controllers':
        setControllers(!controllersOn());
        break;
      default:
        emitSignal(action);
    }
  });
}
