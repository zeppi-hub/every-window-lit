/**
 * What the player is doing right now and how the city stands, in words she
 * can read at a glance. Scenes set it; one system draws it (a small plate
 * low in view that comes forward whenever it changes, and the count of lit
 * windows beside it). Nothing here draws.
 */

export interface Goal {
  /** Where she is in the day, in capitals: "TROUBLE 2 OF 6 · THE COLD FIRE", or "MEMORY · THE BIG TOP". */
  where: string;
  /** What to do now: one short sentence, its verb first. */
  now: string;
  /** Steps done, of steps in all, when the task has steps (hoops, shots, rows). */
  steps?: readonly [number, number];
}

type Listener = () => void;

let goal: Goal | null = null;
const windows = { lit: 0, total: 0 };
const listeners = new Set<Listener>();

function tell(): void {
  for (const listener of listeners) listener();
}

/** Say what the player is to do now; null only when nothing is asked of her (a fade, the credits). */
export function setGoal(next: Goal | null): void {
  if (goal?.where === next?.where && goal?.now === next?.now && goal?.steps?.[0] === next?.steps?.[0] && goal?.steps?.[1] === next?.steps?.[1]) return;
  goal = next;
  tell();
}

export function currentGoal(): Goal | null {
  return goal;
}

/** The city's score: windows lit, of windows in all. */
export function setWindows(lit: number, total: number): void {
  if (windows.lit === lit && windows.total === total) return;
  windows.lit = lit;
  windows.total = total;
  tell();
}

export function windowsLit(): Readonly<{ lit: number; total: number }> {
  return windows;
}

/** Hear every change; returns the way to stop hearing. */
export function onGoal(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
