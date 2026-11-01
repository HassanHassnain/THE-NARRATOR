import { createServer } from 'node:http';
import { readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import type { ViteDevServer } from 'vite';
import { config, eyesModel, writerModel, resourceVoiceFallback } from './config.js';
import { genres, type BeatLog, type ClientMessage, type Health, type PublicState } from '../shared/protocol.js';
import { createLocalClient } from './ai/client.js';
import { LocalEyes } from './ai/eyes.js';
import { LocalWriter } from './ai/writer.js';
import { LocalTTS } from './ai/tts.js';
import { LocalScreen } from './ai/screen.js';
import { checkHealth, warmModel, releaseModel } from './ai/health.js';
import { FakeEyes, FakeWriter, FakeTTS, FakeScreen } from './ai/fakes.js';
import { FileStore } from './store.js';
import { BeatRunner } from './director/beatRunner.js';
import { Director } from './director/index.js';
import { TwitchService } from './twitch/service.js';
import { Hub } from './hub.js';
import { ObsFrames } from './obsFrames.js';
import { provenance } from './provenance.js';
import { stableOverlayKey } from './overlayKey.js';
import { emoteMap, loadEmotes } from './emotes.js';
const pages: Record<string, string> = { '/': '/host/index.html', '/host': '/host/index.html', '/overlay': '/overlay/index.html', '/episode': '/episode/index.html', '/demo': '/demo/index.html' };
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.ttf': 'font/ttf' };
export async function createApp(production = false) {
  const fake = process.env.NARRATOR_FAKE_AI === '1';
  // The overlay key survives restarts so the OBS Browser Source link keeps working.
  const key = await stableOverlayKey(resolve('data/overlay.key'), fake);
  const store = new FileStore();
  const defaultLight = !fake && resourceVoiceFallback(false);
  const voice = fake ? undefined : new LocalTTS({ preferSystemVoice: resourceVoiceFallback(defaultLight) });
  const client = fake ? undefined : createLocalClient();
  const ai = client && voice ? { eyes: new LocalEyes(client), writer: new LocalWriter(client), tts: voice, screen: new LocalScreen(client, () => director.settings.lightMode ? eyesModel() : writerModel(), () => twitch?.router.blocklist ?? config.blocklist) } : { eyes: new FakeEyes(), writer: new FakeWriter(), tts: new FakeTTS(), screen: new FakeScreen() };
  let twitch: TwitchService | undefined;
  let hub: Hub; let vite: ViteDevServer | undefined;
  let health: Health = { ollama: false, installed: [], missing: [], fixes: [], latencyMs: 0 };
  const logs: BeatLog[] = [];
  const runner = new BeatRunner(ai, store, beat => { hub.broadcast({ type: 'beat', beat }); twitch?.chapter(beat); }, log => { logs.unshift(log); logs.splice(100); hub.broadcastState(); }, config.limits.beatTimeoutMs ?? 15000, () => twitch?.router.blocklist ?? config.blocklist);
  const director = new Director(runner);
  // The streamer's choices survive a server restart (data/settings.json); running and muted always start off.
  const prefsFile = resolve('data/settings.json');
  type Prefs = { protagonist?: string; genre?: string; cadenceSeconds?: number; spice?: number; twistMode?: 'approve' | 'auto'; modsOnly?: boolean };
  let prefs: Prefs = {};
  if (!fake) try { prefs = JSON.parse(readFileSync(prefsFile, 'utf8')) as Prefs; } catch { /* first run */ }
  if (typeof prefs.protagonist === 'string' && prefs.protagonist.trim()) director.settings.protagonist = prefs.protagonist.trim().slice(0, 80);
  if (genres.includes(prefs.genre as never)) director.settings.genre = prefs.genre as typeof director.settings.genre;
  if (typeof prefs.cadenceSeconds === 'number') director.settings.cadenceSeconds = Math.max(15, Math.min(90, prefs.cadenceSeconds));
  if (typeof prefs.spice === 'number') director.settings.spice = Math.max(0, Math.min(3, Math.round(prefs.spice)));
  let savingPrefs: Promise<void> = Promise.resolve();
  const savePrefs = () => {
    if (fake) return;
    const { protagonist, genre, cadenceSeconds, spice } = director.settings;
    prefs = { ...prefs, protagonist, genre, cadenceSeconds, spice, ...(twitch ? { twistMode: twitch.router.mode, modsOnly: twitch.router.modsOnly } : {}) };
    const text = JSON.stringify(prefs, null, 2);
    // One write at a time, via a temp file, so overlapping saves cannot interleave.
    savingPrefs = savingPrefs.then(() => writeFile(prefsFile + '.tmp', text)).then(() => rename(prefsFile + '.tmp', prefsFile)).catch(() => undefined);
  };
  // OBS game-layer frames take priority over a browser screen share when OBS is configured.
  const chatSource = process.env.OBS_CHAT_SOURCE ?? 'Twitch chat'; let startGenre = director.settings.genre;
  const obs = new ObsFrames(jpeg => { director.frame = jpeg; director.frameAt = Date.now(); }, () => hub?.broadcastState());
  obs.onRecordStart = outputPath => {
    // Every OBS recording is its own episode, linked to its file for editing and replay; the narrator runs while OBS records.
    startGenre = director.settings.genre; twitch?.router.resetEpisode(); obs.refreshBrowserSource(chatSource);
    const streamId = director.newEpisode(); hub?.broadcast({ type: 'stop' }); director.settings.running = true;
    void store.saveRecording(streamId, { outputPath, startedAt: Date.now() }).catch(() => undefined);
    hub?.notice('OBS started recording: new episode, narrator on.'); hub?.broadcastState();
  };
  obs.onRecordStop = () => {
    // Back to how the take started: same genre, empty chat panel, no queued twists or cooldowns.
    director.settings.running = false; director.settings.genre = startGenre; director.runner.cancel(); hub?.broadcast({ type: 'stop' });
    director.twists = []; director.events = []; director.recap = false; twitch?.router.resetEpisode(); obs.refreshBrowserSource(chatSource);
    savePrefs(); hub?.notice(`OBS stopped recording: narrator paused, back to ${startGenre}.`); hub?.broadcastState();
  };
  director.settings.lightMode = defaultLight;
  if (fake) director.source = 'simulated';
  if (fake) director.state.streamId = `simulated-${director.state.streamId}`;
  const state = (): PublicState => ({ settings: director.settings, story: director.state, health,
    twitch: twitch!.snapshot(), voice: voice?.status ?? { ready: true, engine: 'fake — SIMULATED' }, overlayKey: key, overlays: hub?.overlays ?? 0, logs, frameAt: director.frameAt, mic: director.mic, obs: obs.status });
  const emoteController = new AbortController();
  let closed = false;
  let emoteUser: string | undefined;
  function refreshEmotes() {
    if (fake || closed) return;
    const user = twitch?.auth.user;
    if (emoteUser === (user?.id ?? '')) return;
    emoteUser = user?.id ?? '';
    void loadEmotes({ signal: emoteController.signal, ...(user ? { twitchUserId: user.id, helix: path => twitch!.auth.helix(path, { signal: emoteController.signal }) } : {}) }).then(() => { if (!closed) hub.broadcastState(); }).catch(() => undefined);
  }
  let warming = false;
  async function refreshHealth() {
    health = fake ? { ollama: true, installed: [writerModel(), eyesModel()], missing: [], fixes: [], latencyMs: 0 } : await checkHealth(director.settings.lightMode);
    hub.broadcastState();
  }
  async function warm() {
    if (warming || fake) return;
    warming = true; hub.notice('Loading local models and voice. The first load may take a minute.');
    try {
      if (director.settings.lightMode && writerModel() !== eyesModel()) await releaseModel(writerModel());
      await voice?.ready(AbortSignal.timeout(30000));
      for (const model of [...new Set(director.settings.lightMode ? [eyesModel()] : [eyesModel(), writerModel()])]) await warmModel(model, AbortSignal.timeout(90000));
      hub.notice('Local models and voice are ready.');
    } catch (error) { hub.notice(error instanceof Error ? error.message : 'Local model warmup failed'); }
    finally { warming = false; await refreshHealth(); }
  }
  function onMessage(message: ClientMessage) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'twitch') {
      if (message.action === 'clear' || message.action === 'blocklist') hub.broadcast({ type: 'stop' });
      void twitch?.handle(message).then(() => { if (message.action === 'mode') savePrefs(); }).catch(error => hub.notice(error instanceof Error ? error.message : 'Twitch control failed'));
      return;
    }
    if (message.type === 'settings' && message.settings && typeof message.settings === 'object') {
      const s = message.settings;
      if (typeof s.protagonist === 'string') director.settings.protagonist = s.protagonist.trim().slice(0, 80) || 'Streamer';
      if (genres.includes(s.genre!)) director.settings.genre = s.genre!;
      if (typeof s.cadenceSeconds === 'number' && Number.isFinite(s.cadenceSeconds)) director.settings.cadenceSeconds = Math.max(15, Math.min(90, s.cadenceSeconds));
      if (typeof s.spice === 'number' && Number.isFinite(s.spice)) director.settings.spice = Math.max(0, Math.min(3, Math.round(s.spice)));
      for (const field of ['lightMode', 'muted', 'running'] as const) if (typeof s[field] === 'boolean') director.settings[field] = s[field];
      if (director.settings.muted || !director.settings.running) { runner.cancel(); hub.broadcast({ type: 'stop' }); }
      if (s.lightMode !== undefined) {
        runner.cancel(); hub.broadcast({ type: 'stop' });
        voice?.setResourceMode(resourceVoiceFallback(s.lightMode));
        void voice?.ready().then(() => hub.broadcastState()).catch(error => hub.notice(String(error)));
        if (s.lightMode && !fake && writerModel() !== eyesModel()) {
          runner.cancel(); hub.broadcast({ type: 'stop' });
          void releaseModel(writerModel()).catch(error => hub.notice(String(error)));
        }
        void refreshHealth();
      }
      savePrefs(); hub.broadcastState();
    } else if (message.type === 'frame' && typeof message.jpeg === 'string' && message.jpeg.length < 1_800_000) {
      const bytes = Buffer.from(message.jpeg.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
      if (bytes[0] === 0xff && bytes[1] === 0xd8 && !(obs.status.connected && Date.now() - obs.status.lastFrameAt < 5000)) { director.frame = bytes; director.frameAt = Date.now(); }
    } else if (message.type === 'transcript' && typeof message.text === 'string' && typeof message.at === 'number' && Number.isFinite(message.at)) {
      director.addTranscript(message.text, message.at);
      if (director.settings.running && !fake && message.text.trim()) void store.appendTranscript(director.state.streamId, { at: Date.now(), text: message.text.trim().slice(0, 2000) }).catch(() => undefined);
    }
    else if (message.type === 'mic' && typeof message.active === 'boolean') { director.mic = message.active; hub.broadcastState(); }
    else if (message.type === 'skip') { runner.cancel(); hub.broadcast({ type: 'stop' }); }
    else if (message.type === 'warm') void warm();
  }
  const root = resolve('dist/client');
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
      const url = new URL(request.url ?? '/', 'http://localhost');
      const pathname = decodeURIComponent(url.pathname).replace(/\/$/, '') || '/';
      if (pathname === '/api/state' || pathname === '/api/config') {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(pathname === '/api/state' ? state() : { genres: config.genres, simulated: fake })); return;
      }
      if (pathname === '/api/emotes') {
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(Object.fromEntries(emoteMap))); return;
      }
      if (pathname === '/api/frame') {
        // What the narrator currently sees (local control room preview only).
        if (!director.frame) { response.writeHead(204).end(); return; }
        response.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }).end(director.frame); return;
      }
      if (pathname === '/api/episodes') {
        // Streams and legacy unclassified sessions, excluding model checks and simulated runs.
        const ids = (await readdir(resolve('data/streams')).catch(() => [] as string[])).filter(id => /^[\w-]{1,100}$/.test(id) && !id.startsWith('simulated-'));
        const list = (await Promise.all(ids.map(async id => { const beats = await store.read(id).catch(() => []); const source = await provenance(id, beats); return beats.length && source !== 'model-check' && source !== 'simulated' ? { id, beats: beats.length, at: beats[0]!.at, protagonist: beats.find(b => b.protagonist)?.protagonist ?? '' } : undefined; }))).filter(Boolean);
        list.sort((a, b) => b!.at - a!.at);
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(list)); return;
      }
      if (pathname.startsWith('/api/episode/')) {
        const id = pathname.slice('/api/episode/'.length);
        const saved = await store.read(id); const source = await provenance(id, saved);
        const beats = saved.map(beat => source === 'unknown' ? beat : { ...beat, source });
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(beats)); return;
      }
      if (pathname === '/api/demo-info') {
        const body = await readFile(resolve('fixtures/demo-session/provenance.json')).catch(() => Buffer.from(JSON.stringify({ source: 'unknown' })));
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(body); return;
      }
      if (pathname === '/api/demo') {
        // Recorded session committed to the repo so judges can replay it without models or Twitch.
        const body = await readFile(resolve('fixtures/demo-session/beats.json')).catch(() => Buffer.from('[]'));
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(body); return;
      }
      if (pathname.startsWith('/demo-media/')) {
        const match = /^\/demo-media\/(audio|frames)\/([\w-]{1,100})\.(wav|jpg)$/.exec(pathname);
        if (!match) { response.writeHead(404).end(); return; }
        const file = resolve('fixtures/demo-session', match[1]!, `${match[2]}.${match[3]}`);
        const body = await readFile(file);
        response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' }).end(body); return;
      }
      if (pathname.startsWith('/media/')) {
        const match = /^\/media\/([\w-]{1,100})\/(audio|frames)\/([\w-]{1,100})\.(wav|jpg)$/.exec(pathname);
        if (!match) { response.writeHead(404).end(); return; }
        const file = resolve('data/streams', match[1]!, match[2]!, `${match[3]}.${match[4]}`);
        const body = await readFile(file);
        response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' }).end(body); return;
      }
      const page = pages[pathname] ?? (/^\/episode\/[\w-]{1,100}$/.test(pathname) ? pages['/episode'] : undefined);
      if (vite) { if (page) request.url = page + url.search; vite.middlewares(request, response, () => response.writeHead(404).end('Not found')); return; }
      const file = resolve(root, '.' + (page ?? pathname));
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) { response.writeHead(404).end('Not found'); return; }
      response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
      response.end(request.method === 'HEAD' ? undefined : await readFile(file));
    } catch (error) { if (!response.headersSent) response.writeHead(error instanceof URIError ? 400 : (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500); response.end(); }
  });
  twitch = new TwitchService(director, ai.screen, () => { hub.broadcastState(); refreshEmotes(); }, text => hub.notice(text), fake);
  if (prefs.twistMode === 'approve' || prefs.twistMode === 'auto') twitch.router.mode = prefs.twistMode;
  if (typeof prefs.modsOnly === 'boolean') twitch.router.modsOnly = prefs.modsOnly;
  hub = new Hub(server, key, state, onMessage);
  void twitch.startSaved().catch(error => hub.notice(String(error))).finally(refreshEmotes);
  if (!fake) obs.start();
  if (!production) { const { createServer: createVite } = await import('vite'); vite = await createVite({ server: { middlewareMode: true, hmr: { server } } }); }
  const interval = setInterval(() => { void director.tick().catch(error => hub.notice(String(error))); }, 500);
  const healthInterval = setInterval(() => { void refreshHealth(); }, 10000);
  void refreshHealth();
  return { server, director, hub, twitch, state, async close() { closed = true; emoteController.abort(); obs.close(); clearInterval(interval); clearInterval(healthInterval); runner.cancel(); voice?.close(); twitch?.close(); hub.close(); await vite?.close(); server.closeAllConnections(); await new Promise<void>(resolveClose => server.close(() => resolveClose())); } };
}
