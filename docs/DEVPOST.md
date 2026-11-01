# THE NARRATOR: Devpost submission

**Tagline:** Your stream has a narrator now. Chat writes the plot.

## Inspiration
Most Twitch streams have a handful of viewers. You talk to an almost-empty room, and the one viewer who drops in has nothing to do. I wanted a format that works for a small chat: something that turns a quiet stream into a show from the first minute, gives even one viewer a big lever, and costs nothing to run.

## What it does
- A live **narrator voice** watches the game and narrates the stream as a story, with the streamer as the protagonist. It works in seven genres (noir, nature documentary, epic legend, sports play-by-play, horror, heist, unhinged), each with its own voice and on-screen style.
- **Talk back:** say "Narrator, …" and it answers you, in character.
- **Unhinged mode:** a narrator with the brain of Twitch chat. It writes like a chat message ("best house? it's a dirt pit, saad. ICANT"), with real 7TV/BTTV/Twitch emote images on screen; the voice never reads emote names aloud.
- **Chat reacts, the narrator reacts to chat:** when chat spams KEKW, F, Pog or "clip it", the narrator comments on chat's reaction. No command needed, and only whitelisted emotes and memes ever reach the model.
- **Chat writes the plot:** `!genre` switches the genre by vote. `!twist <text>` proposes a plot twist; it is screened, approved by the streamer, then woven into the next line with a **PLOT TWIST by @viewer** credit on stream. `!recap` gives the story so far.
- **Twitch events become story beats:** follows, subs, gift subs, cheers and raids. New chapters become **stream markers**, so the VOD has story chapters.
- Every stream becomes an **Episode**: a storybook page with chapters, frames, every narrated line (playable), plot-twist credits and a cast list of the viewers who shaped it. It exports as a shareable PNG card and an HTML page.
- **Free and private:** local models through Ollama and a local voice (Kokoro). No API keys, no per-hour cost. With OBS configured, the narrator reads the selected game source. The browser capture fallback reads the window or screen the streamer selects.

## How I built it
- **With Codex, from a spec:** I wrote `docs/SPEC.md` and an `AGENTS.md` (rules, usage budget, definition of done), then had Codex build in phases: scaffold → local narration loop (with measured latency per stage) → Twitch IRC/EventSub, Device Code auth, Shared Chat dedupe, twist moderation. Each phase's prompt and verification is in `codex-log/`. Then I tested it on real streams. The OBS game-layer integration, Unhinged mode, chat reactions, emotes, the Episode page and the judges' replay came out of that testing, and every change is listed in `codex-log/FIXES_2026-11-01_outside-codex.md`. Codex reviewed the first 21 in Phase 3: it corrected demo provenance, fixed the seven-genre check and added regression coverage for OBS, exports, emotes, writer credit and EventSub retries (`codex-log/PHASE_3_REVIEW.md`).
- **Stack:** Node + TypeScript; a Vite control room, OBS overlay, Episode and demo pages; the `openai` SDK pointed at Ollama's OpenAI-compatible API; Kokoro for voice; Chrome's Web Speech API for the streamer's voice; obs-websocket for game frames.
- **About the demo video:** the main session (labelled "Live take") is one real take with only the waits between lines trimmed: real Minecraft play, real Twitch chat, and every narrator line generated live by the app. The demo chat commands were posted from my second Twitch account (0snow1) on a timer. The short talk-back clip (labelled "Earlier stream, re-run through the final build") replays an earlier recorded stream through the app with my words fed in at their original times; the reply is the app's own output. The twitch.tv shot is that day's VOD. No narrator line is scripted or rewritten. The video is edited in Remotion (React); the background music is built from Apple Loops (GarageBand), which Apple licenses royalty-free for use in your own projects.
- **Testing:** Fake-backed unit tests with fake AI clients, plus real-model checks (`npm run check:local`) that log per-stage latency for every genre.

## Challenges
- **Latency on a laptop that is also running the game:** I measured that a 12B model under memory pressure missed a 15 s budget, so I moved screen captioning to the background, cut the model's output to just the line and title, and defaulted to a 4B model. Result: 3–9 s per line, end to end, in my live Twitch takes (measured per beat: 3.2–9.4 s).
- **Small models copy whatever they see:** examples, previous lines, even their own subtitles when the whole screen was captured. The fixes: style examples as tone only, never showing recent lines, and capturing only OBS's game layer.
- **Small models leak JSON/HTML into fields:** chapter titles are sanitized before they reach the overlay or Twitch markers.

## What I learned
My first live takes taught me more than the tests did. Speech-to-text heard "narrator" as "Nader" every time, so the talk-back feature never fired. A small model will happily confirm it used a plot twist without using it. A safety screen that's too strict rejects "change the ending" as off-story. The fixes were small (fuzzy wake words, checking the line actually contains the twist, a rubric for the screen); finding them took watching real footage.

## What's next
Season continuity ("Previously on…" from the last stream), more genres voted in by communities, and a co-op mode where two streamers share one narrator.

## Built with
OpenAI Codex · TypeScript · Node.js · Vite · Ollama (gemma3, gpt-oss) · Kokoro TTS · Twitch EventSub · Twitch IRC · OBS WebSocket · Web Speech API

**Codex session ID:** 01a19387-1b56-7021-b2df-3d1df2a6c36d ("Scaffold THE-NARRATER project")
