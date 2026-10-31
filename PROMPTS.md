# THE NARRATOR — Codex prompts, one phase per 5-hour window

**How to use**
- **Before Phase 0:** put `AGENTS.md` at the repo root and `docs/SPEC.md` in `docs/`. Install Ollama and pull the models; the commands are in the decision doc. `TWITCH_CLIENT_ID` can wait until Phase 2. No API key is needed.
- **Codex needs network for `localhost:11434` and npm.** Approve it when asked, or set `network_access = true` under `[sandbox_workspace_write]` in `~/.codex/config.toml` before leaving Phase 1 unattended.
- **One main Codex thread for Phases 0–4.** Its session ID goes on Devpost. Run `/compact` after each phase.
- **Paste one phase at a time.** If a phase finishes early, start the next one right away. The window is a cap, not a schedule.
- **If the window runs out mid-phase,** start the next window with: `Continue Phase <n>. Check git status and codex-log/PHASE_<n>.md first, then finish the remaining acceptance checks.`
- **Tiny fixes** go in a short side thread.
- **Tuning the narrator's voice or prompt** is cheap. Do it in a side thread with real examples pasted in.

---

## Phase 0 — Scaffold (watch this one, ~10 min)

```
Read AGENTS.md and docs/SPEC.md (Architecture section in detail).
Scaffold exactly as described:
- package.json with scripts dev, build, start, test, typecheck
- tsconfig (strict)
- Vite multi-page inputs for host, overlay, episode, demo
- the folder skeleton
- config/narrator.json with genres (persona text, 6 few-shot example lines each, Kokoro voice, display style), cadence, limits and blocklist
- .gitignore (node_modules, dist, .env, data/, fixtures/private/)
- .env.example (TWITCH_CLIENT_ID, OPENAI_BASE_URL=http://localhost:11434/v1, OPENAI_API_KEY=ollama, WRITER_MODEL=gpt-oss:20b, EYES_MODEL=gemma3:4b, PORT=3000)
- MIT LICENSE and a README stub
Install the allowed dependencies, then run `npx playwright install chromium`, and trigger the one-time kokoro-js model download with a tiny script, so later phases never need network for setup.
Check that `curl -s localhost:11434/api/tags` lists both models; if not, say exactly which `ollama pull` is missing.
Add one placeholder test so `npm test` and `npm run typecheck` pass.
git init if needed and commit "chore: scaffold". Report in 8 lines or fewer.
```
Approve the network request for `npm install` when Codex asks.

---

## Phase 1 — The live narrator loop on your own screen (taste gate)

```
Phase 1. Goal: on my Mac, I open /host, share my game window, talk, and a narrator voice tells my stream as a story through /overlay. No Twitch yet.

1. src/server/ai/: interfaces + real implementations, per "Local AI runtime" in the spec:
   - eyes: frame → ≤ 25-word caption via the Ollama vision model
   - writer: structured JSON output via Ollama's format/JSON schema, validated, retried once
   - tts: kokoro-js, with a macOS `say` fallback
   - health: Ollama up, models installed
   Add fakes for tests.
2. src/server/director/: story state, trigger engine (talk-back, twist, event, transcript spike, cadence; minimum gap; one beat in flight), prompt builder with a size budget, rolling summary every 5 beats, and a beat runner with a 10 s timeout and silent skip. Persist beats, frames and audio to data/streams/<id>/.
3. /host: start screen capture (getDisplayMedia → latest 768 px JPEG kept in memory, captioned only when a beat fires), Chrome speech recognition (continuous; send final chunks; wake word "narrator"), and these controls:
   - setup checklist (Ollama, models, voice)
   - genre picker (all 6), cadence slider, spice 0–3, light-mode toggle
   - mute (M) and skip (S)
   - live beat log: trigger, caption, line, and latency per stage (eyes / writer / tts)
4. /overlay: plays beat audio, shows subtitles revealed in sync with the audio (approximate by audio duration), chapter cards and a genre badge. Use a plain style for now; Phase 3 styles it. Add a "click to enable audio" fallback for normal browsers. OBS browser sources autoplay.
5. Tests listed under "Required tests" in the spec that apply to the director and the AI wrappers, all using fakes.
6. Write the few-shot example lines for all 6 genres in config/narrator.json. They are the main quality lever: specific, dry, ≤ 30 words, gently roasting the protagonist.
7. Run 6 real local beats end to end with a frame from fixtures (you may create a simple test image) and a fake transcript, in both normal and light mode. Record the lines and the per-stage latency in codex-log/PHASE_1.md. If trigger-to-audio is over 6 s, try the obvious fixes (keep_alive, smaller caption, shorter prompt) and log the results.
Acceptance:
- npm test and npm run typecheck pass
- the local check produced audio files and lines
- the README has "Try it on your own screen in 5 minutes", including the Ollama setup
Report in 12 lines or fewer, including measured latency and the 6 lines.
```

**Taste gate (you, ~15 min, before Phase 2).** Play any game with `/host` running and talk normally. Ask yourself: are the lines specific, funny and well-timed?
If not, open a side thread, paste the 10 worst and 3 best lines from the beat log, and ask Codex to tune the few-shot lines, the persona prompts and the cadence.
Prompt tuning is cheap. If the writer is still bland after two tuning passes, try `qwen3:14b` or `gemma3:12b` as the writer (one `ollama pull` plus an `.env` change). Don't build Phase 2 on a bland narrator.

---

## Phase 2 — Twitch: chat steers the story, events become beats

```
Phase 2. Goal: real Twitch chat and events drive the narrator on a live channel.

1. Twitch per SPEC:
   - anonymous IRC chat source (default)
   - Device Code auth with the listed scopes (show the code and the activate URL on /host; tokens in data/tokens.json with refresh)
   - EventSub WebSocket with channel.chat.message, channel.follow v2, channel.subscribe, channel.subscription.gift, channel.cheer and channel.raid; handle keepalive, reconnect and revocation
   - Shared Chat dedupe
2. Commands:
   - !genre (cooldown, majority vote when there are 3 or more voters)
   - !twist (blocklist, then the writer-model screen, then approve mode by default with an approval queue on /host; auto-accept optional, optionally for mods/VIPs only; queue max 3; per-chatter limit; credit kept with the twist)
   - !recap
3. Events become beats: follow, sub, gift, cheer, raid. Viewers who appear join the cast, after their names pass the blocklist and the model screen.
4. Stream markers: on a new chapterTitle while live, create a marker. Log failures and ignore them.
5. /overlay: twist credit card ("PLOT TWIST by @name: …") and event toasts.
6. Tests: IRC tag parsing, EventSub mapping per event type (use recorded sample payloads in fixtures/), Shared Chat dedupe, and the twist pipeline end to end with the fake AI clients.
7. README: "Go live in 5 minutes": .env, npm install, npm run build && npm start, Twitch connect on /host, OBS Browser Source settings (1920×1080, the /overlay link, "Control audio via OBS" ticked).
Acceptance:
- tests and typecheck pass
- a local script feeds a fake IRC stream with !genre, !twist and a follow payload through the real director with the fake AI clients, and asserts the resulting beats
Report the exact steps I should run for the live test in 12 lines or fewer.
```

**Live test (you, ~20 min).** Go live on your channel. From your second Twitch account:
- follow the channel
- type `!genre noir`
- type `!twist the cat is the real villain`
- type `!recap`

Check that each one lands, and save the OBS recording. It's raw footage for the video.

---

## Phase 3 — Make it look and sound like a show

```
Phase 3. Goal: footage-ready presentation per "Visual and audio direction" in docs/SPEC.md.
1. Genre typography and subtitle plates for all 6 genres with bundled OFL fonts (include the licences). 40 px minimum at 1080p, at most 2 lines, bottom third, never covering the centre of the screen.
2. Chapter title cards (2.5 s fade), twist credit card slide-in (5 s), event toasts, genre badge, and an optional soft page-turn sting (WebAudio).
3. /episode/:streamId: the storybook. Chapters, each beat with its frame thumbnail and line, twist credits, a cast list, a static HTML export, and a 1080×1350 PNG summary card.
4. /host polish: big mute and skip buttons, an approval queue with one-click approve/reject, a connection status panel with plain-words errors, and a latency readout per stage.
5. /demo replay mode with a "RECORDED SESSION — REPLAY" banner. Generate fixtures/demo-session/ from my best real session in data/streams/ (I'll tell you which id), copying only frames, lines and audio.
6. Use playwright once to screenshot /overlay in each genre with a sample line, plus /episode, into docs/screens/.
Acceptance:
- tests and typecheck pass
- screenshots saved
- /demo runs with Ollama stopped
Report in 12 lines or fewer.
```

---

## Phase 4 — Fixes from a real stream, reliability, judge path

Paste your notes, using the bug-batch template below, **in the same message** as this prompt.

```
Phase 4. Goal: fix what the real stream exposed and make it judge-proof.
1. Fix every P0 and P1 item in the notes below, with a test wherever logic was wrong.
2. Reliability:
   - IRC/EventSub reconnect without losing story state
   - the overlay reconnects and resumes
   - the host warns if no frame has been captured for 60 s or speech recognition stopped, and offers a one-click restart
   - Ollama down or a model missing means silence plus a host notice with the exact fix, never an error on stream
3. A /host first-run checklist with green ticks: Ollama up, models installed, voice loaded, Twitch connected, screen shared, mic on, overlay connected.
4. README for judges:
   - what it is in 3 lines, plus screenshots
   - "Try it with no setup": npm i && npm run build && npm start, then open /demo
   - "Run it on your stream" (Ollama + models + OBS)
   - hardware needs and measured latency from codex-log; "free, and your screen never leaves your machine"
   - safety controls
   - how Codex built it (link codex-log/)
Acceptance:
- tests and typecheck pass
- a cold clone, then npm install, npm run build and npm start, serves a working /demo (verify in a temp copy)
Report in 12 lines or fewer.

NOTES:
<paste bug batch here>
```

---

## Phase 5 — Polish (only after the banked reset; skip if short on budget)

```
Phase 5. Polish in this priority order. Stop when the window is nearly used up, and commit after each item.
1. "Previously on…": at stream start, if a previous stream exists, open with a two-sentence recap from its story state (continuity across streams).
2. Talk-back quality: when the streamer argues with the narrator, keep a short running "relationship" note in the story state, so the narrator's attitude develops over the stream.
3. Episode page: shareable link card with an og:image (the PNG summary), and cast entries linking to viewers' Twitch channels.
4. Optional end-of-stream chat message with the episode link, if authorised with user:write:chat. Off by default.
Tests and typecheck must still pass after each item. Report in 10 lines or fewer.
```

---

## Phase 6 — Freeze and submission material

```
Phase 6. Feature freeze: no new features.
1. Run tests, typecheck and the screenshot script. Fix only failures.
2. Final README pass: accurate commands, real measured latency and hardware, and known limitations stated plainly.
3. docs/DEVPOST.md: Inspiration, What it does, How we built it (Codex: AGENTS.md, phased prompts in codex-log/, the fake-client test strategy, prompt tuning loop; runtime on OpenAI's open-weight gpt-oss via Ollama), Challenges, What we learned, What's next. Plain English, only claims we can show.
4. codex-log/SUMMARY.md: one paragraph per phase.
Report in 10 lines or fewer.
```

---

## Bug-batch template (one message per test stream)

```
P0 (breaks the stream / wrong or unsafe output): …
P1 (bland, mistimed, confusing on stream): …
P2 (nice to fix): …
Best 3 lines: …  Worst 3 lines: …  Average latency felt: …  Did the game stutter? …
```
