import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
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
const pages: Record<string, string> = { '/': '/host/index.html', '/host': '/host/index.html', '/overlay': '/overlay/index.html', '/episode': '/episode/index.html', '/demo': '/demo/index.html' };
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav' };
export async function createApp(production = false) {
  const fake = process.env.NARRATOR_FAKE_AI === '1';
  const key = randomBytes(24).toString('hex');
  const store = new FileStore();
  const defaultLight = !fake && resourceVoiceFallback(false);
  const voice = fake ? undefined : new LocalTTS({ preferSystemVoice: resourceVoiceFallback(defaultLight) });
  const client = fake ? undefined : createLocalClient();
  const ai = client && voice ? { eyes: new LocalEyes(client), writer: new LocalWriter(client), tts: voice, screen: new LocalScreen(client, () => director.settings.lightMode ? eyesModel() : writerModel(), () => twitch?.router.blocklist ?? config.blocklist) } : { eyes: new FakeEyes(), writer: new FakeWriter(), tts: new FakeTTS(), screen: new FakeScreen() };
  let twitch: TwitchService | undefined;
  let hub: Hub; let vite: ViteDevServer | undefined;
  let health: Health = { ollama: false, installed: [], missing: [], fixes: [], latencyMs: 0 };
  const logs: BeatLog[] = [];
  const runner = new BeatRunner(ai, store, beat => { hub.broadcast({ type: 'beat', beat }); twitch?.chapter(beat); }, log => { logs.unshift(log); logs.splice(100); hub.broadcastState(); }, 10000, () => twitch?.router.blocklist ?? config.blocklist);
  const director = new Director(runner);
  director.settings.lightMode = defaultLight;
  if (fake) director.state.streamId = `simulated-${director.state.streamId}`;
  const state = (): PublicState => ({ settings: director.settings, story: director.state, health,
    twitch: twitch!.snapshot(), voice: voice?.status ?? { ready: true, engine: 'fake — SIMULATED' }, overlayKey: key, overlays: hub?.overlays ?? 0, logs, frameAt: director.frameAt, mic: director.mic });
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
      void twitch?.handle(message).catch(error => hub.notice(error instanceof Error ? error.message : 'Twitch control failed'));
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
      hub.broadcastState();
    } else if (message.type === 'frame' && typeof message.jpeg === 'string' && message.jpeg.length < 1_800_000) {
      const bytes = Buffer.from(message.jpeg.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
      if (bytes[0] === 0xff && bytes[1] === 0xd8) { director.frame = bytes; director.frameAt = Date.now(); }
    } else if (message.type === 'transcript' && typeof message.text === 'string' && typeof message.at === 'number' && Number.isFinite(message.at)) director.addTranscript(message.text, message.at);
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
      if (pathname.startsWith('/api/episode/')) {
        const beats = await store.read(pathname.slice('/api/episode/'.length));
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(beats)); return;
      }
      if (pathname.startsWith('/media/')) {
        const match = /^\/media\/([\w-]{1,100})\/(audio|frames)\/([\w-]{1,100})\.(wav|jpg)$/.exec(pathname);
        if (!match) { response.writeHead(404).end(); return; }
        const file = resolve('data/streams', match[1]!, match[2]!, `${match[3]}.${match[4]}`);
        const body = await readFile(file);
        response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=3600' }).end(body); return;
      }
      const page = pages[pathname] ?? (/^\/episode\/[^/]+$/.test(pathname) ? pages['/episode'] : undefined);
      if (vite) { if (page) request.url = page + url.search; vite.middlewares(request, response, () => response.writeHead(404).end('Not found')); return; }
      const file = resolve(root, '.' + (page ?? pathname));
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) { response.writeHead(404).end('Not found'); return; }
      response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
      response.end(request.method === 'HEAD' ? undefined : await readFile(file));
    } catch (error) { if (!response.headersSent) response.writeHead(error instanceof URIError ? 400 : (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500); response.end(); }
  });
  twitch = new TwitchService(director, ai.screen, () => hub.broadcastState(), text => hub.notice(text), fake);
  hub = new Hub(server, key, state, onMessage);
  void twitch.startSaved().catch(error => hub.notice(String(error)));
  if (!production) { const { createServer: createVite } = await import('vite'); vite = await createVite({ server: { middlewareMode: true, hmr: { server } } }); }
  const interval = setInterval(() => { void director.tick().catch(error => hub.notice(String(error))); }, 500);
  const healthInterval = setInterval(() => { void refreshHealth(); }, 10000);
  void refreshHealth();
  return { server, director, hub, twitch, state, async close() { clearInterval(interval); clearInterval(healthInterval); runner.cancel(); voice?.close(); twitch?.close(); hub.close(); await vite?.close(); server.closeAllConnections(); await new Promise<void>(resolveClose => server.close(() => resolveClose())); } };
}
