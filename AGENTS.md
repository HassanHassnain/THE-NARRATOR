# AGENTS.md — THE NARRATOR

Entry for the Codex × TwitchCon hackathon. Deadline: 3 Nov 2026, 03:00 PKT.
The product spec is `docs/SPEC.md`. Read it before any change and follow it.
If the spec and a prompt disagree, the prompt wins for that task. Note the deviation in the phase log.

## Usage budget (important)
We are on a Plus plan with a hard 5-hour usage cap. Spend tokens on the product, not on exploration.
- Don't re-read files you already read this session unless they changed. Don't dump large files or logs. Use `head`, `rg` and targeted reads.
- Don't run long-lived processes (`npm run dev`, `npm start`) except for a short smoke check with a timeout of 20 s or less, then kill it.
- Verify with `npm test` and `npm run typecheck`, and with the fake AI clients.
  - Call the local models (Ollama at `localhost:11434`, Kokoro) only when a phase prompt says to. They are free, but slow, and they share memory with the streamer's game.
- Prefer one complete, tested implementation over several partial attempts. If something fails twice the same way, stop and explain instead of retrying blindly.
- Keep end-of-task reports to 12 lines or fewer: what changed, what was verified (commands and results), what is not done.

## Stack and commands
Node ≥ 20, TypeScript strict, single package. Client: Vite + vanilla TS. Server: `node:http` + `ws`. Tests: Vitest.
- `npm run dev`: server (tsx watch) + Vite
- `npm run build` / `npm start`: production build and serve
- `npm test`, `npm run typecheck`

Allowed dependencies: `openai` (pointed at Ollama's OpenAI-compatible endpoint), `kokoro-js`, `ws`, `vite`, `typescript`, `tsx`, `vitest`, `@types/ws`, `@types/node`, `concurrently`, and `playwright` (dev only, for screenshots). Ask before adding anything else.

## Rules
- **No paid APIs.** The product runs on local models through Ollama (`OPENAI_BASE_URL=http://localhost:11434/v1`). Nothing may require an API key.
- **Secrets:** never commit them. `.env`, `data/` and `fixtures/private/` are gitignored. `.env` holds `TWITCH_CLIENT_ID`, `OPENAI_BASE_URL`, `WRITER_MODEL`, `EYES_MODEL` and the TTS voice names.
- **AI calls** (writer, eyes, TTS) go through `src/server/ai/` behind interfaces. Each call records its latency.
- **Never crash the stream:** a failed, invalid or slow (> 10 s) beat is skipped and logged.
- **What reaches the voice:** only model output is spoken, after a final blocklist check. Raw chat text never goes to TTS. Viewer text passes the blocklist and the model screen before it reaches the story.
- **Personas are original.** Don't imitate real narrators, actors or celebrities by voice, name or catchphrase.
- **Assets:** no sampled music. Fonts are OFL, bundled with their licence.
- **Recorded or simulated content** (the replay demo, fake chat in tests) is labelled on screen. Never present it as live Twitch traffic.

## Definition of done for any task
- `npm run typecheck` and `npm test` pass.
- New behaviour has tests.
- The README is updated if setup or commands changed.
- One commit per task with a clear message.
- A short entry is appended to `codex-log/PHASE_<n>.md`: prompt summary, what changed, verification, and measured beat latency if models were used.
