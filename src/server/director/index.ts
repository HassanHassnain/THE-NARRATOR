import type { Settings, StoryEvent, Transcript, Twist } from '../../shared/protocol.js';
import { createStory } from './storyState.js';
import { normalizeWakeWord, selectTrigger } from './triggers.js';
import type { BeatRunner } from './beatRunner.js';
export class Director {
  state = createStory();
  settings: Settings = { protagonist: 'Streamer', genre: 'noir', cadenceSeconds: 35, spice: 1, lightMode: false, muted: false, running: false };
  transcript: Transcript[] = []; events: StoryEvent[] = []; twists: Twist[] = [];
  source: 'stream' | 'simulated' = 'stream';
  frame: Buffer | undefined; frameAt = 0; mic = false; recap = false;
  private lastAttempt = Date.now();
  private lastPrecaption = 0;
  constructor(readonly runner: BeatRunner) {}
  /** Starts a fresh story (new stream id, empty canon and queues) with the current settings. */
  newEpisode() {
    this.runner.cancel();
    this.state = createStory(this.settings.protagonist, this.settings.genre);
    this.transcript = []; this.events = []; this.twists = []; this.recap = false;
    // Open the episode within a few seconds instead of after a full cadence interval.
    this.lastAttempt = Date.now() - this.settings.cadenceSeconds * 1000 + 4000;
    return this.state.streamId;
  }
  addTranscript(text: string, at = Date.now()) {
    const clean = normalizeWakeWord(text.trim().slice(0, 2000)); if (!clean) return;
    this.transcript.push({ text: clean, at: Math.min(Date.now(), Math.max(Date.now() - 60000, at)) });
    this.transcript = this.transcript.slice(-30);
    void this.tick();
  }
  async tick(now = Date.now()) {
    const selected = selectTrigger({ now, lastAttempt: this.lastAttempt, inFlight: this.runner.busy, settings: this.settings, transcript: this.transcript, twists: this.twists, events: this.events, recap: this.recap });
    if (!selected) {
      if (this.settings.running && !this.settings.muted && this.frame && !this.runner.busy && now - this.lastPrecaption >= 10000) { this.lastPrecaption = now; void this.runner.precaption(this.frame); }
      return;
    }
    this.lastAttempt = now; this.state.protagonist = this.settings.protagonist;
    const transcript = this.transcript.splice(0);
    const events = selected.event ? [selected.event, ...this.events.filter(e => e.id !== selected.event!.id).slice(0, 4)] : this.events.slice(0, 5);
    if (selected.trigger === 'recap') this.recap = false;
    const beat = await this.runner.run({ state: this.state, settings: { ...this.settings }, ...(this.frame ? { frame: this.frame } : {}), transcript, events, source: this.source, ...selected });
    if (beat) {
      if (selected.twist) this.twists = this.twists.filter(t => t.id !== selected.twist!.id);
      if (selected.event) this.events = this.events.filter(e => e.id !== selected.event!.id);
    }
    return beat;
  }
}
