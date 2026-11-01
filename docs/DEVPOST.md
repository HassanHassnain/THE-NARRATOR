# THE NARRATOR: Devpost draft

> Fill in the bracketed items after recording the demo. Keep every claim to what the video and repo show.

**Tagline:** Your stream has a narrator now. Chat writes the plot.

## Inspiration
Most Twitch streams have a handful of viewers. The streamer talks to an almost-empty room, and the one viewer who drops in has nothing to do. We wanted a story format that also works for a small chat. We wanted something that turns a quiet stream into a show from the first minute, gives even one viewer a big lever, and costs nothing to run.

## What it does
- A live **narrator voice** watches the game and narrates the stream as a story, with the streamer as the protagonist. It works in seven genres (noir, nature documentary, epic legend, sports play-by-play, horror, heist, unhinged), each with its own voice and on-screen style.
- **Talk back:** say "Narrator, …" and it answers you, in character.
- **Unhinged mode:** a narrator with the brain of Twitch chat. It writes like a chat message ("best house? it's a dirt pit, saad. ICANT"), with real 7TV/BTTV/Twitch emote images on screen; the voice never reads emote names aloud.
- **Chat reacts, the narrator reacts to chat:** when chat spams KEKW, F, Pog or "clip it", the narrator comments on chat's reaction. No command needed, and only whitelisted emotes and memes ever reach the model.
- **Chat writes the plot:** `!genre` switches the genre by vote. `!twist <text>` proposes a plot twist; it is screened, approved by the streamer, then woven into the next line with a **PLOT TWIST by @viewer** credit on stream. `!recap` gives the story so far.
- **Twitch events become story beats:** follows, subs, gift subs, cheers and raids. New chapters become **stream markers**, so the VOD has story chapters.
- Every stream becomes an **Episode**: a storybook page with chapters, frames, every narrated line (playable), plot-twist credits and a cast list of the viewers who shaped it. It exports as a shareable PNG card and an HTML page.
- **Free and private:** local models through Ollama and a local voice (Kokoro). No API keys, no per-hour cost. With OBS configured, the narrator reads the selected game source. The browser capture fallback reads the window or screen the streamer selects.

## How we built it
- **With Codex, from a spec:** we wrote `docs/SPEC.md` and an `AGENTS.md` (rules, usage budget, definition of done), then had Codex build in phases: scaffold → local narration loop (with measured latency per stage) → Twitch IRC/EventSub, Device Code auth, Shared Chat dedupe, twist moderation. Each phase's prompt and verification is in `codex-log/`. Live testing, the OBS game-layer integration, Unhinged mode, chat reactions, emotes, the Episode page and the judges' replay were finished with additional AI assistance, and every such change is listed in `codex-log/FIXES_2026-11-01_outside-codex.md`. Codex reviewed all 21 outside changes, corrected demo provenance, fixed the seven-genre check and added regression coverage for OBS, exports, emotes, writer credit and EventSub retries; see `codex-log/PHASE_3_REVIEW.md`.
- **Stack:** Node + TypeScript; a Vite control room, OBS overlay, Episode and demo pages; the `openai` SDK pointed at Ollama's OpenAI-compatible API; Kokoro for voice; Chrome's Web Speech API for the streamer's voice; obs-websocket for game frames.
- **Replay evidence:** the committed demo contains real local-model audio generated from a synthetic frame and scripted speech; it does not prove live Twitch capture.
- **Testing:** Fake-backed unit tests with fake AI clients, plus real-model checks (`npm run check:local`) that log per-stage latency for every genre.

## Challenges
- **Latency on a laptop that is also running the game:** we measured that a 12B model under memory pressure missed a 15 s budget. We moved screen captioning to the background, cut the model's output to just the line and title, and defaulted to a 4B model. Result: [7–12] s per line, end to end.
- **Small models copy whatever they see:** examples, previous lines, even their own subtitles when the whole screen was captured. The fixes: style examples as tone only, never showing recent lines, and capturing only OBS's game layer.
- **Small models leak JSON/HTML into fields:** chapter titles are sanitized before they reach the overlay or Twitch markers.

## What we learned
[2–3 honest sentences after the demo session.]

## What's next
Season continuity ("Previously on…" from the last stream), more genres voted in by communities, and a co-op mode where two streamers share one narrator.

## Built with
OpenAI Codex · TypeScript · Node.js · Vite · Ollama (gemma3, gpt-oss) · Kokoro TTS · Twitch EventSub · Twitch IRC · OBS WebSocket · Web Speech API

**Codex session ID:** [main build thread ID from `/status` in Codex]
