import { liveLineOpen } from './live-gate.js';
import { currentTown, historyCodes, realWeek } from './store.js';

/**
 * Tocco's live line (worker/README.md): one short sentence a small model
 * adds to his built-in answer, about the Keeper's own past choices. Only
 * fixed codes leave the game, never free text; solidarity weeks are left
 * out of them, and no question is sent during one, nor in the first week
 * (live-gate.ts). With no Worker address configured, or no answer within
 * 1.5 s, nothing is sent or shown and the built-in answer stands alone.
 */

const ADDRESS = (import.meta.env.VITE_ADVISOR_URL as string | undefined) ?? '';
const TIMEOUT_MS = 1500;
/** An anonymous id for this visit only, so the Worker can cap calls per session; never stored. */
const SESSION = Array.from({ length: 4 }, () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0')).join('-');

export function liveEnabled(): boolean {
  return ADDRESS !== '';
}

/** One live sentence for question `q` (0 who it helps, 1 what happens later, 2 what Tocco would do), or null. */
export async function liveLine(q: number, chosen: number): Promise<string | null> {
  const town = currentTown();
  const real = realWeek();
  if (real == null || !liveLineOpen(liveEnabled(), town.week, real.solidarity != null)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${ADDRESS.replace(/\/$/, '')}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q,
        week: town.week,
        kind: real.kind,
        tier: real.tier,
        chosen,
        built: town.builds,
        helped: town.helped,
        eased: town.eased,
        strained: town.strained,
        history: historyCodes(),
        session: SESSION,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { line?: unknown };
    const line = typeof data.line === 'string' ? data.line.trim() : '';
    // The Worker filters already; a last check keeps anything long or odd off Tocco's panel.
    return line.length >= 8 && line.length <= 52 && !/[0-9<>{}]/.test(line) ? line : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
