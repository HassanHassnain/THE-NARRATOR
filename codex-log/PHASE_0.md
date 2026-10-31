# Phase 0 — Scaffold

Date: 1 November 2026 (Asia/Karachi).

Prompt: read AGENTS.md and the architecture spec; create the strict TypeScript
single-package scaffold, four Vite pages, narrator presets, setup files, local
runtime caches and a placeholder test; verify and commit `chore: scaffold`.

Repository: cloned `https://github.com/HassanHassnain/THE-NARRATOR` into this
workspace after the user supplied the URL. Its AGENTS.md and SPEC.md were
byte-identical to the local starter kit initially consulted. Existing repo
instructions, spec and prompts were preserved.

Implemented: the complete server/client folder skeleton, four Vite build
inputs, strict typecheck and server build configs, one configuration test,
all six original personas with six example lines each, Kokoro voices and
display settings, cadence/limits/blocklist, ignore rules, environment example,
MIT licence and setup README. Development embeds Vite in the `tsx watch` HTTP
server so one process and port serve all screens. Future modules are explicit
placeholders. Replay is labelled. No fonts or sampled audio were added.

Verification completed:
- `npm test`: one configuration placeholder test passed.
- `npm run typecheck`: passed.
- `npm run build`: four HTML outputs and the Node server compiled.
- Bounded dev and production smoke checks: `/host`, `/overlay?key=smoke`,
  `/episode/test-stream`, `/demo` returned 200; demo contained the recorded
  replay banner; an unknown route returned 404. Processes were stopped after
  1.72 s (dev) and 0.43 s (production).
- Kokoro q8 CPU model downloaded; all six configured voice identifiers validated.
  Initial model load/download: 118840 ms; tiny synthesis: 1960 ms.
- Offline verification with fetch disabled: model load 485 ms; synthesis
  1951 ms; WAV contained 60600 mono samples at 24000 Hz (2.525 s).
  Output: ignored `data/setup/kokoro-smoke.wav`. These are setup timings,
  not end-to-end narration beat measurements; no beat pipeline exists yet.
- `curl -s localhost:11434/api/tags`: Ollama responded with `{"models":[]}`.
  Missing: `ollama pull gpt-oss:20b` and `ollama pull gemma3:4b`.
  Model pulls were not requested and were not performed.

Dependency note: only allowlisted direct packages were installed. npm audit
reported three high-severity entries in the Kokoro → transformers.js → sharp
chain, with no automatic fix available. No new dependency or override was added.

Browser setup: pinned the allowlisted dev dependency to Playwright 1.62.0,
matching this machine's existing browser cache. Stopped the initial redundant
1.64.1 browser download, then `npx playwright install chromium` completed
successfully with the pinned version. Headless Chromium launched and closed
successfully (151.0.7922.34). No browser download is required for later phases
while the cache remains present.

Final checks after moving dependencies into the cloned repository and pinning
Playwright: `npm test` (1 passed), `npm run typecheck`, `npm run build`,
`npm ls --depth=0` and `git diff --check` all passed. Direct dependencies match
the allowlist; secrets, generated audio, model cache, node_modules and dist are
ignored. No implementation-phase AI beats or Twitch traffic were run.
