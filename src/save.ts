import type { Kept } from './season/model.js';

/**
 * The Keeper's progress between sessions, in this browser's storage: every
 * kept week's choice and Sunday calls, from which the season's model
 * replays the town, and the last week whose calls Tocco has already
 * settled aloud. Storage can be missing or blocked (private windows); then
 * the game simply starts fresh.
 */
export interface Saved {
  kept: Kept[];
  /** The last kept week whose calls were settled on a morning; 0 for none. */
  settled: number;
}

const KEY = 'every-window-lit.v2';

function isKept(value: unknown): value is Kept {
  if (value == null || typeof value !== 'object') return false;
  const k = value as Record<string, unknown>;
  if (k.aid != null && typeof k.aid !== 'boolean') return false;
  return [k.chosen, k.call, k.tocco].every((n) => Number.isInteger(n) && (n as number) >= -1 && (n as number) <= 2);
}

export function load(): Saved {
  const fresh: Saved = { kept: [], settled: 0 };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw == null) return fresh;
    const data = JSON.parse(raw) as Partial<Saved>;
    const kept = Array.isArray(data.kept) ? data.kept.filter(isKept) : [];
    const settled = Number.isInteger(data.settled) ? Math.min(Math.max(0, data.settled as number), kept.length) : 0;
    return { kept, settled };
  } catch {
    return fresh;
  }
}

export function save(state: Saved): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage blocked or full: the week is still played, just not remembered.
  }
}
