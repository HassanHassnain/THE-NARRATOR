# Demo video: script and recording runbook (under 3:00)

Judges may watch only this video. It has to be funny in the first 15 seconds, prove it runs on real Twitch, and show Codex.

## Before recording (2 min)
- Mac plugged in, Low Power Mode off, Presenter Overlay off. Headphones on.
- Control room open (`/host?mic=on` keeps the mic on). Noir, roast level 2, twists set to **Auto-accept** for the demo.
- Minecraft Classic in its own window, with a small Twitch chat window beside it.
- In OBS, press **Start Recording**. A fresh episode starts and the narrator turns on. Stop Recording pauses it.

## Record 6–10 minutes per take, hitting these moments (any order)
1. **The brag** (noir): "chat, this jump is easy", then miss it. Wait for the line.
2. **Talk back:** start the sentence with "Narrator," said slowly and clearly ("Narrator, I'm not stuck."). The reply takes about 10 s. Do it 2–3 times. Talk to the narrator and chat, not to the judges; the video's captions explain the features.
3. **Genre switch:** type `!genre sports` in chat (anyone in chat can), then do something dramatic. Wait at least a minute before the next `!genre`.
4. **Plot twist:** `!twist the sheep are planning a coup`. It's auto-accepted and lands with the PLOT TWIST card.
5. **Unhinged:** `!genre unhinged`, then brag again: "I'm actually cracked at this game."
6. **Chat reaction:** right after a fail, send three reaction messages within 12 s (`KEKW`, `KEKW KEKW`, `LMAOOO`). The narrator reacts to chat and the CHAT card shows the emote.
7. `!recap` near the end.

Afterwards: run `npm run demo:capture -- <streamId>` to preserve a recorded stream for replay; the capture command backs up the old fixture. Use `/episode/<streamId>` for footage. The currently bundled fixture is a model check with synthetic inputs; it is not evidence of live Twitch chat.

## Edit (2:55 max)

| Time | Shot | Notes |
|---|---|---|
| 0:00–0:15 | **Cold open:** the brag, the fail, the noir line, then your talk-back and its smug reply | Best moment first, no title |
| 0:15–0:25 | Title card: "THE NARRATOR · Your stream has a narrator now. Chat writes the plot." | |
| 0:25–0:55 | Chat in control: `!genre sports` (style and voice flip live), then `!twist` → line + PLOT TWIST card | The chat panel is part of the OBS scene |
| 0:55–1:25 | **Unhinged mode:** the brag line in chat style, KEKW spam, the narrator reacting to chat with the emote card | This is the "made for Twitch" moment |
| 1:25–1:45 | Follow narrated as a story beat; `!recap` | |
| 1:45–2:05 | Episode storybook scroll, the PNG card, the control room (mute, skip, approve) | "Every stream becomes an episode" |
| 2:05–2:25 | **Why it matters:** "Built for streams with three viewers. Runs on your Mac, free, the screen never leaves it." Show `ollama ps`, the OBS game-only layer | Impact + privacy |
| 2:25–2:50 | **Built with Codex:** the Codex thread (AGENTS.md, phase prompts, tests passing, `codex-log/`) | Must show the Codex session |
| 2:50–2:55 | Repo URL + `/demo` | |

Cut the waiting between your line and the narrator's reply (it takes about 7–12 s live); say on screen that pauses are trimmed. Don't speed up or fake the narration itself. Label anything simulated.
