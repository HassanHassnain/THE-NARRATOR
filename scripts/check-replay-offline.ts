/** Real app, unavailable Ollama endpoint, isolated empty credentials/cache; never stops the user's Ollama. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
const original = process.cwd(); const directory = await mkdtemp(join(tmpdir(), 'narrator-offline-'));
const deadline = setTimeout(() => { console.error('Offline replay exceeded 18 seconds'); process.exit(1); }, 18000);
for (const item of ['config', 'fixtures', 'dist']) await symlink(resolve(original, item), join(directory, item));
await mkdir(join(directory, 'data')); await writeFile(join(directory, 'data/emotes.json'), JSON.stringify({ at: Date.now(), user: '', emotes: {} }));
process.chdir(directory); process.env.NARRATOR_FAKE_AI = '0'; process.env.OPENAI_BASE_URL = 'http://127.0.0.1:1/v1'; process.env.TWITCH_CLIENT_ID = ''; delete process.env.OBS_WS_URL; delete process.env.OBS_WS_PASSWORD;
const { createApp } = await import('../src/server/app.js');
const app = await createApp(true); await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
const address = app.server.address(); assert(address && typeof address !== 'string'); const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage(); page.setDefaultTimeout(3000); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(base+'/demo'); await page.locator('#play:enabled').waitFor(); await page.locator('#play').click();
  await page.waitForFunction(() => (document.getElementById('voice') as HTMLAudioElement).currentTime > 0);
  assert.equal(app.state().health.ollama, false); assert.equal(app.state().voice.engine, 'unloaded'); assert.equal(app.state().story.beatCount, 0);
  await page.goto(base+'/episode/demo'); await page.locator('#story article').first().waitFor(); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ check: 'Real app replay with unavailable Ollama', recordedAudioPlayed: true, episodeLoaded: true, newInference: false, voiceUnloaded: true, twitchCredentials: 'isolated empty', pageErrors: errors }));
} finally { await browser.close(); await app.close(); process.chdir(original); clearTimeout(deadline); await rm(directory, { recursive: true, force: true }); }
