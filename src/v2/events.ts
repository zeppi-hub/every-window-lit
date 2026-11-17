/**
 * The new version's moments, each with what it carries ("a stage was lost,
 * and why", "a word was won"). Free of systems, DOM and three.js, so pure
 * modules, systems and tests can all use it. Unlike signals.ts, nothing is
 * debounced: every event is delivered.
 */
export interface V2Events {
  /** A mini game's stage starts (`attempt` counts from 1 for each stage). */
  stageStart: { word: string; stage: number; attempt: number };
  stageWon: { word: string; stage: number };
  stageLost: { word: string; stage: number; reason: string; failures: number };
  /** The stage was lost `failures` times (from the hint threshold on): time for a hint. */
  hint: { word: string; stage: number; failures: number };
  /** All of a mini game's stages won: the word is the parrot's. */
  wordWon: { word: string };
  /** The memory orb has closed round the head: swap to the memory's world now. */
  memoryEnter: { memory: string };
  /** Leaving the memory: swap back to the city now. */
  memoryLeave: { memory: string };
  /** A feather was held up to the leader's ear: the word to repeat. */
  wordSpoken: { word: string };
  /** The parrot learned a word (it joins the wing). */
  wordLearned: { word: string };
}

export type V2EventName = keyof V2Events;
type Listener<K extends V2EventName> = (payload: V2Events[K]) => void;

const listeners = new Map<V2EventName, Set<Listener<never>>>();

export function emitV2<K extends V2EventName>(name: K, payload: V2Events[K]): void {
  const set = listeners.get(name);
  if (set == null) return;
  for (const listener of [...set]) (listener as Listener<K>)(payload);
}

/** Subscribe; returns the unsubscribe function (for a system's cleanupFuncs). */
export function onV2<K extends V2EventName>(name: K, listener: Listener<K>): () => void {
  let set = listeners.get(name);
  if (set == null) {
    set = new Set();
    listeners.set(name, set);
  }
  set.add(listener as Listener<never>);
  return () => {
    set.delete(listener as Listener<never>);
  };
}
