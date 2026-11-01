import '../overlay/style.css';
import './style.css';
import { cleanChapterTitle } from '../../shared/chapter';
import type { Beat } from '../../shared/protocol';
import { loadEmotes, withEmotes } from '../emotes';

// Replays a recorded session (fixtures/demo-session) through the same overlay styling used on stream.
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const audio = el<HTMLAudioElement>('voice');
let beats: Beat[] = []; let index = 0; let paused = false; let gapTimer: ReturnType<typeof setTimeout> | undefined; let cardTimer: ReturnType<typeof setTimeout> | undefined;
let words: string[] = []; let waitingForNext = false;

function show(beat: Beat) {
  waitingForNext = false; clearTimeout(gapTimer);
  document.body.dataset.genre = beat.genre;
  el('genre').textContent = beat.genre.toUpperCase();
  if (beat.frameUrl) el<HTMLImageElement>('frame').src = beat.frameUrl;
  words = beat.line.split(/\s+/); el('subtitles').replaceChildren(...withEmotes(words[0] ?? ''));
  const chapter = beat.chapterChanged ? cleanChapterTitle(beat.chapterTitle) : '';
  el('chapter').textContent = chapter && chapter.split(' ').length <= 7 ? chapter : '';
  el('credit').textContent = beat.twist ? `@${beat.twist.author}: ${beat.twist.text}` : '';
  el('event').replaceChildren(...(!beat.event ? [] : beat.event.kind === 'hype' ? withEmotes(`CHAT · ${beat.event.detail.replace(/ \(chat is .*\)$/u, '')}`) : [document.createTextNode(`${beat.event.kind.toUpperCase()} · @${beat.event.author}`)]));
  clearTimeout(cardTimer); cardTimer = setTimeout(() => { el('credit').textContent = ''; el('event').textContent = ''; el('chapter').textContent = ''; }, 5000);
  el('progress').textContent = `Line ${index + 1} of ${beats.length} · ${beat.trigger === 'talk-back' ? 'streamer talked back' : beat.trigger}`;
  audio.src = beat.audioUrl; void audio.play().catch(() => { paused = true; el('toggle').textContent = 'Play'; });
}

audio.ontimeupdate = () => {
  const beat = beats[index]; if (!beat) return;
  const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : beat.durationSeconds;
  const visible = Math.max(1, Math.ceil((audio.currentTime / duration) * words.length));
  const page = Math.floor((visible - 1) / 14) * 14;
  el('subtitles').replaceChildren(...withEmotes(words.slice(page, Math.min(visible, page + 14)).join(' ')));
};
audio.onerror = () => { paused = true; el('toggle').textContent = 'Retry'; el('progress').textContent = 'Recorded audio unavailable. Retry or reload the page.'; };
audio.onended = () => {
  waitingForNext = true;
  el('subtitles').textContent = '';
  gapTimer = setTimeout(() => { index += 1; if (index < beats.length) show(beats[index]!); else finish(); }, 1400);
};

function finish() {
  el('progress').textContent = `Finished · ${beats.length} lines`;
  el('toggle').textContent = 'Replay'; paused = true;
}

el<HTMLButtonElement>('toggle').onclick = () => {
  if (index >= beats.length) { index = 0; paused = false; el('toggle').textContent = 'Pause'; show(beats[0]!); return; }
  paused = !paused; el('toggle').textContent = paused ? 'Play' : 'Pause';
  if (paused) { audio.pause(); clearTimeout(gapTimer); } else if (waitingForNext || audio.ended || !audio.src) audio.onended?.(new Event('ended')); else void audio.play().catch(() => { paused = true; el('toggle').textContent = 'Play'; });
};

el<HTMLButtonElement>('play').onclick = () => {
  if (!beats.length) return;
  paused = false; el('toggle').textContent = 'Pause';
  el('start').hidden = true; el<HTMLButtonElement>('toggle').disabled = false; index = 0; show(beats[0]!);
};

void fetch('/api/demo-info').then(r => r.json()).then(info => { el('banner').textContent = info.label ?? 'Recorded session · input provenance unverified'; }).catch(() => {});
void loadEmotes();
void fetch('/api/demo').then(r => r.json() as Promise<Beat[]>).then(list => {
  beats = list;
  const twists = list.filter(b => b.twist).length; const talk = list.filter(b => b.trigger === 'talk-back').length;
  el('info').textContent = list.length
    ? `${list.length} narrated lines · ${talk} talk-back replies · ${twists} plot twists from chat · about ${Math.round(list.reduce((s, b) => s + b.durationSeconds + 1.4, 0))} seconds`
    : 'No recorded session yet. Run: npm run demo:capture -- <streamId>';
  el<HTMLButtonElement>('play').disabled = !list.length;
  if (list[0]?.frameUrl) el<HTMLImageElement>('frame').src = list[0].frameUrl;
}).catch(() => { el('info').textContent = 'Could not load the recorded session.'; });
