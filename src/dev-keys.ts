/**
 * The dev server's keyboard shortcuts for the desktop emulator (IWER, the
 * browser's XR emulator), and what its "Emulator controls" card on the 2D
 * page says (Devir 1b item 12). Only the dev server loads this, through
 * dev-tools.ts; nothing of it ships. Free of imports, so `node --test`
 * loads it as it is.
 *
 * No shortcut shares a key with the emulator's own Play mode, which moves
 * the headset with W, A, S and D (and Shift with them) and presses the
 * controllers' buttons with Q, E, R, F, X, Z and others (EMULATOR_KEYS):
 * the rope is P, Nora's window is I, and the week is skipped with 0.
 *
 * In the emulator each step's key shows beside its instruction, as a small
 * badge (key-badges.ts); H hides the badges and shows them again.
 */

/** What a shortcut does (dev-tools.ts carries it out). */
export type DevAction =
  | 'latch'
  | 'recenter'
  | 'stairs'
  | 'turnLeft'
  | 'turnRight'
  | 'rope'
  | 'lower'
  | 'window'
  | 'knock'
  | 'sun'
  | 'up'
  | 'down'
  | 'lamp'
  | 'choose0'
  | 'choose1'
  | 'choose2'
  | 'skipWeek'
  | 'tocco'
  | 'ask0'
  | 'ask1'
  | 'ask2'
  | 'badges';

export interface DevKey {
  /** KeyboardEvent.code. */
  code: string;
  /** The key as the card names it. */
  key: string;
  action: DevAction;
  /** What it does, as the card says it. */
  does: string;
  /** Whether the "Emulator controls" card lists it (skipping a week is left off it, and off the badges). */
  listed: boolean;
}

const key = (code: string, name: string, action: DevAction, does: string, listed = true): DevKey => ({ code, key: name, action, does, listed });

export const DEV_KEYS: readonly DevKey[] = [
  key('KeyO', 'O', 'latch', 'Slide the latch: open or close the shutters'),
  key('KeyC', 'C', 'recenter', 'Recenter the seat'),
  key('KeyP', 'P', 'rope', 'Pull the rope once'),
  key('Digit1', '1', 'choose0', 'Tap the first thing for the basket'),
  key('Digit2', '2', 'choose1', 'Tap the second thing'),
  key('Digit3', '3', 'choose2', 'Tap the third thing'),
  key('KeyB', 'B', 'lower', 'Pull the iron lever'),
  key('KeyI', 'I', 'window', "Bring Nora's window over, or send it home"),
  key('KeyK', 'K', 'knock', 'Knock on its little glass'),
  key('KeyN', 'N', 'sun', 'Tap the sun on to the next evening'),
  key('KeyU', 'U', 'up', "Call next week's prices up"),
  key('KeyV', 'V', 'down', "Call next week's prices down"),
  key('KeyM', 'M', 'lamp', 'Light the Sunday lamp'),
  key('KeyT', 'T', 'tocco', 'Poke Tocco'),
  key('Digit7', '7', 'ask0', 'Ask Tocco his first question'),
  key('Digit8', '8', 'ask1', 'Ask his second question'),
  key('Digit9', '9', 'ask2', 'Ask his third question'),
  key('KeyG', 'G', 'stairs', 'Go down to the square, or back up'),
  key('KeyJ', 'J', 'turnLeft', 'Turn left while walking'),
  key('KeyL', 'L', 'turnRight', 'Turn right while walking'),
  key('KeyH', 'H', 'badges', 'Hide or show the key badges beside the steps'),
  // Not on the card or the badges: a tester's shortcut past a whole week.
  key('Digit0', '0', 'skipWeek', 'Skip to the next week, nothing chosen', false),
];

/** The shortcuts the "Emulator controls" card lists. */
export const CARD_KEYS: readonly DevKey[] = DEV_KEYS.filter((k) => k.listed);

/** The shortcut for a key, or null. With Shift held there is none: Shift moves the headset in Play mode. */
export function devAction(code: string, shift: boolean): DevAction | null {
  if (shift) return null;
  for (const k of DEV_KEYS) if (k.code === code) return k.action;
  return null;
}

/**
 * Keys the emulator's Play mode presses with (IWER's default keymap): the
 * headset's and controllers' sticks, buttons and poses, and Shift, which
 * moves the headset with W, A, S and D. A shortcut never uses one.
 */
export const EMULATOR_KEYS: readonly string[] = [
  'ShiftLeft',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyR',
  'KeyX',
  'KeyZ',
  'KeyQ',
  'KeyE',
  'KeyF',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Slash',
  'Enter',
  'ShiftRight',
  'Backslash',
  'Space',
];

/** The card's title and its two notes, each at most 90 characters (tests/restart.test.mjs). */
export const CARD_TITLE = 'Emulator controls';
export const CARD_NOTES = [
  'Play mode: a short click on the lit thing works for every step. No drag needed.',
  'Shortcuts skip the gestures. To test clarity, play without them.',
] as const;

/** The 2D page's own line on the badges, dev server only (at most 90 characters). */
export const BADGES_NOTE = 'Testing in the emulator? Keys are shown next to each step. H hides them.';
