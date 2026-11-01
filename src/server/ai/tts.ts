import { fork, execFile, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { timed, type Speech, type TTS } from './interfaces.js';
import type { Genre } from '../../shared/protocol.js';
const exec = promisify(execFile);
interface Reply { id: number; error?: string; ready?: boolean; bytes?: Buffer; durationSeconds?: number }
export class LocalTTS implements TTS {
  private child: ChildProcess | undefined;
  private id = 0;
  private pending = new Map<number, { resolve: (value: Reply) => void; reject: (error: Error) => void }>();
  status: { ready: boolean; engine: string; error?: string } = { ready: false, engine: 'unloaded' };
  private loading: Promise<void> | undefined;
  private preferSystem: boolean;
  private generation = 0;
  constructor(options: { preferSystemVoice?: boolean } = {}) { this.preferSystem = options.preferSystemVoice ?? false; }
  setResourceMode(preferSystemVoice: boolean) {
    if (this.preferSystem === preferSystemVoice) return;
    this.close(); this.preferSystem = preferSystemVoice;
  }
  private async checkSystemVoice(signal: AbortSignal) {
    const voice = process.env.SAY_VOICE ?? 'Samantha';
    const listed = await exec('/usr/bin/say', ['-v', '?'], { signal });
    if (!listed.stdout.split('\n').some(line => line.startsWith(voice + ' '))) throw new Error(`macOS voice ${voice} is not installed; set SAY_VOICE to a voice listed by say -v '?'`);
  }
  private spawn() {
    if (this.child) return;
    const child = fork(fileURLToPath(new URL(`./ttsWorker${extname(import.meta.url)}`, import.meta.url)), [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'advanced', execArgv: process.execArgv.filter(arg => !arg.startsWith('--input-type')) });
    this.child = child;
    let stderr = '';
    child.stderr?.on('data', b => { stderr = (stderr + String(b)).slice(-1000); });
    child.on('message', (reply: Reply) => {
      const pending = this.pending.get(reply.id);
      if (!pending) return;
      this.pending.delete(reply.id);
      if (reply.error) pending.reject(new Error(reply.error)); else pending.resolve(reply);
    });
    child.on('error', error => this.fail(error));
    child.on('exit', () => { if (this.child === child) { this.child = undefined; this.fail(new Error(stderr || 'Voice worker stopped')); } });
  }
  private fail(error: Error) {
    for (const p of this.pending.values()) p.reject(error);
    this.pending.clear(); this.loading = undefined;
    this.status = { ready: false, engine: 'unavailable', error: error.message.slice(0, 160) };
  }
  private request(data: { line?: string; voice?: string; speed?: number }, signal: AbortSignal): Promise<Reply> {
    signal.throwIfAborted(); this.spawn();
    const id = ++this.id;
    return new Promise<Reply>((resolve, reject) => {
      const abort = () => { this.close(); reject(new Error('Voice cancelled')); };
      signal.addEventListener('abort', abort, { once: true });
      const cleanup = () => signal.removeEventListener('abort', abort);
      this.pending.set(id, { resolve: reply => { cleanup(); resolve(reply); }, reject: error => { cleanup(); reject(error); } });
      this.child!.send({ id, ...data });
    });
  }
  async ready(signal = AbortSignal.timeout(15000)): Promise<void> {
    if (this.status.ready) return;
    if (this.preferSystem) {
      await this.checkSystemVoice(signal);
      this.status = { ready: true, engine: 'say', error: 'Normal mode uses macOS voice on this 24 GB Mac. Light mode uses Kokoro.' };
      return;
    }
    const generation = this.generation;
    this.loading ??= this.request({}, signal).then(() => { if (generation === this.generation) this.status = { ready: true, engine: 'kokoro' }; }).catch(async error => {
      if (signal.aborted || generation !== this.generation) throw error;
      if (process.platform === 'darwin') {
        await this.checkSystemVoice(signal);
        this.status = { ready: true, engine: 'say', error: 'Kokoro unavailable; using macOS voice' };
      } else throw error;
    });
    try { await this.loading; } catch (error) { this.loading = undefined; throw error; }
  }
  speak(line: string, genre: Genre, signal: AbortSignal, budgetMs = Infinity) {
    return timed(async (): Promise<Speech> => {
      const preset = config.genres[genre];
      signal.throwIfAborted();
      // If writing used most of this beat's deadline, use the faster local
      // fallback rather than starting a Kokoro synthesis that cannot finish.
      // Kokoro q8 measured ~2 s for a 2.5 s clip on an M5; ~220 ms/word covers a 22-word line.
      if (budgetMs < Math.max(1500, line.trim().split(/\s+/u).length * 220 + 800) && process.platform === 'darwin') return this.say(line, preset.speed, signal);
      try {
        await this.ready(signal); signal.throwIfAborted();
        if (this.status.engine === 'say') return await this.say(line, preset.speed, signal);
        const reply = await this.request({ line, voice: process.env[`TTS_VOICE_${genre.toUpperCase()}`] ?? preset.voice, speed: preset.speed }, signal);
        if (!reply.bytes || !reply.durationSeconds) throw new Error('Voice returned no audio');
        return { bytes: Buffer.from(reply.bytes), durationSeconds: reply.durationSeconds, engine: 'kokoro' };
      } catch (error) {
        if (signal.aborted || process.platform !== 'darwin') throw error;
        const speech = await this.say(line, preset.speed, signal);
        this.status = { ready: true, engine: 'say', error: 'Kokoro failed; using macOS voice' };
        return speech;
      }
    });
  }
  private async say(line: string, speed: number, signal: AbortSignal): Promise<Speech> {
    const directory = await mkdtemp(join(tmpdir(), 'narrator-say-'));
    const file = join(directory, 'speech.wav');
    try {
      await exec('/usr/bin/say', ['-v', process.env.SAY_VOICE ?? 'Samantha', '-r', String(Math.round(175 * speed)), '-o', file, '--file-format=WAVE', '--data-format=LEI16@24000', '--', line], { signal });
      const bytes = await readFile(file);
      return { bytes, durationSeconds: Math.max(0.1, (bytes.length - 44) / 48000), engine: 'say' };
    } finally { await rm(directory, { recursive: true, force: true }); }
  }
  close() {
    this.generation++;
    const child = this.child; this.child = undefined;
    child?.kill('SIGKILL'); this.fail(new Error('Voice cancelled'));
  }
}
