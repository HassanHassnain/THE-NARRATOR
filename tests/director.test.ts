import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeEyes, FakeScreen, FakeTTS, FakeWriter } from '../src/server/ai/fakes';
import { LocalEyes } from '../src/server/ai/eyes';
import { LocalWriter } from '../src/server/ai/writer';
import { LocalScreen } from '../src/server/ai/screen';
import type { BeatLog, Settings, StoryState } from '../src/shared/protocol';
import type { ChatClient, WriteRequest } from '../src/server/ai/interfaces';
import { BeatRunner } from '../src/server/director/beatRunner';
import { createStory } from '../src/server/director/storyState';
import { selectTrigger, wakeWord } from '../src/server/director/triggers';
import { buildPrompt } from '../src/server/director/promptBuilder';
import { FileStore } from '../src/server/store';
import { blocked } from '../src/server/config';
const settings: Settings = { protagonist: 'Hassan', genre: 'noir', cadenceSeconds: 35, spice: 1, lightMode: false, muted: false, running: true };
const logs: BeatLog[] = [];
function setup(timeout = 10000) {
  const eyes = new FakeEyes(), writer = new FakeWriter(), tts = new FakeTTS(), screen = new FakeScreen();
  const save = vi.fn(async () => {}); const publish = vi.fn();
  const runner = new BeatRunner({ eyes, writer, tts, screen }, { save }, publish, log => logs.push(log), timeout);
  const state = createStory();
  const input = () => ({ state, settings: { ...settings }, frame: Buffer.from('fake frame'), transcript: [{ text: 'narrator, the red door was locked', at: Date.now() }], events: [], trigger: 'talk-back' as const });
  return { eyes, writer, tts, screen, save, publish, runner, state, input };
}
afterEach(() => { logs.length = 0; vi.restoreAllMocks(); });
describe('director triggers', () => {
  it('prioritises talk-back, twist, raid, transcript and cadence with the 8s gap', () => {
    const base = { now: 50000, lastAttempt: 0, settings, inFlight: false, transcript: [], twists: [], events: [] };
    const twist = { id: 't', author: 'viewer', text: 'The cat owned the vault.' };
    const raid = { id: 'r', kind: 'raid' as const, author: 'visitor', detail: '10 viewers' };
    expect(selectTrigger({ ...base, transcript: [{ text: 'NARRATOR?', at: 49999 }], lastAttempt: 49999, twists: [twist], events: [raid] })?.trigger).toBe('talk-back');
    expect(selectTrigger({ ...base, twists: [twist], events: [raid] })?.trigger).toBe('twist');
    expect(selectTrigger({ ...base, events: [{ ...raid, id: 'f', kind: 'follow' }, raid] })?.event?.kind).toBe('raid');
    expect(selectTrigger({ ...base, transcript: [{ text: 'Wow!', at: 49999 }] })?.trigger).toBe('transcript');
    expect(selectTrigger(base)?.trigger).toBe('cadence');
    expect(selectTrigger({ ...base, lastAttempt: 43000, events: [raid] })).toBeUndefined();
    expect(selectTrigger({ ...base, lastAttempt: 42000, events: [raid] })?.trigger).toBe('event');
    expect(selectTrigger({ ...base, inFlight: true, transcript: [{ text: 'narrator', at: 50000 }] })).toBeUndefined();
    expect(selectTrigger({ ...base, settings: { ...settings, muted: true } })).toBeUndefined();
    expect(wakeWord('a NARRATOR, please')).toBe(true); expect(wakeWord('narratorship')).toBe(false);
  });
  it('uses only fresh transcript lines for spikes', () => {
    const base = { now: 20000, lastAttempt: 10000, settings, inFlight: false, twists: [], events: [] };
    expect(selectTrigger({ ...base, transcript: [0,1,2].map(i => ({ text: 'plain', at: 18000+i })) })?.trigger).toBe('transcript');
    expect(selectTrigger({ ...base, transcript: [{ text: 'laughing!', at: 0 }] })).toBeUndefined();
  });
});
describe('beat transaction', () => {
  it('uses caption cache, light model, six recent lines and rewrites summary only every fifth beat', async () => {
    const s = setup();
    for (let i = 1; i <= 7; i++) {
      const beat = await s.runner.run({ ...s.input(), settings: { ...settings, lightMode: i % 2 === 0 } });
      expect(beat).toBeDefined(); expect(s.state.beatCount).toBe(i);
      await s.runner.settleSummary(); expect(s.writer.summaries).toHaveLength(Math.floor(i / 5));
    }
    expect(s.eyes.calls).toBe(1); expect(s.state.recentLines).toHaveLength(6);
    expect(s.state.summary).toContain('red door'); expect(s.writer.calls[1]?.model).toBe('gemma3:4b');
    expect(s.tts.calls[0]).not.toContain('narrator,'); expect(s.save).toHaveBeenCalledTimes(7);
  });
  it('delivers audio before a slow summary and cancels the rewrite on a new beat', async () => {
    const s = setup(); let finish!: () => void; let summarySignal: AbortSignal | undefined;
    vi.spyOn(s.writer, 'summarize').mockImplementation((_facts, _model, signal) => {
      summarySignal = signal;
      return new Promise(resolve => { finish = () => resolve({ value: 'Late rewritten summary', latencyMs: 9999 }); });
    });
    for (let i = 0; i < 5; i++) expect(await s.runner.run(s.input())).toBeDefined();
    const fallback = s.state.summary; expect(fallback.length).toBeGreaterThan(0); expect(s.publish).toHaveBeenCalledTimes(5);
    await s.runner.run(s.input()); expect(summarySignal?.aborted).toBe(true);
    finish(); await s.runner.settleSummary(); expect(s.state.summary).toBe(fallback);
  });
  it('marks only new chapters and rejects a known cast role when its screen rejects it', async () => {
    const s = setup(); s.writer.result = { chapterTitle: 'Locked Out' };
    expect((await s.runner.run(s.input()))?.chapterChanged).toBe(true);
    expect((await s.runner.run(s.input()))?.chapterChanged).toBe(false);
    s.state.cast.friend = 'visitor'; s.writer.result = { castUpdates: [{ name: 'friend', role: 'guard' }] }; s.screen.allow = false;
    expect(await s.runner.run(s.input())).toBeUndefined(); expect(s.tts.calls).toHaveLength(2);
  });
  it('does not speak blocked output or unscreened cast; safe words do not cause substring rejects', async () => {
    const s = setup(); s.writer.result = { line: 'The protagonist said kill yourself.' };
    expect(await s.runner.run(s.input())).toBeUndefined(); expect(s.tts.calls).toHaveLength(0); expect(s.state.beatCount).toBe(0);
    s.writer.result = { line: 'The red door opened.', castUpdates: [{ name: 'invented viewer', role: 'guard' }] };
    expect(await s.runner.run(s.input())).toBeUndefined(); expect(s.tts.calls).toHaveLength(0);
    expect(blocked('kys')).toBe(true); expect(blocked('skyscraper')).toBe(false); expect(blocked('kill your\u200bself')).toBe(true);
  });
  it('attaches accepted twist credit and updates canon only after saved audio', async () => {
    const s = setup(); const twist = { id: 'twist', author: 'friend', text: 'The red door belonged to the cat.' };
    const beat = await s.runner.run({ ...s.input(), trigger: 'twist', twist });
    expect(beat?.twist).toEqual(twist); expect(s.state.canon).toEqual([twist]);
    expect(s.publish).toHaveBeenCalledOnce();
    s.save.mockRejectedValueOnce(new Error('Disk full'));
    expect(await s.runner.run(s.input())).toBeUndefined(); expect(s.publish).toHaveBeenCalledOnce(); expect(s.state.beatCount).toBe(1);
  });
  it('skips Ollama down without throwing', async () => {
    const s = setup(); vi.spyOn(s.eyes, 'caption').mockRejectedValue(new Error('Ollama down'));
    expect(await s.runner.run(s.input())).toBeUndefined(); expect(logs[0]?.reason).toBe('Ollama down'); expect(s.tts.calls).toHaveLength(0);
  });
  it('times out uncooperative clients, rejects overlap, and ignores late completions', async () => {
    const s = setup(20); let finish!: () => void;
    vi.spyOn(s.eyes, 'caption').mockImplementation(() => new Promise(resolve => { finish = () => resolve({ value: 'red door', latencyMs: 99 }); }));
    const first = s.runner.run(s.input());
    expect(await s.runner.run(s.input())).toBeUndefined();
    expect(await first).toBeUndefined(); finish(); await new Promise(r => setTimeout(r, 5));
    expect(s.tts.calls).toHaveLength(0); expect(s.publish).not.toHaveBeenCalled(); expect(s.state.beatCount).toBe(0);
    expect(logs[0]?.reason).toContain('10 seconds');
  });
  it('mute/skip cancellation prevents late audio and persistent beat commits', async () => {
    const s = setup(); let finish!: () => void;
    vi.spyOn(s.tts, 'speak').mockImplementation(() => new Promise(resolve => { finish = () => resolve({ value: { bytes: Buffer.from('wav'), durationSeconds: 1, engine: 'fake' }, latencyMs: 5 }); }));
    const first = s.runner.run(s.input()); await new Promise(r => setTimeout(r, 1)); s.runner.cancel();
    expect(await first).toBeUndefined(); finish(); await new Promise(r => setTimeout(r, 1));
    expect(s.publish).not.toHaveBeenCalled(); expect(s.save).not.toHaveBeenCalled();
  });
});
describe('prompt and model boundaries', () => {
  it('includes caption, transcript, events, canon and examples under its budget', () => {
    const state = createStory(); state.canon = [{ id: 't', author: 'friend', text: 'The cat owned the key.' }];
    const request = buildPrompt({ state, settings, caption: 'red door', transcript: [{ text: 'blue river', at: 0 }], events: [{ id: 'f', kind: 'follow', author: 'friend', detail: 'arrived' }], trigger: 'cadence', model: 'test' });
    expect(request.user).toContain('red door'); expect(request.user).toContain('blue river'); expect(request.user).toContain('follow'); expect(request.user).toContain('cat owned');
    expect(request.system).toContain('Examples:'); expect(request.system.length+request.user.length).toBeLessThanOrEqual(12000);
    const huge: StoryState = { ...state, summary: 'long '.repeat(10000) };
    expect(buildPrompt({ state: huge, settings, caption: 'red door', transcript: [], events: [], trigger: 'cadence', model: 'test' }).user.length).toBeLessThan(3000);
    expect(() => buildPrompt({ state, settings, caption: 'red door', transcript: [], events: [], trigger: 'cadence', model: 'test' }, 20)).toThrow('budget');
  });
  it('retries malformed JSON exactly once, validates word limit and uses a JSON schema', async () => {
    const complete = vi.fn().mockResolvedValueOnce('not JSON').mockResolvedValueOnce(JSON.stringify({ line: 'The red door stayed shut.', castUpdates: [] }));
    const writer = new LocalWriter({ complete }); const req: WriteRequest = { system: 'system', user: '{}', model: 'gpt-oss:20b' };
    expect((await writer.write(req, new AbortController().signal)).value.line).toContain('red door'); expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[0]?.[0].response_format.type).toBe('json_schema'); expect(complete.mock.calls[0]?.[0].reasoning_effort).toBe('low');
    expect(complete.mock.calls[0]?.[0].messages.at(-1)).toEqual({ role: 'assistant', content: '{' });
    complete.mockReset().mockResolvedValue('\"line\":\"The red door stayed shut.\",\"castUpdates\":[],\"chapterTitle\":\"\",\"usedTwistId\":\"\"}');
    expect((await writer.write(req, new AbortController().signal)).value.line).toBe('The red door stayed shut.');
    complete.mockReset().mockResolvedValue(JSON.stringify({ line: 'word '.repeat(31), castUpdates: [] }));
    await expect(writer.write(req, new AbortController().signal)).rejects.toThrow('twice'); expect(complete).toHaveBeenCalledTimes(2);
    const s = setup(); vi.spyOn(s.writer, 'write').mockImplementation(r => writer.write(r, new AbortController().signal));
    expect(await s.runner.run(s.input())).toBeUndefined(); expect(s.tts.calls).toHaveLength(0);
  });
  it('rejects a line cut off by the schema instead of speaking an incomplete sentence', async () => {
    const complete = vi.fn().mockResolvedValueOnce(JSON.stringify({ line: 'Hassan reached the door but', castUpdates: [] })).mockResolvedValueOnce(JSON.stringify({ line: 'Hassan reached the locked red door.', castUpdates: [] }));
    const result = await new LocalWriter({ complete }).write({ system: 'system', user: '{}', model: 'gemma3:4b' }, new AbortController().signal);
    expect(result.value.line).toBe('Hassan reached the locked red door.'); expect(complete).toHaveBeenCalledTimes(2);
  });
  it('validates two-sentence recap output before voice', async () => {
    const complete=vi.fn().mockResolvedValueOnce(JSON.stringify({line:'Hassan reached the red door.',castUpdates:[]})).mockResolvedValueOnce(JSON.stringify({line:'Hassan reached the red door. The key remained missing.',castUpdates:[]}));
    const result=await new LocalWriter({complete}).write({system:'system',user:'{}',model:'gemma3:4b',recap:true},new AbortController().signal);
    expect(result.value.line).toContain('The key remained missing.');expect(complete).toHaveBeenCalledTimes(2);
  });
  it('caps captions and fails closed on unsafe/invalid viewer screen output', async () => {
    const client: ChatClient = { complete: vi.fn().mockResolvedValue('word '.repeat(26)) };
    await expect(new LocalEyes(client).caption(Buffer.from('jpg'), new AbortController().signal)).rejects.toThrow('25 words');
    const screen = new LocalScreen(client, () => 'gemma3:4b');
    expect((await screen.check('kys', new AbortController().signal)).allow).toBe(false);
    await expect(screen.check('ordinary twist', new AbortController().signal)).rejects.toThrow();
  });
  it('persists real manifest, frame and audio files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'narrator-store-'));
    try {
      const s = setup(); const store = new FileStore(directory);
      const runner = new BeatRunner(s, store, () => {}, () => {});
      const beat = await runner.run(s.input()); expect(beat).toBeDefined();
      const saved = await store.read(s.state.streamId); expect(saved).toHaveLength(1);
      expect(await readFile(join(directory, s.state.streamId, 'audio', `${beat!.id}.wav`))).toEqual(s.tts.calls.length ? (await import('../src/server/ai/fakes')).wavSample() : Buffer.alloc(0));
      expect(await readFile(join(directory, s.state.streamId, 'frames', `${beat!.id}.jpg`))).toEqual(Buffer.from('fake frame'));
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
