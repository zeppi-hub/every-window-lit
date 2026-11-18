/**
 * Dev only: a start option, from the page's address (?name=value) or, for
 * the managed test browser (which cannot be sent to another address), from
 * .env.local as VITE_V2_<NAME> or VITE_<NAME>. Always null in a build.
 */
export function devParam(name: string): string | null {
  if (!import.meta.env.DEV) return null;
  const asked = new URLSearchParams(window.location.search).get(name);
  if (asked != null) return asked;
  const env = import.meta.env as unknown as Record<string, unknown>;
  const fromFile = env[`VITE_V2_${name.toUpperCase()}`] ?? env[`VITE_${name.toUpperCase()}`];
  return typeof fromFile === 'string' && fromFile !== '' ? fromFile : null;
}
