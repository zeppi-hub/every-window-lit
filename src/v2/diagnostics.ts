/**
 * The dev server's measuring lines ([quest] budgets, [render] draw counts, the desktop head): on only when asked for, with
 * ?quest=1 in the page's address or VITE_QUEST_PROBE=1 when the dev server is started, so a play-through's console keeps the
 * game's own lines readable. Never in a build.
 */
export const DIAGNOSTICS: boolean =
  import.meta.env.DEV && (new URLSearchParams(window.location.search).has('quest') || import.meta.env.VITE_QUEST_PROBE === '1');
