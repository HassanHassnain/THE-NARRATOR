# THE NARRATOR

Your stream has a narrator now. Chat writes the plot.

A local narrator for your shared game window. The host captures the latest
screen frame and final speech transcripts; the director asks local models for
one short line, then sends its audio and subtitles to the OBS overlay.

## Try it on your own screen in 5 minutes

Requires Node 20.19+ and Ollama. On this Mac the dependencies, Chromium and
Kokoro q8 weights are already cached. Model downloads on a new machine can
exceed five minutes; allow about 17 GB for the two Ollama models.

```sh
npm install
cp .env.example .env # only if you do not already have .env
ollama pull gpt-oss:20b
ollama pull gemma3:4b
npm run setup:voice
npm run dev
```

1. Open [the host](http://localhost:3000/host) in Chrome. Set your protagonist name.
2. Use **Load local models & voice**. Wait for Ollama, models and voice checks.
   Enable **Light mode** first to use Gemma for writing as well as vision;
   switching it on also unloads the separate writer to free memory. It starts
   enabled on this 24 GB Mac. Switch it off to test the larger writer.
3. Open the **Open overlay** link from the host. Its session key changes on
   server restart. In OBS, add that link as a 1920×1080 Browser Source and tick
   **Control audio via OBS**. A normal browser may require **Click to enable
   narrator audio** before its first line.
4. **Share game window** and choose the window you want narrated. Enable the
   microphone, then **Start narrator**. macOS/Chrome ask you to grant screen and
   microphone access; the app cannot choose or approve these for you.
5. Say “Narrator, why did I miss that jump?” for a reply, or let the cadence
   fire. **M** mutes instantly; **S** skips the current line. Shortcuts do not
   fire while you type. Stop screen sharing/mic independently when finished.

Chrome speech recognition requires browser support and may use the browser
vendor's speech service. If it is unavailable or fails, use **Transcript
fallback** to type what you said. Screenshots go only to your configured local
Ollama endpoint. No Twitch connection is needed in Phase 1.

The host shows per-stage timings and skipped-beat reasons. Only one beat can
run at a time. Failed or >10 s beats are skipped, and cancellation prevents
late audio. Cadence is 15–90 seconds; ordinary beats have an 8-second minimum
gap. The wake word “narrator” bypasses the gap, never an active beat or mute.
Genre changes apply to the next beat. The first caption for a changed frame
costs more than a beat reusing an unchanged frame.

## Commands and checks

```sh
npm test
npm run typecheck
npm run build
npm start
npx playwright install chromium
npm run check:browser
npm run check:local -- --light
npm run check:local
```

`npm start` serves all pages on `PORT` (3000 by default). Development runs Vite
middleware inside the `tsx watch` server. `check:browser` is an 18-second
production-browser check using simulated screen/speech and fake AI; it must
follow a build. It tests actual WebSockets, WAV playback and persistence.
`check:local` uses real Ollama/Kokoro with the clearly labelled synthetic frame
in `fixtures/local-scene.jpg`, produces six genre beats, and saves raw results
in `data/checks/`. No fake AI is used in those measurements. Run the checks
sequentially so local model calls do not compete with one another.

Episodes, replay and Twitch are later-phase work. The episode and demo pages
are currently placeholders. The demo is explicitly labelled as recorded replay.
See [the spec](docs/SPEC.md) and [phase evidence](codex-log/PHASE_1.md).

## Local settings and files

`.env` configures `TWITCH_CLIENT_ID`, `OPENAI_BASE_URL`, `OPENAI_API_KEY`,
`WRITER_MODEL`, `EYES_MODEL`, and `PORT`; no paid key is required. Optional
`TTS_VOICE_NOIR`, `TTS_VOICE_NATURE`, `TTS_VOICE_EPIC`, `TTS_VOICE_SPORTS`,
`TTS_VOICE_HORROR`, `TTS_VOICE_HEIST` override Kokoro voices. `SAY_VOICE`
(default `Samantha`) sets the macOS fallback; `TTS_THREADS` (1–4, default 4)
bounds Kokoro's CPU pool. Kokoro failure falls back to local `say`. On a 24 GB Mac with the default
20B writer, normal mode uses `say` to reduce memory pressure; light mode uses
Kokoro. Late or long lines also use `say` when their remaining deadline cannot
accommodate Kokoro. The beat log identifies the actual voice engine. Speed is
applied per genre; pitch is reserved at zero in the presets.

Original personas, six examples each, voice and display settings, cadence,
limits and the starter blocklist live in `config/narrator.json`. Model output
passes the final blocklist before TTS; raw transcripts/chat never go to TTS.
Every fifth successful beat updates a bounded factual summary immediately,
then asks the writer for a compact rewrite after audio delivery. This background
call is cancelled when a new beat starts; failure keeps the factual summary. Story state keeps the last six lines to avoid repeats.

`data/streams/<id>/` holds append-only beat entries in `beats.json`, JPEG frames
and WAV audio. Streams receive a new ID on server restart; previous artifacts
are preserved. `data/`, `.env` and `fixtures/private/` are ignored by Git.
Model caches are in `node_modules/@huggingface/transformers/.cache`; retain
installed dependencies between phases. Chromium uses Playwright's user cache.
Deleting these caches can require downloads again.

`NARRATOR_FAKE_AI=1` is an explicitly labelled test mode: no real AI is called,
and its stream IDs start with `simulated-`. It is not a real model benchmark.

MIT licensed; see [LICENSE](LICENSE).
