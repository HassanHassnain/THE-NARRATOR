/** Fake-backed browser regression check; every app instance has an 18s hard deadline. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import type { Beat } from '../src/shared/protocol.js';
process.env.NARRATOR_FAKE_AI = '1';
const { createApp } = await import('../src/server/app.js');
const deadline = setTimeout(() => { console.error('Review browser smoke exceeded 18 seconds'); process.exit(1); }, 18000);
const app = await createApp(!process.argv.includes('--dev'));
await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
const address = app.server.address(); assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 }, acceptDownloads: true }); context.setDefaultTimeout(3000);
  const errors: string[] = []; context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const page = await context.newPage();
  const fixture = JSON.parse(await readFile('fixtures/demo-session/beats.json', 'utf8')) as Beat[];
  const evil = '</title><img src=x onerror=alert(1)>';
  const testBeats = fixture.map((b, i) => ({ ...b, protagonist: evil, castUpdates: [{ name: 'CastViewer', role: 'kept the key' }], ...(i === 0 ? { twist: { id: 't', author: 'PlotFriend', text: 'The cat owned the vault.' } } : {}) }));
  await context.route('**/api/demo', route => route.fulfill({ json: testBeats }));
  await context.route('**/api/emotes', route => route.fulfill({ json: {} }));
  await page.goto(`${base}/host`); await page.locator('#connection').filter({ hasText: 'Control room connected' }).waitFor();
  assert.equal(await page.locator('#genreTiles button').count(), 7);
  const episodes = await (await fetch(base+'/api/episodes')).json() as { id: string }[];
  assert(episodes.every(episode => !/^(simulated|model-check)-/.test(episode.id)));
  assert.equal((await fetch(base+'/demo-media/audio/missing.wav')).status, 404);
  assert.equal((await fetch(base+'/media/invalid/audio/missing.wav')).status, 404);
  assert.equal((await fetch(base+'/%E0%A4%A')).status, 400);
  assert.equal((await fetch(base+'/api/demo', { method: 'POST' })).status, 405);
  // All four slashless pages must resolve their own absolute module inputs in dev and production.
  const overlay = await context.newPage(); await overlay.goto(base+(await page.locator('#overlay').getAttribute('href'))); await overlay.locator('#genre').waitFor();
  await page.goto(`${base}/episode/demo`); await page.locator('#story article').nth(5).waitFor();
  await mkdir('data/screens/review', { recursive: true }); await page.screenshot({ path: 'data/screens/review/episode-injection-test.png', fullPage: true });
  assert.equal(await page.locator('#story article').count(), 6); assert((await page.locator('#cast').textContent())?.includes('CastViewer'));
  assert((await page.locator('#story').textContent())?.includes('PlotFriend')); assert((await page.locator('#subtitle').textContent())?.includes('synthetic'));
  const htmlDownload = page.waitForEvent('download'); await page.locator('#export').click(); const download = await htmlDownload; const path = await download.path(); assert(path);
  const html = await readFile(path, 'utf8'); assert(html.includes('data:audio/wav;base64,')); assert(html.includes('data:image/jpeg;base64,'));
  const offline = await context.newPage(); await offline.route('**/*', route => route.abort()); await offline.setContent(html);
  assert.equal(await offline.locator('audio[controls]').count(), 6); assert.equal(await offline.locator('script, img[src="x"]').count(), 0); assert((await offline.title()).includes(evil));
  assert.equal(await offline.locator('article').count(), 6);
  const pngDownload = page.waitForEvent('download'); await page.locator('#card').click(); const png = await (await pngDownload).path(); assert(png);
  await (await pngDownload).saveAs('data/screens/review/summary.png');
  const bytes = await readFile(png); assert.equal(bytes.readUInt32BE(16), 1080); assert.equal(bytes.readUInt32BE(20), 1350);
  await context.route('**/api/demo', route => route.fulfill({ json: fixture }));
  await page.reload(); await page.locator('#story article').nth(5).waitFor();
  await page.screenshot({ path: 'data/screens/review/episode.png', fullPage: true });
  await page.goto(`${base}/demo`); await page.locator('#play:enabled').waitFor(); assert((await page.locator('#banner').textContent())?.includes('synthetic'));
  // Use the first two recorded lines to exercise playback, gap pause/resume, completion and replay quickly.
  await context.route('**/api/demo', route => route.fulfill({ json: testBeats.slice(0, 2) })); await page.reload(); await page.locator('#play:enabled').waitFor(); await page.locator('#play').click();
  await page.waitForFunction(() => (document.getElementById('voice') as HTMLAudioElement).currentTime > 0);
  await page.evaluate(() => { const a = document.getElementById('voice') as HTMLAudioElement; a.pause(); a.dispatchEvent(new Event('ended')); });
  await page.locator('#toggle').click(); assert.equal(await page.locator('#toggle').textContent(), 'Play'); await page.locator('#toggle').click();
  await page.locator('#progress').filter({ hasText: 'Line 2 of 2' }).waitFor();
  await page.evaluate(() => { const a = document.getElementById('voice') as HTMLAudioElement; a.pause(); a.dispatchEvent(new Event('ended')); });
  await page.locator('#progress').filter({ hasText: 'Finished' }).waitFor(); await page.locator('#toggle').click(); await page.locator('#progress').filter({ hasText: 'Line 1 of 2' }).waitFor();
  await mkdir('data/screens/review', { recursive: true }); await page.screenshot({ path: 'data/screens/review/demo.png' });
  await page.setViewportSize({ width: 1920, height: 1200 });
  for (const genre of ['noir', 'nature', 'epic', 'sports', 'horror', 'heist', 'unhinged']) {
    await page.evaluate(g => {
      const voice = document.getElementById('voice') as HTMLAudioElement; voice.pause(); voice.ontimeupdate = null; voice.onended = null; voice.onplaying = null;
      document.body.dataset.genre = g; document.getElementById('genre')!.textContent = g.toUpperCase();
      document.getElementById('subtitles')!.textContent = 'Hassan dropped the only key in the river. A bold exit strategy.';
      document.getElementById('chapter')!.textContent = 'The Locked Door';
      let label = document.getElementById('previewLabel');
      if (!label) { label = document.createElement('div'); label.id = 'previewLabel'; label.style.cssText = 'position:absolute;top:12px;left:20px;color:white;background:#111;padding:8px;z-index:99'; document.getElementById('stage')!.append(label); }
      label.textContent = 'ILLUSTRATIVE STYLE PREVIEW · synthetic frame and scripted text';
    }, genre);
    await page.evaluate(() => document.fonts.ready);
    const plate = await page.locator('#subtitles').evaluate(node => { const s = getComputedStyle(node); return { font: s.fontFamily, size: parseFloat(s.fontSize), line: parseFloat(s.lineHeight), height: node.getBoundingClientRect().height, top: node.getBoundingClientRect().top, stageTop: node.parentElement!.getBoundingClientRect().top, stageHeight: node.parentElement!.getBoundingClientRect().height }; });
    assert(plate.font.includes('Narrator')); assert(plate.size >= 40); assert(plate.height <= plate.line * 2 + 44); assert(plate.top - plate.stageTop > plate.stageHeight * 2 / 3);
    assert(await page.evaluate(family => document.fonts.check(`40px ${family.split(',')[0]}`), plate.font));
    await page.locator('#stage').screenshot({ path: `data/screens/review/overlay-${genre}.png` });
  }
  await context.route('**/api/demo', route => route.fulfill({ json: [] })); await page.reload(); await page.locator('#info').filter({ hasText: 'No recorded' }).waitFor(); assert(await page.locator('#play').isDisabled());
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ check: 'SIMULATED browser review', mode: process.argv.includes('--dev') ? 'dev' : 'production', pages: 4, genres: 7, replay: true, emptyReplay: true, offlineHtmlAudio: 6, htmlEscaping: true, png: '1080x1350', castAndCredits: true, missingMedia404: true, pageErrors: errors }));
} finally { await browser.close(); await app.close(); clearTimeout(deadline); }
