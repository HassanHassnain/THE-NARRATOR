# Fixes made outside Codex — 1 Nov 2026 (read before Phase 3)

These were made by Claude Code at the team's request, between Phase 2 and Phase 3. Keep them.

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
