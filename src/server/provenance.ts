import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Beat } from '../shared/protocol.js';
export type Provenance = 'stream' | 'model-check' | 'simulated' | 'unknown';
/** Old sessions predate source markers. Consult their check record; never infer live Twitch from real model audio. */
export async function provenance(id: string, beats: Beat[], root = 'data'): Promise<Provenance> {
  if (id.startsWith('simulated-') || beats.some(b => b.source === 'simulated')) return 'simulated';
  if (id.startsWith('model-check-') || beats.some(b => b.source === 'model-check')) return 'model-check';
  for (const prefix of ['normal', 'light']) {
    try {
      const check = JSON.parse(await readFile(join(root, 'checks', `${prefix}-${id}.json`), 'utf8')) as { label?: string };
      if (check.label?.includes('SIMULATED')) return 'model-check';
    } catch { /* no historical check record */ }
  }
  return beats.length && beats.every(b => b.source === 'stream') ? 'stream' : 'unknown';
}
