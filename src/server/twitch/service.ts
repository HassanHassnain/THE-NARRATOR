import type { Beat, ClientMessage, StoryEvent, TwitchPublic } from '../../shared/protocol.js';
import type { Screen } from '../ai/screen.js';
import type { Director } from '../director/index.js';
import { CommandRouter } from './commands.js';
import { AnonymousIRC } from './irc.js';
import { DeviceAuth } from './deviceAuth.js';
import { EventSub } from './eventsub.js';
import { createMarker } from './markers.js';
export class TwitchService {
  readonly router: CommandRouter; readonly auth: DeviceAuth;
  private irc: AnonymousIRC; private events: EventSub;
  private channel = ''; private chatConnected = false; private eventsConnected = false;
  private notices: string[] = []; private source: 'none' | 'irc' | 'eventsub' = 'none';
  private connectedUser = ''; private autoAuth = true; private closed = false;
  private eventQueue: StoryEvent[] = []; private draining = false;
  constructor(private director: Director, screen: Screen, private changed: () => void, private hostNotice: (message: string) => void, private disabled = false) {
    this.router = new CommandRouter(director, screen, changed, text => this.notice(text));
    this.auth = new DeviceAuth(disabled ? '' : process.env.TWITCH_CLIENT_ID ?? '', () => { this.syncAuth(); changed(); }, text => this.notice(text));
    this.irc = new AnonymousIRC(chat => { void this.router.handle(chat).catch(() => this.notice('Chat command failed safely.')); }, (connected, text) => { if (this.source === 'irc') this.chatConnected = connected; if (text) this.notice(text); changed(); });
    this.events = new EventSub(this.auth,
      chat => { void this.router.handle(chat).catch(() => this.notice('Chat command failed safely.')); },
      event => { if (this.eventQueue.length >= 50) { this.notice('Event input queue full; event skipped.'); return; } this.eventQueue.push(event); void this.drain(); },
      (connected, chat) => { this.eventsConnected = connected; if (this.source === 'eventsub') this.chatConnected = chat; changed(); }, text => this.notice(text));
  }
  private notice(text: string) { this.notices.unshift(text.slice(0,300)); this.notices.splice(20); this.hostNotice(text); this.changed(); }
  async startSaved() { if (this.disabled) return; await this.auth.restore(); this.syncAuth(); }
  private syncAuth() {
    if (this.closed || this.disabled || !this.autoAuth) return;
    const user = this.auth.user;
    if (!user) { if (this.source === 'eventsub') { this.events.stop(); this.source = 'none'; } return; }
    if (this.source === 'eventsub' && this.connectedUser === user.id && this.events.active) return;
    this.irc.stop(); this.source = 'eventsub'; this.channel = user.login; this.connectedUser = user.id;
    if (this.director.settings.protagonist === 'Streamer') this.director.settings.protagonist = user.displayName;
    this.events.start();
  }
  private async drain() {
    if (this.draining) return; this.draining = true;
    const order = ['raid','gift','sub','cheer','follow'];
    try { while (!this.closed && this.eventQueue.length) { this.eventQueue.sort((a,b) => order.indexOf(a.kind)-order.indexOf(b.kind)); await this.router.event(this.eventQueue.shift()!); } }
    finally { this.draining = false; }
  }
  snapshot(): TwitchPublic {
    return { clientConfigured: this.auth.configured, channel: this.channel, chatConnected: this.chatConnected, eventsConnected: this.eventsConnected,
      authenticated: !!this.auth.user, mode: this.router.mode, modsOnly: this.router.modsOnly,
      pending: this.router.pending, accepted: this.director.twists, blocklist: this.router.blocklist, notices: this.notices,
      ...(this.auth.device ? { device: this.auth.device } : {}), ...(this.auth.user ? { user: this.auth.user } : {}) };
  }
  async handle(message: Extract<ClientMessage, { type: 'twitch' }>) {
    if (message.action === 'chat') {
      if (this.disabled) throw new Error('Twitch network is disabled in simulated test mode.');
      if (typeof message.channel !== 'string') return;
      const channel = message.channel.replace(/^#/, '').toLowerCase();
      if (!/^[a-z0-9_]{1,25}$/.test(channel)) throw new Error('Enter a Twitch channel name, not a URL.');
      this.autoAuth = false; this.events.stop(); this.source = 'irc'; this.channel = channel; this.irc.start(this.channel);
    } else if (message.action === 'auth') {
      if (this.disabled) throw new Error('Twitch network is disabled in simulated test mode.');
      this.autoAuth = true; await this.auth.begin();
    } else if (message.action === 'stop') { this.autoAuth = false; this.irc.stop(); this.events.stop(); this.source = 'none'; this.chatConnected = false; this.eventsConnected = false; }
    else if (message.action === 'approve' && typeof message.id === 'string') this.router.approve(message.id);
    else if (message.action === 'reject' && typeof message.id === 'string') this.router.reject(message.id);
    else if (message.action === 'clear') { this.director.runner.cancel(); this.router.clear(); }
    else if (message.action === 'mode') {
      if (message.mode === 'approve' || message.mode === 'auto') this.router.mode = message.mode;
      if (typeof message.modsOnly === 'boolean') this.router.modsOnly = message.modsOnly;
    } else if (message.action === 'blocklist' && Array.isArray(message.words) && message.words.every(w => typeof w === 'string')) {
      this.director.runner.cancel(); this.router.setBlocklist(message.words);
    }
    this.changed();
  }
  chapter(beat: Beat) { if (!this.disabled && this.source === 'eventsub' && beat.chapterChanged) void createMarker(this.auth, beat.chapterTitle, text => this.notice(text)); }
  close() { this.closed = true; this.eventQueue = []; this.router.close(); this.auth.close(); this.irc.stop(); this.events.stop(); }
}
