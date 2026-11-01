import { randomUUID } from 'node:crypto';
import { loadEnvFile } from 'node:process';
try { loadEnvFile(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createLocalClient } from '../src/server/ai/client.js';
import { LocalEyes } from '../src/server/ai/eyes.js';
import { LocalWriter } from '../src/server/ai/writer.js';
import { LocalTTS } from '../src/server/ai/tts.js';
import { LocalScreen } from '../src/server/ai/screen.js';
import { checkHealth, warmModel, releaseModel } from '../src/server/ai/health.js';
import { writerModel, eyesModel, resourceVoiceFallback } from '../src/server/config.js';
import { BeatRunner } from '../src/server/director/beatRunner.js';
import { createStory } from '../src/server/director/storyState.js';
import { FileStore } from '../src/server/store.js';
import { genres, type Beat, type BeatLog, type Settings, type Genre } from '../src/shared/protocol.js';
const mode = process.argv.includes('--light') ? 'light' : 'normal';
const health = await checkHealth(mode === 'light');
if (!health.ollama || health.missing.length) throw new Error(health.fixes.join('\n'));
const model = mode === 'light' ? eyesModel() : writerModel();
const actualClient = createLocalClient();
const client: typeof actualClient = { async complete(request, signal) {
  const started = performance.now();
  try { const text = await actualClient.complete(request, signal);
    if (process.env.NARRATOR_TRACE === '1') console.log(JSON.stringify({ trace: request.model, ms: Math.round(performance.now() - started), text: text.slice(0, 1200) }));
    return text;
  } catch (error) { if (process.env.NARRATOR_TRACE === '1') console.log(JSON.stringify({ trace: request.model, ms: Math.round(performance.now() - started), error: String(error) })); throw error; }
} }; const tts = new LocalTTS({ preferSystemVoice: resourceVoiceFallback(mode === 'light') });
const state = createStory('Hassan', 'noir', `model-check-${randomUUID()}`);
const frame = await readFile('fixtures/local-scene.jpg');
let currentGenre: Genre = 'noir';
const rows: (BeatLog & { genre: Genre })[] = []; const beats: Beat[] = [];
await mkdir('data/checks', { recursive: true });
const path = `data/checks/${mode}-${state.streamId}.json`;
try {
  if (mode === 'light' && writerModel() !== eyesModel()) await releaseModel(writerModel());
  await tts.ready(AbortSignal.timeout(30000));
  await warmModel(eyesModel(), AbortSignal.timeout(120000));
  if (model !== eyesModel()) await warmModel(model, AbortSignal.timeout(120000));
  const runner = new BeatRunner({ eyes: new LocalEyes(client), writer: new LocalWriter(client), tts, screen: new LocalScreen(client, () => model) }, new FileStore(), beat => beats.push(beat), log => { rows.push({ ...log, genre: currentGenre }); console.log(JSON.stringify(rows.at(-1))); });
  let previousFailure = '';
  genreLoop: for (const [i, genre] of genres.entries()) {
    currentGenre = genre;
    const settings: Settings = { protagonist: 'Hassan', genre, cadenceSeconds: 35, spice: 1, lightMode: mode === 'light', muted: false, running: true };
    const transcript = ['Narrator, I tried the locked red door with twenty health and no key.', 'Narrator, I dropped my only key into that blue river.', 'Narrator, I drank my last potion before the fight even started.', 'Narrator, that was my third failed lockpicking attempt at the red door.', 'Narrator, recap my story: I lost the key, wasted a potion and failed the red lock.', 'Narrator, I tried hiding behind the red door but set off the alarm instead.', 'Narrator, I called myself a pro, then dropped the key in the river.'][i]!;
    for (let attempt = 0; attempt < 2; attempt++) {
    const beat = await runner.run({ state, settings, frame, transcript: [{ text: transcript, at: Date.now() }], events: [], trigger: 'talk-back', source: 'model-check' });
    await runner.settleSummary();
    const failure = rows.at(-1)?.reason ?? '';
    const repeatedFailure = !!failure && failure === previousFailure; previousFailure = failure;
    await writeFile(path, JSON.stringify({ label: 'REAL LOCAL MODELS — SIMULATED FRAME AND TRANSCRIPT', mode, model, streamId: state.streamId, rows, beats }, null, 2));
    if (beat) break;
    if (repeatedFailure) { console.log('Stopped after the same failure twice; tune before rerunning.'); break genreLoop; }
    console.log('Warm the writer after the model-swap timeout, then make one diagnostic retry with the cached caption.');
    await warmModel(model, AbortSignal.timeout(90000));
    }
  }
  console.log(`Saved ${beats.length}/${genres.length} real ${mode} beats to ${path}`);
  if (beats.length !== genres.length) process.exitCode = 1;
} finally { tts.close(); }
