# THE NARRATOR: Devpost submission

**Tagline:** Your stream has a narrator now. Chat writes the plot.

## Inspiration
Most Twitch streams have a handful of viewers. When you stream to an almost empty chat you end up talking to yourself, and the one person who drops in has nothing to do. I wanted something that makes a small stream feel like a show from the first minute and gives even a single viewer something fun to do with it. It also had to cost nothing to run, because small streamers aren't going to pay for AI by the hour.

## What it does
The Narrator is a voice that tells your stream as a story while you play, with you as the main character.

- It watches the game and narrates in one of seven genres: noir, nature documentary, epic legend, sports play-by-play, horror, heist, and unhinged. Each has its own voice and overlay style. Unhinged writes like a chat message, with real 7TV, BTTV and Twitch emotes on screen ("Chat, is this real? He's still saying he's new. LMAO.").
- You can talk back. Say "Narrator, …" and it answers in character.
- Chat writes the plot. `!genre` switches the genre, by vote if several people try at once. `!twist <text>` suggests a plot twist: a local model screens it, the streamer approves it, and the next line uses it with a **PLOT TWIST by @viewer** card on stream. `!recap` gives the story so far.
- When chat spams KEKW, F, Pog or "clip it", the narrator reacts to chat. Only a fixed list of emotes and phrases ever reaches the model.
- Follows, subs, gift subs, cheers and raids become story beats. New chapters become stream markers, so the VOD has story chapters.
- Every stream becomes an episode page: chapters, the frame behind each line, every line playable, plot-twist credits and a cast list of the viewers who shaped it. It exports as a PNG card and an HTML page.
- It runs on the streamer's computer. The vision, writing and voice models are local (Ollama and Kokoro), so there's no paid AI API and no per-hour cost. With OBS set up it reads only the game source; without OBS it reads whatever window the streamer shares.

## How I built it
I wrote `docs/SPEC.md` and an `AGENTS.md` (repo rules, my usage budget and a definition of done), then gave Codex one phase at a time from `PROMPTS.md`. In a single thread, between about 1 and 3 a.m. on 1 November, Codex built the scaffold, then the local narration loop with latency measured per stage, then Twitch IRC and EventSub with device-code login, shared-chat dedupe and twist moderation. It ran the test suite 32 times in those two hours, and 7 more in the Phase 3 review. Each phase's summary and verification is in `codex-log/`.

Then I tested it on real streams, and a lot of the product came out of that: the OBS game-source integration, unhinged mode, chat reactions, emotes, the episode page and the replay demo. Every change made outside Codex is listed in `codex-log/FIXES_2026-11-01_outside-codex.md`. Codex reviewed the first 21 in Phase 3. It corrected the demo's provenance labels, fixed the seven-genre check, and added regression tests for OBS, exports, emotes, twist credit and EventSub retries (`codex-log/PHASE_3_REVIEW.md`).

Stack: Node and TypeScript; Vite pages for the control room, OBS overlay, episode and demo; the `openai` SDK pointed at Ollama's OpenAI-compatible API; Kokoro for the voice; Chrome's Web Speech API for the streamer's voice; obs-websocket for game frames. The unit tests use fake AI clients, and `npm run check:local` runs real local-model lines for every genre and logs how long each stage takes.

## Challenges
- **Speed on a laptop that's also running the game.** A 12B model under memory pressure missed a 15 s budget, so I moved frame captioning to the background, cut the model's output down to the line and a chapter title, and switched to a 4B model. Lines now land 4 to 10 s after the moment in my live takes.
- **Small models copy what they see:** the example lines, their own previous lines, even their own subtitles when the whole screen was captured. I now use examples for tone only, never show recent lines, and capture only OBS's game source.
- **Small models leak JSON and HTML into fields,** so chapter titles are cleaned before they reach the overlay or Twitch markers.

## Accomplishments that I'm proud of
- It's actually funny. In one live take it described my purple glass blocks as "a stained glass cathedral", and two minutes later it brought the cathedral back on its own.
- A viewer's twist is safety-checked in about 5 seconds, and once I approve it, it's on air about 7 seconds later with the viewer's name on screen.
- The AI needs no API key or account, so anyone with a decent laptop can run it.

## What I learned
My first live takes taught me more than the tests did. Speech-to-text heard "narrator" as "Nader" every time, so talk-back never fired. A small model will happily say it used a plot twist without using it. A safety screen that's too strict rejects "change the ending" as off-story. The fixes were small (fuzzy wake words, checking the line really contains the twist, a clearer rubric for the screen), but finding them took watching real footage.

## What's next
Season continuity ("Previously on…" from the last stream), more genres voted in by communities, and a co-op mode where two streamers share one narrator.

## About the demo video
The main session is one live take on Twitch with only the waits between lines trimmed: real Minecraft play, real Twitch chat, and every narrator line generated live by the app. The chat commands came from my second Twitch account (0snow1). The talk-back clips, labelled "Earlier stream, re-run through the final build", replay an earlier recorded stream through the app with my words and that stream's chat fed in at their original times; the replies are the app's own output. The twitch.tv shot is Twitch's VOD of an earlier take that day. I re-created the control-room shots after the stream with the same build: I switched twists to approval, sent one `!twist` from my second account, approved it, and the narrator voiced it 7.1 s later. No narrator line is scripted or rewritten. I edited the video in Remotion (React). The music is built from Apple Loops (GarageBand), which Apple licenses royalty-free for your own projects.

## Built with
OpenAI Codex · TypeScript · Node.js · Vite · Ollama (gemma3, gpt-oss) · Kokoro TTS · Twitch EventSub · Twitch IRC · OBS WebSocket · Web Speech API

**Codex session ID:** 01a19387-1b56-7021-b2df-3d1df2a6c36d ("Scaffold THE-NARRATER project")
