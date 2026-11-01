import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type WebSocket from 'ws';
import { chatFromIRC, parseIRC, AnonymousIRC } from '../src/server/twitch/irc';
import { CommandRouter } from '../src/server/twitch/commands';
import { SeenIds, type ChatMessage } from '../src/server/twitch/types';
import { mapNotification, EventSub, subscriptionRequests, type Envelope } from '../src/server/twitch/eventsub';
import { DeviceAuth, scopes } from '../src/server/twitch/deviceAuth';
import { createMarker } from '../src/server/twitch/markers';
import { FakeEyes, FakeScreen, FakeTTS, FakeWriter } from '../src/server/ai/fakes';
import { BeatRunner } from '../src/server/director/beatRunner';
import { Director } from '../src/server/director/index';
const message = (id: string, text: string, badges: string[] = []): ChatMessage => ({ id, sourceId: id, authorId: id, author: 'Viewer'+id, text, badges });
function setup() {
  const screen = new FakeScreen(), writer = new FakeWriter(), tts = new FakeTTS();
  let router: CommandRouter;
  const runner = new BeatRunner({ eyes: new FakeEyes(), writer, tts, screen }, { save: async () => {} }, () => {}, () => {}, 10000, () => router.blocklist);
  const director = new Director(runner); director.settings.running = true; director.frame = Buffer.from('fixture');
  const notice = vi.fn(); router = new CommandRouter(director, screen, () => {}, notice);
  return { router, director, screen, runner, writer, tts, notice };
}
afterEach(() => vi.useRealTimers());
describe('IRC and Shared Chat', () => {
  it('parses tags, escaping, first command token, and source message IDs', () => {
    const raw = '@id=copy;source-id=original;user-id=7;display-name=Plot\\sFriend;badges=moderator/1,vip/1 :friend!friend@friend.tmi.twitch.tv PRIVMSG #channel :!TwIsT the cat owned the key';
    expect(chatFromIRC(raw)).toMatchObject({ sourceId: 'original', author: 'Plot Friend', badges: ['moderator','vip'], text: '!TwIsT the cat owned the key' });
    expect(parseIRC('@a=x\\:y\\\\z\\r\\n :p PRIVMSG #c :hello')?.tags.a).toBe('x;y\\z\r\n');
    expect(parseIRC('PING :tmi.twitch.tv')).toMatchObject({ command: 'PING', trailing: 'tmi.twitch.tv' });
    expect(chatFromIRC('NOTICE #c :hello')).toBeUndefined();
    const seen = new SeenIds(); expect(seen.add('id')).toBe(true); expect(seen.add('id')).toBe(false);
  });
  it('buffers fragmented IRC lines, answers PING, and reconnects with backoff', async () => {
    vi.useFakeTimers(); const sockets: (FakeSocket & { send: ReturnType<typeof vi.fn> })[]=[];
    const make=()=>{const socket=Object.assign(new FakeSocket(),{send:vi.fn()});sockets.push(socket);return socket as unknown as WebSocket;};
    const chat=vi.fn();const irc=new AnonymousIRC(chat,()=>{},'wss://fixture',make);irc.start('fixture');
    sockets[0]!.emit('open');expect(sockets[0]!.send.mock.calls).toHaveLength(4);expect(sockets[0]!.send.mock.calls.every(call=>String(call[0]).split('\r\n').filter(Boolean).length===1)).toBe(true);expect(sockets[0]!.send).toHaveBeenCalledWith(expect.stringContaining('NICK justinfan'));
    sockets[0]!.emit('message',Buffer.from('PING :tmi.twitch.tv\r\n@id=one;display-name=Friend;user-id=7 :f!f@f PRIVMSG #fixture :!twi'));
    expect(sockets[0]!.send).toHaveBeenCalledWith('PONG :tmi.twitch.tv\r\n');expect(chat).not.toHaveBeenCalled();
    sockets[0]!.emit('message',Buffer.from('st the cat owned the key\r\n'));expect(chat).toHaveBeenCalledOnce();
    sockets[0]!.close();await vi.advanceTimersByTimeAsync(1000);expect(sockets).toHaveLength(2);irc.stop();
  });
  it('deduplicates Shared Chat copies before a twist reaches the model', async () => {
    const s=setup(); await s.router.handle(message('id','!twist the cat owned the key'));
    await s.router.handle({ ...message('copy','!twist another plot'), sourceId:'id' });
    expect(s.router.pending).toHaveLength(1);
  });
});
describe('chat commands and safety', () => {
  it('counts distinct genre voters, selects majority, and enforces cooldown', async () => {
    const s=setup(); await s.router.handle(message('a','!GENRE heist'), 1000); await s.router.handle(message('b','!genre noir'), 2000); await s.router.handle(message('c','!genre heist'), 3000);
    expect(s.director.settings.genre).toBe('heist');
    await s.router.handle(message('d','!genre horror'), 40000); expect(s.director.settings.genre).toBe('heist');
    await s.router.handle(message('e','!genre horror'), 181001); expect(s.director.settings.genre).toBe('horror');
    await s.router.handle(message('z','!genres noir'), 181002); expect(s.director.settings.genre).toBe('horror');
  });
  it('rejects blocked and model-screen rejected proposals before approval or TTS', async () => {
    const s=setup(); await s.router.handle(message('a','!twist kys')); expect(s.router.pending).toEqual([]);
    s.screen.allow=false; await s.router.handle(message('b','!twist the cat owned the door')); expect(s.router.pending).toEqual([]); expect(s.tts.calls).toEqual([]);
  });
  it('defaults to approval, caps the whole queue at three, and applies per-chatter cooldown', async () => {
    const s=setup(); await s.router.handle(message('a','!twist the cat owned the red key'), 1000);
    await s.router.handle({ ...message('second','!twist another plot'), authorId:'a' }, 2000);
    expect(s.router.pending).toHaveLength(1); expect(s.director.twists).toEqual([]);
    await s.router.handle(message('b','!twist the river hid a map'), 3000); await s.router.handle(message('c','!twist the door was a decoy'), 4000); await s.router.handle(message('d','!twist overflow'), 5000);
    expect(s.router.pending).toHaveLength(3); s.router.approve(s.router.pending[0]!.id);
    const twist=s.director.twists[0]!; const beat=await s.director.tick(Date.now()+9000);
    expect(beat?.twist).toEqual(twist); expect(s.director.state.canon).toEqual([twist]); expect(s.director.twists).toEqual([]);
    expect(s.tts.calls[0]).not.toBe(twist.text);
  });
  it('auto-accepts eligible mods/VIPs while leaving ordinary viewers in approval', async () => {
    const s=setup(); s.router.mode='auto'; s.router.modsOnly=true;
    await s.router.handle(message('a','!twist the cat owned the key')); await s.router.handle(message('b','!twist the door hid a map',['vip']));
    expect(s.router.pending).toHaveLength(1); expect(s.director.twists).toHaveLength(1);
  });
  it('clearing the queue or editing bans invalidates an in-flight safety result', async () => {
    const s=setup(); let finish!:()=>void;
    vi.spyOn(s.screen,'check').mockImplementation(()=>new Promise(resolve=>{finish=()=>resolve({allow:true,reason:'safe',latencyMs:1});}));
    const request=s.router.handle(message('a','!twist the cat owned the key')); s.router.clear(); finish(); await request;
    expect(s.router.pending).toEqual([]); expect(s.director.twists).toEqual([]);
  });
  it('uses edited bans for final model output and preserves recap until its priority is reached', async () => {
    const s=setup(); s.router.setBlocklist(['red door']);
    expect(await s.runner.run({ state:s.director.state,settings:s.director.settings,frame:Buffer.from('frame'),transcript:[],events:[],trigger:'cadence' })).toBeUndefined(); expect(s.tts.calls).toHaveLength(0);
    s.router.setBlocklist([]); await s.router.handle(message('a','!recap'),1000);
    s.director.transcript.push({text:'narrator, hello',at:Date.now()}); await s.director.tick(); expect(s.director.recap).toBe(true);
    expect((await s.director.tick(Date.now()+9000))?.trigger).toBe('recap');
    await s.router.handle(message('b','!recap'),2000); expect(s.director.recap).toBe(false);
  });
});
function notification(type:string,event:Record<string,unknown>):Envelope {return {metadata:{message_type:'notification',message_id:'event-'+type},payload:{subscription:{type},event}};}
describe('EventSub mapping and lifecycle', () => {
  it('maps each requested event, the chat source ID, and incoming raid conditions', () => {
    for(const [type,kind] of [['channel.follow','follow'],['channel.subscribe','sub'],['channel.subscription.gift','gift'],['channel.cheer','cheer'],['channel.raid','raid']]) {
      expect(mapNotification(notification(type!,{user_name:'Friend',from_broadcaster_user_name:'Raider',bits:50,total:2,viewers:12})).event?.kind).toBe(kind);
    }
    expect(mapNotification(notification('channel.chat.message',{message_id:'copy',source_message_id:'original',chatter_user_id:'4',chatter_user_name:'Friend',message:{text:'!recap'},badges:[{set_id:'vip'}]})).chat).toMatchObject({sourceId:'original',text:'!recap',badges:['vip']});
    expect(subscriptionRequests('broadcaster','session').find(s=>s.type==='channel.raid')?.condition).toEqual({to_broadcaster_user_id:'broadcaster'});
    expect(subscriptionRequests('broadcaster','session').find(s=>s.type==='channel.follow')?.version).toBe('2');
  });
  it('reconnects when the welcome or keepalive deadline is missed', async () => {
    vi.useFakeTimers();const sockets:FakeSocket[]=[];
    const auth={user:{id:'7',login:'host',displayName:'Host'},helix:vi.fn(async()=>new Response('{}',{status:202}))};
    const events=new EventSub(auth,()=>{},()=>{},()=>{},()=>{},()=>{const s=new FakeSocket();sockets.push(s);return s as unknown as WebSocket;});
    events.start();await vi.advanceTimersByTimeAsync(15001);expect(sockets[0]!.closed).toBe(true);await vi.advanceTimersByTimeAsync(1000);expect(sockets).toHaveLength(2);events.stop();
  });
  it('subscribes, transfers reconnect without resubscribing, handles revocation and backs off', async () => {
    vi.useFakeTimers(); const sockets:FakeSocket[]=[]; const make=vi.fn(()=>{const socket=new FakeSocket();sockets.push(socket);return socket as unknown as WebSocket;});
    const auth={user:{id:'7',login:'host',displayName:'Host'},helix:vi.fn(async()=>new Response('{}',{status:202}))};
    const status=vi.fn(), notice=vi.fn(); const events=new EventSub(auth,()=>{},()=>{},status,notice,make); events.start();
    sockets[0]!.message({metadata:{message_type:'session_welcome',message_id:'w'},payload:{session:{id:'one',keepalive_timeout_seconds:10}}});
    await vi.waitFor(()=>expect(auth.helix).toHaveBeenCalledTimes(6));
    sockets[0]!.message({metadata:{message_type:'session_reconnect',message_id:'r'},payload:{session:{id:'one',reconnect_url:'wss://eventsub.wss.twitch.tv/ws?reconnect=1'}}});
    expect(sockets[0]!.closed).toBe(false);
    sockets[1]!.message({metadata:{message_type:'session_welcome',message_id:'w2'},payload:{session:{id:'two',keepalive_timeout_seconds:10}}});
    expect(sockets[0]!.closed).toBe(true); expect(auth.helix).toHaveBeenCalledTimes(6);
    sockets[1]!.message({metadata:{message_type:'revocation',message_id:'v'},payload:{subscription:{type:'channel.chat.message',status:'authorization_revoked'}}});
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('authorization_revoked'));
    sockets[1]!.close(); await vi.advanceTimersByTimeAsync(1000); expect(sockets).toHaveLength(3); events.stop();
  });
});
class FakeSocket extends EventEmitter { closed=false; close(){if(this.closed)return;this.closed=true;this.emit('close');} message(value:unknown){this.emit('message',Buffer.from(JSON.stringify(value)));} }
describe('public device auth and markers', () => {
  it('polls a public device code, persists private tokens and never requires a client secret', async () => {
    vi.useFakeTimers(); const dir=await mkdtemp(join(tmpdir(),'narrator-auth-')); const calls:{url:string;init?:RequestInit}[]=[];
    const http=vi.fn(async(url: string|URL|Request, init?:RequestInit)=>{
      calls.push({url:String(url),...(init?{init}:{})});
      if(String(url).endsWith('/device')) return new Response(JSON.stringify({device_code:'private-code',user_code:'VISIBLE',verification_uri:'https://www.twitch.tv/activate',expires_in:1800,interval:5}));
      if(String(url).endsWith('/validate')) return new Response(JSON.stringify({client_id:'client',user_id:'7',login:'host',scopes}));
      return new Response(JSON.stringify({access_token:'private-access',refresh_token:'private-refresh',expires_in:3600}));
    });
    const file=join(dir,'tokens.json'); const auth=new DeviceAuth('client',()=>{},()=>{},file,http as typeof fetch);
    try {await auth.begin();expect(auth.device?.userCode).toBe('VISIBLE');await vi.advanceTimersByTimeAsync(5000);await vi.waitFor(()=>expect(auth.user?.id).toBe('7'));expect(JSON.parse(await readFile(file,'utf8')).access_token).toBe('private-access');expect((await stat(file)).mode & 0o777).toBe(0o600);expect(calls.some(c=>String(c.init?.body).includes('client_secret'))).toBe(false);}
    finally {auth.close();await rm(dir,{recursive:true,force:true});}
  });
  it('stops a denied device flow and handles a missing client ID without a network call', async () => {
    vi.useFakeTimers();const notice=vi.fn();const http=vi.fn(async(url:string|URL|Request)=>String(url).endsWith('/device') ? new Response(JSON.stringify({device_code:'private',user_code:'VISIBLE',expires_in:1800,interval:5})) : new Response(JSON.stringify({message:'access_denied'}),{status:400}));
    const missing=new DeviceAuth('',()=>{},notice,'unused',http as typeof fetch);await expect(missing.begin()).rejects.toThrow('TWITCH_CLIENT_ID');expect(http).not.toHaveBeenCalled();
    const auth=new DeviceAuth('client',()=>{},notice,'unused',http as typeof fetch);
    try {await auth.begin();await vi.advanceTimersByTimeAsync(5000);expect(auth.device).toBeUndefined();expect(auth.user).toBeUndefined();expect(notice).toHaveBeenCalledWith(expect.stringContaining('denied'));await vi.advanceTimersByTimeAsync(15000);expect(http).toHaveBeenCalledTimes(2);}
    finally {auth.close();}
  });
  it('serializes one-time public refresh tokens across simultaneous requests', async () => {
    const dir=await mkdtemp(join(tmpdir(),'narrator-refresh-'));const file=join(dir,'tokens.json');
    await writeFile(file,JSON.stringify({access_token:'old',refresh_token:'one-use',expiresAt:0}));let refreshes=0;let release!:()=>void;
    const http=vi.fn(async(url:string|URL|Request)=>{
      if(String(url).endsWith('/validate'))return new Response(JSON.stringify({client_id:'client',user_id:'7',login:'host',scopes}));
      refreshes++;return await new Promise<Response>(resolve=>{release=()=>resolve(new Response(JSON.stringify({access_token:'new',refresh_token:'rotated',expires_in:3600})));});
    });const auth=new DeviceAuth('client',()=>{},()=>{},file,http as typeof fetch);
    try {const restoring=auth.restore();await vi.waitFor(()=>expect(refreshes).toBe(1));const first=auth.token(),second=auth.token();release();await Promise.all([restoring,first,second]);expect(refreshes).toBe(1);expect(JSON.parse(await readFile(file,'utf8')).refresh_token).toBe('rotated');}
    finally {auth.close();await rm(dir,{recursive:true,force:true});}
  });
  it('creates chapter markers only when live and ignores API failures', async () => {
    const helix=vi.fn().mockResolvedValueOnce(new Response('{"data":[]}')).mockResolvedValueOnce(new Response('{"data":[{}]}')).mockResolvedValueOnce(new Response('{}',{status:200})).mockRejectedValueOnce(new Error('offline'));
    const auth={user:{id:'7'},helix} as unknown as DeviceAuth;const notice=vi.fn();
    await createMarker(auth,'Chapter one',notice);expect(helix).toHaveBeenCalledTimes(1);
    await createMarker(auth,'Chapter two',notice);expect(helix.mock.calls[2]?.[0]).toBe('streams/markers');
    await expect(createMarker(auth,'Chapter three',notice)).resolves.toBeUndefined();expect(notice).toHaveBeenCalled();
  });
});
describe('chat reactions become story beats', () => {
  it('turns emote spam from two chatters into one hype event and narrates it, without screening raw chat', async () => {
    const s = setup(); const screened = vi.spyOn(s.screen, 'check');
    await s.router.handle(message('a1', 'KEKW KEKW'), 1000);
    await s.router.handle({ ...message('a2', 'KEKW'), authorId: 'a1' }, 2000);
    await s.router.handle(message('b1', 'LMAO'), 3000);
    await s.router.handle(message('c1', 'just a normal sentence about the game'), 3500);
    expect(s.director.events).toHaveLength(1);
    expect(s.director.events[0]).toMatchObject({ kind: 'hype', author: '' });
    expect(s.director.events[0]!.detail).toContain('KEKW ×2');
    expect(screened).not.toHaveBeenCalled();
    const beat = await s.director.tick(Date.now() + 60000);
    expect(beat?.event?.kind).toBe('hype'); expect(beat?.trigger).toBe('event');
  });
});
