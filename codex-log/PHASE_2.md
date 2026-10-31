# Phase 2 — Twitch input and chat-driven story

Date: 1 November 2026 (Asia/Karachi).

Continuation was explicitly requested by the user after Phase 1. Phase 1 is
committed as `c98dba8`. The automatic continuation does not claim a passed human
live-game taste gate. The original spec, prompts and Phase 0 artifacts remain
preserved in Git.

Implemented:
- `ChatSource`, anonymous read-only IRC with IRCv3 tag escaping, fragmented-line
  buffering, PING/PONG, eight-second opening timeout and reconnect backoff.
  No PRIVMSG/chat-post operation exists. Shared Chat dedupes source message IDs.
- Public-client device code authorization, broadcaster identity validation,
  hourly token validation, private atomic token persistence, serialized
  one-time refresh-token rotation, denied/expired authorization handling, and
  host code/connection status. No client secret or paid API is needed.
- EventSub welcome/subscriptions, keepalive deadline, reconnect handoff without
  duplicate subscriptions, ordinary reconnect/resubscribe, metadata dedupe and
  revocation. Follow v2, sub, gift, cheer, incoming raid and chat mappings use
  the requested broadcaster conditions. A 409 on another transport session
  is reported instead of incorrectly claiming that session is connected.
- First-token, case-insensitive `!genre`, `!twist`, `!recap`. Genre ballots use
  distinct voters in 30 seconds and a three-minute cooldown; ties retain the
  current genre. A lone request applies to the next beat while the ballot can
  still collect votes. `!recap` has a two-minute cooldown and validates exactly
  two complete sentences within the 30-word limit.
- Blocklist then model screen for viewer names and proposals/events. Approval
  is default; optional automatic approval can be restricted to mods/VIPs,
  leaving other proposals in host approval. Pending plus accepted twists are
  capped at three; per-chatter proposal cooldown is two minutes. One safety
  proposal runs at a time. Queue clearing invalidates a pending screen result.
- Host approval/rejection, clear queue, mode/mod-VIP controls and per-run banned
  word editing. Edited bans reach the final voice gate too, and stop an active
  line. Credits persist with beats and display on the overlay. Event toasts are
  tied to narrated events. Deferred events/recaps survive higher-priority beats.
- A confirmed-live chapter can create a Helix stream marker. Marker checks and
  failures run outside the narration critical path and never interrupt audio.
- Event input and screened-event queues are bounded at 50; overflow skips are
  reported to the host. New Twitch input cannot grow these queues indefinitely.

Verification:
- `npm run check:twitch` feeds the labelled simulated fixture through the real
  command router, director and file store with fake AI. Three beats were saved:
  twist → follow event → recap. Genre majority selected heist, the Shared Chat
  copy was ignored, approval attached PlotFriend's credit, and WAVs persisted.
  Result: ignored `data/checks/phase2-simulation.json` and a `simulated-phase2-`
  stream folder. These are not live Twitch traffic or model latency results.
- The bounded production-browser check covers screen/frame and final transcript
  delivery, real WebSockets, persisted WAV playback, mute/skip, clicking host
  Approve, displaying the twist credit, and editing the final voice blocklist.
  Simulated pages carry a visible test banner; no page errors were observed.
- Tests cover IRC parsing/framing/PING/reconnect, vote and cooldown rules,
  blocklist/model rejection, approval/queue bounds/credit, mods/VIP policy,
  in-flight invalidation, dynamic voice bans, recap priority, each event mapping,
  keepalive, handoff/revocation/backoff, public device polling/denial, private
  file permissions, overlapping refresh calls, and live-only marker behavior.

Live connectivity probe:
- An initial read-only connection got HTTP 101 and CAP responses but no login
  welcome. The diagnostic exposed batched login commands in one WebSocket
  frame. Each IRC command is now sent in a separate frame; a regression test
  verifies that contract.
- The corrected eight-second anonymous probe connected successfully to Twitch.
  No chat messages were sent or stored. Result is saved in ignored
  `data/checks/twitch-connection-probe-framed.json` (connected=true, 8021 ms
  observation window). This proves anonymous handshake connectivity, not
  delivery from the user's own channel or live OAuth/EventSub authorization.

Unfinished user-side verification:
- `TWITCH_CLIENT_ID` is empty. Register/supply a Public application's client ID
  and approve the device flow as the broadcaster. Those credentials and account
  consent cannot be supplied or invented by the implementation.
- Grant Chrome actual screen/mic access, choose the real game window, confirm
  taste/timing and OBS audio, then use a second account for follow/genre/twist/
  recap and record the session. Subscription/cheer availability is account-
  dependent. No authenticated live event test has been claimed.
- The test payloads are explicitly simulated from documented schemas, not
  recorded user traffic. Live recorded fixtures await account authorization.
- Phase 3 requests the user's best real stream ID for its recorded-session
  replay. None has been supplied. The episode/demo screens remain Phase 0
  placeholders; synthetic benchmark sessions are not substituted for a live
  game recording.

Primary protocol references consulted:
- https://dev.twitch.tv/docs/chat/irc
- https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow
- https://dev.twitch.tv/docs/authentication/refresh-tokens/
- https://dev.twitch.tv/docs/eventsub/handling-websocket-events/
- https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/

No real model calls were needed in Phase 2; fake timings are not performance
measurements. Actual normal/light timings and their limitations are in
PHASE_1.md and PHASE_1_RESULTS.json. No dependencies beyond the allowlist were
added. Final checks and commit are appended below after completion.

Final acceptance: 38 tests, strict typecheck, fake Twitch simulation,
production build and bounded browser flow passed. The live anonymous IRC
handshake also passed. TWITCH_CLIENT_ID remains unset, so authenticated
OAuth/EventSub and the real-game/OBS checks remain explicitly unverified.
All check servers and anonymous probes were stopped. No paid API or new
dependency was introduced.

Final UI/startup check: Start is disabled until local model health and voice
readiness pass; Stop remains available during a failure. The production app
started with light mode enabled on the actual 24 GB Mac, voice unloaded until
explicit warmup, no configured Twitch client ID, and narration stopped. Its
state endpoint passed the bounded smoke check, and the app was closed.
The final host screenshot was visually inspected; no clipped controls were
observed. The check screenshot remains private under `data/screens/`.
