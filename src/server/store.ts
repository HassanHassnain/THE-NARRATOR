import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Beat } from '../shared/protocol.js';
export interface BeatStore { saveSummary?(streamId: string, summary: { atBeat: number; text: string; latencyMs: number; method: string }): Promise<void>; save(beat: Beat, frame: Buffer | undefined, audio: Buffer, signal: AbortSignal): Promise<void> }
export class FileStore implements BeatStore {
  constructor(private root = 'data/streams') {}
  async save(beat: Beat, frame: Buffer | undefined, audio: Buffer, signal: AbortSignal) {
    const dir = join(this.root, beat.streamId);
    await mkdir(join(dir, 'frames'), { recursive: true }); await mkdir(join(dir, 'audio'), { recursive: true });
    signal.throwIfAborted();
    await writeFile(join(dir, 'audio', `${beat.id}.wav`), audio, { signal });
    if (frame) await writeFile(join(dir, 'frames', `${beat.id}.jpg`), frame, { signal });
    const beats = await this.read(beat.streamId);
    signal.throwIfAborted();
    const tmp = join(dir, `beats-${beat.id}.tmp`);
    await writeFile(tmp, JSON.stringify([...beats, beat], null, 2), { signal });
    signal.throwIfAborted(); await rename(tmp, join(dir, 'beats.json'));
  }
  async saveSummary(streamId: string, summary: { atBeat: number; text: string; latencyMs: number; method: string }) {
    const file = join(this.root, streamId, 'summary.json');
    await writeFile(file + '.tmp', JSON.stringify(summary, null, 2));
    await rename(file + '.tmp', file);
  }
  async read(streamId: string): Promise<Beat[]> {
    if (!/^[\w-]{1,100}$/.test(streamId)) throw new Error('Invalid stream id');
    try { return JSON.parse(await readFile(join(this.root, streamId, 'beats.json'), 'utf8')) as Beat[]; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  }
}
