/**
 * Dev only: a start option, from the page's address (?name=value) or, for
 * the managed test browser (which cannot be sent to another address), from
 * .env.local as VITE_V2_<NAME>. Always null in a build.
 */
export function devParam(name: string): string | null {
  if (!import.meta.env.DEV) return null;
  const fromFile = (import.meta.env as Record<string, unknown>)[`VITE_V2_${name.toUpperCase()}`];
  return new URLSearchParams(window.location.search).get(name) ?? (typeof fromFile === 'string' && fromFile !== '' ? fromFile : null);
}
