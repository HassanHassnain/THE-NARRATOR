import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
process.env.NARRATOR_FAKE_AI = '1';
const { createApp } = await import('../src/server/app.js');
const app = await createApp(true);
await new Promise<void>(resolve => app.server.listen(0, '127.0.0.1', resolve));
const address = app.server.address(); assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const deadline = setTimeout(() => { console.error('Browser smoke check exceeded 18 seconds'); process.exit(1); }, 18000);
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  context.setDefaultTimeout(5000);
  await context.addInitScript({ content: `
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 432;
    const c = canvas.getContext('2d'); c.fillStyle = '#b73232'; c.fillRect(0,0,768,432); setInterval(() => c.fillRect(0,0,768,432), 100);
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable: true, value: async () => canvas.captureStream(5) });
    class Recognition {
      constructor() { window.testRecognition = this; }
      start() { if(this.onstart) this.onstart(); }
      stop() { if(this.onend) this.onend(); }
    }
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: Recognition });
    Object.defineProperty(window, 'SpeechRecognition', { value: Recognition });
    window.played = 0; window.creditSeen = false;
    new MutationObserver(() => { if(document.getElementById('credit')?.textContent?.includes('PlotFriend')) window.creditSeen = true; }).observe(document, {subtree:true, childList:true, characterData:true});
    document.addEventListener('play', () => { window.played++; }, true);
  ` });
  const host = await context.newPage(); const errors: string[] = [];
  host.on('pageerror', e => errors.push(e.message));
  await host.goto(`${base}/host`);
  await host.getByText('Control room connected', { exact: true }).waitFor();
  const overlayLink = await host.locator('#overlay').getAttribute('href'); assert(overlayLink);
  const overlay = await context.newPage(); overlay.on('pageerror', e => errors.push(e.message));
  await overlay.goto(base+overlayLink);
  await host.getByText('✓ Overlay connected', { exact: true }).waitFor();
  await host.getByRole('button', { name: 'Share game window', exact: true }).click();
  await host.getByRole('button', { name: 'Stop sharing', exact: true }).waitFor();
  await host.waitForFunction(async () => (await (await fetch('/api/state')).json()).frameAt > 0);
  await host.getByRole('button', { name: 'Enable microphone', exact: true }).click();
  await host.getByRole('button', { name: 'Start narrator', exact: true }).click();
  await host.waitForFunction(() => !!(window as unknown as { testRecognition?: unknown }).testRecognition);
  await host.evaluate(() => {
    const r = (window as unknown as { testRecognition: { onresult: (event: unknown) => void } }).testRecognition;
    r.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Narrator, I missed the locked red door!' } }] });
  });
  await host.locator('#logs li.spoken').first().waitFor();
  await overlay.waitForFunction(() => (window as unknown as { played: number }).played > 0);
  const state = app.state(); assert.equal(state.story.beatCount, 1); assert(state.frameAt > 0); assert(state.mic); assert.equal(state.overlays, 1);
  const beats = JSON.parse(await readFile(`data/streams/${state.story.streamId}/beats.json`, 'utf8')) as { audioUrl: string; frameUrl: string }[];
  assert.equal(beats.length, 1);
  assert.equal((await fetch(base+beats[0]!.audioUrl)).status, 200); assert.equal((await fetch(base+beats[0]!.frameUrl)).status, 200);
  await host.keyboard.press('m'); await host.getByRole('button', { name: 'Unmute (M)' }).waitFor();
  await host.keyboard.press('s');
  await host.getByRole('button', { name: 'Unmute (M)' }).click();
  await host.getByRole('button', { name: 'Mute (M)', exact: true }).waitFor();
  await app.twitch.router.handle({ id:'browser-twist',sourceId:'browser-twist',authorId:'friend',author:'PlotFriend',text:'!twist The cat owned the red door.',badges:[] });
  await host.locator('#pendingTwists').getByRole('button', { name: 'Approve', exact: true }).click();
  await host.waitForFunction(async () => (await (await fetch('/api/state')).json()).twitch.accepted.length === 1);
  assert.equal((await app.director.tick(Date.now()+9000))?.trigger, 'twist');
  await overlay.waitForFunction(() => (window as unknown as { creditSeen: boolean }).creditSeen);
  await host.getByText('Edit banned words', { exact: true }).click();
  await host.locator('#blocklist').fill('red door');
  await host.getByRole('button', { name: 'Apply banned words', exact: true }).click();
  await host.waitForFunction(async () => (await (await fetch('/api/state')).json()).twitch.blocklist.includes('red door'));
  await host.evaluate(() => { (window as unknown as { testRecognition: { onresult: (event: unknown) => void } }).testRecognition.onresult({ resultIndex:0,results:[{isFinal:true,0:{transcript:'Narrator, the red door stayed locked.'}}] }); });
  await host.locator('#logs li.skipped').first().waitFor();
  assert.equal(app.state().story.beatCount, 2);
  await host.locator('#twitchSetup').getByText('TWITCH_CLIENT_ID', { exact: false }).waitFor();
  await mkdir('data/screens', { recursive: true });
  await host.screenshot({ path: 'data/screens/host-phase1.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ check: 'SIMULATED browser integration', capturedWidth: 768, speechFinalDelivered: true, audioPlayback: true, persistedBeat: true, mute: true, skip: true, twistApproval: true, overlayCredit: true, editedVoiceBlocklist: true, pageErrors: errors, streamId: state.story.streamId }));
} finally { await browser.close(); await app.close(); clearTimeout(deadline); }
