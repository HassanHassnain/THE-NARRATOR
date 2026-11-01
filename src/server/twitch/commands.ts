import { randomUUID } from 'node:crypto';
import { genres, type Genre, type StoryEvent, type Twist } from '../../shared/protocol.js';
import { blocked, config } from '../config.js';
import type { Screen } from '../ai/screen.js';
import type { Director } from '../director/index.js';
import { SeenIds, type ChatMessage } from './types.js';
import { ChatPulse } from './pulse.js';
export class CommandRouter {
  mode: 'approve' | 'auto' = 'approve'; modsOnly = false;
  pending: Twist[] = []; blocklist = [...config.blocklist];
  readonly seen = new SeenIds();
  private twistAt = new Map<string, number>(); private recapAt = -Infinity;
  private queueEpoch = 0; private blocklistEpoch = 0;
  private voteStart = -Infinity; private votes = new Map<string, Genre>(); private screening = false;
  // Emote spam and meme phrases become a 'hype' story event. Only whitelisted tokens are passed on, so no model screen is needed.
  readonly pulse = new ChatPulse(event => {
    if (this.director.events.length >= 50 || blocked(event.detail, this.blocklist) || this.director.events.some(e => e.kind === 'hype')) return;
    this.director.events.push(event); this.notice(`Chat reaction: ${event.detail}`); this.changed();
  });
  constructor(private director: Director, private screen: Screen, private changed: () => void, private notice: (text: string) => void) {}
  async handle(message: ChatMessage, now = Date.now()): Promise<void> {
    if (!this.seen.add(message.sourceId || message.id, now)) return;
    const [token, ...args] = message.text.trim().split(/\s+/); const command = token?.toLowerCase();
    if (!command?.startsWith('!')) { this.pulse.add(message, now); return; }
    if (command === '!genre') {
      const genre = args[0]?.toLowerCase() as Genre;
      if (!genres.includes(genre)) return;
      const withinWindow = now - this.voteStart <= 30000;
      if (!withinWindow && now - this.voteStart < 60000) return;
      if (!withinWindow) { this.voteStart = now; this.votes.clear(); }
      this.votes.set(message.authorId, genre);
      if (this.votes.size < 3) this.director.settings.genre = genre;
      else {
        const counts = new Map<Genre, number>(); for (const value of this.votes.values()) counts.set(value, (counts.get(value) ?? 0)+1);
        const most = Math.max(...counts.values()); const tied = [...counts].filter(([, count]) => count === most).map(([name]) => name);
        this.director.settings.genre = tied.includes(this.director.settings.genre) ? this.director.settings.genre : tied[0]!;
      }
      this.changed(); return;
    }
    if (command === '!recap') {
      if (now - this.recapAt < 120000) return;
      this.recapAt = now; this.director.recap = true; this.changed(); return;
    }
    if (command !== '!twist') return;
    const text = args.join(' ');
    if (!text || text.length > 120 || blocked(`${message.author} ${text}`, this.blocklist)) { this.notice('Twist rejected by length limit or blocklist.'); return; }
    if (now - (this.twistAt.get(message.authorId) ?? -Infinity) < 120000) return;
    if (this.pending.length + this.director.twists.length >= 3 || this.screening) { this.notice('Twist queue or safety screen is busy.'); return; }
    this.twistAt.set(message.authorId, now); this.screening = true; const epoch = this.queueEpoch;
    try {
      const result = await this.screen.check(`Viewer name: ${message.author}\nProposed plot twist: ${text}`, AbortSignal.timeout(6000));
      if (epoch !== this.queueEpoch) return;
      if (!result.allow || blocked(`${message.author} ${text}`, this.blocklist)) { this.notice(`Twist rejected: ${result.reason}`); return; }
      if (this.pending.length + this.director.twists.length >= 3) return;
      const twist = { id: randomUUID(), author: message.author.slice(0,80), text };
      const privileged = message.badges.some(b => ['moderator', 'vip', 'broadcaster'].includes(b));
      if (this.mode === 'auto' && (!this.modsOnly || privileged)) this.director.twists.push(twist); else this.pending.push(twist);
      this.notice(`Twist screened in ${result.latencyMs} ms; ${this.pending.includes(twist) ? 'awaiting approval' : 'accepted'}.`);
      this.changed();
    } catch { this.notice('Twist safety screen unavailable or timed out; proposal rejected.'); }
    finally { this.screening = false; }
  }
  approve(id: string) {
    const twist = this.pending.find(t => t.id === id); if (!twist || this.director.twists.length >= 3) return;
    this.pending = this.pending.filter(t => t.id !== id);
    if (!blocked(`${twist.author} ${twist.text}`, this.blocklist)) this.director.twists.push(twist);
    this.changed();
  }
  reject(id: string) { this.pending = this.pending.filter(t => t.id !== id); this.changed(); }
  clear() { this.queueEpoch++; this.pending = []; this.director.twists = []; this.changed(); }
  close() { this.queueEpoch++; this.blocklistEpoch++; }
  setBlocklist(words: string[]) {
    this.queueEpoch++; this.blocklistEpoch++;
    this.blocklist = words.map(w => w.trim().slice(0,80)).filter(Boolean).slice(0,200);
    this.pending = this.pending.filter(t => !blocked(`${t.author} ${t.text}`, this.blocklist));
    this.director.twists = this.director.twists.filter(t => !blocked(`${t.author} ${t.text}`, this.blocklist)); this.changed();
  }
  async event(event: StoryEvent) {
    if (!this.seen.add('event:'+event.id) || blocked(`${event.author} ${event.detail}`, this.blocklist)) return;
    const epoch = this.blocklistEpoch;
    try {
      const result = await this.screen.check(`Viewer name: ${event.author}\nStream event: ${event.kind} ${event.detail}`, AbortSignal.timeout(6000));
      if (epoch !== this.blocklistEpoch) return;
      if (!result.allow || blocked(`${event.author} ${event.detail}`, this.blocklist)) return;
      if (this.director.events.length >= 50) { this.notice('Event queue full; event skipped.'); return; }
      this.director.events.push(event); this.notice(`Event screened in ${result.latencyMs} ms.`); this.changed();
    } catch { this.notice('Event safety screen unavailable; event skipped.'); }
  }
}
