# THE NARRATOR

Your stream has a narrator now. Chat writes the plot.

Phase 0 scaffold: Node ≥ 20, strict TypeScript, Vite and vanilla TS clients,
`node:http` server, and Vitest. Playwright is pinned to 1.62.0 to use the
preinstalled Chromium cache. Product requirements: [docs/SPEC.md](docs/SPEC.md).
Narration, Twitch, persistence and replay implementation come in later phases.

```sh
npm install
cp .env.example .env
npx playwright install chromium
npm run setup:voice
ollama pull gpt-oss:20b
ollama pull gemma3:4b
npm run dev
```

Open `/host`, `/overlay?key=example`, `/episode/example` or `/demo` at
`http://localhost:3000`. These are placeholder pages; the demo is labelled as
recorded replay. The server runs Vite middleware in development, so one Node
process serves all four pages and reloads server code through `tsx watch`.

```sh
npm test
npm run typecheck
npm run build
npm start
```

`npm start` serves the production build on `PORT` (default 3000). `.env` loads
locally; no paid API or secret key is required. Ollama must be running for later
AI phases. Check installed models with `curl -s localhost:11434/api/tags`.

The voice setup downloads the Kokoro q8 CPU model and synthesises a tiny smoke
sample in ignored `data/setup/`. Voices are bundled with `kokoro-js`.
`node scripts/download-kokoro.mjs --offline` verifies cached synthesis with
network fetch disabled. Retain `node_modules` and the Playwright browser cache
between phases; deleting either can require downloads again. Genre speed and
pitch settings are configuration for later TTS handling; no pitch effect is
implemented in this scaffold. Display styles use system font fallbacks until
OFL font files and their licences are bundled in the visual phase.

Source layout: `src/server/{director,ai,twitch}`, `src/client/{host,overlay,episode,demo}`,
`config/narrator.json`, `fixtures/{demo-session,twitch}`, and `codex-log/`.
Future private state belongs under ignored `data/` or `fixtures/private/`.

MIT licensed; see [LICENSE](LICENSE).
