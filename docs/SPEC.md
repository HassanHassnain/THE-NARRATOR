# THE NARRATOR — product spec v1.1 (local models, no API keys)

**One line:** A live narrator voice that watches your stream and tells it as a story, with you as the protagonist. Chat picks the genre and writes the plot twists.
It runs entirely on the streamer's own computer: no API keys, no per-hour cost, and the screen never leaves the machine.

**Tagline:** "Your stream has a narrator now. Chat writes the plot."

**Who it's for:** every streamer, but it shines for small and solo streams. Hours of talking to an empty room become a show, and one viewer with one `!twist` changes what the whole stream hears. Free and private matters most to exactly these streamers.

## Pillars (decide every trade-off with these)
1. **Specific beats generic.** Every line must refer to something real: what's on screen, what the streamer just said, what chat just did. "The hero walks forward" is a failure.
2. **Short and well-timed.** One or two sentences, ≤ 30 words, then silence. A narrator that never shuts up is worse than none.
3. **Chat's words become canon, with credit.** An accepted twist is narrated within one beat and its author appears on screen.
4. **Free, private, safe by default.** Local models only. Viewer text is checked before it reaches the narrator. The streamer can mute or skip instantly.

## Local AI runtime
- **Ollama** on the streamer's machine, called through its OpenAI-compatible endpoint (`http://localhost:11434/v1`) with the official `openai` Node SDK.
  `OPENAI_BASE_URL` and `OPENAI_API_KEY` in `.env` let anyone point the same code at OpenAI's hosted API instead; that's optional and not needed.
- **Writer model** (narration, recap, twist screening): default `gpt-oss:20b` (OpenAI's open-weight model) at low reasoning effort.
- **Eyes model** (screen caption): default `gemma3:4b`, a small vision model. It turns the latest frame into ≤ 25 words of concrete scene facts.
  Only the caption goes to the writer, so the writer can be text-only.
- **Light mode** (host toggle): use the eyes model for writing too. This is for machines where the game stutters with both models loaded.
- **Voice:** Kokoro TTS running locally (`kokoro-js`, Apache-2.0), one voice per genre, with speed and pitch adjustments per genre.
  Fallback: macOS `say` with a configured voice. The model weights are downloaded once on first run.
- **Model names are configurable** (`WRITER_MODEL`, `EYES_MODEL`, `TTS_VOICE_*`). `/host` shows whether Ollama is up, which models are installed, and a one-line fix (`ollama pull <model>`) when one is missing.
- **Target latency:** trigger to first audio ≤ 6 s on an Apple M-series machine with 24 GB of memory. Measure it and log it per beat.

## Inputs
- **Screen:** the host page captures the streamer's screen or window with `getDisplayMedia`, downsizes it to a 768 px wide JPEG, and keeps the latest frame. The eyes model only sees it when a beat fires.
- **Streamer's voice:** Chrome Web Speech API (`webkitSpeechRecognition`, continuous, interim results) on the host page. Final transcript chunks go to the server with timestamps. The wake word "narrator" triggers a talk-back beat.
- **Twitch chat:** the commands below.
- **Twitch events:** follow, subscribe, gift sub, cheer, raid (EventSub). Each becomes a story beat ("A stranger called @name arrived, bearing a follow.").

## Chat commands
| Command | Effect | Rules |
|---|---|---|
| `!genre <name>` | Switches the genre at the next beat | Genres: noir, nature, epic, sports, horror, heist, unhinged. Cooldown 1 min. With ≥ 3 distinct voters within 30 s, the majority wins. |
| `!twist <text>` | Proposes a plot twist (≤ 120 chars) | The blocklist runs first, then the writer model screens it (JSON: allow / reject + reason). Default mode is **approve on `/host`**. Auto-accept can be switched on, optionally for mods/VIPs only. Accepted twists queue (max 3). One twist per chatter every 2 min. |
| `!recap` | The narrator gives a two-sentence "story so far" | Cooldown 2 min. |

Commands are case-insensitive; only the first token counts. Unknown commands are ignored.

## The narration director (the core)
A server-side loop decides *when* to speak and builds *what* the writer sees.

**Beat triggers,** in priority order. Only one beat can be in flight at a time.
1. Talk-back: the wake word "narrator" in the transcript fires immediately, and the narrator answers the streamer in character.
2. An accepted twist is waiting.
3. A Twitch event (raid > gift sub > sub > cheer > follow).
4. A transcript spike: an exclamation, laughter, or ≥ 3 lines within 10 s.
5. Cadence: if nothing has fired for `cadenceSeconds` (host slider 15–90, default 35).

There must be at least 8 s between beats, except for talk-back.

**Story state,** kept per stream:
- the protagonist (the streamer's display name)
- the genre
- the cast: viewers who appeared, and what they are in the story
- the canon: accepted twists, with authors
- a rolling summary of at most 120 words, rewritten every 5 beats
- the last 6 lines spoken (to avoid repetition)
- the current chapter title

**Per beat:**
1. If the frame changed since the last caption, the eyes model captions it.
2. The writer gets: the genre persona, the story state, the transcript since the last beat, events since the last beat, the trigger reason, and the caption.
   It returns JSON:
   - `line` (≤ 30 words)
   - `chapterTitle?` (only when the scene clearly changes)
   - `castUpdates[]`
   - `usedTwistId?`
   Use Ollama's structured output (`format`/JSON schema), validate the result, and retry once on invalid JSON.
3. Kokoro synthesises the line, and the audio goes to the overlay.

**Writing rules in the prompt:**
- Third person, past tense; the streamer is the protagonist.
- Include at least one concrete detail from the caption or transcript.
- Never repeat a recent joke.
- Gently roast the streamer at the host's "spice" level (0–3).
- Never insult viewers.
- Each genre persona has 6 short example lines (few-shot) in `config/narrator.json`. This is the main quality lever.

**Personas are original.** Never imitate a real person's voice, name or catchphrase.

**Failure behaviour:** if Ollama is down, the output is invalid twice, or the beat takes longer than 10 s, the beat is skipped silently and the failure is logged on `/host`. The narrator must never block or crash the stream.

## Safety
- **Viewer text:** every `!twist` and every viewer name entering the story passes the blocklist and the writer-model screen.
- **Approval:** approve mode is the default.
- **Host controls:** mute (instant), skip the current line, clear the twist queue, choose auto-accept or approve, set spice 0–3, and edit the banned-word list.
- **What gets spoken:** only model output, after a final blocklist check. Raw chat text is never sent to TTS.

## Screens (one Node process serves everything)
- **`/host`** — the streamer's control room:
  - a setup checklist: Ollama up, models present, voice loaded, screen shared, mic on, Twitch connected, overlay connected
  - genre picker with voice preview, cadence slider, spice level
  - twist mode and the approval queue
  - mute (M) and skip (S) with big hit areas
  - a live beat log with trigger, caption, line, and latency per stage
- **`/overlay?key=…`** — the OBS Browser Source (1920×1080, transparent):
  - plays the narration audio (tick "Control audio via OBS")
  - subtitles in the genre's style, revealed in sync with the audio
  - chapter title cards
  - a twist credit card ("PLOT TWIST by @name: …")
  - a small genre badge
  - an event toast when a follow or raid is narrated
- **`/episode/:streamId`** — the Episode, a storybook of the stream:
  - each beat with its saved frame thumbnail and line
  - chapter headings and twist credits
  - a cast list of the viewers who shaped the story
  - shareable as a static HTML export and a 1080×1350 PNG summary card
- **`/demo`** — replay mode for judges, no models needed. It plays a recorded session (frames, lines and audio in `fixtures/demo-session/`) through the real overlay and episode pipeline, under a banner reading "RECORDED SESSION — REPLAY".

## Twitch integration
- **Chat:** a `ChatSource` interface.
  - Default: anonymous read-only IRC (raw WebSocket to `wss://irc-ws.chat.twitch.tv:443`, a `justinfan` nick, IRCv3 tags, PING/PONG, reconnect with backoff).
  - With auth: EventSub `channel.chat.message`.
- **Auth:** Device Code flow for a public client, with `TWITCH_CLIENT_ID` from `.env`.
  - Scopes: `user:read:chat moderator:read:followers channel:read:subscriptions bits:read channel:manage:broadcast`.
  - `/host` shows the code and `https://www.twitch.tv/activate`.
  - Tokens are stored in `data/tokens.json` (gitignored) and refreshed.
- **EventSub WebSocket subscriptions:** `channel.chat.message`, `channel.follow` v2, `channel.subscribe`, `channel.subscription.gift`, `channel.cheer`, `channel.raid` (raids to the broadcaster). Handle `session_keepalive`, `session_reconnect` and revocation.
- **Stream markers:** when a new chapter starts and the channel is live, create a marker with the chapter title (Helix Create Stream Marker). Log failures and ignore them.
- **Shared Chat:** dedupe on the source message id.

## Visual and audio direction
The overlay never covers gameplay. Subtitles sit in the bottom third, at most 2 lines, minimum 40 px at 1080p, with a strong text shadow or plate.

Each genre has its own typographic identity:
| Genre | Typography and colour |
|---|---|
| noir | condensed serif, grey/white |
| nature | humanist sans, warm green |
| epic | engraved caps, gold |
| sports | bold italic sans, broadcast lower-third style |
| horror | distressed type with a red flicker |
| heist | monospace, amber |

- **Fonts:** bundled OFL fonts only, with their licence files.
- **Cards:** the twist credit card slides in from the right for 5 s. Chapter cards are centred and fade over 2.5 s.
- **Sound:** no music. The only audio is TTS, plus an optional soft "page turn" sting synthesised with WebAudio.

## Architecture
- **Stack:** Node ≥ 20, TypeScript strict, one package. Client: Vite + vanilla TS. Server: `node:http` + `ws`. Tests: Vitest. Libraries: `openai` (pointed at Ollama) and `kokoro-js`.
- **Layout:**
  - `src/server/`: `index.ts`, `hub.ts`, `director/` (triggers, storyState, promptBuilder, beatRunner), `ai/` (writer, eyes, tts, screen, health), `twitch/` (irc, eventsub, deviceAuth, markers), `store.ts`
  - `src/client/`: `host/`, `overlay/`, `episode/`, `demo/`
  - `config/narrator.json`: genres (persona text, few-shot lines, voice, display style), cadence, limits, blocklist
  - `fixtures/`: `demo-session/` and recorded Twitch payloads for tests
  - `codex-log/`
- **Testability:** the director runs without models. Every AI call goes through an interface, and tests use fakes.
- **Persistence:** `data/streams/<id>/` holds `beats.json`, `frames/*.jpg` and `audio/*.wav`. No database.

## Required tests
- Trigger priority and the minimum gap.
- Talk-back wake word.
- Genre vote by majority, and the cooldown.
- Twist pipeline: blocklist reject, model-screen reject, approve mode, queue limit, credit attached.
- Ollama down, a timeout, or invalid JSON twice: the beat is skipped and nothing throws.
- Rolling summary rewritten every 5 beats.
- Prompt builder includes the caption, transcript, events and canon, and stays under its size budget.
- Final blocklist check before TTS.
- IRC tag parsing; EventSub mapping per event type; Shared Chat dedupe.
- Episode export contains every beat and every credit.

## Non-goals for v1
- No paid APIs required.
- No Twitch Extension.
- No writing to chat.
- No voice cloning.
- No database.
- No mobile layout.
- No running multiple streams at once.
