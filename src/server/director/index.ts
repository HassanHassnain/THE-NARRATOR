import type { Settings, StoryEvent, Transcript, Twist } from '../../shared/protocol.js';
import { createStory } from './storyState.js';
import { selectTrigger } from './triggers.js';
import type { BeatRunner } from './beatRunner.js';
export class Director {
  state = createStory();
  settings: Settings = { protagonist: 'Streamer', genre: 'noir', cadenceSeconds: 35, spice: 1, lightMode: false, muted: false, running: false };
  transcript: Transcript[] = []; events: StoryEvent[] = []; twists: Twist[] = [];
  frame: Buffer | undefined; frameAt = 0; mic = false; recap = false;
  private lastAttempt = Date.now();
  constructor(readonly runner: BeatRunner) {}
  addTranscript(text: string, at = Date.now()) {
    const clean = text.trim().slice(0, 2000); if (!clean) return;
    this.transcript.push({ text: clean, at: Math.min(Date.now(), Math.max(Date.now() - 60000, at)) });
    this.transcript = this.transcript.slice(-30);
    void this.tick();
  }
  async tick(now = Date.now()) {
    const selected = selectTrigger({ now, lastAttempt: this.lastAttempt, inFlight: this.runner.busy, settings: this.settings, transcript: this.transcript, twists: this.twists, events: this.events, recap: this.recap });
    if (!selected) return;
    this.lastAttempt = now; this.state.protagonist = this.settings.protagonist;
    const transcript = this.transcript.splice(0);
    const events = selected.event ? [selected.event, ...this.events.filter(e => e.id !== selected.event!.id).slice(0, 4)] : this.events.slice(0, 5);
    if (selected.trigger === 'recap') this.recap = false;
    const beat = await this.runner.run({ state: this.state, settings: { ...this.settings }, ...(this.frame ? { frame: this.frame } : {}), transcript, events, ...selected });
    if (beat) {
      if (selected.twist) this.twists = this.twists.filter(t => t.id !== selected.twist!.id);
      if (selected.event) this.events = this.events.filter(e => e.id !== selected.event!.id);
    }
    return beat;
  }
}
