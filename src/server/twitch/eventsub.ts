import WebSocket from 'ws';
import type { StoryEvent } from '../../shared/protocol.js';
import type { DeviceAuth } from './deviceAuth.js';
import { SeenIds, type ChatMessage } from './types.js';
export interface Envelope {
  metadata: { message_type: string; message_id: string; subscription_type?: string };
  payload: { session?: { id: string; keepalive_timeout_seconds?: number; reconnect_url?: string }; subscription?: { type: string; status?: string }; event?: Record<string, unknown> };
}
export function mapNotification(message: Envelope): { chat?: ChatMessage; event?: StoryEvent } {
  const e = message.payload.event; const type = message.payload.subscription?.type ?? message.metadata.subscription_type;
  if (!e || message.metadata.message_type !== 'notification') return {};
  const text = (key: string, fallback = '') => typeof e[key] === 'string' ? (e[key] as string).slice(0,500) : fallback;
  if (type === 'channel.chat.message') {
    const body = e.message as { text?: unknown } | undefined;
    if (typeof body?.text !== 'string') return {};
    const id = text('message_id', message.metadata.message_id);
    return { chat: { id, sourceId: text('source_message_id', id) || id, authorId: text('chatter_user_id'), author: text('chatter_user_name', text('chatter_user_login')), text: body.text.slice(0,500), badges: Array.isArray(e.badges) ? e.badges.map(b => String((b as { set_id?: string }).set_id ?? '')) : [] } };
  }
  let kind: StoryEvent['kind']; let detail = ''; let author = text('user_name', text('user_login', 'Anonymous'));
  if (type === 'channel.follow') { kind = 'follow'; detail = 'followed the channel'; }
  else if (type === 'channel.subscribe') { kind = 'sub'; detail = 'subscribed'; }
  else if (type === 'channel.subscription.gift') { kind = 'gift'; detail = `gifted ${Number(e.total) || 1} subscriptions`; }
  else if (type === 'channel.cheer') { kind = 'cheer'; detail = `cheered ${Number(e.bits) || 0} bits`; }
  else if (type === 'channel.raid') { kind = 'raid'; author = text('from_broadcaster_user_name', text('from_broadcaster_user_login')); detail = `raided with ${Number(e.viewers) || 0} viewers`; }
  else return {};
  return { event: { id: message.metadata.message_id, kind, author: author.slice(0,80), detail } };
}
export function subscriptionRequests(userId: string, sessionId: string) {
  const items = [
    { type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: userId, user_id: userId } },
    { type: 'channel.follow', version: '2', condition: { broadcaster_user_id: userId, moderator_user_id: userId } },
    { type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: userId } },
    { type: 'channel.subscription.gift', version: '1', condition: { broadcaster_user_id: userId } },
    { type: 'channel.cheer', version: '1', condition: { broadcaster_user_id: userId } },
    { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: userId } }
  ];
  return items.map(item => ({ ...item, transport: { method: 'websocket', session_id: sessionId } }));
}
export class EventSub {
  private seen = new SeenIds();
  private socket: WebSocket | undefined; private sockets = new Set<WebSocket>();
  private idle: ReturnType<typeof setTimeout> | undefined; private reconnect: ReturnType<typeof setTimeout> | undefined;
  private stopped = true; private epoch = 0; private backoff = 1000; private idleSeconds = 15;
  private waits = new Map<ReturnType<typeof setTimeout>, () => void>();
  private pause(ms: number) { return new Promise<void>(resolve => { const timer = setTimeout(() => { this.waits.delete(timer); resolve(); }, ms); this.waits.set(timer, resolve); }); }
  private subscribed = new Set<string>(); private handoff = false;
  constructor(private auth: Pick<DeviceAuth, 'helix' | 'user'>, private onChat: (chat: ChatMessage) => void, private onEvent: (event: StoryEvent) => void,
    private status: (connected: boolean, chat: boolean) => void, private notice: (text: string) => void,
    private makeSocket: (url: string) => WebSocket = url => new WebSocket(url)) {}
  get active() { return !this.stopped; }
  start() { this.stop(); if (!this.auth.user) return; this.stopped = false; this.connect('wss://eventsub.wss.twitch.tv/ws'); }
  private resetIdle() {
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => { this.notice('EventSub keepalive missed; reconnecting.'); this.socket?.close(); }, this.idleSeconds * 1000);
  }
  private connect(url: string, transfer = false) {
    if (this.stopped) return;
    const epoch = this.epoch; const previous = this.socket;
    const socket = this.makeSocket(url); this.socket = socket; this.sockets.add(socket); this.resetIdle();
    socket.on('message', data => {
      if (this.stopped || epoch !== this.epoch) return;
      let message: Envelope;
      try { message = JSON.parse(data.toString()) as Envelope; if (!message.metadata || !message.payload || typeof message.metadata.message_id !== 'string' || typeof message.metadata.message_type !== 'string') return; } catch { return; }
      if (!this.seen.add(message.metadata.message_id)) return;
      this.resetIdle();
      const type = message.metadata.message_type;
      if (type === 'session_welcome') {
        const session = message.payload.session; if (!session?.id) return;
        this.idleSeconds = Math.max(10, session.keepalive_timeout_seconds ?? 10)+5; this.resetIdle();
        this.handoff = false;
        if (transfer) { previous?.close(); this.status(true, this.subscribed.has('channel.chat.message')); }
        else void this.subscribe(session.id, epoch);
      } else if (type === 'session_reconnect') {
        const next = message.payload.session?.reconnect_url;
        try { const parsed = new URL(next ?? ''); if (parsed.protocol !== 'wss:' || parsed.hostname !== 'eventsub.wss.twitch.tv') throw new Error(); }
        catch { this.notice('Invalid EventSub reconnect URL ignored.'); return; }
        if (!this.handoff) { this.handoff = true; this.connect(next!, true); }
      } else if (type === 'revocation') {
        const subscription = message.payload.subscription;
        if (subscription) this.subscribed.delete(subscription.type);
        this.notice(`Twitch revoked ${subscription?.type ?? 'subscription'}: ${subscription?.status ?? 'unknown'}. Connect again.`);
        this.status(this.subscribed.size > 0, this.subscribed.has('channel.chat.message'));
      } else if (type === 'notification') {
        try { const mapped = mapNotification(message); if (mapped.chat) this.onChat(mapped.chat); if (mapped.event) this.onEvent(mapped.event); } catch { this.notice('Malformed Twitch notification ignored.'); }
      }
    });
    socket.on('error', () => { this.notice('EventSub connection failed. Reconnecting.'); socket.close(); });
    socket.on('close', () => {
      this.sockets.delete(socket);
      if (this.socket !== socket || this.stopped || epoch !== this.epoch) return;
      this.epoch++; this.status(false, false); if (this.idle) clearTimeout(this.idle);
      this.reconnect = setTimeout(() => this.connect('wss://eventsub.wss.twitch.tv/ws'), this.backoff); this.backoff = Math.min(30000, this.backoff*2);
    });
  }
  private async subscribe(sessionId: string, epoch: number) {
    if (!this.auth.user) return; this.subscribed.clear();
    for (const body of subscriptionRequests(this.auth.user.id, sessionId)) {
      // Requests made while the dev server is still starting can time out; retry before giving up.
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (this.stopped || epoch !== this.epoch) return;
        try {
          const response = await this.auth.helix('eventsub/subscriptions', { method: 'POST', body: JSON.stringify(body) });
          if (this.stopped || epoch !== this.epoch) return;
          if ((response.status === 429 || response.status >= 500) && attempt < 3) { await this.pause(2000 * attempt); continue; }
          if (response.ok) this.subscribed.add(body.type);
          else if (response.status === 409) this.notice(`${body.type} is bound to another session. Close the other copy or wait, then reconnect.`);
          else this.notice(`${body.type} unavailable (${response.status}); check account eligibility and permissions.`);
          break;
        } catch {
          if (this.stopped || epoch !== this.epoch) return;
          if (attempt === 3) this.notice(`${body.type} subscription failed; narration remains available.`);
          else await this.pause(2000 * attempt);
        }
      }
    }
    if (this.stopped || epoch !== this.epoch) return;
    if (this.subscribed.size) this.backoff = 1000;
    this.status(this.subscribed.size > 0, this.subscribed.has('channel.chat.message'));
    if (!this.subscribed.size) { this.notice('No Twitch subscriptions enabled. Authorize again.'); this.stop(); }
  }
  stop() { this.stopped = true; for (const [timer, resolve] of this.waits) { clearTimeout(timer); resolve(); } this.waits.clear(); this.epoch++; this.handoff = false; if (this.idle) clearTimeout(this.idle); if (this.reconnect) clearTimeout(this.reconnect); this.idle = undefined; this.reconnect = undefined; for (const socket of this.sockets) socket.close(); this.sockets.clear(); this.socket = undefined; this.subscribed.clear(); this.status(false, false); }
}
