import { createHash, randomUUID } from 'node:crypto';
import WebSocket from 'ws';
export interface ObsStatus { configured: boolean; connected: boolean; source: string; lastFrameAt: number; error?: string | undefined }
/** Reads one OBS source, never the composed scene or an unrelated window. */
export class ObsFrames {
  status: ObsStatus;
  /** Called when OBS starts recording, with the file it records to, and when it stops. */
  onRecordStart: ((outputPath: string) => void) | undefined;
  onRecordStop: (() => void) | undefined;
  private ws: WebSocket | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private pending = new Map<string, { resolve: (data: Record<string, unknown>) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private inFlight = false; private closed = false; private backoff = 1000;
  private url: string;
  constructor(private onFrame: (jpeg: Buffer) => void, private changed: () => void,
    url = process.env.OBS_WS_URL, private password = process.env.OBS_WS_PASSWORD ?? '',
    source = process.env.OBS_GAME_SOURCE ?? 'Game', private intervalMs = 1000,
    private makeSocket: (url: string) => WebSocket = url => new WebSocket(url, 'obswebsocket.json', { handshakeTimeout: 5000 })) {
    this.url = url || 'ws://127.0.0.1:4455';
    this.status = { configured: !!url || !!password, connected: false, source, lastFrameAt: 0 };
  }
  start() { if (this.status.configured && !this.ws && !this.closed) this.connect(); }
  private rejectPending() { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('OBS disconnected')); } this.pending.clear(); }
  close() {
    this.closed = true; clearInterval(this.timer); clearTimeout(this.retry); this.rejectPending();
    const ws = this.ws; this.ws = undefined; ws?.close(); this.status = { ...this.status, connected: false };
  }
  private set(patch: Partial<ObsStatus>) { this.status = { ...this.status, ...patch }; this.changed(); }
  private connect() {
    if (this.closed) return;
    let ws: WebSocket;
    try { ws = this.makeSocket(this.url); } catch { this.set({ connected: false, error: 'Invalid OBS WebSocket URL. Check OBS_WS_URL.' }); return; }
    this.ws = ws;
    const hash = (s: string) => createHash('sha256').update(s).digest('base64');
    ws.on('message', raw => {
      if (this.closed || this.ws !== ws) return;
      try {
        const msg: unknown = JSON.parse(String(raw));
        if (!msg || typeof msg !== 'object') throw new Error('Malformed OBS message');
        const { op, d } = msg as { op: number; d?: Record<string, unknown> };
        if (!d || typeof d !== 'object') throw new Error('Malformed OBS payload');
        if (op === 0) {
          const auth = d.authentication as { salt?: unknown; challenge?: unknown } | undefined;
          if (auth && (typeof auth.salt !== 'string' || typeof auth.challenge !== 'string')) throw new Error('Invalid OBS authentication challenge');
          // Outputs events (1 << 6) only, for RecordStateChanged.
          ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, eventSubscriptions: 64, ...(auth ? { authentication: hash(hash(this.password + auth.salt) + auth.challenge) } : {}) } }));
        } else if (op === 2) {
          this.backoff = 1000; this.set({ connected: true, error: undefined });
          clearInterval(this.timer); this.timer = setInterval(() => void this.grab(ws), this.intervalMs); void this.grab(ws);
        } else if (op === 5) {
          const data = d.eventData as { outputState?: unknown; outputPath?: unknown } | undefined;
          if (d.eventType === 'RecordStateChanged' && data?.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED') this.onRecordStart?.(typeof data.outputPath === 'string' ? data.outputPath : '');
          if (d.eventType === 'RecordStateChanged' && data?.outputState === 'OBS_WEBSOCKET_OUTPUT_STOPPED') this.onRecordStop?.();
        } else if (op === 7 && typeof d.requestId === 'string') {
          const p = this.pending.get(d.requestId); if (!p) return;
          this.pending.delete(d.requestId); clearTimeout(p.timer);
          const status = d.requestStatus as { result?: boolean; comment?: string; code?: number } | undefined;
          if (status?.result) p.resolve((d.responseData ?? {}) as Record<string, unknown>);
          else p.reject(new Error(status?.comment ?? `OBS error ${status?.code}`));
        }
      } catch (error) { this.set({ error: error instanceof Error ? error.message : 'Malformed OBS message' }); }
    });
    ws.on('close', () => {
      if (this.ws !== ws || this.closed) return;
      clearInterval(this.timer); this.rejectPending(); this.ws = undefined;
      this.set({ connected: false, error: 'OBS is not reachable. Open OBS (WebSocket server on).' });
      this.retry = setTimeout(() => this.connect(), this.backoff); this.backoff = Math.min(15000, this.backoff * 2);
    });
    ws.on('error', () => { /* ws emits close after transport errors */ });
  }
  /** Reloads a browser source (the chat panel), so each episode starts with an empty chat. Fire and forget. */
  refreshBrowserSource(inputName: string) {
    const ws = this.ws; if (!ws || ws.readyState !== WebSocket.OPEN || !this.status.connected) return;
    try { ws.send(JSON.stringify({ op: 6, d: { requestType: 'PressInputPropertiesButton', requestId: randomUUID(), requestData: { inputName, propertyName: 'refreshnocache' } } })); } catch { /* reconnect handles it */ }
  }
  private request(ws: WebSocket) {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      if (this.closed || this.ws !== ws || ws.readyState !== WebSocket.OPEN) { reject(new Error('OBS disconnected')); return; }
      const requestId = randomUUID();
      const timer = setTimeout(() => { if (this.pending.delete(requestId)) reject(new Error('OBS screenshot timed out')); }, 5000);
      this.pending.set(requestId, { resolve, reject, timer });
      try { ws.send(JSON.stringify({ op: 6, d: { requestType: 'GetSourceScreenshot', requestId, requestData: { sourceName: this.status.source, imageFormat: 'jpg', imageWidth: 768, imageCompressionQuality: 70 } } })); }
      catch { clearTimeout(timer); this.pending.delete(requestId); reject(new Error('OBS disconnected')); }
    });
  }
  private async grab(ws: WebSocket) {
    if (this.inFlight || this.closed) return; this.inFlight = true;
    try {
      const data = await this.request(ws);
      if (this.closed || this.ws !== ws) return;
      if (typeof data.imageData !== 'string' || !/^data:image\/jpe?g;base64,/.test(data.imageData) || data.imageData.length > 1_800_000) throw new Error('OBS returned an invalid JPEG');
      const bytes = Buffer.from(data.imageData.replace(/^data:image\/jpe?g;base64,/, ''), 'base64');
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('OBS returned an invalid JPEG');
      this.onFrame(bytes); const first = !this.status.lastFrameAt || !!this.status.error;
      this.status = { ...this.status, lastFrameAt: Date.now(), error: undefined }; if (first) this.changed();
    } catch (error) {
      if (this.closed || this.ws !== ws) return;
      const message = error instanceof Error ? error.message : 'OBS screenshot failed';
      if (message !== this.status.error) this.set({ error: /source/i.test(message) ? `OBS has no source named "${this.status.source}". Rename the game layer or set OBS_GAME_SOURCE.` : message });
    } finally { this.inFlight = false; }
  }
}
