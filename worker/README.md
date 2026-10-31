# Tocco's live line (Cloudflare Worker)

Optional. The game plays fully without it: Tocco always has his built-in
answer, and the live sentence is added only when this Worker answers within
1.5 seconds. Nothing in the game's bundle is secret.

What it does: the game sends a few fixed codes (question, week, kind of
week, pressure, choice, builds, family counts, a short history of past
choices); the Worker writes the prompt, asks a model, filters the answer
and returns one short sentence or nothing. A Durable Object counts calls
per day, for everyone and per anonymous session, so a runaway cannot run
up a bill (Nebius budgets only warn).

## Deploy (Zeynep, once both accounts exist)

1. Create the Cloudflare account and the Nebius Token Factory project key
   yourself (no one else should create accounts or handle the key).
2. In this folder: `cp wrangler.toml.example wrangler.toml`, then fill in
   `MODEL_PRIMARY` and `MODEL_SECOND` with two current ids from
   https://tokenfactory.nebius.com/models (a small fast one first).
3. `npx wrangler login` (opens the browser; you sign in).
4. `npx wrangler secret put NEBIUS_API_KEY` and paste the key when asked.
5. `npx wrangler deploy`. Note the URL it prints.
6. In the game, set `VITE_ADVISOR_URL=<that URL>` in `.env.production`
   (not committed) and rebuild.

Freeze the Worker at submission and write its version id in the Devpost
text; do not change it while judging runs.
