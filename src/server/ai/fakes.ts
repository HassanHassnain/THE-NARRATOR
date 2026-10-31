import type { Eyes, TTS, Writer, WriteRequest, Speech } from './interfaces.js';
import type { Screen } from './screen.js';
import type { Narration } from '../../shared/protocol.js';
export function wavSample(): Buffer {
  const wav = Buffer.alloc(4844); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(24000, 24);
  wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(4800, 40); return wav;
}
export class FakeEyes implements Eyes { calls = 0; async caption() { this.calls++; return { value: 'A red door stood beside a blue river.', latencyMs: 2 }; } }
export class FakeWriter implements Writer {
  calls: WriteRequest[] = []; summaries: string[] = []; result: Partial<Narration> = {};
  async write(request: WriteRequest) {
    this.calls.push(request);
    return { value: { line: `Streamer inspected the red door for the ${this.calls.length} time. The river remained unimpressed.`, castUpdates: [],
      ...(request.twistId ? { usedTwistId: request.twistId } : {}), ...this.result }, latencyMs: 3 };
  }
  async summarize(facts: string, _model?: string, _signal?: AbortSignal) { this.summaries.push(facts); return { value: facts, latencyMs: 1 }; }
}
export class FakeTTS implements TTS {
  calls: string[] = [];
  async speak(line: string) { this.calls.push(line); return { value: { bytes: wavSample(), durationSeconds: 0.1, engine: 'fake' } as Speech, latencyMs: 4 }; }
}
export class FakeScreen implements Screen { allow = true; async check() { return { allow: this.allow, reason: this.allow ? 'Safe' : 'Rejected', latencyMs: 1 }; } }
