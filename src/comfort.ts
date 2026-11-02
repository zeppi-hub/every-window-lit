/**
 * The start page's two comfort options, both off until the viewer turns
 * them on. Larger captions: every line the Keeper reads in the headset
 * (Tocco's, the family's, his questions) is drawn at 68 px instead of 52
 * (station/caption.ts). Less motion: the family's window fades in and out
 * of the Keeper's window instead of flying across the square, Tocco's line
 * jumps to its new place instead of sliding there, and the lamplight on
 * the closed shutters stands still. Remembered in this browser's storage;
 * storage can be missing or blocked (private windows), and then both
 * simply start off. Kept free of systems and DOM, like stance.ts: the
 * storage is handed in, so `node --test` loads it as it is.
 */

export interface Comfort {
  largerCaptions: boolean;
  lessMotion: boolean;
}

export type ComfortOption = keyof Comfort;

/** What the options need of the browser's storage; the getter itself may throw where storage is blocked. */
export type ComfortStorage = () => Pick<Storage, 'getItem' | 'setItem'> | null | undefined;

const KEYS: Record<ComfortOption, string> = {
  largerCaptions: 'every-window-lit.larger-captions',
  lessMotion: 'every-window-lit.less-motion',
};

const current: Comfort = { largerCaptions: false, lessMotion: false };

export function largerCaptions(): boolean {
  return current.largerCaptions;
}

export function lessMotion(): boolean {
  return current.lessMotion;
}

/** Reads both options from storage; anything missing, unreadable or blocked leaves an option off. */
export function loadComfort(storage: ComfortStorage): Comfort {
  for (const option of Object.keys(KEYS) as ComfortOption[]) {
    let on = false;
    try {
      on = storage()?.getItem(KEYS[option]) === 'on';
    } catch {
      // Storage blocked: the option starts off.
    }
    current[option] = on;
  }
  return { ...current };
}

/** Turns an option on or off for this visit, and remembers it if storage allows. */
export function setComfort(option: ComfortOption, on: boolean, storage: ComfortStorage): void {
  current[option] = on;
  try {
    storage()?.setItem(KEYS[option], on ? 'on' : 'off');
  } catch {
    // Storage blocked or full: the choice holds for this visit only.
  }
}
