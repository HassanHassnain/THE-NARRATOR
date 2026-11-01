# Demo video: script and recording runbook (under 3:00)

Judges may watch only this video. It has to be funny in the first 15 seconds, prove it runs on real Twitch, and show Codex.

## Before recording (5 min)
- Headphones on, so the mic doesn't pick up the narrator.
- In OBS, choose **Start Recording only** (local). Go live only if you want the stream public.
- Control room: Load models & voice → Enable microphone → Roast level 2 → start in **Noir**.
- Second Twitch account logged in on your phone, with your channel's chat open.
- Minecraft Classic window in front, full size.

## Record about 12 minutes of play, hitting these moments (it doesn't need to be in order)
1. **The brag** (noir): say "chat, this jump is easy" and miss it. Wait for the line.
2. **Talk back:** "Narrator, I'm not stuck." Wait for the reply, about 10 s. Do it twice more during the session.
3. **Genre switch:** from the phone, type `!genre sports`. Do something dramatic, like building tall and falling.
4. **Plot twist:** from the phone, `!twist the sheep are planning a coup`. Approve it in the control room and let it land with the PLOT TWIST card.
5. **Unhinged:** `!genre unhinged`. Brag again: "I'm actually cracked at this game."
6. **Chat reaction:** from both accounts (phone + laptop chat), spam `KEKW` 3–4 times right after a fail. The narrator reacts to chat, and the CHAT card shows the KEKW image.
7. **A follow** from the phone account, if it isn't already following.
8. `!recap` near the end.

Afterwards: run `npm run demo:capture -- <streamId>` to preserve a recorded stream for replay; the capture command backs up the old fixture. Use `/episode/<streamId>` for footage. The currently bundled fixture is a model check with synthetic inputs; it is not evidence of live Twitch chat.

## Edit (2:55 max)

| Time | Shot | Notes |
|---|---|---|
| 0:00–0:15 | **Cold open:** the brag, the fail, the noir line, then your talk-back and its smug reply | Best moment first, no title |
| 0:15–0:25 | Title card: "THE NARRATOR · Your stream has a narrator now. Chat writes the plot." | |
| 0:25–0:55 | Chat in control: `!genre sports` (style and voice flip live), then `!twist` → approve → line + PLOT TWIST card | Show the phone chat in a corner |
| 0:55–1:25 | **Unhinged mode:** the brag line in chat style, KEKW spam, the narrator reacting to chat with the emote card | This is the "made for Twitch" moment |
| 1:25–1:45 | Follow narrated as a story beat; `!recap` | |
| 1:45–2:05 | Episode storybook scroll, the PNG card, the control room (mute, skip, approve) | "Every stream becomes an episode" |
| 2:05–2:25 | **Why it matters:** "Built for streams with three viewers. Runs on your Mac, free, the screen never leaves it." Show `ollama ps`, the OBS game-only layer | Impact + privacy |
| 2:25–2:50 | **Built with Codex:** the Codex thread (AGENTS.md, phase prompts, tests passing, `codex-log/`) | Must show the Codex session |
| 2:50–2:55 | Repo URL + `/demo` | |

Cut the waiting between your line and the narrator's reply (it takes about 7–12 s live); say on screen that pauses are trimmed. Don't speed up or fake the narration itself. Label anything simulated.
