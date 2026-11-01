# Changes between the Codex phases (1 Nov 2026)

These came out of testing on real streams, between Phase 2 and Phase 3. Codex reviewed items 1–21 in Phase 3 (`PHASE_3_REVIEW.md`); items 22 onward came from the demo takes afterwards, each with its tests.

1. **Pages never loaded their scripts.** `/host` (no trailing slash) resolved `./main.ts` to `/main.ts` → 404, so the host page was unstyled and never connected. All four `index.html` files now use absolute paths (`/host/main.ts` etc.).
2. **Check scripts ignored `.env`.** `check:local`, `check:browser` and `check:twitch` now call `loadEnvFile()`. Earlier "gemma" measurements were really `gpt-oss:20b` + `gemma3:4b`.
3. **Models.** `.env` now uses `gemma3:4b` for both writer and eyes. Measured on this 24 GB M5 under normal desktop load: 6/6 beats spoken, writer 2–5 s, total 7–12 s. `gemma3:12b` writes slightly better but took 7–15 s per write under memory pressure and timed out. Data: `data/checks/normal-0627b047-*.json` (4b), `normal-5fbb6f87-*.json` (12b).
4. **Prompt (non-gpt-oss branch, `promptBuilder.ts`).** Stronger genre personas (`config/narrator.json`), examples inline in the system prompt (no fake user/assistant turns: gemma copied their scenes), recent lines not shown to the model (it copied them; the writer still rejects exact repeats), labelled user message (`STREAMER JUST SAID`, `SCENE`, `TWITCH EVENTS`, `PLOT TWIST (id …)`), 8–18 words, punchline last. The system prompt is now beat-independent so Ollama can reuse the prefix cache.
5. **Writer (`writer.ts`).** Gemma asks only for `{line, chapterTitle}`; `castUpdates` = [] and `usedTwistId` = the queued twist id are filled in code (halves output tokens). Temperature 0.9 for gemma.
6. **Timeouts and voice.** `beatTimeoutMs` 15000 (the server had a hard-coded 10000 in `app.ts`; it now reads config). The Kokoro→`say` budget threshold is `words × 220 + 800 ms` (was ×350 + 1400, which forced the robotic macOS voice almost every beat). The timeout message reports the real value.
7. **UI.** Host redesigned as a control room (on-air tally, genre tiles, "last line on air" card, beat log with timing bars, Twitch panel). The overlay now has per-genre subtitle plates, a sports lower-third, a PLOT TWIST credit card, a chapter card and a genre badge, driven by `body[data-genre]`.

`npm test` (38/38), `npm run typecheck` and `npm run build` pass after these changes.

## Second pass (after the first live Twitch test, 1 Nov ~12:20 PKT)

What the live test showed: the twist pipeline worked end to end; whole-screen capture made the narrator read its own subtitles back (feedback loop) and exposed the streamer's other windows; 4/12 beats timed out waiting on screen captions; no talk-back reached the narrator.

8. **OBS game layer as the narrator's eyes** (`src/server/obsFrames.ts`): frames come from obs-websocket `GetSourceScreenshot` of one source (`OBS_GAME_SOURCE`, default `Game`). No browser screen share, no other windows, no feedback loop. Browser sharing remains as a fallback and is ignored while OBS frames are fresh. `/api/frame` serves the current frame to the control-room preview.
9. **Background captioning** (`BeatRunner.precaption`, `Director.tick`): the eyes model runs between beats every ~10 s; beats reuse a caption up to 30 s old. Live result on OBS frames: 5/5 beats spoken in 6.6–11.9 s, 4 of them with zero caption wait.
10. **Stable overlay key** (`data/overlay.key`): the OBS Browser Source link no longer breaks on restart.
11. **Chapter-title sanitizer** (`cleanChapterTitle`): a 4B model leaked `”, 1”, 0”, [], 0 } </p>` into a title, which would have reached the overlay and Twitch stream markers. Tests added.
12. **Wake word** now accepts common mis-hearings (narrater, narator, nerator). Tests added.
13. **Twitch EventSub:** subscriptions retry up to three times and the request timeout is 15 s (subscriptions timed out while the dev server was starting).
14. **Episode page** (`/episode/:id`, `/episode/latest`): chapters, frames, playable lines, twist credits, cast, a 1080×1350 PNG story card and a self-contained HTML export. `/api/episodes` lists real sessions.
15. **Judges' replay** (`/demo`, `npm run demo:capture -- <streamId>`, `fixtures/demo-session/`): plays a recorded real session through the overlay styling without models or Twitch, labelled "RECORDED SESSION — REPLAY".
16. **Overlay:** removed the duplicated "PLOT TWIST" label; the subtitle plate now fits two lines with padding.
17. **Docs:** README rewritten for judges; `docs/DEVPOST.md` draft; `npm run screens` regenerates `docs/screens/`.

Verification: `npm test` 40/40, `npm run typecheck`, `npm run build`, `npm run check:twitch` all pass.

## Third pass: Twitch-native tone (1 Nov ~13:30 PKT)

Feedback: real Twitch chat doesn't talk like a cinematic narrator; it shitposts.

18. **Unhinged genre** (`config/narrator.json`, prompt rules): writes like a chat message (lowercase, slang, at most two emote words), drawing two rotating slang hints per beat in the user message (so the prompt cache still works). Persona has no fixed phrase list, because the 4B model repeated "he's cooked" when it had one. Chat-style lines may end in an emote (`parseNarration(chatStyle)`). Overlay: chat-message plate with a purple `narrator:` label and a "CHAT MODE" badge; host tile; episode title "<name> Is So Cooked".
19. **Chat pulse** (`src/server/twitch/pulse.ts`): emote spam and meme phrases (whitelist) become a `hype` story event: 3 reaction messages from 2+ chatters, or 5 from anyone, within 10 s; 25 s cooldown; one pending at a time. No model screen is needed because only whitelisted tokens are passed on. Every genre is told to react to what chat felt.
20. **Real emotes** (`src/server/emotes.ts`, `/api/emotes`, `src/client/emotes.ts`): the 7TV/BTTV global sets, the channel's 7TV set, Twitch global and channel emotes via Helix, and core reaction emotes via 7TV exact search; cached weekly. Rendered as images in overlay subtitles, cards, demo and episode. `stripEmotes` keeps them out of the voice; `fixEmoteCase` restores their spelling and caps repeated runs at two.
21. `!genre` cooldown is 1 min (was 3) to keep a demo moving.

Measured (gemma3:4b, live server): talk-back "it's so over, falling in water is your baseline, saad." in 10.4 s; excited speech "insane is putting it mildly. we're so back." in 5.5 s. Tests: 46/46.

## After the Phase 3 review (demo prep)

22. **One OBS button runs the show** (`src/server/obsFrames.ts`, `app.ts`, `director/index.ts`, `store.ts`): the OBS client subscribes to output events. When OBS starts recording, the narrator starts a fresh episode (new stream id, empty canon and queues) and turns on. It writes `data/streams/<id>/recording.json` with the file path and start time, so takes can be cut from beat timestamps. Stopping the recording pauses the narrator.
23. **Chat pulse for tiny streams** (`pulse.ts`, `commands.ts`, `config/narrator.json`): the solo threshold and window come from config (`chatPulseSoloMessages: 3`, `chatPulseWindowSeconds: 12`). The code default stays at 5, so one excited viewer can trigger a reaction beat in a three-viewer stream.
24. `config.twistMode` is now read at startup; the default stays `approve`. Auto-accept was switched on from the control room for the demo.
25. **Microphone remembered** (`src/client/host/main.ts`): speech recognition restarts after a reload, or on `/host?mic=on`, and re-reports itself after a server restart.

26. **Findings from the first two demo takes** (all 16 lines were cadence lines; whisper transcripts of the takes):
   - **Wake word:** speech-to-text heard "narrator" as "Nader" in all eight attempts, so it now matches nader/nadir/nadar and other close misspellings.
   - **Safety screen:** it rejected `!twist change the ending` for "deviating from the narrative" and read `muhammad_…` usernames as religious references or personal data. It now judges only the twist text, against an explicit rubric with examples, at 17/18 on a local-model check of story and harmful twists. Events (follows etc.) no longer go through the model, because their only viewer text is a Twitch-moderated username; the blocklist still applies.
   - **Twist cooldown:** a rejected twist only costs 15 s, so the viewer can rephrase.
   - **Between takes:** stopping a recording restores the take's starting genre, clears queued twists, events, cooldowns and votes, and reloads the OBS chat panel. Starting one does the same and opens the episode with a line within about 10 s instead of 40.
   - **Prompt:** it said "roast the silence" when nothing was said, which produced five lines about silence. It now ignores silence and treats speech-to-text as possibly garbled (react to the meaning, quote at most three words).
   - **Lines:** non-recap lines keep whole sentences up to 20 words (sports lines ran to 28 words, 9 s). Markdown asterisks are stripped, because the voice read "asterisk". "cadence" and similar leaked trigger names are no longer chapter titles.
   - **Settings and transcripts:** settings and twist mode persist in `data/settings.json` across restarts. What the streamer says is saved per episode in `transcript.jsonl`, locally, for editing.

Measured during setup (battery, Low Power Mode on): 11–13 s per beat; OBS lagged 6–26% of frames while the model ran. Plugged in, without Low Power Mode, is the recording setup. Tests: 82/82.

## Demo replays (1 Nov evening)

I couldn't record another take that evening, so I re-ran my recorded take 1 through the current build. OBS plays the take, the narrator's eyes see only its game area, my whisper-transcribed speech is fed in at its original timestamps, and demo commands are posted live in Twitch chat from my second account (`user:write:chat`, a local token that never leaves the machine). The replays exposed four defects, all fixed with tests:

27. **"Nader" became a character** (`director/triggers.ts`, `director/index.ts`): the narrator answered "Asking for an echo, Nader?". Misheard wake words are now rewritten to "Narrator" before the writer sees them, and the talk-back rule says "Narrator" is the narrator itself.
28. **Twists acknowledged but not told** (`promptBuilder.ts`, `ai/writer.ts`): the model returned the twist id with an unrelated line ("actual npc behavior…"). The twist is now the second line of the prompt with a MUST instruction, and the writer rejects a twist line that shares no key word with the twist (`mentionsTwist`), so it retries instead.
29. **Twist screen timed out under load** (`twitch/commands.ts`): with narration and TTS running, screening took over 6 s and the twist was rejected. The timeout is 15 s; a timeout still rejects. The model client's own 10 s cap (`ai/client.ts`) also cut the screen short while Ollama was busy narrating; it is 30 s now, since every caller passes its own deadline.
30. **Recaps that weren't** (`ai/writer.ts`, `promptBuilder.ts`): unhinged mode produced "summit of a blue puddle? L", which passed as two "sentences". A recap now needs 12–30 words in two sentences and is prompted to cover what happened, the twist and chat's reaction.
31. **Recaps timed out** (`director/beatRunner.ts`): a recap waited 7 s for a fresh screen caption and blew the 15 s beat budget. Recaps and talk-back replies now reuse the last caption; recaps skip the screen entirely when there is none.
32. **Voice read chat shorthand** (`emotes.ts`): Kokoro said "capital L" for `L` and "el mal" for `LMAOOO`. Standalone L/W and LMAO-style words stay in the subtitle but are no longer spoken. The demo video trims those two words from the end of two replayed lines, which is what the fixed build now does.
33. **Unhinged recaps were thrown away** (`ai/writer.ts`): chat style is lowercase, and `Intl.Segmenter` does not break a sentence before a lowercase word, so "…drowning. the sheep are staging a coup…" counted as one sentence and failed the two-sentence check. Sentences are now counted by end punctuation. Real-model check: 3 of 4 unhinged recaps pass, versus 1 of 4 before.
34. **Beat budget 30 s** (`config/narrator.json`): with Low Power Mode on during a live take, every line took 15–21 s and the 15 s budget discarded all of them, so the narrator stayed silent for two minutes. A late line beats no line; the budget is now 30 s.
35. **The `/demo` fixture is now a real stream** (`fixtures/demo-session`, README): captured with `npm run demo:capture` from the final live take (7 narrated beats, a viewer's plot twist, a chat reaction). The previous fixture was a model check from a synthetic frame; it is backed up under `data/demo-backups/`.

Recording setup: OBS now records with the hardware encoder (`apple_h264`); the software encoder dropped 8% of frames while the models ran. Tests: 85/85 (with the shorthand cases added).
