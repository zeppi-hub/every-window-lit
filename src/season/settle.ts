import type { Kept } from './model.js';

/**
 * Sunday's call on next week's prices, as plain rules: which weeks have one,
 * what a kept week records, and which kept weeks are settled aloud on the
 * next morning. Type-only imports, so `node --test` can load this file as it
 * is; ToccoSystem and the store follow these rules.
 */

/**
 * Whether week `n` has a call: the arrows rise, Tocco makes his own, and the
 * next morning settles both. Not in the first week (it lights the lamp
 * straight away; calls start in the second), nor in a solidarity week.
 */
export function callsOpen(n: number, quiet: boolean): boolean {
  return n >= 2 && !quiet;
}

/** What week `n` keeps as its shutters close on Sunday: the choice, and the calls only in a week that has them. */
export function keptEntry(n: number, quiet: boolean, chosen: number, call: number, tocco: number): Kept {
  if (quiet) return { chosen, call: -1, tocco: -1, aid: true };
  if (!callsOpen(n, quiet)) return { chosen, call: -1, tocco: -1 };
  return { chosen, call, tocco };
}

/** The weeks kept since calls were last settled (`settled` of them were) that have a call to settle, oldest first, with their week numbers. */
export function callsToSettle(kept: readonly Kept[], settled: number): Array<{ week: number; kept: Kept }> {
  const out: Array<{ week: number; kept: Kept }> = [];
  for (let i = settled; i < kept.length; i += 1) {
    const done = kept[i];
    if (done.call >= 0 || done.tocco >= 0) out.push({ week: i + 1, kept: done });
  }
  return out;
}

/**
 * Whether a morning holds its breath before settling (the answer waits, the
 * square hushes, a chime): only when there is a call to settle. A week with
 * none is still marked settled, quietly.
 */
export function shouldHush(calls: readonly unknown[]): boolean {
  return calls.length > 0;
}
