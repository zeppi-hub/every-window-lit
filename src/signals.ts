/**
 * A tiny named-event bus for one-shot game moments ("the latch opened",
 * "recenter now", "go down to the square"). Kept free of systems and DOM so
 * components and systems can both import it.
 */

export type SignalName = 'latch' | 'recenter' | 'descend' | 'ascend' | 'rope' | 'lower' | 'window' | 'knock' | 'sun' | 'up' | 'down' | 'lamp' | 'tocco' | 'kept' | 'busy' | 'refused' | 'ask0' | 'ask1' | 'ask2' | 'say' | 'murmur' | 'reveal' | 'hint' | 'coin' | 'strike' | 'gauge' | 'tap' | 'slap';

type Listener = () => void;

/** Repeats of the same signal inside this window are dropped (ms). */
const DEBOUNCE_MS = 500;

const listeners = new Map<SignalName, Set<Listener>>();
const lastEmitted = new Map<SignalName, number>();

export function emitSignal(name: SignalName): void {
  const now = performance.now();
  if (now - (lastEmitted.get(name) ?? -Infinity) < DEBOUNCE_MS) return;
  lastEmitted.set(name, now);
  listeners.get(name)?.forEach((listener) => listener());
}

/** Subscribe to a signal. Returns the unsubscribe function for cleanupFuncs. */
export function onSignal(name: SignalName, listener: Listener): () => void {
  let set = listeners.get(name);
  if (set == null) {
    set = new Set();
    listeners.set(name, set);
  }
  set.add(listener);
  return () => set.delete(listener);
}
