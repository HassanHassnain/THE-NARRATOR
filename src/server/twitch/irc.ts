import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import type { ChatMessage, ChatSource } from './types.js';
export function unescapeTag(value: string): string {
  const codes: Record<string, string> = { s: ' ', ':': ';', r: '\r', n: '\n', '\\': '\\' };
  return value.replace(/\\(.)/g, (_, char: string) => codes[char] ?? char);
}
export function parseIRC(line: string): { command: string; tags: Record<string, string>; prefix: string; params: string[]; trailing: string } | undefined {
  let rest = line; const tags: Record<string, string> = {}; let prefix = '';
  if (rest.startsWith('@')) {
    const end = rest.indexOf(' '); if (end < 0) return;
    for (const tag of rest.slice(1, end).split(';')) { const eq = tag.indexOf('='); if (eq >= 0) tags[tag.slice(0, eq)] = unescapeTag(tag.slice(eq+1)); }
    rest = rest.slice(end+1);
  }
  if (rest.startsWith(':')) { const end = rest.indexOf(' '); if (end < 0) return; prefix = rest.slice(1, end); rest = rest.slice(end+1); }
  const trailingAt = rest.indexOf(' :');
  const trailing = trailingAt >= 0 ? rest.slice(trailingAt+2) : '';
  const [command, ...params] = (trailingAt >= 0 ? rest.slice(0, trailingAt) : rest).trim().split(/\s+/);
  if (!command) return;
  return { command, tags, prefix, params, trailing };
}
export function chatFromIRC(line: string): ChatMessage | undefined {
  const parsed = parseIRC(line); if (parsed?.command !== 'PRIVMSG') return;
  const author = parsed.tags['display-name'] || parsed.prefix.split('!')[0] || '';
  if (!author) return;
  const id = parsed.tags.id || randomUUID();
  return { id, sourceId: parsed.tags['source-id'] || id, authorId: parsed.tags['user-id'] || author.toLowerCase(), author, text: parsed.trailing, badges: (parsed.tags.badges ?? '').split(',').filter(Boolean).map(b => b.split('/')[0]!) };
}
export class AnonymousIRC implements ChatSource {
  private socket: WebSocket | undefined; private reconnect: ReturnType<typeof setTimeout> | undefined;
  private channel = ''; private stopped = true; private backoff = 1000;
  constructor(private onChat: (message: ChatMessage) => void, private status: (connected: boolean, notice?: string) => void, private url = 'wss://irc-ws.chat.twitch.tv:443', private makeSocket: (url: string) => WebSocket = url => new WebSocket(url, { handshakeTimeout: 8000 })) {}
  start(channel: string) {
    const normalized = channel.replace(/^#/, '').toLowerCase();
    if (!/^[a-z0-9_]{1,25}$/.test(normalized)) throw new Error('Enter a Twitch channel name, not a URL.');
    this.stop(); this.channel = normalized; this.stopped = false; this.connect();
  }
  private connect() {
    if (this.stopped) return;
    const socket = this.makeSocket(this.url); this.socket = socket;
    socket.on('open', () => {
      if (this.stopped || this.socket !== socket) { socket.close(); return; }
      for (const command of ['CAP REQ :twitch.tv/tags twitch.tv/commands', 'PASS SCHMOOPIIE', `NICK justinfan${Math.floor(Math.random()*900000)+100000}`, `JOIN #${this.channel}`]) socket.send(command + '\r\n');
    });
    let buffer = '';
    socket.on('message', data => {
      if (this.stopped || this.socket !== socket) return;
      buffer += data.toString();
      if (buffer.length > 65536) { this.status(false, 'Oversized IRC message ignored.'); socket.close(); return; }
      let end: number;
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const parsed = parseIRC(line); if (!parsed) continue;
        if (parsed.command === 'PING') socket.send(`PONG :${parsed.trailing || parsed.params[0] || 'tmi.twitch.tv'}\r\n`);
        if (parsed.command === '001') { this.backoff = 1000; this.status(true); }
        if (parsed.command === 'RECONNECT') socket.close();
        if (parsed.command === 'NOTICE') this.status(false, `Twitch IRC: ${parsed.trailing.slice(0,180)}`);
        const chat = chatFromIRC(line); if (chat) this.onChat(chat);
      }
    });
    socket.on('error', () => { if (this.socket !== socket || this.stopped) return; this.status(false, 'Chat connection failed. Check the channel or connect with Twitch.'); socket.close(); });
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.status(false);
      if (!this.stopped) { this.reconnect = setTimeout(() => this.connect(), this.backoff); this.backoff = Math.min(30000, this.backoff * 2); }
    });
  }
  stop() { this.stopped = true; if (this.reconnect) clearTimeout(this.reconnect); this.reconnect = undefined; const socket = this.socket; this.socket = undefined; socket?.close(); this.status(false); }
}
