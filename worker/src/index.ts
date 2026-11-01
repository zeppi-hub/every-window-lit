/**
 * Tocco's live line: a Cloudflare Worker that turns a few fixed codes from
 * the game into one short sentence about the Keeper's own past choices.
 *
 * - The game sends only codes (question, week, kind, tier, choice, builds,
 *   family counts and a short history string); the prompt is built here,
 *   and the model key stays a Worker secret.
 * - A Durable Object counts calls: a daily cap for everyone and a smaller
 *   one per anonymous session.
 * - Models are tried in turn (two on Nebius Token Factory, then Workers AI);
 *   whatever comes back is filtered, and anything doubtful is dropped. The
 *   game always has its own built-in answer, so a dropped line costs
 *   nothing.
 * - Solidarity weeks never reach the model: the game strips them, and any
 *   history that still carries one is refused.
 *
 * Deploy steps are in worker/README.md. The code is frozen at submission.
 */

export interface Env {
  COUNTER: DurableObjectNamespace;
  AI?: { run(model: string, input: unknown): Promise<{ response?: string }> };
  NEBIUS_API_KEY?: string;
  /** Model ids, checked against the Token Factory list at deploy time. */
  MODEL_PRIMARY?: string;
  MODEL_SECOND?: string;
  WORKERS_AI_MODEL?: string;
  /** The game's origin, e.g. https://zeppi-hub.github.io */
  ALLOWED_ORIGIN?: string;
  DAILY_CAP?: string;
  SESSION_CAP?: string;
}

const NEBIUS_URL = 'https://api.tokenfactory.nebius.com/v1/chat/completions';
const MODEL_TIMEOUT_MS = 1200;
const QUESTIONS = ['Who does this help?', 'What happens later?', 'What would you do?'] as const;
const KINDS = ['fuel', 'power', 'food'] as const;
const OPTIONS = ['ease the price', 'help the family', 'build for later'] as const;
const BUILDS: Record<(typeof KINDS)[number], string> = { fuel: 'the tram', power: 'the roof turbines', food: 'the roof garden' };
/** Words a line may never contain, the game's own list plus a few for a live model. */
const FORBIDDEN = /\b(victims?|died|deaths?|dead|lives|tragic|pray|RIP|donate|fund|survivors?|again|quake|flood\w*|war|news|live|daily|disaster\w*|kill\w*)\b/i;
/** Names the game never shows: the clock figure and the town stay unnamed, and the family's old names are gone. */
const NAMES = /\b(Tocco|Tessa|Dario|Ombrisa)\b/i;

interface Ask {
  q: number;
  week: number;
  kind: (typeof KINDS)[number];
  tier: number;
  chosen: number;
  built: Record<(typeof KINDS)[number], number>;
  helped: number;
  strained: number;
  /** One code per kept week, oldest first: kind letter (F, P, G) and choice (E, H, B, N). */
  history: string;
  session: string;
}

function parse(body: unknown): Ask | null {
  if (body == null || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  if (!int(b.q, 0, 2) || !int(b.week, 1, 12) || !int(b.tier, -1, 3) || !int(b.chosen, -1, 2)) return null;
  if (!int(b.helped, 0, 12) || !int(b.strained, 0, 12)) return null;
  if (typeof b.kind !== 'string' || !(KINDS as readonly string[]).includes(b.kind)) return null;
  const built = b.built as Record<string, unknown> | undefined;
  if (built == null || !KINDS.every((k) => int(built[k], 0, 2))) return null;
  // History: up to 11 kept weeks of two letters; a solidarity week (S) is refused outright.
  if (typeof b.history !== 'string' || !/^([FPG][EHBN]){0,11}$/.test(b.history)) return null;
  if (typeof b.session !== 'string' || !/^[0-9a-f-]{8,40}$/.test(b.session)) return null;
  return b as unknown as Ask;
}

/** The facts the model gets, written out here from the codes; no free text from the game. */
function prompt(ask: Ask): Array<{ role: string; content: string }> {
  const kindName = { fuel: 'pump prices', power: 'power prices', food: 'grocery prices' }[ask.kind];
  const pressure = ['eased', 'calm', 'a little up', 'up', 'sharply up'][ask.tier + 1];
  const past = ask.history.match(/../g) ?? [];
  const pastText = past
    .map((code, i) => {
      const kind = { F: 'pumps', P: 'power', G: 'groceries' }[code[0] as 'F' | 'P' | 'G'];
      const choice = { E: 'eased the price', H: 'helped the family', B: 'started a build', N: 'sent the basket empty' }[code[1] as 'E' | 'H' | 'B' | 'N'];
      return `week ${i + 1} (${kind}): ${choice}`;
    })
    .join('; ');
  const built = KINDS.filter((k) => ask.built[k] > 0)
    .map((k) => `${BUILDS[k]} ${ask.built[k] === 2 ? 'working' : 'under scaffolding'}`)
    .join(', ');
  return [
    {
      role: 'system',
      content:
        "You are a small wooden clock figure on the Keeper's window sill, advising the Keeper of a small fictional island town. " +
        'Answer in ONE short, warm sentence of at most 14 words, in plain English, that adds a point from the Keeper\'s own past choices. ' +
        'Never use numbers or any names (yours, people, places, companies or brands), and never mention news, disasters, illness or politics.',
    },
    {
      role: 'user',
      content:
        `Question: "${QUESTIONS[ask.q]}". This is week ${ask.week}; ${kindName} are ${pressure}. ` +
        `The Keeper's choice this week: ${ask.chosen >= 0 ? OPTIONS[ask.chosen] : 'nothing yet'}. ` +
        `Past weeks: ${pastText || 'none yet'}. Builds: ${built || 'none'}. ` +
        `Pressed weeks the family was helped through: ${ask.helped}; left on its own: ${ask.strained}.`,
    },
  ];
}

/** One sentence, short, plain, and free of anything on the list; otherwise nothing. */
export function clean(text: string | undefined | null): string | null {
  if (text == null) return null;
  const line = text.replace(/\s+/g, ' ').trim().replace(/^["'“]|["'”]$/g, '');
  if (line.length < 8 || line.length > 75) return null;
  if (/[0-9@#<>{}\[\]\\/|_*]|https?:/i.test(line)) return null;
  if (FORBIDDEN.test(line) || NAMES.test(line)) return null;
  if ((line.match(/[.!?]/g) ?? []).length > 2) return null;
  return line;
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await work(controller.signal);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function nebius(env: Env, model: string | undefined, messages: Array<{ role: string; content: string }>): Promise<string | null> {
  if (env.NEBIUS_API_KEY == null || model == null || model === '') return null;
  return withTimeout(async (signal) => {
    const response = await fetch(NEBIUS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.NEBIUS_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: 60, temperature: 0.6 }),
      signal,
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return clean(data.choices?.[0]?.message?.content);
  }, MODEL_TIMEOUT_MS);
}

async function workersAi(env: Env, messages: Array<{ role: string; content: string }>): Promise<string | null> {
  if (env.AI == null || env.WORKERS_AI_MODEL == null) return null;
  return withTimeout(async () => clean((await env.AI?.run(env.WORKERS_AI_MODEL as string, { messages, max_tokens: 60 }))?.response), MODEL_TIMEOUT_MS);
}

function cors(env: Env, request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = origin === env.ALLOWED_ORIGIN || /^https:\/\/localhost(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = cors(env, request);
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    const reply = (line: string | null, status = 200) => new Response(JSON.stringify({ line }), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/ask') return reply(null, 404);
    let ask: Ask | null = null;
    try {
      ask = parse(await request.json());
    } catch {
      ask = null;
    }
    if (ask == null) return reply(null, 400);

    // Counted once per call, before any model is asked.
    const counter = env.COUNTER.get(env.COUNTER.idFromName('global'));
    const allowed = await counter.fetch('https://counter/take', { method: 'POST', body: JSON.stringify({ session: ask.session, daily: Number(env.DAILY_CAP ?? 3000), perSession: Number(env.SESSION_CAP ?? 30) }) });
    if (!allowed.ok) return reply(null, 429);

    const messages = prompt(ask);
    const line = (await nebius(env, env.MODEL_PRIMARY, messages)) ?? (await nebius(env, env.MODEL_SECOND, messages)) ?? (await workersAi(env, messages));
    return reply(line);
  },
};

/** Calls counted per UTC day, for everyone and per anonymous session; kept in the object's SQLite storage. */
export class Counter {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const { session, daily, perSession } = (await request.json()) as { session: string; daily: number; perSession: number };
    const day = new Date().toISOString().slice(0, 10);
    const total = ((await this.state.storage.get<number>(`all:${day}`)) ?? 0) + 1;
    const mine = ((await this.state.storage.get<number>(`s:${day}:${session}`)) ?? 0) + 1;
    if (total > daily || mine > perSession) return new Response('cap', { status: 429 });
    await this.state.storage.put({ [`all:${day}`]: total, [`s:${day}:${session}`]: mine });
    return new Response('ok');
  }
}
