import { randomUUID, createHash } from 'node:crypto';
import { blocked, config, eyesModel, writerModel } from '../config.js';
import type { Eyes, TTS, Writer } from '../ai/interfaces.js';
import type { Screen } from '../ai/screen.js';
import type { BeatStore } from '../store.js';
import type { Beat, BeatLog, Settings, StoryEvent, StoryState, Transcript, Twist, Trigger } from '../../shared/protocol.js';
import { buildPrompt } from './promptBuilder.js';
import { applyBeat } from './storyState.js';
export interface BeatInput { state: StoryState; settings: Settings; frame?: Buffer; transcript: Transcript[]; events: StoryEvent[]; trigger: Trigger; twist?: Twist; event?: StoryEvent }
export class BeatRunner {
  private active: AbortController | undefined;
  private summaryController: AbortController | undefined;
  private summaryTask: Promise<void> = Promise.resolve();
  async settleSummary() { await this.summaryTask; }
  private captionCache: { hash: string; text: string } | undefined;
  constructor(private ai: { eyes: Eyes; writer: Writer; tts: TTS; screen: Screen }, private store: BeatStore,
    private publish: (beat: Beat) => void, private log: (log: BeatLog) => void, private timeoutMs = config.limits.beatTimeoutMs ?? 10000, private bannedWords: () => string[] = () => config.blocklist) {}
  get busy() { return !!this.active; }
  cancel() { this.active?.abort(new Error('Skipped or muted by host')); this.summaryController?.abort(); }
  async run(input: BeatInput): Promise<Beat | undefined> {
    if (this.busy || input.settings.muted) return;
    this.summaryController?.abort();
    const controller = new AbortController(); this.active = controller;
    const started = performance.now();
    const latency = { eyes: 0, writer: 0, tts: 0, total: 0 };
    let caption = ''; let line = ''; let stage: 'eyes' | 'writer' | 'tts' = 'eyes'; let stageStarted = started;
    const timer = setTimeout(() => controller.abort(new Error('Beat exceeded 10 seconds; skipped')), this.timeoutMs);
    const signal = controller.signal;
    const operation = async () => {
      if (input.frame) {
        const hash = createHash('sha256').update(input.frame).digest('hex');
        if (this.captionCache?.hash === hash) caption = this.captionCache.text;
        else {
          const result = await this.ai.eyes.caption(input.frame, signal); signal.throwIfAborted();
          caption = result.value; latency.eyes = result.latencyMs; this.captionCache = { hash, text: caption };
        }
      }
      if (!caption && !input.transcript.length && !input.events.length && !input.twist) throw new Error('Share a screen or provide a transcript before narrating');
      stage = 'writer'; stageStarted = performance.now();
      const request = buildPrompt({ ...input, caption, model: input.settings.lightMode ? eyesModel() : writerModel() });
      const result = await this.ai.writer.write(request, signal); signal.throwIfAborted();
      latency.writer = result.latencyMs; const narration = result.value; line = narration.line;
      if (blocked([line, narration.chapterTitle ?? ''].join(' '), this.bannedWords())) throw new Error('Final blocklist rejected model output');
      if (input.state.recentLines.includes(line)) throw new Error('Repeated recent line; skipped');
      if (input.twist && narration.usedTwistId !== input.twist.id) throw new Error('Writer did not credit the accepted twist');
      if (narration.usedTwistId && narration.usedTwistId !== input.twist?.id) throw new Error('Writer referenced an unknown twist');
      // Only already-screened viewers can enter the cast. New model inventions never enter canon.
      const known = new Set([...Object.keys(input.state.cast), ...input.state.canon.map(t => t.author), ...input.events.map(e => e.author), ...(input.twist ? [input.twist.author] : [])]);
      for (const cast of narration.castUpdates) {
        if (!known.has(cast.name) || blocked(`${cast.name} ${cast.role}`, this.bannedWords())) throw new Error('Unscreened cast update');
        const screened = await this.ai.screen.check(`${cast.name}: ${cast.role}`, signal); signal.throwIfAborted();
        if (!screened.allow) throw new Error('Cast update rejected by safety screen');
      }
      stage = 'tts'; stageStarted = performance.now();
      // Last gate before voice; raw transcript/chat text is never sent to TTS.
      if (blocked(line, this.bannedWords())) throw new Error('Final blocklist rejected voice input');
      const speech = await this.ai.tts.speak(line, input.settings.genre, signal, this.timeoutMs - (performance.now() - started)); signal.throwIfAborted();
      latency.tts = speech.latencyMs;
      const id = randomUUID(); const base = `/media/${input.state.streamId}`;
      const beat: Beat = { id, streamId: input.state.streamId, at: Date.now(), trigger: input.trigger, genre: input.settings.genre,
        caption, line, chapterTitle: narration.chapterTitle ?? input.state.chapterTitle, chapterChanged: !!narration.chapterTitle && narration.chapterTitle !== input.state.chapterTitle, castUpdates: narration.castUpdates,
        ...(input.twist ? { twist: input.twist } : {}), ...(input.event ? { event: input.event } : {}),
        latency, audioUrl: `${base}/audio/${id}.wav`, frameUrl: input.frame ? `${base}/frames/${id}.jpg` : '',
        durationSeconds: speech.value.durationSeconds, engine: speech.value.engine, lightMode: input.settings.lightMode };
      latency.total = Math.round(performance.now() - started);
      await this.store.save(beat, input.frame, speech.value.bytes, signal); signal.throwIfAborted();
      latency.total = Math.round(performance.now() - started);
      applyBeat(input.state, beat, narration, input.twist);
      this.publish(beat); this.log({ at: beat.at, status: 'spoken', trigger: input.trigger, caption, line, latency, engine: speech.value.engine });
      if (input.state.beatCount % 5 === 0 && this.ai.writer.summarize) this.summaryTask = this.refreshSummary(input.state, request.model);
      return beat;
    };
    try {
      return await Promise.race([operation(), new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))]);
    } catch (error) {
      latency.total = Math.round(performance.now() - started);
      if (!latency[stage]) latency[stage] = Math.round(performance.now() - stageStarted);
      this.log({ at: Date.now(), status: 'skipped', trigger: input.trigger, caption, line, latency, reason: error instanceof Error ? error.message : 'Beat skipped' });
      return;
    } finally { clearTimeout(timer); if (this.active === controller) this.active = undefined; }
  }
  private async refreshSummary(state: StoryState, model: string) {
    const controller = new AbortController(); this.summaryController = controller;
    const timer = setTimeout(() => controller.abort(), 6000);
    const revision = state.beatCount; const started = performance.now();
    let method = 'fallback'; let latencyMs = 0;
    try {
      const result = await Promise.race([
        this.ai.writer.summarize!(state.summary, model, controller.signal),
        new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('Summary cancelled')), { once: true }))
      ]);
      latencyMs = result.latencyMs;
      if (!controller.signal.aborted && Math.floor(state.beatCount / 5) === Math.floor(revision / 5) && !blocked(result.value, this.bannedWords())) {
        state.summary = result.value; method = 'model';
      }
    } catch { /* Keep the bounded, factual fallback. Summary failures never cost a beat. */ }
    finally { clearTimeout(timer); if (this.summaryController === controller) this.summaryController = undefined; }
    if (Math.floor(state.beatCount / 5) === Math.floor(revision / 5)) {
      try { await this.store.saveSummary?.(state.streamId, { atBeat: revision, text: state.summary, latencyMs: latencyMs || Math.round(performance.now() - started), method }); }
      catch { /* Optional summary metadata must not disrupt narration. */ }
    }
  }
}
