import { loadEnvFile } from 'node:process';
try { loadEnvFile(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { FakeEyes, FakeScreen, FakeTTS, FakeWriter } from '../src/server/ai/fakes.js';
import { BeatRunner } from '../src/server/director/beatRunner.js';
import { Director } from '../src/server/director/index.js';
import { createStory } from '../src/server/director/storyState.js';
import { FileStore } from '../src/server/store.js';
import { CommandRouter } from '../src/server/twitch/commands.js';
import { chatFromIRC } from '../src/server/twitch/irc.js';
import { mapNotification, type Envelope } from '../src/server/twitch/eventsub.js';
import type { Beat } from '../src/shared/protocol.js';
const fixture = JSON.parse(await readFile('fixtures/twitch/simulated-session.json','utf8')) as { label: string; irc: string[]; follow: Envelope };
const screen = new FakeScreen(), tts = new FakeTTS(), writer = new FakeWriter();
const beats: Beat[] = []; const notices: string[] = [];
let router: CommandRouter;
const runner = new BeatRunner({eyes:new FakeEyes(),writer,tts,screen},new FileStore(),b=>beats.push(b),()=>{},10000,()=>router.blocklist);
const director = new Director(runner); director.state=createStory('FixtureHero','noir','simulated-phase2-'+randomUUID()); director.source = 'simulated';
director.settings.running=true;
director.frame=await readFile('fixtures/local-scene.jpg');
router=new CommandRouter(director,screen,()=>{},text=>notices.push(text));
const start=Date.now();
for(const line of fixture.irc) {const message=chatFromIRC(line);assert(message);await router.handle(message,start);}
assert.equal(director.settings.genre,'heist');assert.equal(router.pending.length,1);assert.equal(director.twists.length,0);
const twist=router.pending[0]!;router.approve(twist.id);
const event=mapNotification(fixture.follow).event;assert(event);await router.event(event);
assert.equal((await director.tick(start+9000))?.trigger,'twist');assert.deepEqual(beats[0]?.twist,twist);
assert.equal((await director.tick(start+18000))?.trigger,'event');assert.equal(beats[1]?.event?.kind,'follow');
await router.handle({id:'recap',sourceId:'recap',authorId:'6',author:'FixtureSix',text:'!RECAP',badges:[]},start+20000);
assert.equal((await director.tick(start+27000))?.trigger,'recap');
assert.equal(beats.length,3);assert.equal(director.state.canon[0]?.author,'PlotFriend');
for(const beat of beats) {assert.equal(beat.engine,'fake');assert((await readFile(`data/streams/${beat.streamId}/audio/${beat.id}.wav`)).length>44);}
await mkdir('data/checks',{recursive:true});
await writeFile('data/checks/phase2-simulation.json',JSON.stringify({label:fixture.label,streamId:director.state.streamId,notices,beats},null,2));
console.log(JSON.stringify({label:fixture.label,genre:director.settings.genre,beats:beats.map(b=>b.trigger),credit:beats[0]?.twist?.author,sharedChatDedupe:true,savedAudio:true,streamId:director.state.streamId}));
