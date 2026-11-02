/**
 * The dev server's keyboard shortcuts for the desktop emulator (IWER, the
 * browser's XR emulator), and what its "Emulator controls" card on the 2D
 * page says (Devir 1b item 12). Only the dev server loads this, through
 * dev-tools.ts; nothing of it ships. Free of imports, so `node --test`
 * loads it as it is.
 *
 * No shortcut shares a key with the emulator's own Play mode, which moves
 * the headset with W, A, S and D and presses the controllers' buttons with
 * Q, E, R, F, X, Z and others (EMULATOR_KEYS): the week is skipped with
 * Shift+W only, the rope is P and Nora's window is H.
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
  | 'ask2';

export interface DevKey {
  /** KeyboardEvent.code. */
  code: string;
  /** Whether Shift must be held. */
  shift: boolean;
  /** The key as the card names it. */
  key: string;
  action: DevAction;
  /** What it does, as the card says it. */
  does: string;
}

const key = (code: string, name: string, action: DevAction, does: string, shift = false): DevKey => ({ code, shift, key: name, action, does });

export const DEV_KEYS: readonly DevKey[] = [
  key('KeyO', 'O', 'latch', 'Slide the latch: open or close the shutters'),
  key('KeyC', 'C', 'recenter', 'Recenter the seat'),
  key('KeyP', 'P', 'rope', 'Pull the rope once'),
  key('Digit1', '1', 'choose0', 'Tap the first thing for the basket'),
  key('Digit2', '2', 'choose1', 'Tap the second thing'),
  key('Digit3', '3', 'choose2', 'Tap the third thing'),
  key('KeyB', 'B', 'lower', 'Pull the iron lever'),
  key('KeyH', 'H', 'window', "Bring Nora's window over, or send it home"),
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
  key('KeyW', 'Shift+W', 'skipWeek', 'Skip to the next week, nothing chosen', true),
];

/** The shortcut for a key pressed with Shift held or not, or null. */
export function devAction(code: string, shift: boolean): DevAction | null {
  for (const k of DEV_KEYS) if (k.code === code && k.shift === shift) return k.action;
  return null;
}

/**
 * Keys the emulator's Play mode presses with (IWER's default keymap): the
 * headset's and controllers' sticks, buttons and poses. A shortcut never
 * uses one without Shift.
 */
export const EMULATOR_KEYS: readonly string[] = [
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
