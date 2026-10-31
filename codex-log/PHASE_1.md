# Phase 1 — Local narration loop

Date: 1 November 2026 (Asia/Karachi).

Request: implement the local screen/speech → director → writer → TTS → overlay
loop; cover applicable required tests with fake AI; run real six-genre checks
in normal and light mode; document setup and continue to the next prompt when
finished. `PROMPTS.md` is the repository's phase-prompt file (there is no
`PROMPT.md`). No Twitch connection is part of this phase.

Implemented: typed and timed AI interfaces, Ollama OpenAI-compatible SDK
clients, JSON-schema writer output with validation and one retry, caption
bounds and change cache, local health and warmup, cancellable Kokoro worker,
macOS `say` fallback, story state and priority triggers, a single-flight beat
transaction, bounded prompts, 10-second silent skip, final voice blocklist,
atomic manifest persistence plus JPEG/WAV artifacts, host capture/speech and
controls, authenticated overlay WebSocket link, audio/subtitles, and new-chapter
cards. Configuration retains six original short lines per genre and now pairs
them with example scene facts to separate style from current evidence.

Runtime details and adjustments:
- Normal writing includes all six example pairs. Compact light mode uses two
  of the six pairs to fit the smaller model and reduce prompt cost. All six
  remain in the configuration. This is an explicit prompt-size optimization.
- Unused twist IDs are constrained to the empty string by JSON schema. Known
  queued twist IDs are constrained to their actual ID. Recent repeated lines
  trigger the single regeneration attempt and are never spoken twice.
- Every fifth successful beat immediately refreshes a bounded factual rolling
  summary from established narration. A separate model rewrite runs after
  audio delivery with its own six-second limit. New beats/mute cancel it;
  failure retains the factual fallback. Combining narration and summary in one
  writer call caused fifth-beat timeouts in the real light-mode run, so that
  work was removed from the audio critical path.
- Kokoro uses cached q8 CPU weights. A one/two/four-thread comparison of the
  same nine-word line measured 3453/2929/2621 ms after warmup. Its public model
  is recreated with ONNX session thread options because the Kokoro loader
  does not forward those options. Default is four threads, configurable 1–4.
- Voice warmup runs before a beat, and Ollama warmup uses native `keep_alive`
  with a 4096-token context. Screen captions ask for 8–16 words (hard max 25).
- A model response, invalid twice, deadline, failed store, or final safety
  rejection does not publish audio or mutate successful-beat state. Cancelling
  a worker kills it; late async completions check the abort signal.

Verification so far:
- 20 Vitest tests passed; strict typecheck passed. Tests use fake HTTP, AI and
  voice processes. Coverage includes priorities/gaps/wake word, single flight,
  caption reuse, rolling-summary cadence, nonblocking/cancelled summary,
  JSON retry and word bound, Ollama failure, deadline/skip late completion,
  output blocklist, screened cast, twist credit, persistence and TTS fallback.
- The bounded production-browser check passed with simulated display capture,
  speech final results and fake AI: 768 px frame upload, real WebSockets,
  persisted JPEG and WAV, overlay audio playback, mute and skip, no page errors.
  Test pages are explicitly labelled SIMULATED; this does not verify macOS
  permission dialogs, a live game, physical microphone or OBS capture.
- Browser harness diagnosis: a transpiled class helper broke the original
  speech stub; plain browser JavaScript fixed it. The synthetic video then
  needed active frames and a wait for the first upload. No production speech
  or capture bypass was introduced.

Hardware measured: Apple M5 MacBook Pro, 24 GB unified memory. Test input is
`fixtures/local-scene.jpg`, generated locally with an explicit SIMULATED label,
and six distinct fake transcript chunks. No private screenshots or live Twitch
traffic were used. Audio below comes from real local model output and Kokoro,
not prerecorded or fake AI. The same frame is reused: only the first beat
requires captioning in each run; later captions use the director cache.

## Real-run evidence

Final light run: `data/checks/light-3a662877-4a86-4a21-98a9-bead2a197f85.json`.
Six successful beats and six WAVs were saved under
`data/streams/3a662877-4a86-4a21-98a9-bead2a197f85/`.
Normal-mode results and final verification are appended after the model
installation completes. The missing writer model download was started by this
phase; Gemma was already installed. No user action is needed for that download.

The six-second target is not consistently attained by the light run. The
10-second limit remains unchanged. Initial failed/slow/duplicate attempts are
retained in ignored `data/checks/` and copied into the evidence JSON below;
they are not counted as successful beats.

Final light-mode results (milliseconds; total includes persistence):

| Genre | Eyes | Writer | TTS | Total | Line |
|---|---:|---:|---:|---:|---|
| noir | 664 | 1902 | 4029 | 6607 | Hassan considered the red door, a predictably poor choice, frankly. |
| nature | 0 | 2077 | 4040 | 6119 | Hassan observed the blue river, a disheartening loss confirmed by the key. |
| epic | 0 | 1853 | 4203 | 6068 | Hassan, considering the depleted state, chose the red door deliberately. |
| sports | 0 | 1903 | 3652 | 5557 | Hassan, defeated by the red door, reluctantly prepared for another attempt. |
| horror | 0 | 3678 | 3552 | 7231 | Hassan examined the blue river, confirming his dwindling health. |
| heist | 0 | 1849 | 4659 | 6512 | Hassan decided the blue river offered no immediate tactical advantage, instead. |

Real fallback verification: forced an invalid Kokoro voice using an already
validated model line; macOS `say` produced `data/setup/say-fallback.wav`
(207876 bytes, 1182 ms synthesis). The initial empty-text `/dev/null` readiness
probe was invalid on this macOS release and was replaced with voice-list
validation. Stdin-only Node flags are filtered from voice-worker launches.
Light mode also explicitly unloads the separate writer model to free memory.

## Final normal verification

Run `5b98393a-aef4-4234-a5b1-b946fc9cd86d`: six successful real beats; median 4681.5 ms, max 6385 ms.

| Genre | Eyes | Writer | TTS | Total | Voice | Line |
|---|---:|---:|---:|---:|---|---|
| noir | 0 | 2764 | 1329 | 4107 | say | Hassan examined the red door, knowing his twenty health would not suffice. |
| nature | 0 | 2733 | 940 | 3676 | say | Hassan opened the red door, knowing his low health would not suffice. |
| epic | 0 | 5201 | 1182 | 6385 | say | Hassan opened the red door, despite his meager health. |
| sports | 0 | 4952 | 980 | 5934 | say | Hassan forced the red door open, ignoring his dwindling health. |
| horror | 0 | 3921 | 995 | 4918 | say | Hassan opened the red door, breath shallow, eyeing the blue river. |
| heist | 0 | 3459 | 983 | 4445 | say | Hassan opened the red door, ignoring his low health, and stared at the blue river. |

Additional skipped diagnostic attempts: 2. Every skipped attempt is retained in PHASE_1_RESULTS.json.
- noir: Beat exceeded 10 seconds; skipped, total 10011 ms.
- horror: Invalid model JSON twice: Repeated recent line. Use the latest spoken words and a different concrete detail., total 4626 ms.

Summary rewrite metadata: `data/streams/5b98393a-aef4-4234-a5b1-b946fc9cd86d/summary.json`: {   "atBeat": 5,   "text": "Hassan examined and opened the red door multiple times, despite his low health, and then looked at the blue river with shallow breath.",   "latencyMs": 1941,   "method": "model" }

## Final light verification

Run `1da9d8a8-6fc1-440e-87b1-cdba25f59c71`: six successful real beats; median 5609.0 ms, max 7301 ms.

| Genre | Eyes | Writer | TTS | Total | Voice | Line |
|---|---:|---:|---:|---:|---|---|
| noir | 3402 | 1791 | 960 | 6163 | say | Hassan considered the blue river, a detail of minimal consequence. |
| nature | 0 | 1834 | 3532 | 5368 | kokoro | Hassan observed the blue river, noting the low health indicator. |
| epic | 0 | 3634 | 3658 | 7301 | kokoro | Hassan, recalling his last potion, stared at the red door. |
| sports | 0 | 1903 | 3345 | 5250 | kokoro | Hassan decided to move away from the red door, acknowledging the low health. |
| horror | 0 | 1827 | 3647 | 5476 | kokoro | Hassan considered the blue river, noting the low health indicator. |
| heist | 0 | 2276 | 3464 | 5742 | kokoro | Hassan, acknowledging low health, moved away from the red door. |

Additional skipped diagnostic attempts: 0. Every skipped attempt is retained in PHASE_1_RESULTS.json.

Summary rewrite metadata: `data/streams/1da9d8a8-6fc1-440e-87b1-cdba25f59c71/summary.json`: {   "atBeat": 5,   "text": "Hassan observed a blue river with a low health indicator and a red door. He recalled a potion and moved away from the door, acknowledging the poor health status.",   "latencyMs": 1786,   "method": "model" }

## Final runtime choices and limitations

Both requested Ollama models are now installed. Normal mode on this 24 GB Mac
uses GPT-OSS for writing and the real macOS voice fallback; light mode uses
Gemma for writing and Kokoro unless too little deadline remains. The log and
beat metadata report the actual engine. Light mode starts enabled on this
machine. Voice/model warmup is explicit through the host setup button.

Normal-mode cold model swaps exceeded the deadline and were silently skipped.
The diagnostic script records these attempts, waits for the writer to become
fully loaded, then makes one new attempt using the cached caption. This is a
measurement procedure, not a relaxation of the product's ten-second rule.
Unchanged-frame warm results do not establish fresh-game-frame performance.

The installed GPT-OSS template supports a final-channel assistant continuation.
A nonempty JSON prefix selects that path while retaining low reasoning_effort,
structured generation, full validation and the final blocklist. A diagnostic
writer call fell to 3611 ms; reasoning-effort=none alone did not help (22925 ms,
versus 8437 ms for low in a separate probe). Low remains configured.

Output clipped by the JSON string length constraint is now rejected unless it
ends as a complete sentence. Exact repeats get one regeneration and then skip.
The larger writer still sometimes embellishes or repeats the same situation
on this deliberately static fixture. A live-game taste review is pending; no
human taste gate or physical microphone/OBS test is claimed.

The six-second latency target is not consistent in either mode. Cold loads,
retries and real moving frames can cost more. Keep light mode on for the first
live test on this Mac. All generated private data and model caches remain
ignored; the committed fixture and measurements are synthetic and labelled.

Final acceptance: 21 tests passed, strict typecheck and production build passed,
and the final bounded browser check passed. Both local model tags are present.
Twelve successful final real beats (six normal, six light), their WAVs/frames,
and the measured summary rewrites are saved. No dev or production server was
left running. Physical screen/mic permissions, a live-game taste test and OBS
are user-side checks. Automatic continuation to Phase 2 follows the user's
explicit request; it does not imply the human taste gate has passed.
