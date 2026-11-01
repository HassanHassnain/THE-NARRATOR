# Phase 3 review — 2026-11-01

Prompt: review every numbered change in `FIXES_2026-11-01_outside-codex.md`, run the five requested commands, fix defects, add coverage, and document the review.

The outside work was uncommitted at the start. Its UI, seven genres, OBS source capture, prompt changes, model choices and replay media are preserved. This review does not claim authorship of the outside work. The original outside log is unchanged; this document corrects claims discovered during verification.

## Verification and evidence

| Check | Result |
|---|---|
| `npm test` | **75 passed**, versus 46 at baseline; 29 added cases, all AI/network/process paths faked. |
| `npm run typecheck` | Passed with strict TypeScript. |
| `npm run build` | Passed, all four Vite inputs and server output. |
| `npm run check:local` | **7/7 real local-model beats**, Kokoro audio files generated. Normal mode, writer and eyes `gemma3:4b`, synthetic image and scripted speech. |
| `npm run check:twitch` | Passed: **simulated** Shared Chat dedupe, twist approval/credit, follow event, recap, persisted fake WAVs. No live chat sent. |
| `npm run check:browser` | Passed: synthetic screen capture at 768px, fake final speech delivery, actual browser audio playback, mute/skip, twist approval/credit and edited voice blocklist; no page errors. |
| `npm run check:review` and `npm run check:review -- --dev` | Passed in production and dev: all four slashless pages, seven genre tiles/styles, local fonts, subtitle placement/size, replay pause/resume/finish/replay/empty state, API errors, cast/credits, escaped HTML title, six offline HTML audio tracks and inline frames, 1080×1350 PNG. No page errors. |
| `npm run check:replay-offline` | Passed with the **real app**, unavailable Ollama endpoint, unloaded TTS and isolated empty Twitch credentials: recorded audio played and episode loaded; no new inference. Did not stop the user's Ollama. |
| Ollama tags | `gemma3:4b`, `gpt-oss:20b`, `gemma3:12b` installed; no missing pull for the configured models. |

Development/testing used an isolated work copy so smoke tests could bind ephemeral ports and avoid the existing server on port 3000. Test-server instances had 18-second deadlines and closed after checks. `.env`, Twitch tokens, existing stream data and the original replay WAV/JPEG bytes were preserved. The task commit includes the reviewed outside changes and these corrections. No push or deployment was performed.

## Review of all 21 outside changes

| # | Change reviewed | Finding, correction and coverage |
|---|---|---|
| 1 | Absolute script URLs | Kept. Chromium loaded host, overlay, episode and demo without trailing slashes in dev and production; JS/CSS loaded and controls worked. |
| 2 | `.env` in check scripts | Kept. Local benchmark resolved the configured 4B writer, not the 20B default. Updated obsolete host selectors in the browser check to use control IDs. |
| 3 | 4B models | Kept private settings and public example. Queried installed models and completed seven real beats. Historical 12B and live-session timings were not remeasured. |
| 4 | Personas, inline examples, stable prefix, labelled context | Kept; existing prompt-budget/repetition tests and real runs pass. Sample slang hints once per prompt build so budget trimming cannot silently rerandomize the request. |
| 5 | Compact writer JSON | **Fixed false twist attribution:** code no longer invents `usedTwistId`. With an accepted twist, the compact schema requires its ID and validation rejects absent/wrong IDs with one retry. Model-invented compact cast updates are discarded. Added acknowledgment, retry and chat-style tests. An ID acknowledgment is structural evidence, not proof of semantic writing quality. |
| 6 | 15s budget and Kokoro fallback | Kept the explicit outside 15000ms choice and `words × 220 + 800` threshold. Added exact voice-budget boundary tests and a fake uncooperative-AI deadline test. This deliberately retains the outside deviation from the original 10s spec/AGENTS budget; the six-second taste target is not met. |
| 7 | Control room and genre overlays | Kept redesign; fixed preview visibility so fresh OBS frames visually take precedence over a concurrent browser capture. Existing M/S, approval and banned-word controls pass browser integration. Bundled four OFL font families with licences/checksums. |
| 8 | OBS game-source screenshots | Hardened injectable WebSocket transport: guarded JSON/auth payloads, handshake deadline, request timeout cleanup, disconnect rejection, bounded reconnect, idempotent start, closed/stale socket guards and JPEG validation. Fake-socket tests verify v5 auth, `Game`, width 768, malformed payloads, timeouts, reconnect and close. `/api/frame` path retained. |
| 9 | Background caption cache | Kept 10s scheduling and recent-caption reuse. **Fixed cancellation:** cancelled or uncooperative background eyes requests release the caption lock. Tests cover reuse with changed frames, >30s expiry for changed frames, cancellation/deadline and paused/muted inactivity. Identical-frame captions can remain cached longer. |
| 10 | Stable overlay key | Preserved persistence. New key is fully written privately before atomically linking into place; concurrent creators use the winner. Existing keys are validated and permissions tightened; invalid files are preserved with an actionable error. Fake apps use ephemeral keys. Persistence, concurrency, permissions and invalid-file tests added. |
| 11 | Chapter-title cleanup | Shared one sanitizer between writer, episode and demo, retaining existing leak/length tests. DOM rendering remains text-based. |
| 12 | Wake-word aliases | Kept; alias and non-word false-positive tests pass; browser speech stub reaches the director. Physical mic permission/recognition accuracy was not tested. |
| 13 | EventSub retry/API timeouts | Retained 15s HTTP timeouts. Added bounded retries for 429/5xx as well as transport errors, cancellable retry waits, post-await epoch guards, cleanup when no subscriptions succeed, and external cancellation for emote Helix calls. Tests cover recovery, permanent 403, exhaustion at three attempts, stopped requests and cancelled backoff. |
| 14 | Episode and exports | **Fixed:** cast updates were omitted; overlapping audio had no owner/error handling; HTML title was interpolated unsafely; exported HTML omitted audio; PNG long text could overflow; exports could misclaim live Twitch. Added cast updates, one active player, DOM-built escaped HTML with inline WAVs/images, text fallback for failed images, bounded PNG text, source labels and disabled empty exports. Browser tests validate offline audio/media, hostile title, credits/cast and PNG dimensions. Missing demo media now returns 404 before headers are sent. |
| 15 | Recorded demo/capture | **Corrected provenance:** all six committed frames hash-match `fixtures/local-scene.jpg`; the original `normal-0627b047-...json` says `REAL LOCAL MODELS — SIMULATED FRAME AND TRANSCRIPT`. There is no real Twitch-input evidence in this fixture. Preserved recordings, added provenance metadata, explicit model-check labels in demo/episode/PNG, and source markers on new beats. `/episode/latest` excludes model checks and simulated runs, including historical checks when their records exist. Capture validates/stages media before replacement, backs up the old fixture, restores on swap failure, rejects simulated streams and requires `--allow-model-check` for synthetic-input recordings. Capture/provenance tests and browser replay/export tests added. Fixed inter-line pause/resume state, playback failures and initially enabled empty replay button. |
| 16 | Two-line plates/credit labels | Kept. Seven labelled 1920×1080 style previews inspected. Browser geometry checks confirm subtitle font ≥40px at this size, bottom third and at most two line-heights plus padding. **Fixed Epic's 38.4px text at 1920px**. Credit has one label. |
| 17 | Judges docs/screens | Updated README/Devpost/video guidance to distinguish model checks, simulations, replay and live evidence. Removed an unsupported competition-rules claim and hosted-model compatibility claim (runtime enforces loopback). Added reproducible review/offline checks. Old screenshots retained; README now uses labelled review screenshots. Capture helper writes new screenshots under ignored data instead of overwriting old documentation images. |
| 18 | Unhinged genre | Kept seventh persona, six examples, voice/style and chat-style validation. Added the missing seventh CLI transcript; check success now requires `genres.length`, not hard-coded six. Baseline falsely passed with six spoken beats and two skipped Unhinged attempts (`undefined.slice`). Corrected run speaks all seven. |
| 19 | Chat pulse | Kept thresholds, whitelisted tokens, cooldown and single pending hype event. Added a bounded reaction window and bounded tokens. **Fixed bypass of the edited blocklist and 50-event queue cap.** Tests cover window expiry, cooldown reopening, solo/multiple chatters, ordinary chat exclusion, banned hype and full queue. |
| 20 | Emote images/voice | Validated cache/source names and HTTPS CDN URLs; channel maps replace stale maps; channel 7TV uses the same validation. Bounded parallel lookups with short deadlines, stale-load generation protection and shutdown cancellation; refresh after auth user changes. Client ignores inherited map properties. **Fixed emote-only speech fallback and rechecks the actual spoken text after stripping emotes**, preventing `kill KEKW yourself` bypass. Added cache, override, offline failure, abort and final voice-gate tests. Live CDN/channel appearance remains best effort and was not authenticated in this review. |
| 21 | One-minute `!genre` cooldown | Kept. Added exact 59,999ms rejection / 60,000ms reopening regression test; existing distinct-voter/majority behavior still passes. |

## Measured local output

Source: `data/checks/normal-model-check-10ec7a4a-ddf7-488c-a967-321e4463772f.json`; corresponding WAV/JPEG files are in `data/streams/model-check-10ec7a4a-ddf7-488c-a967-321e4463772f/`. A public timing/line summary is saved alongside this log in `PHASE_3_REVIEW_RESULTS.json`.

**Scope:** gemma3:4b writer and eyes, normal mode, local Kokoro, one repeated synthetic frame and seven scripted transcripts. These are not seven live Twitch/game beats. First eyes caption took 3747ms; subsequent beats reused the identical-frame cache. Seven spoken rows, zero skipped rows or diagnostic retries. No new light-mode or 12B benchmark in this task.

| Genre | Eyes ms | Writer ms | TTS ms | Total ms | Line |
|---|---:|---:|---:|---:|---|
| noir | 3747 | 2068 | 3129 | 8959 | Twenty health and no key. He never learns. |
| nature | 0 | 3249 | 6695 | 9956 | The acquisition of a new element, remarkably, came at a steep cost. Hassan’s territorial losses are evident. |
| epic | 0 | 2486 | 5182 | 7671 | Thus began the age of consequences, Hassan, fueled by a single, regrettable draught. |
| sports | 0 | 5248 | 3446 | 8698 | That third attempt highlighted Hassan’s remarkably poor lockpicking skills. |
| horror | 0 | 2329 | 4428 | 6761 | That’s quite the impressive display of inefficient resource management, Hassan. |
| heist | 0 | 9475 | 4998 | 14480 | Hassan’s instinct for concealment proved spectacularly, and predictably, misguided. |
| unhinged | 0 | 2915 | 3259 | 6179 | actual npc behavior, he’s literally a walking tutorial ICANT |

Range **6.179–14.480s**, median **8.698s**, mean **8.958s**. All audio used Kokoro. The six-second goal remains unmet; one writer call took 9.475s. Existing keep-alive, compact output, reduced prompt and cached captions are retained. A single synthetic repeated-frame check cannot establish live-game latency or narration quality.

## What still needs a human/live session

- On the actual game/OBS scene, check the configured game-layer source, visual capture priority and freshness, and Chrome microphone permission/recognition. No physical OBS connection or mic was exercised here.
- Authorize/connect Twitch if needed, then test real chat, EventSub eligibility, moderation and markers while live. This task did not send messages, create markers, explicitly restart/stop the existing server, or treat simulations as live evidence.
- Choose/record an actual stream ID before replacing the labelled model-check replay with a real-session demo. Use `npm run demo:capture -- <id>`; the old fixture is backed up under ignored `data/demo-backups/`.
- Submission-specific video, account authorization and Devpost fields remain user work. No submission or deployment occurred.

No additional dependency packages were introduced. The added font files are local OFL assets with individual licences and upstream checksums in `src/client/fonts/SOURCES.md`. New documentation images are illustrative/simulated and labelled within the captured frame. Existing live-test claims in the outside log remain historical claims; only the results above were verified in this review.

Final application back into the repository: `npm test` (75/75), typecheck, build, check:twitch and `git diff --check` passed again. Seven real WAVs and their saved manifest were verified after copying the isolated check evidence back. Browser checks and the real-model check above used the isolated copy of the same implementation.

Font licence bytes retain upstream whitespace/line endings; `.gitattributes` disables whitespace checks only for these verbatim licence files.
