/**
 * The Keeper's progress between sessions, in this browser's storage: the
 * week to open on, the notches carved for each side's right calls, and a
 * Sunday call still waiting to be settled. Storage can be missing or
 * blocked (private windows); then the game simply starts fresh.
 */
export interface Saved {
  week: number;
  keeper: number;
  tocco: number;
  /** The calls made last Sunday for the week now starting: 0 down, 1 up; -1 if the Keeper made none. */
  pending: { week: number; call: number; tocco: number } | null;
}

const KEY = 'every-window-lit.v1';

export function load(): Saved {
  const fresh: Saved = { week: 1, keeper: 0, tocco: 0, pending: null };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw == null) return fresh;
    const data = JSON.parse(raw) as Partial<Saved>;
    return {
      week: Number.isInteger(data.week) && (data.week ?? 0) > 0 ? (data.week as number) : 1,
      keeper: Number.isInteger(data.keeper) ? (data.keeper as number) : 0,
      tocco: Number.isInteger(data.tocco) ? (data.tocco as number) : 0,
      pending: data.pending ?? null,
    };
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
