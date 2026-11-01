// Usage: npm run demo:capture -- <streamId> [--allow-model-check]
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { Beat } from '../src/shared/protocol.js';
import { provenance } from '../src/server/provenance.js';
export async function captureDemo(streamId: string, root = '.', allowModelCheck = false) {
  if (!/^[\w-]{1,100}$/.test(streamId)) throw new Error('Usage: npm run demo:capture -- <streamId from data/streams> [--allow-model-check]');
  const source = join(root, 'data/streams', streamId), target = join(root, 'fixtures/demo-session');
  const beats = JSON.parse(await readFile(join(source, 'beats.json'), 'utf8')) as Beat[];
  if (!Array.isArray(beats) || !beats.length || beats.some(b => !/^[\w-]{1,100}$/.test(b.id))) throw new Error('No valid spoken beats.');
  const kind = await provenance(streamId, beats, join(root, 'data'));
  if (kind === 'simulated') throw new Error('Refusing a simulated test stream.');
  if (kind === 'model-check' && !allowModelCheck) throw new Error('Model check uses synthetic inputs; pass --allow-model-check to label it explicitly.');
  const label = kind === 'model-check' ? 'Recorded local models · synthetic frame and scripted speech · no live Twitch evidence' : kind === 'stream' ? 'Recorded stream · replay, not live traffic' : 'Recorded session · input provenance unverified';
  const staging = `${target}-${randomUUID()}.tmp`;
  let backup: string | undefined;
  try {
    await mkdir(join(staging, 'audio'), { recursive: true }); await mkdir(join(staging, 'frames'));
    const out: Beat[] = [];
    for (const beat of beats) {
      await cp(join(source, 'audio', `${beat.id}.wav`), join(staging, 'audio', `${beat.id}.wav`));
      if (beat.frameUrl) await cp(join(source, 'frames', `${beat.id}.jpg`), join(staging, 'frames', `${beat.id}.jpg`));
      out.push({ ...beat, ...(kind !== 'unknown' ? { source: kind } : {}), streamId: 'demo', audioUrl: `/demo-media/audio/${beat.id}.wav`, frameUrl: beat.frameUrl ? `/demo-media/frames/${beat.id}.jpg` : '' });
    }
    await writeFile(join(staging, 'beats.json'), JSON.stringify(out, null, 2));
    await writeFile(join(staging, 'provenance.json'), JSON.stringify({ source: kind, streamId, label }, null, 2));
    await writeFile(join(staging, 'SOURCE.md'), `${label}. Source ${streamId}; captured ${new Date().toISOString()}; ${out.length} recorded beats. No live Twitch claim is implied.\n`);
    backup = join(root, 'data/demo-backups', randomUUID()); await mkdir(dirname(backup), { recursive: true });
    try { await rename(target, backup); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; backup = undefined; }
    try { await rename(staging, target); } catch (error) { if (backup) await rename(backup, target); throw error; }
    return { beats: out.length, source: kind, backup };
  } finally { await rm(staging, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(await captureDemo(process.argv[2] ?? '', '.', process.argv.includes('--allow-model-check')));
}
