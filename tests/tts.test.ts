import { EventEmitter } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { wavSample } from '../src/server/ai/fakes';
const mocks = vi.hoisted(() => ({ fork: vi.fn(), execFile: vi.fn() }));
vi.mock('node:child_process', async original => ({ ...await original<typeof import('node:child_process')>(), ...mocks }));
import { LocalTTS } from '../src/server/ai/tts';
function worker(mode: 'ok' | 'fail' | 'hang') {
  const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter; send: ReturnType<typeof vi.fn>; kill: ReturnType<typeof vi.fn> };
  child.stderr = new EventEmitter(); child.kill = vi.fn();
  child.send = vi.fn((message: { id: number; line?: string }) => queueMicrotask(() => {
    if (mode === 'hang') return;
    child.emit('message', mode === 'fail' ? { id: message.id, error: 'Model unavailable' } : message.line ? { id: message.id, bytes: wavSample(), durationSeconds: 0.1 } : { id: message.id, ready: true });
  }));
  mocks.fork.mockReturnValue(child); return child;
}
afterEach(() => { mocks.fork.mockReset(); mocks.execFile.mockReset(); });
describe('local TTS wrapper with fake processes', () => {
  it('loads once, sends only supplied model output to the voice worker and returns WAV', async () => {
    const child = worker('ok'); const tts = new LocalTTS();
    try {
      await tts.ready(); const result = await tts.speak('The red door stayed shut.', 'noir', new AbortController().signal);
      expect(result.value.engine).toBe('kokoro'); expect(result.value.bytes.toString('ascii', 0, 4)).toBe('RIFF');
      expect(child.send.mock.calls[1]?.[0].line).toBe('The red door stayed shut.'); expect(mocks.fork).toHaveBeenCalledOnce();
    } finally { tts.close(); }
  });
  it('cancels and kills a hung worker rather than producing late speech', async () => {
    const child = worker('hang'); const tts = new LocalTTS(); const abort = new AbortController();
    const promise = tts.speak('The red door stayed shut.', 'noir', abort.signal);
    abort.abort(); await expect(promise).rejects.toThrow(); expect(child.kill).toHaveBeenCalledWith('SIGKILL'); expect(mocks.execFile).not.toHaveBeenCalled();
  });
  it.skipIf(process.platform !== 'darwin')('falls back to macOS say after a Kokoro failure', async () => {
    worker('fail');
    mocks.execFile.mockImplementation((_command: string, args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      const file = args[args.indexOf('-o')+1]!;
      if (!args.includes('-o')) queueMicrotask(() => callback(null, 'Samantha en_US Test voice', ''));
      else void writeFile(file, wavSample()).then(() => callback(null, '', ''));
      return new EventEmitter();
    });
    const tts = new LocalTTS();
    try {
      const result = await tts.speak('The red door stayed shut.', 'noir', new AbortController().signal);
      expect(result.value.engine).toBe('say'); expect(result.value.bytes.toString('ascii', 0, 4)).toBe('RIFF');
      expect(mocks.execFile.mock.calls.at(-1)?.[1]).toContain('The red door stayed shut.');
    } finally { tts.close(); }
  });
});
describe('reviewed speech budget boundary', () => {
  it.skipIf(process.platform !== 'darwin').each([[1899, 'say'], [1900, 'kokoro']] as const)('uses %s ms budget without forcing an unnecessary voice fallback', async (budget, engine) => {
    worker('ok');
    mocks.execFile.mockImplementation((_command: string, args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      if (!args.includes('-o')) queueMicrotask(() => callback(null, 'Samantha en_US Test voice', ''));
      else void writeFile(args[args.indexOf('-o')+1]!, wavSample()).then(() => callback(null, '', ''));
      return new EventEmitter();
    });
    const tts = new LocalTTS();
    try { await tts.ready(); expect((await tts.speak('The red door stayed shut.', 'noir', new AbortController().signal, budget)).value.engine).toBe(engine); }
    finally { tts.close(); }
  });
});
