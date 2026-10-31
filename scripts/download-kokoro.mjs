import { mkdir, readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { KokoroTTS } from 'kokoro-js';

// Uses the transformers.js disk cache shipped inside node_modules. Keep the
// installed dependencies between phases; rerunning this script reuses weights.
// --offline forbids network so a successful run proves the cache is sufficient.
if (process.argv.includes('--offline')) {
  globalThis.fetch = async () => { throw new Error('Network disabled for Kokoro cache verification'); };
}
const started = performance.now();
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
  dtype: 'q8', device: 'cpu',
  progress_callback: (event) => {
    if (event.status === 'done') console.log(`Cached: ${event.file}`);
  }
});
const loadMs = Math.round(performance.now() - started);
const config = JSON.parse(await readFile(new URL('../config/narrator.json', import.meta.url), 'utf8'));
for (const genre of Object.values(config.genres)) {
  if (!Object.hasOwn(tts.voices, genre.voice)) throw new Error(`Unknown Kokoro voice: ${genre.voice}`);
}
await mkdir('data/setup', { recursive: true });
const synthesisStarted = performance.now();
const audio = await tts.generate('The narrator was ready.', { voice: config.genres.noir.voice });
await audio.save('data/setup/kokoro-smoke.wav');
console.log(JSON.stringify({ loadMs, synthesisMs: Math.round(performance.now() - synthesisStarted), samples: audio.audio.length, output: 'data/setup/kokoro-smoke.wav' }));
